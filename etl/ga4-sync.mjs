#!/usr/bin/env node
/**
 * ga4-sync.mjs — nightly GA4 pull for every connected bot (report.bot_ga4).
 * For each property: run a few aggregate reports and UPSERT them into the
 * anon-readable report.ga4_*_daily tables. Read-only against GA4; no PII stored.
 * Mirrors the OpenAI/Twilio cost pulls: runs server-side (droplet) after the sync.
 *
 * TWO auth paths, chosen per bot:
 *   • OAuth (self-serve): bot has oauth_refresh_token_enc → decrypt (TWILIO_TOKEN_ENC_KEY,
 *     same AES-256-GCM as tokenCrypto) → mint an access token → Data API via REST.
 *   • Service account (dev/test/stand-in): no OAuth token → BetaAnalyticsDataClient
 *     with GA4_SA_KEY. Used for the GSB test property.
 *
 *   node ga4-sync.mjs                 all connected bots, last 90 days
 *   node ga4-sync.mjs --bot=2         one bot
 *   node ga4-sync.mjs --days=28       shorter window
 */
import 'dotenv/config'
import pg from 'pg'
import { createDecipheriv } from 'node:crypto'
import { BetaAnalyticsDataClient } from '@google-analytics/data'

const arg = (k, d) => { const m = process.argv.find((a) => a.startsWith(`--${k}=`)); return m ? m.split('=')[1] : d }
const DAYS = Number(arg('days', 90))
const ONLY_BOT = arg('bot', null)
const dateRanges = [{ startDate: `${DAYS}daysAgo`, endDate: 'yesterday' }]
const ymd = (s) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
const num = (v) => Number(v || 0)

// --- token decryption (same v1 format as api/_lib/tokenCrypto.ts) ---
function encKey() {
  const raw = (process.env.TWILIO_TOKEN_ENC_KEY || '').trim()
  if (!raw) return null
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  return buf.length === 32 ? buf : null
}
function decryptToken(blob) {
  const k = encKey()
  if (!k || !blob || !blob.startsWith('v1:')) return null
  try {
    const b = Buffer.from(blob.slice(3), 'base64')
    const d = createDecipheriv('aes-256-gcm', k, b.subarray(0, 12))
    d.setAuthTag(b.subarray(12, 28))
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8')
  } catch { return null }
}

