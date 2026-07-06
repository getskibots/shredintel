#!/usr/bin/env node
/**
 * build-ip-geo.mjs — offline IP → location enrichment.
 *
 * Enriches every distinct raw.admin_user.ip_address against the local MaxMind
 * GeoLite2 City + ASN databases → report.ip_geo (city / region / lat-lon /
 * network owner). Lookups run entirely offline against the .mmdb files, so NO
 * IP ever leaves our infrastructure.
 *
 * PII: report.ip_geo holds the RAW IP, so it is deliberately NOT granted to
 * anon (report.* is grant-per-object; we just don't grant it + revoke to be
 * certain). Only aggregate location views (built separately, no raw IP) get
 * anon-exposed for the dashboard.
 *
 * The is_datacenter flag is stored as a factual field only — the bot/junk
 * FILTER feature is parked; nothing reads or acts on this yet.
 *
 * Prereq: node geoip-update.mjs (downloads the .mmdb files). Idempotent upsert;
 * safe to re-run (e.g. after a GeoLite2 refresh or new IPs sync in).
 *   node build-ip-geo.mjs
 */
import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import maxmind from 'maxmind'
import pg from 'pg'

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'geoip')
const city = await maxmind.open(path.join(DIR, 'GeoLite2-City.mmdb'))
const asn = await maxmind.open(path.join(DIR, 'GeoLite2-ASN.mmdb'))

// v1 datacenter/hosting/VPN heuristic on the ASN org name (GeoLite2 has no
// usage_type). Residential ISPs (Comcast, Verizon, Spectrum…) don't match.
const DATACENTER = /(amazon|aws|ec2|google llc|google cloud|microsoft|azure|digitalocean|digital ocean|ovh|hetzner|linode|vultr|choopa|leaseweb|contabo|scaleway|oracle|alibaba|aliyun|tencent|huawei|m247|datacamp|colocrossing|hostwinds|namecheap|godaddy|ipxo|zenlayer|constant company|equinix|fastly|cloudflare|akamai|data ?cent(er|re)|hosting|colo(cation)?|\bvpn\b|proxy|dedicated|virtual server|\bvps\b|frantech|serverius|worldstream|nforce|host europe|censys|shodan)/i

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()
await c.query("set statement_timeout='600000ms'")

await c.query(`create table if not exists report.ip_geo (
  ip text primary key,
  country_iso text,
  country_name text,
  region text,
  city text,
  lat double precision,
  lon double precision,
  accuracy_km integer,
  asn integer,
  asn_org text,
  is_datacenter boolean not null default false,
  updated_at timestamptz not null default now()
)`)
// PII lockdown — raw IP must never reach the anon key.
await c.query('revoke all on report.ip_geo from anon').catch(() => {})

const { rows: ips } = await c.query(`select distinct ip_address ip from raw.admin_user where ip_address is not null`)
console.log(`enriching ${ips.length} distinct IPs (offline)…`)

const t0 = Date.now()
const BATCH = 1000
let done = 0
for (let i = 0; i < ips.length; i += BATCH) {
  const slice = ips.slice(i, i + BATCH)
  const params = []
  const tuples = []
  slice.forEach((r, j) => {
    const ip = r.ip
    let g, a
    try { g = city.get(ip) } catch { g = null }
    try { a = asn.get(ip) } catch { a = null }
    const org = a?.autonomous_system_organization ?? null
    params.push(
      ip,
      g?.country?.iso_code ?? null,
      g?.country?.names?.en ?? null,
      g?.subdivisions?.[0]?.iso_code ?? null,
      g?.city?.names?.en ?? null,
      g?.location?.latitude ?? null,
      g?.location?.longitude ?? null,
      g?.location?.accuracy_radius ?? null,
      a?.autonomous_system_number ?? null,
      org,
      org ? DATACENTER.test(org) : false,
    )
    const b = j * 11
    tuples.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11})`)
  })
  await c.query(
    `insert into report.ip_geo (ip,country_iso,country_name,region,city,lat,lon,accuracy_km,asn,asn_org,is_datacenter)
     values ${tuples.join(',')}
     on conflict (ip) do update set
       country_iso=excluded.country_iso, country_name=excluded.country_name, region=excluded.region,
       city=excluded.city, lat=excluded.lat, lon=excluded.lon, accuracy_km=excluded.accuracy_km,
       asn=excluded.asn, asn_org=excluded.asn_org, is_datacenter=excluded.is_datacenter, updated_at=now()`,
    params,
  )
  done += slice.length
  if (done % 25000 === 0 || done === ips.length) console.log(`  ${done}/${ips.length}`)
}

await c.query('create index if not exists ip_geo_country_idx on report.ip_geo (country_iso)')
await c.query('create index if not exists ip_geo_dc_idx on report.ip_geo (is_datacenter)')

const { rows: [s] } = await c.query(`select
  count(*)::int total,
  count(city)::int with_city,
  count(*) filter (where is_datacenter)::int datacenter
  from report.ip_geo`)
console.log(`✓ report.ip_geo built in ${((Date.now() - t0) / 1000).toFixed(0)}s — ${s.total} IPs, ${s.with_city} with city, ${s.datacenter} datacenter (internal only; raw IP not anon-granted)`)
await c.end()
