#!/usr/bin/env node
/**
 * build-geo-views.mjs — the LOCATION layer for the chat dashboard.
 *
 * report.conversation_geo is a MATERIALIZED view joining conversation_intel →
 * admin_conversation → admin_user → report.ip_geo. Like conversation_page it
 * materializes the raw.* join so anon never touches raw.*, and — critically —
 * it selects ONLY the geo attributes (country/region/city/lat/lon), never the
 * raw IP, so the anon-granted layer stays PII-free.
 *
 * Aggregates on top: geo_country (market breakdown) + geo_city (map, with
 * lat/lon). Both scoped to substantive = real guests (bot noise washes out).
 * Carry `day` (resort-local) so they filter with the dashboard date range.
 *
 * Run after build-ip-geo.mjs. Separate from the enrichment so the views can be
 * rebuilt without re-enriching 382k IPs. Idempotent. Add 'conversation_geo' to
 * the MATVIEWS refresh list in sync.mjs so it refreshes nightly.
 */
import 'dotenv/config'
import pg from 'pg'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()
await c.query("set statement_timeout='280000ms'")

console.log('Building report.conversation_geo (matview) …')
await c.query('drop view if exists report.geo_country, report.geo_city cascade')
await c.query('drop materialized view if exists report.conversation_geo cascade')
await c.query(`
  create materialized view report.conversation_geo as
  select ci.bot_id, ci.conversation_id, ci.day, ci.substantive, ci.sentiment,
         g.country_iso, g.country_name, g.region, g.city, g.lat, g.lon, g.is_datacenter
    from report.conversation_intel ci
    join raw.admin_conversation cv on cv.id = ci.conversation_id
    join raw.admin_user u on u.id = cv.user_id
    join report.ip_geo g on g.ip = u.ip_address`)
await c.query('create index on report.conversation_geo (bot_id, day)')
await c.query('create index on report.conversation_geo (bot_id, conversation_id)')
await c.query('grant select on report.conversation_geo to anon, authenticated')

console.log('Building aggregate views …')
// Country breakdown (US/Canada vs international is derived client-side).
await c.query(`create view report.geo_country as
  select bot_id, day, country_iso, max(country_name) as country_name, count(*)::int as conversations
    from report.conversation_geo
   where substantive is true and country_iso is not null
   group by bot_id, day, country_iso`)
// City map — one row per (day, country, region, city) with a centroid lat/lon.
await c.query(`create view report.geo_city as
  select bot_id, day, country_iso, region, city,
         avg(lat)::double precision as lat, avg(lon)::double precision as lon,
         count(*)::int as conversations
    from report.conversation_geo
   where substantive is true and city is not null and lat is not null
   group by bot_id, day, country_iso, region, city`)

for (const v of ['geo_country', 'geo_city']) await c.query(`grant select on report.${v} to anon, authenticated`)
await c.query(`notify pgrst, 'reload schema'`)
console.log('✓ location views created + granted + PostgREST reloaded')

// ── verify against JH (bot 43) ───────────────────────────────────────────────
const { rows: [cov] } = await c.query(`select
  (select count(*) from report.conversation_intel where bot_id=43 and substantive) subst,
  (select count(*) from report.conversation_geo where bot_id=43 and substantive) geo`)
console.log(`\ncoverage bot 43: ${cov.geo} of ${cov.subst} substantive conversations located (${(100 * cov.geo / cov.subst).toFixed(1)}%)`)

const { rows: ctry } = await c.query(`select country_iso, sum(conversations)::int n
  from report.geo_country where bot_id=43 group by country_iso order by n desc limit 8`)
console.log('\ntop countries (bot 43, substantive):')
for (const r of ctry) console.log(`  ${r.country_iso}: ${r.n}`)

const { rows: cities } = await c.query(`select city, region, sum(conversations)::int n
  from report.geo_city where bot_id=43 group by city, region order by n desc limit 12`)
console.log('\ntop guest cities (bot 43, substantive):')
for (const r of cities) console.log(`  ${r.city}, ${r.region || '?'}: ${r.n}`)

await c.end()
console.log('\ndone.')