// --- OAuth path (per-bot refresh token → access token → REST runReport) ---
async function refreshAccessToken(refreshToken) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken, client_id: process.env.GA4_OAUTH_CLIENT_ID,
      client_secret: process.env.GA4_OAUTH_CLIENT_SECRET, grant_type: 'refresh_token',
    }).toString(),
  })
  if (!r.ok) throw new Error(`token refresh ${r.status} ${await r.text()}`)
  return (await r.json()).access_token
}
async function oauthRunner(propertyId, encToken) {
  const rt = decryptToken(encToken)
  if (!rt) return null
  const access = await refreshAccessToken(rt)
  const id = String(propertyId).replace(/\D/g, '')
  return async (body) => {
    const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${id}:runReport`, {
      method: 'POST', headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) throw new Error(`runReport ${r.status} ${await r.text()}`)
    return (await r.json()).rows ?? []
  }
}

// --- Service-account path (shared GA4_SA_KEY; for the GSB test property) ---
let saClient = null
function saRunner(propertyId) {
  if (!saClient) {
    const b64 = process.env.GA4_SA_KEY
    if (!b64) return null
    const credentials = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
    saClient = new BetaAnalyticsDataClient({ credentials })
  }
  const property = `properties/${String(propertyId).replace(/\D/g, '')}`
  return async (body) => {
    const [resp] = await saClient.runReport({ property, ...body })
    return resp.rows ?? []
  }
}

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()

async function upsert(table, cols, conflictCols, rows) {
  if (!rows.length) return 0
  const updateCols = cols.filter((c) => !conflictCols.includes(c))
  const setClause = updateCols.map((c) => `${c} = excluded.${c}`).join(', ')
  let done = 0
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const params = []
    const values = chunk.map((r, ri) => {
      cols.forEach((col) => params.push(r[col]))
      return `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(', ')})`
    })
    await c.query(
      `insert into ${table} (${cols.join(', ')}) values ${values.join(', ')}
       on conflict (${conflictCols.join(', ')}) do update set ${setClause}`, params)
    done += chunk.length
  }
  return done
}

const { rows: bots } = await c.query(
  `select bot_id, ga4_property_id, oauth_refresh_token_enc from report.bot_ga4
   where status <> 'paused'${ONLY_BOT ? ' and bot_id = $1' : ''} order by bot_id`,
  ONLY_BOT ? [Number(ONLY_BOT)] : [])
if (!bots.length) { console.log('No connected bots in report.bot_ga4.'); await c.end(); process.exit(0) }

for (const { bot_id, ga4_property_id, oauth_refresh_token_enc } of bots) {
  if (!ga4_property_id) { console.log(`\n=== bot ${bot_id} · no property selected — skip ===`); continue }
  const via = oauth_refresh_token_enc ? 'oauth' : 'service-account'
  console.log(`\n=== bot ${bot_id} · property ${ga4_property_id} · ${via} · last ${DAYS}d ===`)
  try {
    const run = oauth_refresh_token_enc
      ? await oauthRunner(ga4_property_id, oauth_refresh_token_enc)
      : saRunner(ga4_property_id)
    if (!run) { throw new Error(via === 'oauth' ? 'could not decrypt/refresh OAuth token' : 'GA4_SA_KEY not set for the service-account path') }

    // 1) traffic by day
    const traffic = await run({ dateRanges, dimensions: [{ name: 'date' }],
      metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'screenPageViews' }, { name: 'eventCount' }] })
    const nT = await upsert('report.ga4_traffic_daily',
      ['bot_id', 'day', 'sessions', 'users', 'pageviews', 'events'], ['bot_id', 'day'],
      traffic.map((r) => ({ bot_id, day: ymd(r.dimensionValues[0].value),
        sessions: num(r.metricValues[0].value), users: num(r.metricValues[1].value),
        pageviews: num(r.metricValues[2].value), events: num(r.metricValues[3].value) })))

    // 2) pages by day + host + path
    const pages = await run({ dateRanges,
      dimensions: [{ name: 'date' }, { name: 'hostName' }, { name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'sessions' }], limit: 100000 })
    const pMap = new Map()
    for (const r of pages) {
      const host = r.dimensionValues[1].value || ''
      const path = r.dimensionValues[2].value || ''
      const full = host + path
      const key = r.dimensionValues[0].value + '|' + full
      const prev = pMap.get(key)
      const row = { bot_id, day: ymd(r.dimensionValues[0].value), host, page_path: path, full_path: full,
        pageviews: num(r.metricValues[0].value), sessions: num(r.metricValues[1].value) }
      if (prev) { prev.pageviews += row.pageviews; prev.sessions += row.sessions } else pMap.set(key, row)
    }
    const nP = await upsert('report.ga4_page_daily',
      ['bot_id', 'day', 'host', 'page_path', 'full_path', 'pageviews', 'sessions'],
      ['bot_id', 'day', 'full_path'], [...pMap.values()])

    // 3) sources by day + source/medium
    const src = await run({ dateRanges,
      dimensions: [{ name: 'date' }, { name: 'sessionSourceMedium' }],
      metrics: [{ name: 'sessions' }, { name: 'activeUsers' }], limit: 100000 })
    const nS = await upsert('report.ga4_source_daily',
      ['bot_id', 'day', 'source_medium', 'sessions', 'users'], ['bot_id', 'day', 'source_medium'],
      src.map((r) => ({ bot_id, day: ymd(r.dimensionValues[0].value),
        source_medium: r.dimensionValues[1].value || '(unknown)',
        sessions: num(r.metricValues[0].value), users: num(r.metricValues[1].value) })))

    // 4) events by day + name
    const ev = await run({ dateRanges,
      dimensions: [{ name: 'date' }, { name: 'eventName' }],
      metrics: [{ name: 'eventCount' }], limit: 100000 })
    const nE = await upsert('report.ga4_event_daily',
      ['bot_id', 'day', 'event_name', 'event_count'], ['bot_id', 'day', 'event_name'],
      ev.map((r) => ({ bot_id, day: ymd(r.dimensionValues[0].value),
        event_name: r.dimensionValues[1].value || '', event_count: num(r.metricValues[0].value) })))

    await c.query(`update report.bot_ga4 set last_synced_at = now(), last_error = null,
      status = 'connected', updated_at = now() where bot_id = $1`, [bot_id])
    console.log(`  traffic ${nT}d · pages ${nP} · sources ${nS} · events ${nE} rows upserted`)
  } catch (e) {
    const msg = String(e.message || e).slice(0, 500)
    await c.query(`update report.bot_ga4 set last_error = $2, status = 'error', updated_at = now() where bot_id = $1`, [bot_id, msg])
    console.error(`  ❌ ${msg}`)
    if (/permission|PERMISSION_DENIED|403/i.test(msg))
      console.error('     → SA/token lacks read access on this property, or the Property ID is wrong.')
  }
}
await c.end()
console.log('\nDone.')
