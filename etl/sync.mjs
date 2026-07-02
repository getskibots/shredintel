#!/usr/bin/env node
/**
 * shredintel ETL — incremental sync from Botscrew MySQL (read-only)
 * into GSB Supabase `raw.*`, then refresh the `report.*` materialized views.
 *
 * Schema-agnostic: column lists are read at runtime from each source's
 * information_schema and intersected, so we never hardcode columns and we
 * survive schema drift.
 *
 * Usage:
 *   node sync.mjs --test         Connect to both DBs, print row counts, exit. No writes.
 *   node sync.mjs --dry-run      Compute per-table deltas, print plan, exit. No writes.
 *   node sync.mjs                Run the full sync + refresh matviews.
 *   node sync.mjs --refresh-only Just REFRESH the report.* matviews.
 *
 * All connection details come from .env (see .env.example).
 */

import 'dotenv/config'
import mysql from 'mysql2/promise'
import pg from 'pg'
import { TABLES } from './tables.mjs'

const MODE =
  process.argv.includes('--test')         ? 'test'         :
  process.argv.includes('--dry-run')      ? 'dry-run'      :
  process.argv.includes('--refresh-only') ? 'refresh-only' :
                                            'sync'

const BATCH_SIZE = Number(process.env.BATCH_SIZE || 5000)
const RAW_SCHEMA = 'raw'

// report.* materialized views to refresh after a sync
const MATVIEWS = [
  'outcome_timeline',
  'conversion_pulse',
  'sender_mix_stack',
  'lead_capture_funnel',
  'demand_heatmap',
]

// ── tiny logger ───────────────────────────────────────────────────
const t0 = Date.now()
const ts = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`
const log  = (...a) => console.log(`[${ts()}]`, ...a)
const warn = (...a) => console.warn(`[${ts()}] ⚠️ `, ...a)
const die  = (msg) => { console.error(`\n❌ ${msg}\n`); process.exit(1) }

function requireEnv(keys) {
  const missing = keys.filter((k) => !process.env[k])
  if (missing.length) die(`Missing env vars: ${missing.join(', ')}\nCopy .env.example to .env and fill it in.`)
}

// ── connections ───────────────────────────────────────────────────
async function connectMySQL() {
  requireEnv(['BOTSCREW_MYSQL_HOST', 'BOTSCREW_MYSQL_USER', 'BOTSCREW_MYSQL_PASSWORD', 'BOTSCREW_MYSQL_DATABASE'])
  const conn = await mysql.createConnection({
    host: process.env.BOTSCREW_MYSQL_HOST,
    port: Number(process.env.BOTSCREW_MYSQL_PORT || 3306),
    user: process.env.BOTSCREW_MYSQL_USER,
    password: process.env.BOTSCREW_MYSQL_PASSWORD,
    database: process.env.BOTSCREW_MYSQL_DATABASE,
    // read-only workload; be a good citizen
    connectTimeout: 20_000,
    dateStrings: false,
    supportBigNumbers: true,
    bigNumberStrings: false,
  })
  return conn
}

async function connectPG() {
  // Prefer discrete fields (avoids URL-encoding pain with special chars in
  // the password). Fall back to a full connection string if provided.
  const hasDiscrete = process.env.SUPABASE_DB_HOST && process.env.SUPABASE_DB_PASSWORD
  let cfg
  if (hasDiscrete) {
    requireEnv(['SUPABASE_DB_HOST', 'SUPABASE_DB_USER', 'SUPABASE_DB_PASSWORD'])
    cfg = {
      host: process.env.SUPABASE_DB_HOST,
      port: Number(process.env.SUPABASE_DB_PORT || 5432),
      user: process.env.SUPABASE_DB_USER,
      password: process.env.SUPABASE_DB_PASSWORD,   // raw, no encoding needed
      database: process.env.SUPABASE_DB_NAME || 'postgres',
    }
  } else {
    requireEnv(['SUPABASE_DB_URL'])
    cfg = { connectionString: process.env.SUPABASE_DB_URL }
  }
  const client = new pg.Client({
    ...cfg,
    // Supabase requires SSL; pooler cert isn't in the local trust store
    ssl: { rejectUnauthorized: false },
    statement_timeout: 0,
    query_timeout: 0,
  })
  await client.connect()
  // The pooler/role can impose its own statement_timeout that the client-config
  // above doesn't override. Set it explicitly high so big matview refreshes
  // (over 880k+ conversations) don't get canceled. 20 min is plenty.
  try { await client.query(`SET statement_timeout = '1200s'`) } catch { /* best effort */ }
  return client
}

// ── schema introspection ──────────────────────────────────────────
async function mysqlColumns(my, table) {
  const [rows] = await my.query(
    `SELECT COLUMN_NAME, DATA_TYPE
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION`,
    [process.env.BOTSCREW_MYSQL_DATABASE, table],
  )
  return rows.map((r) => ({ name: r.COLUMN_NAME, type: r.DATA_TYPE }))
}

async function pgColumns(pgc, table) {
  const { rows } = await pgc_query(pgc,
    `SELECT column_name, data_type
       FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position`,
    [RAW_SCHEMA, table],
  )
  return rows.map((r) => ({ name: r.column_name, type: r.data_type }))
}

// small wrapper so we can log slow queries if needed
async function pgc_query(pgc, sql, params) {
  return pgc.query(sql, params)
}

// Instant row-count ESTIMATES (avoid slow exact COUNT(*) on huge tables).
// Used only for the informational src/dst totals; the incremental delta
// (WHERE key > high-water) stays exact.
async function mysqlEstimate(my, table) {
  const [[row]] = await my.query(
    `SELECT TABLE_ROWS AS est FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [process.env.BOTSCREW_MYSQL_DATABASE, table],
  )
  return Number(row?.est ?? 0)
}
async function pgEstimate(pgc, table) {
  const { rows: [row] } = await pgc_query(pgc,
    `SELECT reltuples::bigint AS est
       FROM pg_class WHERE oid = ($1)::regclass`,
    [`${RAW_SCHEMA}.${table}`],
  )
  return Number(row?.est ?? 0)
}

