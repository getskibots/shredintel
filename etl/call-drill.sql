-- report.call_drill — the voice DRILL + CUBE list. call_base + anon-safe flags/axes:
--   transferred  — Twilio ground truth (report.call_transfers)
--   is_voicemail — from the Whisper handover transcript (report.call_handover_transcript)
--   resolution/revenue/category/flavor — the enrichment axes call_base lacks, folded in
--     from report.conversation_intel (call_base already carries section/sentiment/urgency/
--     handover/pinchpoint/topic + hour_local/geo/duration). Labels + booleans only, no PII:
--     the view reads the server-only/PII tables with the owner's rights and exposes only
--     these, so anon can filter/pivot on them without touching the protected tables.
create or replace view report.call_drill as
  select cb.*,
         (ct.transferred is true) as transferred,
         (h.conversation_id is not null and h.is_voicemail is true) as is_voicemail,
         ci.resolution, ci.revenue, ci.category, ci.flavor
  from report.call_base cb
  left join report.call_transfers ct on ct.conversation_id = cb.conversation_id
  left join report.call_handover_transcript h on h.conversation_id = cb.conversation_id
  left join report.conversation_intel ci on ci.conversation_id = cb.conversation_id and ci.bot_id = cb.bot_id;

grant select on report.call_drill to anon, authenticated;
