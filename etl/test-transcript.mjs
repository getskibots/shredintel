import 'dotenv/config'
import pg from 'pg'
const c = new pg.Client({ host: process.env.SUPABASE_DB_HOST, port:+(process.env.SUPABASE_DB_PORT||5432), user:process.env.SUPABASE_DB_USER, password:process.env.SUPABASE_DB_PASSWORD, database:process.env.SUPABASE_DB_NAME||'postgres', ssl:{rejectUnauthorized:false} })
await c.connect()
const scrub = (s)=>(s||'').replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi,'[email]').replace(/(\+?\d[\d\s().-]{7,}\d)/g,'[phone]')
// pick an enriched checkout-pinchpoint conversation for bot 43
const { rows:[pick] } = await c.query(`select conversation_id cid from report.conversation_intel where bot_id=43 and pinchpoint='Checkout' order by day desc limit 1`)
console.log('conversation:', pick.cid)
const { rows:[meta] } = await c.query(`select section, pinchpoint, sentiment, topic from report.conversation_intel where conversation_id=$1 and bot_id=43`,[pick.cid])
console.log('meta:', JSON.stringify(meta))
// bot-scope check: wrong bot should return nothing
const wrong = await c.query(`select 1 from report.conversation_intel where conversation_id=$1 and bot_id=2`,[pick.cid])
console.log('bot-scoping (should be 0 rows for bot 2):', wrong.rowCount)
const { rows:msgs } = await c.query(`
  select case when coalesce(h.is_from_support,0)=1 then 'support' when coalesce(h.is_echo,false) then 'bot' else 'user' end sender,
         coalesce(nullif(h.formatted_chat_history->>'text',''), h.message->>'text', h.message #>> '{}') txt
    from raw.admin_chat_history h where h.conversation_id=$1 and h.is_message=1 and coalesce(h.visible,1)=1 order by h."timestamp"`,[pick.cid])
console.log('\n── scrubbed transcript ──')
for (const m of msgs) { const t=scrub((m.txt||'').replace(/\s+/g,' ').trim()); if(t) console.log(`  ${m.sender.toUpperCase()}: ${t.slice(0,220)}`) }
await c.end()
