import 'dotenv/config'
const KEY=(process.env.OPENAI_API_KEY||'').trim()
const r = await fetch('https://api.openai.com/v1/realtime/client_secrets',{
  method:'POST', headers:{Authorization:`Bearer ${KEY}`,'Content-Type':'application/json'},
  body: JSON.stringify({ session:{ type:'realtime', model:'gpt-realtime',
    instructions:'You are ShredIntel. Call query_shredintel for data questions.',
    audio:{ output:{ voice:'cedar' } },
    tools:[{ type:'function', name:'query_shredintel', description:'Answer a data question.', parameters:{type:'object',properties:{question:{type:'string'}},required:['question']} }] } }) })
const j = await r.json()
const tok = j?.value || j?.client_secret?.value
console.log('http', r.status, '· token', tok? tok.slice(0,12)+'…(minted ✓)':'(none)')
if(!tok) console.log(JSON.stringify(j).slice(0,400))
else console.log('voice cedar + gpt-realtime + query_shredintel tool → accepted ✓')
