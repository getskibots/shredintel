#!/usr/bin/env node
/**
 * build-bot-go-live.mjs — report.bot_go_live: the authoritative billable set +
 * launch date per live-production bot (from Brandon's list, 2026-07-17). This is
 * what the Botscrew $40/mo platform fee prorates against, so a bot launched
 * mid-window is only charged from its go-live date — not the whole window.
 *
 * Membership in THIS table (not a name match) defines who incurs the $40/mo.
 * Service-role only; the fee is surfaced via the fleet_usage rpc (security definer).
 *
 * Idempotent. Prod write.  node build-bot-go-live.mjs
 */
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { config } from 'dotenv'
import pg from 'pg'
config({ path: join(dirname(fileURLToPath(import.meta.url)), '.env') })

// given-name → bot_id → ISO launch date. bot_ids resolved from public.bots.
// ⚠ flagged rows are uncertain — verify against the printed actual name.
const GO_LIVE = [
  { name: 'Get Ski Tickets',          bot: 1,   since: '2024-08-15' },
  { name: 'Mountain Collective',      bot: 2,   since: '2024-08-15' },
  { name: 'Sipapu',                   bot: 23,  since: '2024-08-15' },
  { name: 'Diamond Peak Ski Resort',  bot: 17,  since: '2024-11-20' },
  { name: 'Jackson Hole',             bot: 43,  since: '2024-11-26' },
  { name: 'Fred the Moose',           bot: 60,  since: '2025-02-20' },
  { name: 'Angel Fire Resort',        bot: 137, since: '2025-02-07' },
  { name: 'Mountain Creek Resort',    bot: 90,  since: '2025-03-28' },
  { name: 'Big Snow',                 bot: 103, since: '2025-03-28' },
  { name: 'Gunstock Mountain Resort', bot: 166, since: '2025-06-07' },
  { name: 'Mountain Lodge Telluride', bot: 65,  since: '2025-06-23' },
  { name: 'Killington',               bot: 16,  since: '2025-06-24' },
  { name: 'Pico',                     bot: 189, since: '2025-06-24' },
  { name: 'Ski Portillo',             bot: 152, since: '2025-06-25' },
  { name: 'Blue Hills Ski Area',      bot: 200, since: '2025-08-11' },
  { name: 'Voice – Mtn Collective',   bot: 248, since: '2025-08-15' },
  { name: 'Snow Trails',              bot: 190, since: '2025-09-01' },
  { name: 'Snow Triple Play Pass',    bot: 258, since: '2025-09-01' },
  { name: 'Ski Marmot Basin',         bot: 142, since: '2025-09-04' },
  { name: 'Calabogie',                bot: 263, since: '2025-09-16' },
  { name: 'Sugarbowl',                bot: 171, since: '2025-09-18' },
  { name: 'Cranmore',                 bot: 101, since: '2025-11-01' },
  { name: 'Outside Travel',           bot: 311, since: '2025-11-01' },
  { name: 'Shawnee Mtn',              bot: 69,  since: '2025-10-27' },
  { name: 'Pajarito',                 bot: 55,  since: '2025-11-08' },
  { name: 'Peak N Peek',              bot: 76,  since: '2025-11-20' },
  { name: 'Splash Lagoon',            bot: 275, since: '2025-11-20' },
  { name: 'Brundage Mountain',        bot: 136, since: '2025-11-26' },
  { name: 'Snow Valley, Ontario',     bot: 277, since: '2025-11-26' },
  { name: 'Snowy Range',              bot: 254, since: '2025-11-26' },
  { name: 'Summit Express',           bot: 364, since: '2026-01-30' },
  { name: 'Sunrise Park Resort',      bot: 359, since: '2026-02-05' },
  // ⚠ FLAGGED — verify these against the printed actual name:
  { name: 'Get Ski Bots Voice',       bot: 285, since: '2026-02-01', flag: true }, // Voice - Get Ski Bots
  { name: 'Get Ski Bots Voice (2)',   bot: 253, since: '2025-10-27', flag: true }, // Voice - GetSkiTickets?
  { name: 'Steamboat Gravel',         bot: 140, since: '2026-11-01', flag: true }, // SBT GRVL — date likely typo for 2025
]

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()

await c.query(`create table if not exists report.bot_go_live (
  bot_id bigint primary key,
  name_given text,
  live_since date not null,
  flagged boolean not null default false,
  updated_at timestamptz not null default now()
)`)
await c.query('revoke all on report.bot_go_live from anon, authenticated').catch(() => {})
await c.query('truncate report.bot_go_live')

for (const g of GO_LIVE) {
  await c.query(
    `insert into report.bot_go_live (bot_id, name_given, live_since, flagged)
     values ($1,$2,$3,$4)
     on conflict (bot_id) do update set name_given=excluded.name_given, live_since=excluded.live_since, flagged=excluded.flagged, updated_at=now()`,
    [g.bot, g.name, g.since, !!g.flag])
}

// AUTO-ADD active voice bots (billed per bot_id per Brandon 2026-07-17). Go-live
// is ESTIMATED from first recorded activity → flagged=true so it can be pruned/
// corrected. Excludes test/template/redirect lines. Skips any already seeded above.
const added = await c.query(`
  insert into report.bot_go_live (bot_id, name_given, live_since, flagged)
  select fo.bot_id, fo.name,
         (select min(day) from report.conversation_depth cd where cd.bot_id = fo.bot_id and cd.conversations > 0),
         true
    from report.fleet_overview fo
    left join report.bot_go_live gl on gl.bot_id = fo.bot_id
   where fo.channel = 'voice' and fo.conv_all > 0 and gl.bot_id is null
     and fo.name !~* 'template|test|sandbox|demo|redirect'
     and exists (select 1 from report.conversation_depth cd where cd.bot_id = fo.bot_id and cd.conversations > 0)
  on conflict (bot_id) do nothing`)
console.log(`auto-added ${added.rowCount} active voice bots (go-live estimated from first activity, flagged)\n`)

// verify: print given name vs the ACTUAL public.bots name for each bot_id
const { rows } = await c.query(`
  select gl.bot_id, gl.name_given, gl.live_since, gl.flagged, b.name actual
    from report.bot_go_live gl left join public.bots b on b.id = gl.bot_id
   order by gl.live_since`)
console.log(`report.bot_go_live — ${rows.length} billable bots:\n`)
console.log('  bot  live_since   given  →  actual (public.bots)')
for (const r of rows) {
  const flag = r.flagged ? ' ⚠' : ''
  const miss = !r.actual ? '  ❌ NO SUCH BOT' : ''
  console.log(`  ${String(r.bot_id).padStart(4)}  ${String(r.live_since).slice(0,10)}  ${r.name_given}  →  ${r.actual || '(missing)'}${flag}${miss}`)
}
await c.end()
