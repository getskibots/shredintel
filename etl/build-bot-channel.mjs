#!/usr/bin/env node
/**
 * build-bot-channel.mjs — the OMNI-CHANNEL classifier.
 *
 * One row per bot: which channel it serves. This is THE field that drives which
 * ShredIntel card/template renders for a bot — chat today, voice today, email/SMS/
 * messenger next. As GSB goes omni-channel, presentation forks on `channel`, never
 * on hard-coded bot lists.
 *
 * Ground truth = raw.admin_user.platform (per conversation, via the user). Verified
 * 2026-07-07: channel is 1:1 with bot_id (286 chat / 51 voice / 0 mixed), so this is
 * a clean per-bot tag — no per-conversation splitting needed.
 *
 * EXTENDING for a new channel (e.g. email): add ONE branch to the CASE below, add a
 * template on the frontend keyed by the same channel string, and (if it's a new raw
 * platform) it flows in automatically. No schema change.
 *
 * Prod write. Idempotent. Run:  node build-bot-channel.mjs
 */
import 'dotenv/config'
import pg from 'pg'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()
await c.query("set statement_timeout='300000ms'")

// ── report.bot_channel: bot_id → channel (+ raw platform + volume for filtering) ──
// The CASE is the single place channels are defined. `platform` (the dominant raw
// value) is kept so future channels can break out of the 'chat' bucket by data alone.
await c.query('drop materialized view if exists report.bot_channel cascade')
await c.query(`create materialized view report.bot_channel as
  with per_bot as (
    select u.bot_id,
      count(*)::int convs,
      count(*) filter (where u.platform = 'VOICE_TWILIO')::int voice_convs,
      mode() within group (order by u.platform) as top_platform
    from raw.admin_conversation cv
    join raw.admin_user u on u.id = cv.user_id
    where cv.started_at >= '2024-10-01'
    group by u.bot_id
  )
  select
    bot_id,
    top_platform as platform,
    convs,
    voice_convs,
    case
      when voice_convs > 0 then 'voice'
      -- when top_platform = 'EMAIL'        then 'email'      -- (future)
      -- when top_platform = 'FB_MESSENGER' then 'messenger'  -- (future breakout)
      else 'chat'
    end as channel
  from per_bot`)
await c.query('create unique index bot_channel_pk on report.bot_channel (bot_id)')
await c.query('create index bot_channel_ch on report.bot_channel (channel)')
await c.query('grant select on report.bot_channel to anon, authenticated')
await c.query(`notify pgrst, 'reload schema'`)
console.log('✓ report.bot_channel built + granted')

// ── verify ──
const mix = (await c.query(`select channel, count(*)::int bots, sum(convs)::int convs
  from report.bot_channel group by channel order by bots desc`)).rows
console.log('\nchannel split:')
for (const r of mix) console.log(`  ${r.channel.padEnd(8)} ${String(r.bots).padStart(4)} bots · ${r.convs} convs`)

const v = (await c.query(`
  select bc.bot_id, bc.convs, b.name
  from report.bot_channel bc left join public.bots b on b.id = bc.bot_id
  where bc.channel='voice' order by bc.convs desc limit 12`)).rows
console.log('\ntop voice bots (bot · convs · name):')
for (const r of v) console.log(`  ${String(r.bot_id).padStart(4)} · ${String(r.convs).padStart(6)} · ${r.name || '(no name)'}`)

// sanity: any bot the app knows about (public.bots) missing a channel row?
const miss = (await c.query(`select count(*)::int n from public.bots b
  where not exists (select 1 from report.bot_channel bc where bc.bot_id=b.id)`)).rows[0].n
console.log(`\nbots in public.bots with no conversations since 2024-10-01 (no channel row): ${miss}`)
await c.end()
console.log('\ndone.')
