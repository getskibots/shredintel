#!/usr/bin/env node
/**
 * build-bot-branding.mjs — per-bot branding store. One row per bot_id holding
 * an uploadable logo + background image (bytes in Postgres, written by the
 * server /api/branding endpoint with DB creds) + an overlay strength.
 *
 * The image BYTES are never exposed to anon — only a tiny config view
 * (has_logo / has_background / overlay / version) is anon-readable; the images
 * themselves are served by /api/branding-image (server-side). Idempotent.
 */
import 'dotenv/config'
import pg from 'pg'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()

await c.query(`create table if not exists report.bot_branding (
  bot_id     int primary key,
  logo_data  bytea,
  logo_mime  text,
  bg_data    bytea,
  bg_mime    text,
  overlay    real not null default 0.6,
  updated_at timestamptz not null default now()
)`)

// anon-readable CONFIG only — booleans + overlay + a cache-busting version.
// Never exposes the image bytes; those go through /api/branding-image.
await c.query(`create or replace view report.bot_branding_config as
  select bot_id,
         (logo_data is not null) as has_logo,
         (bg_data is not null)   as has_background,
         overlay,
         extract(epoch from updated_at)::bigint as v
    from report.bot_branding`)
await c.query(`grant select on report.bot_branding_config to anon, authenticated`)
await c.query(`notify pgrst, 'reload schema'`)
console.log('✓ report.bot_branding + report.bot_branding_config created + granted + PostgREST reloaded')

const { rows } = await c.query('select bot_id, has_logo, has_background, overlay, v from report.bot_branding_config order by bot_id')
console.log(`\nexisting branding rows: ${rows.length}`)
for (const r of rows) console.log(`  bot ${r.bot_id}: logo=${r.has_logo} bg=${r.has_background} overlay=${r.overlay}`)

await c.end()
console.log('\ndone.')
