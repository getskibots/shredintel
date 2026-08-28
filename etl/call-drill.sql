-- report.call_drill — the voice DRILL list. call_base + two ANON-SAFE booleans so
-- the escalation/voicemail cohorts are filterable in ConversationExplorer:
--   transferred  — Twilio ground truth (report.call_transfers)
--   is_voicemail — from the Whisper handover transcript (report.call_handover_transcript)
-- The view reads the server-only / PII tables with the OWNER's rights and exposes
-- ONLY the booleans (never numbers, destination phone, or transcript text), so anon
-- can filter on them without touching the protected tables. Live (no matview refresh
-- needed) — the flags follow call_transfers/call_handover_transcript directly.
create or replace view report.call_drill as
  select cb.*,
         (ct.transferred is true) as transferred,
         (h.conversation_id is not null and h.is_voicemail is true) as is_voicemail
  from report.call_base cb
  left join report.call_transfers ct on ct.conversation_id = cb.conversation_id
  left join report.call_handover_transcript h on h.conversation_id = cb.conversation_id;

grant select on report.call_drill to anon, authenticated;
