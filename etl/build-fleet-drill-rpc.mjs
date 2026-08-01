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

await c.query('drop function if exists report.fleet_drill(text, text, date, date, int)')
await c.query(`
create or replace function report.fleet_drill(
  p_dim text, p_value text, p_from date, p_to date, p_limit int default 100
)
returns table (
  bot_id          bigint,
  bot_name        text,
  conversation_id bigint,
  topic           text,
  sentiment       text,
  category        text,
  day             date
)
language sql stable security definer
set search_path = report, public
as $fn$
  select ci.bot_id,
         coalesce(b.name, 'Bot ' || ci.bot_id) as bot_name,
         ci.conversation_id,
         ci.topic,
         ci.sentiment,
         ci.category,
         ci.day
    from report.conversation_intel ci
    left join public.bots b on b.id = ci.bot_id
   where ci.day between p_from and p_to
     and ci.substantive
     and case lower(p_dim)
           when 'sentiment'  then ci.sentiment = p_value
           when 'urgency'    then ci.urgency ilike p_value || '%'
           when 'handover'   then (ci.handover is not null and ci.handover not in ('None', ''))
           when 'category'   then ci.category = p_value
           when 'flavor'     then ci.flavor = p_value
           when 'resolution' then ci.resolution = p_value
           when 'channel'    then true  -- channel filtered by the caller's bot set
           else true
         end
   order by ci.day desc, ci.conversation_id desc
   limit greatest(1, least(p_limit, 200))
$fn$`)
await c.query('grant execute on function report.fleet_drill(text, text, date, date, int) to anon, authenticated')
await c.query(`notify pgrst, 'reload schema'`)

// sanity: a few dims over all-time
for (const [dim, val] of [['flavor', 'furious'], ['urgency', 'High'], ['category', 'Pricing & Availability'], ['sentiment', 'Negative']]) {
  const { rows } = await c.query(
    `select bot_name, topic, sentiment from report.fleet_drill($1,$2,(current_date-730)::date,(current_date-1)::date, 5)`,
    [dim, val])
  console.log(`✓ ${dim}=${val}: ${rows.length} sample rows`)
  for (const r of rows.slice(0, 2)) console.log(`    ${r.bot_name} — ${(r.topic || '(no topic)').slice(0, 50)} [${r.sentiment}]`)
}
await c.end()
