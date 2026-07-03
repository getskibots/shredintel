import 'dotenv/config'
const KEY = (process.env.OPENAI_API_KEY||'').trim()
async function tryMint(url, body, label){
  try{
    const r = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${KEY}` }, body: JSON.stringify(body) })
    const txt = await r.text()
    let j; try{ j=JSON.parse(txt) }catch{ j=null }
    const token = j?.value || j?.client_secret?.value
    console.log(`\n[${label}] ${url}\n  http=${r.status}  token=${token? token.slice(0,12)+'…(minted ✓)':'(none)'}`)
    if(!token) console.log('  body:', txt.slice(0,300))
    return r.status
  }catch(e){ console.log(`[${label}] fetch err:`, e.message); return 0 }
}
// GA shape (client_secrets)
await tryMint('https://api.openai.com/v1/realtime/client_secrets',
  { session:{ type:'realtime', model:'gpt-realtime', audio:{ output:{ voice:'ash' } } } }, 'GA client_secrets · ash')
// older sessions shape (fallback)
await tryMint('https://api.openai.com/v1/realtime/sessions',
  { model:'gpt-realtime', voice:'cedar' }, 'legacy sessions · cedar')
