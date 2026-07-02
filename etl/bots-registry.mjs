#!/usr/bin/env node
/**
 * bots-registry.mjs — diagnose (and optionally fix) why the app's landing page
 * only shows the fallback bots.
 *
 * The app (useAvailableBots) reads `public.bots` with the anon key. If that
 * comes back with 0 rows, it falls back to the 3 KNOWN_BOTS + "demo" badge.
 * This tool connects to Supabase Postgres as the service role (bypasses RLS),
 * reports the true state, and — with --apply — populates public.bots from
 * raw.admin_bot and ensures anon can read it.
 *
 *   node bots-registry.mjs            Diagnose only. No writes.
 *   node bots-registry.mjs --apply    Populate + grant + RLS policy, then verify.
 *
 * Connection details come from the same .env the sync uses (SUPABASE_DB_*).
 */

import 'dotenv/config'
import pg from 'pg'

const APPLY = process.argv.includes('--apply')

function requireEnv(keys) {
  const missing = keys.filter((k) => !process.env[k])
  if (missing.length) {
    console.error(`\n❌ Missing env vars: ${missing.join(', ')}\n`)
    process.exit(1)
  }
}

async function connectPG() {
  const hasDiscrete = process.env.SUPABASE_DB_HOST && process.env.SUPABASE_DB_PASSWORD
  let cfg
  if (hasDiscrete) {
    requireEnv(['SUPABASE_DB_HOST', 'SUPABASE_DB_USER', 'SUPABASE_DB_PASSWORD'])
    cfg = {
      host: process.env.SUPABASE_DB_HOST,
      port: Number(process.env.SUPABASE_DB_PORT || 5432),
      user: process.env.SUPABASE_DB_USER,
      password: process.env.SUPABASE_DB_PASSWORD,
      database: process.env.SUPABASE_DB_NAME || 'postgres',
    }
  } else {
    requireEnv(['SUPABASE_DB_URL'])
    cfg = { connectionString: process.env.SUPABASE_DB_URL }
  }
  const client = new pg.Client({ ...cfg, ssl: { rejectUnauthorized: false } })
  await client.connect()
  return client
}

const q = (c, sql, params) => c.query(sql, params)

async function columns(c, schema, table) {
  const { rows } = await q(c,
    `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position`, [schema, table])
  return rows
}