// ── value coercion (MySQL row -> PG param) ────────────────────────
function coerce(val, pgType) {
  if (val === null || val === undefined) return null

  // Boolean target. MySQL stores booleans as BIT(1) (comes back as a 1-byte
  // Buffer 0x00/0x01) or TINYINT(1) (a number 0/1). Convert to a real boolean.
  if (pgType === 'boolean') {
    if (typeof val === 'boolean') return val
    if (Buffer.isBuffer(val)) return val[0] === 1
    if (typeof val === 'number') return val !== 0
    if (typeof val === 'string') return val === '1' || val === '' || val.toLowerCase() === 'true'
    return Boolean(val)
  }

  // jsonb/json target. Must hand PG a *valid* JSON string or NULL.
  if (pgType === 'jsonb' || pgType === 'json') {
    let s = val
    if (Buffer.isBuffer(s)) s = s.toString('utf8')
    if (typeof s === 'string') {
      const trimmed = s.trim()
      if (trimmed === '') return null            // empty ≠ valid JSON
      try { JSON.parse(trimmed); return trimmed } // already valid JSON → pass through
      catch { return null }                       // plain text / malformed → null (don't crash)
    }
    // object/array/number from mysql2's native JSON parsing
    return JSON.stringify(s)
  }

  // Remaining Buffers (binary/bit on non-boolean columns): best-effort text
  if (Buffer.isBuffer(val)) return val.toString('utf8')
  return val
}

