#!/usr/bin/env node
/**
 * usage-trends-data.mjs — read-only. Weekly conversation volume split by
 * channel (voice vs chat) across the full history, for the Usage & Trends mock.
 */
import 'dotenv/config'
import pg from 'pg'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()

const { rows } = await c.query(`
  select to_char(date_trunc('week', cv.started_at), 'YYYY-MM-DD') as wk,
         case when u.platform = 'VOICE_TWILIO' then 'voice' else 'chat' end as channel,
         count(*)::int as n
    from raw.admin_conversation cv
    join raw.admin_user u on u.id = cv.user_id
   where cv.started_at >= '2024-05-01' and cv.started_at < now()
   group by 1, 2
   order by 1, 2`)

// pivot to { week, chat, voice }
const byWeek = new Map()
for (const r of rows) {
  if (!byWeek.has(r.wk)) byWeek.set(r.wk, { week: r.wk, chat: 0, voice: 0 })
  byWeek.get(r.wk)[r.channel] = r.n
}
const series = [...byWeek.values()]

// headline stats
const totChat = series.reduce((s, w) => s + w.chat, 0)
const totVoice = series.reduce((s, w) => s + w.voice, 0)
console.log(JSON.stringify({
  weeks: series.length,
  totalChat: totChat, totalVoice: totVoice,
  firstWeek: series[0]?.week, lastWeek: series[series.length - 1]?.week,
  series,
}))
await c.end()
