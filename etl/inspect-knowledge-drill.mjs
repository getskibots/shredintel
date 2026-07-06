#!/usr/bin/env node
/** inspect-knowledge-drill.mjs <botId> — READ-ONLY. What can we surface per
 *  knowledge layer on drill? Real file/page URLs? A source_id to deep-link a
 *  Text Edit back into the admin? */
import 'dotenv/config'
import pg from 'pg'
const BOT = Number(process.argv[2] || 43)
const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()
const rows = (sql) => c.query(sql).then((r) => r.rows)
const pad = (v, n) => String(v ?? '').slice(0, n).padEnd(n)
const FROM = `from raw.admin_knowledge_reply x join raw.admin_user u on u.id=x.user_id where u.bot_id=${BOT}`

// 1. FILE — distinct downloadable URLs
console.log('=== FILE layer: distinct source_value (downloadable URLs) ===')
for (const r of await rows(`select coalesce(nullif(x.source_value,''),'(empty)') v, count(*) n ${FROM} and x.source_type='FILE' group by 1 order by 2 desc limit 20`))
  console.log(`  ${String(r.n).padStart(5)}  ${r.v}`)

// 2. WEBSITE — top source pages
console.log('\n=== WEBSITE layer: top source pages ===')
for (const r of await rows(`select coalesce(nullif(x.source_value,''),'(empty)') v, count(*) n ${FROM} and x.source_type='WEBSITE' group by 1 order by 2 desc limit 15`))
  console.log(`  ${String(r.n).padStart(5)}  ${r.v}`)

// 3. source_id / source_name populated per type — for Text-Edit deep-linking
console.log('\n=== id/name availability per source_type ===')
for (const r of await rows(`
  select coalesce(x.source_type,'(null=Instructions)') st, count(*) tot,
         count(*) filter(where nullif(trim(x.source_id),'') is not null) has_source_id,
         count(*) filter(where nullif(trim(x.source_name),'') is not null) has_name,
         count(distinct x.source_id) distinct_ids
  ${FROM} group by 1 order by 2 desc`))
  console.log(`  ${pad(r.st, 22)} tot=${pad(r.tot, 7)} has_source_id=${pad(r.has_source_id, 7)} has_name=${pad(r.has_name, 7)} distinct_ids=${r.distinct_ids}`)

// 4. TEXT (Text Edits) — sample name + source_id (can we key back to the admin entry?)
console.log('\n=== TEXT (Text Edits): name -> source_id sample ===')
for (const r of await rows(`select coalesce(nullif(left(x.source_name,44),''),'(empty)') name, x.source_id ${FROM} and x.source_type='TEXT' and nullif(trim(x.source_id),'') is not null order by x.id desc limit 6`))
  console.log(`  id=${pad(r.source_id, 12)} name="${r.name}"`)

await c.end()
console.log('\ndone.')
