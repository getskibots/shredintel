#!/usr/bin/env node
/**
 * sync-openai-costs.mjs — per-bot OpenAI spend, the third cost lane of the fleet
 * dashboard (after Twilio call price + Twilio bill). GSB owns the OpenAI org and
 * organizes it ONE PROJECT PER BOT ("Jackson Hole Chat", "Mountain Collective
 * Voice", …), so OpenAI's own Costs API already gives us true per-bot dollars —
 * no token estimation.
 *
 *   report.openai_project_map   — project_id → bot_id (+ kind), service-role,
 *                                 auto-matched by name+channel, correctable
 *                                 (source='override' is never overwritten)
 *   report.openai_project_cost  — project_id × day × $ (service-role)
 *   report.openai_cost_daily    — bot_id × day × $ (ANON rollup, kind='bot' only)
 *
 * Requires OPENAI_ADMIN_KEY (sk-admin-…, Owner-created, api.usage.read scope) in
 * etl/.env — the project-scoped sk-proj key can't read org billing.
 *
 * Incremental: costs for past days are finalized, so re-pull from max(day)-2d.
 * First run backfills from 2024-10-01 (the report floor). Idempotent. Prod write.
 *   node sync-openai-costs.mjs [--full] [--remap]
 */
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { config } from 'dotenv'
import { fetchRetry, resilientClient } from './_twilio-lib.mjs'
config({ path: join(dirname(fileURLToPath(import.meta.url)), '.env') })

const FULL = process.argv.includes('--full')
const REMAP = process.argv.includes('--remap')
const FLOOR = '2024-10-01'
const KEY = (process.env.OPENAI_ADMIN_KEY || '').trim()
if (!KEY) { console.error('✗ OPENAI_ADMIN_KEY missing in etl/.env'); process.exit(1) }
const H = { Authorization: 'Bearer ' + KEY }

const oa = async (url) => {
  const r = await fetchRetry(url, { headers: H })
  if (!r.ok) throw new Error(`OpenAI ${r.status}: ${(await r.text()).slice(0, 160)}`)
  return r.json()
}

// ── name matching ────────────────────────────────────────────────────────────
// Internal / non-resort projects → GSB overhead, not a bot. (lowercased contains)
const INTERNAL = [
  'shredintel', 'shred intel', 'gsb demos', 'gsb voice demos', 'tools', 'ai emails',
  'trailhead', 'chatbot icon studio', 'omni', 'growth lab', 'sendy',
]
const isInternal = (n) => INTERNAL.some((k) => n.toLowerCase().includes(k))
const isDemo = (n) => /\bdemo(s)?\b/i.test(n)

const STOP = new Set(['active', 'chat', 'voice', 'the', 'resort', 'mountain', 'mtn', 'ski', 'area', 'inc', 'llc', 'com'])
function tokens(s) {
  return (s || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t) && !/^\d+$/.test(t))
}
function jaccard(a, b) {
  const A = new Set(a), B = new Set(b)
  if (!A.size || !B.size) return 0
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  return inter / (A.size + B.size - inter)
}
/** channel from a project name suffix, else null (ambiguous). */
const projChannel = (n) => (/\bvoice\b/i.test(n) ? 'voice' : /\bchat\b/i.test(n) ? 'chat' : null)

const c = resilientClient(process.env)
await c.connect()

await c.query(`create table if not exists report.openai_project_map (
  project_id text primary key,
  project_name text,
  bot_id bigint,
  channel text,
  kind text,               -- 'bot' | 'internal' | 'demo' | 'unmatched' | 'ambiguous'
  confidence numeric,
  source text not null default 'auto',   -- 'auto' | 'override'
  updated_at timestamptz not null default now()
)`)
await c.query(`create table if not exists report.openai_project_cost (
  project_id text not null,
  day date not null,
  cost_usd numeric,
  synced_at timestamptz not null default now(),
  primary key (project_id, day)
)`)
await c.query('revoke all on report.openai_project_map, report.openai_project_cost from anon, authenticated').catch(() => {})

// ── 1. projects → auto-map to bots ───────────────────────────────────────────
const projects = (await oa('https://api.openai.com/v1/organization/projects?limit=100&include_archived=false')).data || []
const { rows: bots } = await c.query(
  `select b.id, b.name, coalesce(bc.channel,'chat') channel
     from public.bots b left join report.bot_channel bc on bc.bot_id=b.id`)
const botTok = bots.map((b) => ({ ...b, tok: tokens(b.name) }))

// which project_ids are pinned by an override — never re-touch those
const pinned = new Set(
  (await c.query(`select project_id from report.openai_project_map where source='override'`)).rows.map((r) => r.project_id))

