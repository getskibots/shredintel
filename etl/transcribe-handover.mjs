#!/usr/bin/env node
/**
 * transcribe-handover.mjs — transcribe the HUMAN / escalation half of transferred
 * voice calls (the portion the live per-turn whisper-1 never captures) and detect
 * voicemail, feeding the handover report.
 *
 * Per call: transfer offset = call_facts.duration_sec - call_transfers.human_talk_sec.
 * Fetch the Twilio recording (mirror creds, same as /api/recording), ffmpeg-slice the
 * tail [offset-LEAD .. offset+segment, capped at CAP_SEC], Whisper (whisper-1), flag
 * voicemail, store in report.call_handover_transcript (1:1, resumable via ON CONFLICT).
 *
 * Guardrails: hard $ --cap (stops scheduling once spent), per-call CAP_SEC transcription
 * cap (marathon/stuck calls can't blow the budget), fetch timeout, 429/5xx backoff,
 * concurrency, running cost. Resumable — safe to stop and re-run.
 *
 *   node transcribe-handover.mjs --prove --ids 1,2,3     # sample: transcribe + PRINT + write
 *   node transcribe-handover.mjs --bot 248 --cap 210      # backfill one bot, hard-stop at $cap
 *   node transcribe-handover.mjs --cap 210                # backfill whole fleet
 *   node transcribe-handover.mjs --nightly --cap 20       # incremental (only new transfers)
 */
