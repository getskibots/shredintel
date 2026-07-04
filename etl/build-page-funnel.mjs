#!/usr/bin/env node
/**
 * build-page-funnel.mjs — the PAGE / URL layer: where each guest conversation
 * originated on the resort's site, mapped to an ecommerce funnel stage.
 *
 * report.conversation_page is a MATERIALIZED view (not a plain view) because it
 * joins raw.admin_conversation + raw.admin_user, and anon has no access to raw.*
 * at query time — materializing precomputes it so the anon-granted report.*
 * layer stays PII-free and self-contained. Attribution source: admin_user.page_url
 * (~99% filled for chat), NOT admin_chat_history.website_location (~40%). The URL
 * is normalized to host+path and the query string is DROPPED (PII safety).
 *
 * Plain aggregate views (page_funnel / page_section / …) sit on top for the
 * dashboard + the global page filter. Refresh: 'conversation_page' is in the
 * MATVIEWS list in sync.mjs, so it refreshes every nightly sync.
 *
 * Run after enrich-backfill.mjs + build-intel-views.mjs. Idempotent.
 */
import 'dotenv/config'
import pg from 'pg'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()

// host+path, lowercased, scheme + query + hash stripped (query string = PII risk)
const LOC = `lower(split_part(split_part(regexp_replace(u.page_url, '^https?://', ''), '?', 1), '#', 1))`

// Ecommerce funnel stage from the normalized path. Order matters — most-specific
// commerce steps first, Account before Product (so /order/history ≠ product),
// bare host = Home, everything else = Browse/Content. Generic across resorts.
const STAGE_RANK = `case
  when page_path ~ 'ordercomplete|order/confirm|order-confirm|thank[-_]?you|/receipt' then 6
  when page_path ~ 'onepagecheckout|/checkout|customer/info|/payment|/billing' then 5
  when page_path ~ '/cart|/basket|/bag' then 4
  when page_path ~ '/order/history|/orders|/account|/profile|/wallet|/my-tickets' then 7
  when page_path ~ '/s/|/l/|/p/|/product|lift[-_ ]?ticket|season[-_ ]?pass|/tickets|/passes|/rentals|/lessons|/shop|reservation|/book' then 3
  when page_path ~ '^[^/]+/?$' then 1
  else 2
end`
const STAGE_LABELS = `array['Home','Browse & content','Product & shop','Cart','Checkout','Confirmation','Account & orders']`

console.log('Building report.conversation_page (matview) …')
await c.query(`drop view if exists report.page_funnel, report.page_section, report.page_pinchpoint, report.page_sentiment, report.page_topics cascade`)
await c.query(`drop materialized view if exists report.conversation_page cascade`)
await c.query(`
  create materialized view report.conversation_page as
  with src as (
    select ci.bot_id, ci.conversation_id, ci.day, ci.substantive, ci.sentiment,
           ci.section, ci.pinchpoint, ci.topic, ${LOC} as page_path
      from report.conversation_intel ci
      join raw.admin_conversation cv on cv.id = ci.conversation_id
      join raw.admin_user u on u.id = cv.user_id
     where u.page_url is not null and u.page_url <> ''
  ),
  ranked as (select *, (${STAGE_RANK.replace(/page_path/g, 'src.page_path')}) as stage_rank from src)
  select bot_id, conversation_id, day, substantive, sentiment, section, pinchpoint, topic, page_path,
         stage_rank, (${STAGE_LABELS})[stage_rank] as funnel_stage
    from ranked`)
await c.query(`create index on report.conversation_page (bot_id, day)`)
await c.query(`create index on report.conversation_page (bot_id, stage_rank)`)
await c.query(`grant select on report.conversation_page to anon, authenticated`)

console.log('Building aggregate views …')
// the funnel itself (substantive conversations + friction per stage)
await c.query(`create view report.page_funnel as
  select bot_id, day, funnel_stage, stage_rank,
         count(*)::int as conversations,
         count(*) filter (where sentiment = 'Negative')::int as negative
    from report.conversation_page
   where substantive is true
   group by bot_id, day, funnel_stage, stage_rank`)

// stage-dimensioned intelligence (powers the global page filter re-scoping)
await c.query(`create view report.page_section as
  select bot_id, day, funnel_stage, stage_rank, section as key, count(*)::int as conversations
    from report.conversation_page
   where substantive is true and section is not null
   group by bot_id, day, funnel_stage, stage_rank, section`)
await c.query(`create view report.page_sentiment as
  select bot_id, day, funnel_stage, stage_rank, sentiment as key, count(*)::int as conversations
    from report.conversation_page
   where substantive is true and sentiment is not null
   group by bot_id, day, funnel_stage, stage_rank, sentiment`)
await c.query(`create view report.page_pinchpoint as
  select bot_id, day, funnel_stage, stage_rank, pinchpoint as key,
         count(*)::int as conversations,
         count(*) filter (where sentiment = 'Negative')::int as negative
    from report.conversation_page
   where substantive is true and pinchpoint is not null and pinchpoint <> 'None'
   group by bot_id, day, funnel_stage, stage_rank, pinchpoint`)
await c.query(`create view report.page_topics as
  select bot_id, day, funnel_stage, stage_rank, sentiment, topic
    from report.conversation_page
   where substantive is true and topic is not null and topic <> ''`)

for (const v of ['page_funnel', 'page_section', 'page_sentiment', 'page_pinchpoint', 'page_topics'])
  await c.query(`grant select on report.${v} to anon, authenticated`)

await c.query(`notify pgrst, 'reload schema'`)
console.log('✓ page-funnel views created + granted + PostgREST reloaded')

// verify against JH (bot 43)
const { rows: fun } = await c.query(
  `select stage_rank, funnel_stage, sum(conversations) conversations, sum(negative) negative,
          round(100.0*sum(negative)/nullif(sum(conversations),0),1) pct_neg
     from report.page_funnel where bot_id=43 group by stage_rank, funnel_stage order by stage_rank`)
console.log('\nreport.page_funnel (bot 43, all-time):')
console.log('  rank  stage                conversations  neg%')
for (const r of fun)
  console.log(`  ${String(r.stage_rank).padEnd(4)}  ${String(r.funnel_stage).padEnd(20)} ${String(r.conversations).padStart(8)}   ${r.pct_neg}%`)

const { rows: [cov] } = await c.query(
  `select (select count(*) from report.conversation_intel where bot_id=43 and substantive) subst,
          (select count(*) from report.conversation_page where bot_id=43 and substantive) paged`)
console.log(`\ncoverage bot 43: ${cov.paged} of ${cov.subst} substantive conversations page-attributed`)

await c.end()
console.log('\ndone.')