// ── per-table sync ────────────────────────────────────────────────
async function syncTable(my, pgc, cfg) {
  const myCols = await mysqlColumns(my, cfg.name)
  const pgCols = await pgColumns(pgc, cfg.name)
  if (pgCols.length === 0) { warn(`raw.${cfg.name} not found in Supabase — skipping`); return { table: cfg.name, skipped: true } }

  const pgTypeByName = new Map(pgCols.map((c) => [c.name, c.type]))
  // intersection of columns, preserving MySQL order
  const cols = myCols.map((c) => c.name).filter((n) => pgTypeByName.has(n))
  if (!cols.includes(cfg.pk)) die(`Table ${cfg.name}: PK '${cfg.pk}' not found in both schemas`)

  // current source vs dest counts (fast estimates — informational only)
  const srcCount = await mysqlEstimate(my, cfg.name)
  const dstCount = await pgEstimate(pgc, cfg.name)

  if (cfg.mode === 'full') {
    const plan = { table: cfg.name, mode: 'full', src: Number(srcCount), dst: Number(dstCount), toLoad: Number(srcCount) }
    if (MODE === 'dry-run' || MODE === 'test') return plan
    // full refresh via upsert (no TRUNCATE — avoids FK-constraint failures and
    // never leaves the table momentarily empty). Updates existing rows, adds new.
    log(`  ${cfg.name}: full upsert`)
    const [rows] = await my.query(`SELECT ${cols.map((c) => `\`${c}\``).join(',')} FROM \`${cfg.name}\``)
    await bulkInsert(pgc, cfg, cols, rows, pgTypeByName, /*upsert*/ true)
    plan.loaded = rows.length
    return plan
  }

  // incremental
  const syncKey = cfg.syncKey || 'id'
  const { rows: [{ hw }] } = await pgc_query(pgc, `SELECT MAX(${syncKey}) AS hw FROM ${RAW_SCHEMA}.${cfg.name}`)
  const highWater = hw ?? 0
  const [[{ delta }]] = await my.query(
    `SELECT COUNT(*) AS delta FROM \`${cfg.name}\` WHERE \`${syncKey}\` > ?`, [highWater],
  )
  const plan = { table: cfg.name, mode: 'incremental', syncKey, highWater, src: Number(srcCount), dst: Number(dstCount), toLoad: Number(delta) }
  if (MODE === 'dry-run' || MODE === 'test') return plan
  if (Number(delta) === 0) { log(`  ${cfg.name}: up to date (hw=${highWater})`); plan.loaded = 0; return plan }

  log(`  ${cfg.name}: pulling ${delta} new rows (${syncKey} > ${highWater})`)
  let loaded = 0
  let cursor = highWater
  for (;;) {
    const [batch] = await my.query(
      `SELECT ${cols.map((c) => `\`${c}\``).join(',')} FROM \`${cfg.name}\`
        WHERE \`${syncKey}\` > ? ORDER BY \`${syncKey}\` ASC LIMIT ?`,
      [cursor, BATCH_SIZE],
    )
    if (batch.length === 0) break
    await bulkInsert(pgc, cfg, cols, batch, pgTypeByName, /*upsert*/ true)
    loaded += batch.length
    cursor = batch[batch.length - 1][syncKey]
    process.stdout.write(`\r  ${cfg.name}: ${loaded}/${delta} …`)
    if (batch.length < BATCH_SIZE) break
  }
  process.stdout.write('\n')
  plan.loaded = loaded
  return plan
}

// ── batched multi-row INSERT (chunked under PG's 65535 param cap) ──
async function bulkInsert(pgc, cfg, cols, rows, pgTypeByName, upsert) {
  if (rows.length === 0) return
  const maxRowsPerStmt = Math.max(1, Math.floor(60000 / cols.length))
  const colList = cols.map((c) => `"${c}"`).join(',')
  const updateSet = cols.filter((c) => c !== cfg.pk).map((c) => `"${c}"=EXCLUDED."${c}"`).join(',')

  for (let i = 0; i < rows.length; i += maxRowsPerStmt) {
    const chunk = rows.slice(i, i + maxRowsPerStmt)
    const params = []
    const valuesSql = chunk.map((row) => {
      const ph = cols.map((c) => {
        params.push(coerce(row[c], pgTypeByName.get(c)))
        return `$${params.length}`
      })
      return `(${ph.join(',')})`
    }).join(',')
    let sql = `INSERT INTO ${RAW_SCHEMA}.${cfg.name} (${colList}) VALUES ${valuesSql}`
    sql += upsert && updateSet
      ? ` ON CONFLICT ("${cfg.pk}") DO UPDATE SET ${updateSet}`
      : ` ON CONFLICT ("${cfg.pk}") DO NOTHING`
    await pgc_query(pgc, sql, params)
  }
}

