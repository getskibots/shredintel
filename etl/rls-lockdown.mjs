#!/usr/bin/env node
/**
 * rls-lockdown.mjs — enable Row Level Security on every public.* table and
 * clear the Supabase "RLS Disabled in Public" CRITICAL advisories.
 *
 * The app's anon role only needs to read TWO things:
 *   - public.bots          (the bot registry — landing page + selector)
 *   - report.*  matviews   (separate schema; RLS N/A to matviews)
 * Everything else in public.* (conversations, conversation_categories,
 * conversation_intents, _schema_migrations, …) is NOT read by the client and
 * should not be exposed to anon at all.
 *
 * Plan:
 *   - ENABLE RLS on all public base tables → anon can no longer read them
 *     (RLS with no policy = zero rows for anon; owner/service_role bypass RLS,
 *      so the ETL writes are unaffected).
 *   - Add ONE permissive SELECT policy on public.bots so the app keeps working.
 *
 *   node rls-lockdown.mjs           Diagnose only (no writes).
 *   node rls-lockdown.mjs --apply   Enable RLS + bots policy, then verify.
 */

import 'dotenv/config'
import pg from 'pg'

const APPLY = process.argv.includes('--apply')

// Tables the anon (client) role MUST still be able to SELECT.
const ANON_READABLE = new Set(['bots'])

function requireEnv(keys) {
  const missing = keys.filter((k) => !process.env[k])
  if (missing.length) { console.error(`\n❌ Missing env vars: ${missing.join(', ')}\n`); process.exit(1) }
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

const ident = (name) => `"${String(name).replace(/"/g, '""')}"`
const fmtBytes = (n) => {
  n = Number(n)
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

async function main() {
  const c = await connectPG()
  console.log('✓ connected to Supabase Postgres\n')

  const { rows: tables } = await c.query(`
    SELECT c.relname AS name, c.relrowsecurity AS rls,
           c.reltuples::bigint AS est_rows, pg_total_relation_size(c.oid) AS bytes
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
     ORDER BY pg_total_relation_size(c.oid) DESC`)

  const { rows: pols } = await c.query(
    `SELECT tablename, policyname, roles::text AS roles, cmd
       FROM pg_policies WHERE schemaname = 'public'`)

  const { rows: report } = await c.query(`
    SELECT c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'report' AND c.relkind IN ('r','m','v') ORDER BY 1`)

  // Disk: biggest tables anywhere (explains compute/disk pressure)
  const { rows: bigraw } = await c.query(`
    SELECT n.nspname AS schema, c.relname AS name, pg_total_relation_size(c.oid) AS bytes
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind IN ('r','m') AND n.nspname IN ('raw','public','report')
     ORDER BY pg_total_relation_size(c.oid) DESC LIMIT 8`)

  console.log('─── public.* tables (RLS advisory scope) ──────────────')
  for (const t of tables) {
    const need = ANON_READABLE.has(t.name) ? '  ← app needs anon SELECT' : ''
    console.log(`  ${t.rls ? 'RLS ON ' : 'RLS OFF'}  ${t.name.padEnd(26)} ~${String(t.est_rows).padStart(9)} rows  ${fmtBytes(t.bytes).padStart(9)}${need}`)
  }
  console.log(`\n  public policies: ${pols.length ? pols.map(p => `${p.tablename}.${p.policyname}[${p.cmd} ${p.roles}]`).join(', ') : '(none)'}`)
  console.log(`\n  report.* objects (matviews — RLS N/A, app reads these): ${report.map(r => `${r.relname}(${r.relkind})`).join(', ')}`)
  console.log('\n─── biggest objects (disk pressure) ───────────────────')
  for (const r of bigraw) console.log(`  ${(r.schema + '.' + r.name).padEnd(34)} ${fmtBytes(r.bytes).padStart(9)}`)

  if (!APPLY) { console.log('\n(diagnose only — re-run with --apply to enable RLS)'); await c.end(); return }

  console.log('\n─── applying RLS lockdown ─────────────────────────────')
  for (const t of tables) {
    await c.query(`ALTER TABLE public.${ident(t.name)} ENABLE ROW LEVEL SECURITY`)
    if (ANON_READABLE.has(t.name)) {
      const has = pols.some(p => p.tablename === t.name && (p.cmd === 'SELECT' || p.cmd === 'ALL') && /anon|\{\}/.test(p.roles))
      if (!has) {
        await c.query(`CREATE POLICY "anon read ${t.name}" ON public.${ident(t.name)} FOR SELECT TO anon USING (true)`)
        console.log(`  RLS ON  ${t.name}  + anon SELECT policy`)
      } else {
        console.log(`  RLS ON  ${t.name}  (anon policy already present)`)
      }
    } else {
      console.log(`  RLS ON  ${t.name}  (locked — no anon access)`)
    }
  }

  // verify as anon — this is the safety net: confirm the app's real reads
  // still work and the locked tables are actually blocked.
  console.log('\n─── verifying as anon role ────────────────────────────')
  await c.query('SET ROLE anon')
  try {
    const { rows: [b] } = await c.query('SELECT count(*) n FROM public.bots')
    console.log(`  public.bots            → ${String(b.n).padStart(6)} rows  (expect 457 — app needs this)`)
  } catch (e) { console.log(`  public.bots            → ERROR ${e.message.split('\n')[0]}`) }

  // Every report object the app reads must still return data as anon.
  const REPORT_READS = [
    'outcome_timeline', 'conversion_pulse', 'knowledge_source_leaderboard',
    'sender_mix_stack', 'guest_identity_split', 'lead_capture_funnel',
    'device_experience_mix', 'demand_heatmap',
  ]
  let brokenReports = 0
  for (const v of REPORT_READS) {
    try {
      const { rows: [r] } = await c.query(`SELECT count(*) n FROM report.${ident(v)}`)
      const n = Number(r.n)
      if (n === 0) brokenReports++
      console.log(`  report.${v.padEnd(28)} → ${String(n).padStart(6)} rows${n === 0 ? '  ⚠️ empty!' : ''}`)
    } catch (e) { brokenReports++; console.log(`  report.${v.padEnd(28)} → ERROR ${e.message.split('\n')[0]}`) }
  }

  // spot-check a locked table is now blocked
  const locked = tables.find(t => !ANON_READABLE.has(t.name))
  if (locked) {
    try {
      const { rows: [l] } = await c.query(`SELECT count(*) n FROM public.${ident(locked.name)}`)
      console.log(`  public.${locked.name.padEnd(22)} → ${String(l.n).padStart(6)} rows  (expect 0 — locked)`)
    } catch (e) { console.log(`  public.${locked.name.padEnd(22)} → blocked (${e.message.split('\n')[0]})`) }
  }
  await c.query('RESET ROLE')

  if (brokenReports > 0) {
    console.log(`\n⚠️  ${brokenReports} report object(s) came back empty/errored as anon — a report view may depend on a locked table. Review before trusting the dashboard.`)
  }

  console.log('\n✓ RLS enabled on all public tables. The Advisor CRITICALs should clear.')
  await c.end()
}

main().catch((e) => { console.error('\n❌', e.message); process.exit(1) })
