#!/usr/bin/env node
/** disable-pgcron.mjs — remove the broken in-DB nightly refresh (droplet owns it now). */
import 'dotenv/config'
import pg from 'pg'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()

const before = await c.query('select jobid, jobname, active from cron.job order by jobid')
console.log('cron jobs before:', JSON.stringify(before.rows))
try {
  await c.query(`select cron.unschedule('refresh_report_mvs_nightly')`)
  console.log('→ unscheduled refresh_report_mvs_nightly')
} catch (e) { console.log('unschedule err:', e.message.split('\n')[0]) }
const after = await c.query('select jobid, jobname, active from cron.job order by jobid')
console.log('cron jobs after: ', JSON.stringify(after.rows))
await c.end()
