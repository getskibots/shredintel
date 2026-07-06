#!/usr/bin/env node
/** verify the FIXED enriched transcript query (join reply by conversation's
 *  user_id + timestamp) attaches a Knowledge Layer to each bot answer. */
import 'dotenv/config'
import pg from 'pg'
const CID = Number(process.argv[2] || 916222)
const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()
const pad = (v, n) => String(v ?? '').slice(0, n).padEnd(n)
const layerOf = (r) => !r.matched ? '—' : r.is_failed ? 'Failed' : r.source_type === 'TEXT' ? 'Text Edits' : r.source_type === 'WEBSITE' ? 'Website' : r.source_type === 'FILE' ? 'Files' : 'Instructions'
const { rows } = await c.query(`
  select case when coalesce(h.is_from_support,0)=1 then 'support'
               when coalesce(h.is_echo,false) then 'bot' else 'user' end as sender,
         left(coalesce(h.formatted_chat_history #>> '{}', h.message #>> '{}'), 40) as txt,
         kr.source_type, kr.source_value, kr.source_name, kr.is_failed, kr.matched
    from raw.admin_chat_history h
    left join lateral (
      select source_type, source_value, source_name, is_failed, true as matched
        from raw.admin_knowledge_reply kr
       where kr.user_id = (select cv.user_id from raw.admin_conversation cv where cv.id = ${CID})
         and kr.sent_at = h."timestamp"
       limit 1
    ) kr on true
   where h.conversation_id = ${CID} and h.is_message = 1 and coalesce(h.visible,1) = 1
   order by h."timestamp"`)
console.log(`conversation ${CID} — ${rows.length} messages:\n`)
for (const r of rows) {
  const src = r.source_type === 'WEBSITE' || r.source_type === 'FILE' ? String(r.source_value || '').replace(/^https?:\/\/(www\.)?/, '').slice(0, 38) : r.source_name
  console.log(`  ${pad(r.sender, 6)} ${pad(layerOf(r), 12)} ${pad(src ? '→ ' + src : '', 42)}`)
}
await c.end()