// ── matview refresh ───────────────────────────────────────────────
async function refreshMatviews(pgc) {
  // Plain (non-CONCURRENT) refresh: faster, no unique-index requirement, and we
  // don't need read-availability during a one-off catch-up. Relies on the high
  // statement_timeout set at connect time.
  log('Refreshing report.* materialized views (plain refresh) …')
  for (const mv of MATVIEWS) {
    const start = Date.now()
    await pgc_query(pgc, `REFRESH MATERIALIZED VIEW report.${mv}`)
    log(`  report.${mv} refreshed (${((Date.now() - start) / 1000).toFixed(1)}s)`)
  }
}

// ── public.bots registry ──────────────────────────────────────────
// The app's landing page + bot selector read public.bots (clean id+name
// registry) via the anon key. Keep it in lockstep with raw.admin_bot so
// newly-added bots appear automatically. Entirely in-Supabase (no MySQL).
async function syncBotsRegistry(pgc) {
  const res = await pgc_query(pgc,
    `INSERT INTO public.bots (id, name)
     SELECT id, COALESCE(NULLIF(TRIM(name), ''), 'Bot ' || id)
       FROM raw.admin_bot
     ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name, synced_at = now()`)
  log(`  public.bots registry upserted (${res.rowCount} rows)`)
}

// ── main ──────────────────────────────────────────────────────────
async function main() {
  log(`shredintel ETL — mode: ${MODE}`)
  let my, pgc
  try {
    log('Connecting to Supabase …')
    pgc = await connectPG()
    log('  ✓ Supabase connected')

    if (MODE === 'refresh-only') {
      await syncBotsRegistry(pgc)
      await refreshMatviews(pgc)
      log('Done.')
      return
    }

    log('Connecting to Botscrew MySQL …')
    my = await connectMySQL()
    log('  ✓ Botscrew MySQL connected')

    if (MODE === 'test') {
      log('\nConnection test OK. Per-table snapshot:')
      for (const cfg of TABLES) {
        const [[{ c }]] = await my.query(`SELECT COUNT(*) AS c FROM \`${cfg.name}\``)
        const { rows: [{ pc }] } = await pgc_query(pgc, `SELECT COUNT(*)::bigint AS pc FROM ${RAW_SCHEMA}.${cfg.name}`)
        log(`  ${cfg.name.padEnd(28)} mysql=${String(c).padStart(9)}  supabase=${String(pc).padStart(9)}`)
      }
      log('\n✓ Both databases reachable from this machine.')
      return
    }

    const plans = []
    log('\nPlanning …')
    for (const cfg of TABLES) plans.push(await syncTable(my, pgc, cfg))

    if (MODE === 'dry-run') {
      log('\nDRY RUN — would load:')
      let total = 0
      for (const p of plans) {
        if (p.skipped) { log(`  ${p.table}: SKIPPED (not in Supabase)`); continue }
        total += p.toLoad
        log(`  ${p.table.padEnd(28)} ${p.mode.padEnd(11)} src=${String(p.src).padStart(9)} dst=${String(p.dst).padStart(9)} → load ${p.toLoad}`)
      }
      log(`\nTotal rows to load: ${total.toLocaleString()}`)
      log('Run `npm run sync` to execute.')
      return
    }

    // real sync summary
    log('\nSync complete:')
    let total = 0
    for (const p of plans) {
      if (p.skipped) continue
      total += p.loaded || 0
      log(`  ${p.table.padEnd(28)} loaded ${p.loaded || 0}`)
    }
    log(`Total rows loaded: ${total.toLocaleString()}`)

    await syncBotsRegistry(pgc)
    await refreshMatviews(pgc)
    log('\n✓ Done — report.* views refreshed. shredintel should now show LIVE data.')
  } finally {
    if (my) await my.end().catch(() => {})
    if (pgc) await pgc.end().catch(() => {})
  }
}

main().catch((e) => die(e.stack || e.message))
