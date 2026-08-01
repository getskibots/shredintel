#!/usr/bin/env node
/**
 * build-fleet-drill-rpc.mjs — report.fleet_drill(dim, value, from, to, limit):
 * the fleet-wide drill-down list behind Master'Botter. Given a dimension +
 * value (the thing the user clicked in the heartbeat) and a date range, returns
 * the matching conversations ACROSS ALL BOTS, each labeled with its resort name,
 * newest first. The modal then opens each transcript via the bot-scoped
 * /api/transcript (using the row's bot_id).
 *
 * Reads report.conversation_intel directly (has every dimension the summary
 * aggregates: sentiment / urgency / handover / category / flavor / resolution).
 * SECURITY DEFINER so anon gets ONLY this shaped list, never the raw table.
 *
 * Prod write, idempotent.  node build-fleet-drill-rpc.mjs
 */
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { config } from 'dotenv'
import pg from 'pg'
config({ path: join(dirname(fileURLToPath(import.meta.url)), '.env') })

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()

// The join to conversation_time / call_base is by conversation_id; give both an
// index on it (they only index (bot_id, day)). Regular REFRESH keeps indexes, so
// this is a one-time add. Idempotent.
await c.query('create index if not exists conversation_time_cid on report.conversation_time (conversation_id)')
await c.query('create index if not exists call_base_cid on report.call_base (conversation_id)')

await c.query('drop function if exists report.fleet_drill(text, text, date, date, int)')
await c.query(`
create or replace function report.fleet_drill(
  p_dim text, p_value text, p_from date, p_to date, p_limit int default 100
)
returns table (
  bot_id          bigint,
  bot_name        text,
  conversation_id bigint,
  channel         text,   -- 'voice' when the conversation has a call record, else 'chat'
  topic           text,
  sentiment       text,
  category        text,
  day             date,
  started_local   text,   -- resort-local wall clock as text (no tz shift on the wire)
  duration_sec    int,
  page_path       text,   -- chat: the page the guest was on
  city            text,   -- IP-geo (chat) or phone-geo (voice); never the raw IP
  region          text,
  country_iso     text,
  lat             double precision,
  lon             double precision,
  recording_sid   text    -- voice only; presence → a recording is playable
)
language sql stable security definer
set search_path = report, public
as $fn$
  -- Pick the matching conversations FIRST (cheap, indexed), then enrich the ≤200
  -- survivors with their chat/voice sidecar — so the expensive joins run on the
  -- small set, not every matching row.
  with hits as (
    select ci.bot_id, ci.conversation_id, ci.topic, ci.sentiment, ci.category, ci.day
      from report.conversation_intel ci
     where ci.day between p_from and p_to
       and ci.substantive
       and case lower(p_dim)
             when 'sentiment'  then ci.sentiment = p_value
             when 'urgency'    then ci.urgency ilike p_value || '%'
             -- handover to a human = Clear Handover / Escalation Required (NOT 'No Handover')
             when 'handover'   then coalesce(ci.handover,'') in ('Clear Handover','Escalation Required')
             when 'category'   then ci.category = p_value
             when 'flavor'     then ci.flavor = p_value
             when 'resolution' then ci.resolution = p_value
             -- outcome: the fleet_fix bucket model, mirrored so the donut slices drill 1:1
             when 'outcome'    then (case
                 when coalesce(ci.handover,'') in ('Clear Handover','Escalation Required') then 'needs_human'
                 when ci.resolution = 'Resolved' then 'ai_solved'
                 else 'unresolved'
               end) = p_value
             when 'channel'    then true  -- channel filtered by the caller's bot set
             else true
           end
     order by ci.day desc, ci.conversation_id desc
     limit greatest(1, least(p_limit, 200))
  )
  select h.bot_id,
         coalesce(b.name, 'Bot ' || h.bot_id) as bot_name,
         h.conversation_id,
         case when cb.conversation_id is not null then 'voice' else 'chat' end as channel,
         h.topic, h.sentiment, h.category, h.day,
         to_char(coalesce(cb.started_local, ct.started_local), 'YYYY-MM-DD"T"HH24:MI:SS') as started_local,
         coalesce(cb.dur_sec, ct.duration_sec)      as duration_sec,
         ct.page_path,
         coalesce(cb.from_city, ct.city)            as city,
         coalesce(cb.from_region, ct.region)        as region,
         coalesce(cb.from_country, ct.country_iso)  as country_iso,
         coalesce(cb.from_lat, ct.lat)              as lat,
         coalesce(cb.from_lon, ct.lon)              as lon,
         cb.recording_sid
    from hits h
    left join public.bots b on b.id = h.bot_id
    left join report.conversation_time ct on ct.conversation_id = h.conversation_id and ct.bot_id = h.bot_id
    left join report.call_base cb on cb.conversation_id = h.conversation_id and cb.bot_id = h.bot_id
   order by h.day desc, h.conversation_id desc
$fn$`)
await c.query('grant execute on function report.fleet_drill(text, text, date, date, int) to anon, authenticated')
await c.query(`notify pgrst, 'reload schema'`)

// sanity: a few dims over all-time — confirm the sidecar (channel/geo/page/recording) rides along
for (const [dim, val] of [['outcome', 'ai_solved'], ['outcome', 'needs_human'], ['outcome', 'unresolved'], ['handover', ''], ['sentiment', 'Negative']]) {
  const { rows } = await c.query(
    `select bot_name, channel, topic, city, region, page_path, recording_sid, duration_sec, started_local
       from report.fleet_drill($1,$2,(current_date-730)::date,(current_date-1)::date, 5)`,
    [dim, val])
  console.log(`✓ ${dim}=${val || '(any)'}: ${rows.length} sample rows`)
  for (const r of rows.slice(0, 3)) {
    const where = [r.city, r.region].filter(Boolean).join(', ')
    const extra = r.channel === 'voice'
      ? `📞 ${where || 'no geo'}${r.recording_sid ? ' · 🎙️rec' : ''}${r.duration_sec ? ` · ${r.duration_sec}s` : ''}`
      : `💬 ${r.page_path || 'no page'}${where ? ` · ${where}` : ''}`
    console.log(`    ${r.bot_name} — ${(r.topic || '(no topic)').slice(0, 40)} | ${extra}`)
  }
}
await c.end()
