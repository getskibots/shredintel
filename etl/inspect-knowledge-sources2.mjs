#!/usr/bin/env node
/** inspect-knowledge-sources2.mjs <botId> — READ-ONLY. Disambiguate the TEXT
 *  bucket, source_name meaning, the AI-edit signal (improvement_source_id), and
 *  reconcile the "unsourced" definition. */
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
const FROM = `from raw.admin_knowledge_reply x join raw.admin_user u on u.id=x.user_id where u.bot_id=${BOT}`
const pad = (v, n) => String(v ?? '').slice(0, n).padEnd(n)

// 1. per source_type: how many carry a source_name vs an improvement id
console.log('=== per source_type: name present? / AI-edit (improvement_source_id)? ===')
for (const r of await rows(`
  select coalesce(x.source_type,'(null)') st, count(*) tot,
         count(*) filter(where nullif(trim(x.source_name),'') is not null) has_name,
         count(*) filter(where nullif(trim(x.improvement_source_id),'') is not null) improved,
         count(*) filter(where x.is_failed) failed
  ${FROM} group by 1 order by 2 desc`))
  console.log(`  ${pad(r.st, 10)} tot=${String(r.tot).padStart(7)}  has_name=${String(r.has_name).padStart(6)}  improved=${String(r.improved).padStart(6)}  failed=${r.failed}`)

// 2. overall AI-edit signal
for (const r of await rows(`select count(*) filter(where nullif(trim(x.improvement_source_id),'') is not null) improved, count(*) tot ${FROM}`))
  console.log(`\n  AI-edit (improvement_source_id set): ${r.improved}/${r.tot} = ${(100 * r.improved / Math.max(1, r.tot)).toFixed(1)}%`)

// 3. source_name — what is it? top values for TEXT (are these KB entries or guest queries?)
console.log('\n=== TEXT: top source_name (is this a KB entry title, or the guest query?) ===')
for (const r of await rows(`select coalesce(nullif(left(x.source_name,54),''),'(empty)') v, count(*) n ${FROM} and x.source_type='TEXT' group by 1 order by 2 desc limit 10`))
  console.log(`  ${pad(r.v, 56)} ${r.n}`)

// 4. TEXT: a couple of (source_name -> odin_reply) pairs to see if TEXT = prompt vs curated Q&A
console.log('\n=== TEXT: sample name -> reply (truncated) ===')
for (const r of await rows(`select coalesce(nullif(left(x.source_name,40),''),'(empty)') name, left(x.odin_reply,60) reply ${FROM} and x.source_type='TEXT' and x.odin_reply is not null order by x.id desc limit 6`))
  console.log(`  name="${r.name}"  reply="${pad(r.reply, 60)}"`)

// 5. null source_type non-failed — what are these? (greetings? flow? prompt?)
console.log('\n=== source_type IS NULL & not failed: top source_name ===')
for (const r of await rows(`select coalesce(nullif(left(x.source_name,54),''),'(empty)') v, count(*) n ${FROM} and x.source_type is null and not x.is_failed group by 1 order by 2 desc limit 10`))
  console.log(`  ${pad(r.v, 56)} ${r.n}`)

// 6. reconcile "unsourced": null source_type vs null source_name vs is_failed
console.log('\n=== unsourced reconciliation ===')
for (const r of await rows(`
  select count(*) tot,
         count(*) filter(where x.source_type is null) null_type,
         count(*) filter(where nullif(trim(x.source_name),'') is null) null_name,
         count(*) filter(where x.is_failed) failed,
         count(*) filter(where x.source_type is null and not x.is_failed) null_type_ok
  ${FROM}`))
  console.log(`  total=${r.tot}  null_source_type=${r.null_type}  null_source_name=${r.null_name}  is_failed=${r.failed}  (null_type & not failed = ${r.null_type_ok})`)

await c.end()
console.log('\ndone.')
