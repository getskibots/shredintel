-- Page / URL layer — where each guest conversation originated on the resort's
-- site, mapped to an ecommerce funnel stage. Built + kept current by
-- etl/build-page-funnel.mjs (this file is the version-controlled reference).
--
-- report.conversation_page is MATERIALIZED (not a plain view) because it joins
-- raw.admin_conversation + raw.admin_user and anon has no raw.* access at query
-- time. Attribution = admin_user.page_url (~99% filled for chat); the URL is
-- normalized to host+path with the query string DROPPED (PII safety). Refreshed
-- nightly via the MATVIEWS list in sync.mjs.
--
-- Funnel stages (stage_rank → funnel_stage):
--   1 Home · 2 Browse & content · 3 Product & shop · 4 Cart ·
--   5 Checkout · 6 Confirmation · 7 Account & orders

create materialized view report.conversation_page as
with src as (
  select ci.bot_id, ci.conversation_id, ci.day, ci.substantive, ci.sentiment,
         ci.section, ci.pinchpoint, ci.topic,
         lower(split_part(split_part(regexp_replace(u.page_url, '^https?://', ''), '?', 1), '#', 1)) as page_path
    from report.conversation_intel ci
    join raw.admin_conversation cv on cv.id = ci.conversation_id
    join raw.admin_user u on u.id = cv.user_id
   where u.page_url is not null and u.page_url <> ''
),
ranked as (
  select *, case
    when page_path ~ 'ordercomplete|order/confirm|order-confirm|thank[-_]?you|/receipt' then 6
    when page_path ~ 'onepagecheckout|/checkout|customer/info|/payment|/billing'        then 5
    when page_path ~ '/cart|/basket|/bag'                                                then 4
    when page_path ~ '/order/history|/orders|/account|/profile|/wallet|/my-tickets'      then 7
    when page_path ~ '/s/|/l/|/p/|/product|lift[-_ ]?ticket|season[-_ ]?pass|/tickets|/passes|/rentals|/lessons|/shop|reservation|/book' then 3
    when page_path ~ '^[^/]+/?$'                                                          then 1
    else 2
  end as stage_rank
  from src
)
select bot_id, conversation_id, day, substantive, sentiment, section, pinchpoint, topic, page_path,
       stage_rank,
       (array['Home','Browse & content','Product & shop','Cart','Checkout','Confirmation','Account & orders'])[stage_rank] as funnel_stage
  from ranked;

create index on report.conversation_page (bot_id, day);
create index on report.conversation_page (bot_id, stage_rank);
grant select on report.conversation_page to anon, authenticated;

-- The funnel + stage-dimensioned intelligence (plain views, no PII, granted anon).
create view report.page_funnel as
  select bot_id, day, funnel_stage, stage_rank,
         count(*)::int as conversations,
         count(*) filter (where sentiment = 'Negative')::int as negative
    from report.conversation_page where substantive is true
   group by bot_id, day, funnel_stage, stage_rank;

create view report.page_section as
  select bot_id, day, funnel_stage, stage_rank, section as key, count(*)::int as conversations
    from report.conversation_page where substantive is true and section is not null
   group by bot_id, day, funnel_stage, stage_rank, section;

create view report.page_sentiment as
  select bot_id, day, funnel_stage, stage_rank, sentiment as key, count(*)::int as conversations
    from report.conversation_page where substantive is true and sentiment is not null
   group by bot_id, day, funnel_stage, stage_rank, sentiment;

create view report.page_pinchpoint as
  select bot_id, day, funnel_stage, stage_rank, pinchpoint as key,
         count(*)::int as conversations,
         count(*) filter (where sentiment = 'Negative')::int as negative
    from report.conversation_page where substantive is true and pinchpoint is not null and pinchpoint <> 'None'
   group by bot_id, day, funnel_stage, stage_rank, pinchpoint;

create view report.page_topics as
  select bot_id, day, funnel_stage, stage_rank, sentiment, topic
    from report.conversation_page where substantive is true and topic is not null and topic <> '';

grant select on report.page_funnel, report.page_section, report.page_sentiment,
                report.page_pinchpoint, report.page_topics to anon, authenticated;