let matched = 0, internal = 0, ambiguous = 0, unmatched = 0
const report = []
for (const p of projects) {
  if (pinned.has(p.id) && !REMAP) continue
  const nm = p.name || ''
  let bot_id = null, channel = null, kind = 'unmatched', conf = 0

  if (isInternal(nm) || isDemo(nm)) {
    kind = isDemo(nm) ? 'demo' : 'internal'
    internal++
  } else {
    const ch = projChannel(nm)
    const ptok = tokens(nm)
    // candidates: same channel when known, else all
    const cands = botTok
      .filter((b) => (ch ? b.channel === ch : true))
      .map((b) => ({ b, s: jaccard(ptok, b.tok) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
    if (cands.length && cands[0].s >= 0.34) {
      const top = cands[0], second = cands[1]
      // ambiguous when channel unknown AND a near-tie across channels
      const tie = second && second.s >= top.s - 0.01 && second.b.channel !== top.b.channel
      if (!ch && tie) { kind = 'ambiguous'; conf = top.s; ambiguous++ }
      else { bot_id = top.b.id; channel = top.b.channel; kind = 'bot'; conf = top.s; matched++ }
    } else { unmatched++ }
  }
  report.push({ pid: p.id, name: nm, bot_id, channel, kind, conf })
  await c.query(
    `insert into report.openai_project_map (project_id, project_name, bot_id, channel, kind, confidence, source, updated_at)
     values ($1,$2,$3,$4,$5,$6,'auto',now())
     on conflict (project_id) do update set
       project_name=excluded.project_name, bot_id=excluded.bot_id, channel=excluded.channel,
       kind=excluded.kind, confidence=excluded.confidence, updated_at=now()
     where report.openai_project_map.source <> 'override'`,
    [p.id, nm, bot_id, channel, kind, conf])
}
console.log(`map: ${matched} bot · ${internal} internal/demo · ${ambiguous} ambiguous · ${unmatched} unmatched  (${pinned.size} pinned overrides kept)`)

// ── 2. costs by project × day ────────────────────────────────────────────────
const { rows: [w] } = await c.query('select max(day) d from report.openai_project_cost')
const sinceISO = FULL || !w.d ? FLOOR : new Date(new Date(w.d).getTime() - 2 * 86400e3).toISOString().slice(0, 10)
const startTs = Math.floor(new Date(sinceISO + 'T00:00:00Z').getTime() / 1000)

let url = `https://api.openai.com/v1/organization/costs?start_time=${startTs}&group_by=project_id&limit=180`
let days = 0, upserts = 0
while (url) {
  const body = await oa(url)
  for (const bucket of body.data || []) {
    const day = new Date((bucket.start_time || 0) * 1000).toISOString().slice(0, 10)
    days++
    for (const r of bucket.results || []) {
      const amt = Number(r.amount?.value) || 0
      if (amt === 0) continue
      const pid = r.project_id || '(none)'
      await c.query(
        `insert into report.openai_project_cost (project_id, day, cost_usd, synced_at)
         values ($1,$2,$3,now())
         on conflict (project_id, day) do update set cost_usd=excluded.cost_usd, synced_at=now()`,
        [pid, day, amt])
      upserts++
    }
  }
  url = body.has_more ? `https://api.openai.com/v1/organization/costs?start_time=${startTs}&group_by=project_id&limit=180&page=${body.next_page}` : null
}
console.log(`costs: ${days} day-buckets since ${sinceISO}, ${upserts} project-day rows upserted`)

// ── 3. anon rollup: bot_id × day × $ (only real bots) ────────────────────────
await c.query('drop materialized view if exists report.openai_cost_daily')
await c.query(`create materialized view report.openai_cost_daily as
  select m.bot_id, pc.day, round(sum(pc.cost_usd), 4) as cost_usd
    from report.openai_project_cost pc
    join report.openai_project_map m on m.project_id = pc.project_id
   where m.kind = 'bot' and m.bot_id is not null
   group by m.bot_id, pc.day`)
await c.query('create unique index openai_cost_daily_pk on report.openai_cost_daily (bot_id, day)')
await c.query('grant select on report.openai_cost_daily to anon, authenticated')
await c.query(`notify pgrst, 'reload schema'`)

// ── summary ──────────────────────────────────────────────────────────────────
const { rows: [t] } = await c.query(`select round(sum(cost_usd),2) usd, min(day) mn, max(day) mx from report.openai_project_cost`)
const { rows: [b] } = await c.query(`select round(sum(cost_usd),2) usd from report.openai_cost_daily`)
console.log(`\n✓ OpenAI spend ${t.mn}→${t.mx}: $${t.usd} total · $${b.usd} attributed to bots`)
console.log(`  last 30d per-bot top:`)
const { rows: top } = await c.query(`
  select o.bot_id, coalesce(bb.name,'?') name, round(sum(o.cost_usd),2) usd
    from report.openai_cost_daily o left join public.bots bb on bb.id=o.bot_id
   where o.day >= current_date - 30 group by o.bot_id, bb.name order by usd desc limit 8`)
for (const r of top) console.log(`    bot ${String(r.bot_id).padStart(4)}  $${String(r.usd).padStart(7)}  ${r.name}`)

// flag the rows that need a human decision
const { rows: flags } = await c.query(`
  select project_name, kind, confidence from report.openai_project_map
   where kind in ('ambiguous','unmatched') order by kind, project_name`)
if (flags.length) {
  console.log(`\n⚠ ${flags.length} project(s) need confirmation (cost currently NOT attributed):`)
  for (const f of flags) console.log(`    [${f.kind}] ${f.project_name}`)
}
await c.end()