async function main() {
  const c = await connectPG()
  console.log('✓ connected to Supabase Postgres\n')

  // ── does public.bots even exist? ────────────────────────────────
  const { rows: relRows } = await q(c,
    `SELECT c.relkind
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'bots'`)
  if (relRows.length === 0) {
    console.log('public.bots does NOT exist. (App expects this table.)')
    await c.end(); return
  }
  const relkind = relRows[0].relkind
  const kindName = { r: 'table', v: 'view', m: 'matview', p: 'partitioned table' }[relkind] || relkind

  const pubCols = await columns(c, 'public', 'bots')
  const rawCols = await columns(c, 'raw', 'admin_bot')

  const { rows: [cnt] } = await q(c,
    `SELECT
        (SELECT count(*) FROM public.bots)      AS public_bots,
        (SELECT count(*) FROM raw.admin_bot)     AS raw_admin_bot`)

  const { rows: [rls] } = await q(c,
    `SELECT relrowsecurity AS enabled
       FROM pg_class WHERE oid = 'public.bots'::regclass`)

  const { rows: policies } = await q(c,
    `SELECT policyname, roles::text AS roles, cmd, qual
       FROM pg_policies WHERE schemaname = 'public' AND tablename = 'bots'`)

  // what can anon actually see? (SET ROLE respects RLS + grants)
  let anonVisible = null, anonErr = null
  try {
    await q(c, 'SET ROLE anon')
    const { rows: [av] } = await q(c, 'SELECT count(*) AS n FROM public.bots')
    anonVisible = Number(av.n)
  } catch (e) { anonErr = e.message } finally { await q(c, 'RESET ROLE') }

  console.log('─── public.bots ───────────────────────────────')
  console.log(`kind:            ${kindName}`)
  console.log(`rows (service):  ${cnt.public_bots}`)
  console.log(`raw.admin_bot:   ${cnt.raw_admin_bot}`)
  console.log(`RLS enabled:     ${rls.enabled}`)
  console.log(`policies:        ${policies.length ? policies.map(p => `${p.policyname}[${p.cmd} ${p.roles}]`).join(', ') : '(none)'}`)
  console.log(`anon can see:    ${anonErr ? 'ERROR: ' + anonErr : anonVisible + ' rows'}`)
  console.log(`\npublic.bots columns:`)
  for (const col of pubCols) console.log(`  ${col.column_name}  ${col.data_type}  ${col.is_nullable === 'NO' ? 'NOT NULL' : 'null-ok'}${col.column_default ? '  default=' + col.column_default : ''}`)
  console.log(`\nraw.admin_bot columns:`)
  console.log('  ' + rawCols.map(c => c.column_name).join(', '))

  if (!APPLY) {
    console.log('\n(diagnose only — re-run with --apply to fix)')
    await c.end(); return
  }

  // ── FIX ─────────────────────────────────────────────────────────
  console.log('\n─── applying fix ──────────────────────────────')
  if (relkind !== 'r') {
    console.log(`public.bots is a ${kindName}, not a table — not populating. Only ensuring anon read access.`)
  } else {
    // Map columns: id + a name-ish column present in BOTH.
    const rawNames = new Set(rawCols.map(c => c.column_name))
    const nameCol = ['name', 'title', 'bot_name', 'display_name'].find(n => rawNames.has(n))
    const pubNames = new Set(pubCols.map(c => c.column_name))
    if (!rawNames.has('id')) { console.log('raw.admin_bot has no id column — aborting populate.'); }
    else {
      const cols = ['id']
      const selects = ['id']
      // name is NOT NULL in public.bots — coalesce blank/null source names.
      if (nameCol && pubNames.has('name')) {
        cols.push('name')
        selects.push(`COALESCE(NULLIF(TRIM(${nameCol}), ''), 'Bot ' || id)`)
      }
      const sql =
        `INSERT INTO public.bots (${cols.join(', ')})
         SELECT ${selects.join(', ')} FROM raw.admin_bot
         ON CONFLICT (id) DO UPDATE SET ${cols.filter(x => x !== 'id').map(x => `${x} = EXCLUDED.${x}`).join(', ') || 'id = EXCLUDED.id'}`
      console.log('populate:\n' + sql)
      const res = await q(c, sql)
      console.log(`→ upserted ${res.rowCount} rows into public.bots`)
    }
  }

  // Ensure anon can read: grant + permissive SELECT policy if RLS on.
  await q(c, 'GRANT USAGE ON SCHEMA public TO anon')
  await q(c, 'GRANT SELECT ON public.bots TO anon')
  console.log('→ GRANT SELECT ON public.bots TO anon')

  if (rls.enabled) {
    const hasAnonSelect = policies.some(p =>
      (p.cmd === 'SELECT' || p.cmd === 'ALL') && /anon|public|\{\}/.test(p.roles))
    if (!hasAnonSelect) {
      await q(c, `CREATE POLICY "anon read bots" ON public.bots FOR SELECT TO anon USING (true)`)
      console.log('→ CREATE POLICY "anon read bots" (SELECT USING true)')
    } else {
      console.log('→ anon SELECT policy already present, leaving as-is')
    }
  } else {
    console.log('→ RLS disabled — grant alone is sufficient')
  }

  // verify as anon
  await q(c, 'SET ROLE anon')
  const { rows: [after] } = await q(c, 'SELECT count(*) AS n FROM public.bots')
  await q(c, 'RESET ROLE')
  console.log(`\n✓ anon now sees ${after.n} rows in public.bots`)

  await c.end()
}

main().catch((e) => { console.error('\n❌', e.message); process.exit(1) })