import 'dotenv/config'
import pg from 'pg'
import { spawn } from 'node:child_process'
import { writeFile, readFile, rm, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const val = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const PROVE = has('--prove')
const NIGHTLY = has('--nightly')
const BOT = val('--bot', null)
const IDS = val('--ids', null)
const LIMIT = Number(val('--limit', 0))
const CAP = Number(val('--cap', PROVE ? 5 : 0))     // USD hard cap
const CONC = Number(val('--conc', 4))
const CAP_SEC = 740        // 12min + 20s: max audio transcribed per call
const LEAD = 20            // seconds before the computed offset (catch handoff/greeting)
const FETCH_MS = 180000    // per-recording download timeout
const PRICE_PER_MIN = 0.006
const MODEL = 'whisper-1'
const KEY = (process.env.OPENAI_API_KEY || '').trim()

if (!KEY) { console.error('OPENAI_API_KEY missing'); process.exit(1) }
if (!CAP || CAP <= 0) { console.error('refusing to run without a positive --cap (USD)'); process.exit(1) }

// Voicemail greeting signature (content-based detection).
const VMAIL_RX = /(leave (a )?(voice ?)?(message|mail)|at the (tone|beep)|after the (tone|beep)|(is |are )?(not|un)available|reached the voicemail|please record|voice ?mail box|mailbox is full|you('| ha)ve reached|no one is available|can'?t (take|come to|answer) (your|the) (call|phone)|press \d|record your message)/i

const pool = new pg.Pool({
  host: process.env.SUPABASE_DB_HOST, port: +(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false }, max: CONC + 2,
})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const credCache = new Map()
async function creds(botId) {
  if (credCache.has(botId)) return credCache.get(botId)
  const m = await pool.query(
    `select t.accountsid, t.auth_token from raw.admin_bot b
       join raw.admin_twilio_configs t on t.id = b.twilio_configs_id
      where b.id = $1 and coalesce(t.accountsid,'')<>'' and coalesce(t.auth_token,'')<>'' limit 1`, [botId])
  const c = m.rows[0] ? { sid: String(m.rows[0].accountsid).trim(), tok: String(m.rows[0].auth_token).trim() } : null
  credCache.set(botId, c); return c
}
async function recordingSid(cid, botId) {
  const r = await pool.query(
    `select recording_sid from report.call_base where conversation_id=$1 and bot_id=$2 and recording_sid is not null limit 1`, [cid, botId])
  return r.rows[0]?.recording_sid || null
}
function ffprobeDuration(file) {
  return new Promise((res) => {
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file], { stdio: ['ignore', 'pipe', 'ignore'] })
    let out = ''; p.stdout.on('data', (d) => { out += d })
    p.on('close', () => res(parseFloat(String(out).trim()) || 0))
    p.on('error', () => res(0))
  })
}
function ffslice(inFile, start, len, outFile) {
  return new Promise((res, rej) => {
    const a = ['-y', '-ss', String(start), '-i', inFile, '-t', String(len),
      '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '64k', outFile]
    const p = spawn('ffmpeg', a, { stdio: ['ignore', 'ignore', 'pipe'] })
    let err = ''; p.stderr.on('data', (d) => { err += d })
    p.on('close', (code) => code === 0 ? res() : rej(new Error('ffmpeg ' + code + ': ' + err.slice(-160))))
  })
}
async function whisper(file) {
  const buf = await readFile(file)
  for (let attempt = 0; attempt < 5; attempt++) {
    const fd = new FormData()
    fd.append('file', new Blob([buf], { type: 'audio/mpeg' }), 'seg.mp3')
    fd.append('model', MODEL); fd.append('response_format', 'verbose_json')
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${KEY}` }, body: fd,
    })
    if (r.ok) return await r.json()
    if (r.status === 429 || r.status >= 500) { await sleep(1000 * 2 ** attempt); continue }
    throw new Error('whisper ' + r.status + ': ' + (await r.text()).slice(0, 160))
  }
  throw new Error('whisper retries exhausted')
}
async function fetchRecording(sid, tok, rsid) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Recordings/${rsid}.mp3`
  const auth = Buffer.from(`${sid}:${tok}`).toString('base64')
  const ac = new AbortController(); const to = setTimeout(() => ac.abort(), FETCH_MS)
  try {
    const tw = await fetch(url, { headers: { Authorization: `Basic ${auth}` }, signal: ac.signal })
    if (!tw.ok) return { err: 'twilio-' + tw.status }
    return { buf: Buffer.from(await tw.arrayBuffer()) }
  } catch (e) { return { err: 'fetch-' + (e.name === 'AbortError' ? 'timeout' : 'fail') } }
  finally { clearTimeout(to) }
}

async function processOne(row) {
  const cid = row.conversation_id, botId = Number(row.bot_id)
  const cr = await creds(botId); if (!cr) return { cid, skip: 'no-creds' }
  const rsid = await recordingSid(cid, botId); if (!rsid) return { cid, skip: 'no-recording' }
  const rec = await fetchRecording(cr.sid, cr.tok, rsid); if (rec.err) return { cid, skip: rec.err }
  const dir = await mkdtemp(join(tmpdir(), 'hv-'))
  try {
    const inF = join(dir, 'in.mp3'), outF = join(dir, 'seg.mp3')
    await writeFile(inF, rec.buf)
    let dur = Number(row.duration_sec) || 0
    if (!dur) dur = await ffprobeDuration(inF)      // bots without call_facts: measure the recording itself
    if (!dur) return { cid, skip: 'no-duration' }
    const start = Math.max(0, (dur - Number(row.human_talk_sec)) - LEAD)
    const len = Math.min(dur - start, CAP_SEC)
    if (len < 2) return { cid, skip: 'too-short' }
    await ffslice(inF, start, len, outF)
    const j = await whisper(outF)
    const text = (j.text || '').trim()
    const segSec = Number(j.duration || len)
    return {
      cid, botId, call_sid: row.call_sid, rsid, start: Math.round(start), segSec,
      text, isVmail: VMAIL_RX.test(text), cost: (segSec / 60) * PRICE_PER_MIN,
    }
  } finally { await rm(dir, { recursive: true, force: true }).catch(() => {}) }
}

async function workRows() {
  const where = ["ct.transferred", "ct.answered", "coalesce(ct.human_talk_sec,0)>0", "h.conversation_id is null"]
  const params = []
  if (IDS) { params.push(IDS.split(',').map((s) => s.trim())); where.push(`ct.conversation_id = any($${params.length}::bigint[])`) }
  else if (BOT) { params.push(Number(BOT)); where.push(`ct.bot_id = $${params.length}`) }
  let sql = `select ct.conversation_id, ct.bot_id, ct.call_sid, cf.duration_sec, ct.human_talk_sec
    from report.call_transfers ct
    left join report.call_facts cf on cf.conversation_id = ct.conversation_id
    left join report.call_handover_transcript h on h.conversation_id = ct.conversation_id
    where ${where.join(' and ')} order by ct.conversation_id`
  if (LIMIT > 0) sql += ` limit ${LIMIT}`
  return (await pool.query(sql, params)).rows
}

const ts = () => new Date().toISOString()
async function main() {
  const rows = await workRows()
  console.log(`transcribe-handover · ${PROVE ? 'PROVE' : NIGHTLY ? 'NIGHTLY' : 'BACKFILL'} · ${rows.length} calls pending · cap $${CAP} · conc ${CONC} · per-call cap ${CAP_SEC}s`)
  if (!rows.length) { console.log('nothing to do.'); await pool.end(); return }
  const work = [...rows]
  let spent = 0, done = 0, failed = 0, vmails = 0
  const skips = {}
  async function worker() {
    while (work.length) {
      if (spent >= CAP) break
      const row = work.shift()
      try {
        const r = await processOne(row)
        if (r.skip) { failed++; skips[r.skip] = (skips[r.skip] || 0) + 1; continue }
        await pool.query(
          `insert into report.call_handover_transcript
             (conversation_id,bot_id,call_sid,recording_sid,offset_sec,segment_sec,text,is_voicemail,model,cost_usd)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) on conflict (conversation_id) do nothing`,
          [r.cid, r.botId, r.call_sid, r.rsid, r.start, r.segSec, r.text, r.isVmail, MODEL, r.cost])
        spent += r.cost; done++; if (r.isVmail) vmails++
        if (PROVE) {
          console.log(`\n── cid ${r.cid} · human=${row.human_talk_sec}s · seg=${Math.round(r.segSec)}s · ${r.isVmail ? '📮 VOICEMAIL' : 'live'} · $${r.cost.toFixed(4)}`)
          console.log('   ' + (r.text ? r.text.replace(/\s+/g, ' ').slice(0, 420) : '(empty transcript)'))
        } else if (done % 25 === 0) {
          console.log(`  ${ts()} · done ${done} · vmail ${vmails} · failed ${failed} · $${spent.toFixed(2)}/${CAP}`)
        }
      } catch (e) { failed++; skips['err:' + String(e.message).slice(0, 40)] = (skips['err'] || 0) + 1 }
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker))
  console.log(`\n== DONE == transcribed ${done} · voicemail ${vmails} · failed ${failed} · spent $${spent.toFixed(2)} of $${CAP}${spent >= CAP ? ' (CAP HIT — re-run to continue)' : ''}`)
  if (Object.keys(skips).length) console.log('skips/errors:', JSON.stringify(skips))
  await pool.end()
}
main().catch((e) => { console.error('FATAL', e); process.exit(1) })
