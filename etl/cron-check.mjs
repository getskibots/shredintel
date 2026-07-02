#!/usr/bin/env node
/**
 * cron-check.mjs — read-only. Shows any pg_cron jobs and their recent run
 * history, so we know what (if anything) runs automatically inside Supabase
 * vs. what only happens when we run the ETL manually from a laptop.
 */
import 'dotenv/config'
import pg from 'pg'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST,
  port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres',
  ssl: { rejectUnauthorized: false },
})

await c.connect()

const jobs = await c.query(
  `SELECT jobid, jobname, schedule, active, command FROM cron.job ORDER BY jobid`
).catch((e) => ({ rows: [], err: e.message }))

console.log('─── cron.job (scheduled jobs) ─────────────────────────')
if (jobs.err) console.log('  pg_cron not available:', jobs.err)
else if (jobs.rows.length === 0) console.log('  (no scheduled jobs — nothing runs automatically)')
else for (const j of jobs.rows) {
  console.log(`  #${j.jobid} ${j.jobname || '(unnamed)'}  schedule="${j.schedule}"  active=${j.active}`)
  console.log(`      cmd: ${String(j.command).replace(/\s+/g, ' ').trim().slice(0, 120)}`)
}

const runs = await c.query(
  `SELECT jobid, status, start_time, end_time,
          left(coalesce(return_message,''), 80) AS msg
     FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10`
).catch((e) => ({ rows: [], err: e.message }))

console.log('\n─── last 10 cron runs ─────────────────────────────────')
if (runs.err) console.log('  no run history:', runs.err)
else if (runs.rows.length === 0) console.log('  (never run)')
else for (const r of runs.rows) {
  const secs = r.end_time && r.start_time ? ((new Date(r.end_time) - new Date(r.start_time)) / 1000).toFixed(0) + 's' : '—'
  console.log(`  #${r.jobid}  ${String(r.status).padEnd(9)} ${new Date(r.start_time).toISOString()}  ${secs.padStart(6)}  ${r.msg}`)
}

await c.end()
