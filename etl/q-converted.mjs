import 'dotenv/config'
import pg from 'pg'
const c = new pg.Client({ host: process.env.SUPABASE_DB_HOST, port:+(process.env.SUPABASE_DB_PORT||5432), user:process.env.SUPABASE_DB_USER, password:process.env.SUPABASE_DB_PASSWORD, database:process.env.SUPABASE_DB_NAME||'postgres', ssl:{rejectUnauthorized:false} })
await c.connect()
// distinct top-level keys across CONVERTED message payloads (bot 43)
const { rows: keys } = await c.query(`
  select k, count(*) n from (
    select jsonb_object_keys(h.message) k
      from raw.admin_chat_history h
      join report._conversations_v cv on cv.conversation_id=h.conversation_id
     where cv.bot_id=43 and h.status='CONVERTED' and jsonb_typeof(h.message)='object'
     limit 20000) t group by 1 order by 2 desc`)
console.log('CONVERTED message payload keys (bot 43):')
for (const r of keys) console.log(`  ${r.k}  (${r.n})`)
// any amount/order/total hiding in the text?
const { rows: hits } = await c.query(`
  select count(*) n from raw.admin_chat_history h
   join report._conversations_v cv on cv.conversation_id=h.conversation_id
  where cv.bot_id=43 and h.status='CONVERTED'
    and h.message::text ~* '\$[0-9]|amount|order_total|"total"|subtotal|price'`)
console.log(`\nCONVERTED payloads containing a $ / amount / total / price token: ${hits[0].n}`)
await c.end()
