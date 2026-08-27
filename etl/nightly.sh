#!/usr/bin/env bash
# ShredIntel nightly pipeline — the whole thing, self-running, on the droplet:
#   sync (Botscrew → Supabase) → detect verticals for new bots → enrich new
#   conversations → refresh every matview → GA4 pull (via Vercel) → health gate
#   + heartbeat.
# The GA4 pull is a CURL to the Vercel endpoint /api/ga4-cron (best-effort): Vercel
# holds the OAuth encryption key and does the decrypt + pull, so nothing GA4-secret
# lives here. Switch-later: rename+rotate the key onto this box and pull locally.
# Wired via crontab (0 8 * * *). Logs to /opt/app/etl/nightly.log.
# Runs from /opt/app/etl (the git clone) with its .env (Supabase + Botscrew MySQL
# + OpenAI + HEARTBEAT_URL).
#
# Every step still runs even if an earlier one fails (best-effort: one bad step
# shouldn't block the rest). What CHANGED 2026-07-20: we now capture each stage's
# exit code instead of discarding it, and finish with a freshness assertion that
# pings the heartbeat only when the run genuinely worked.
#
# WHY: sync.mjs died nightly for five days (a NUL byte in one message) and this
# script still printed "done" every time, because the other three stages ran fine
# over incomplete data. Silent success is worse than loud failure.

cd /opt/app/etl || { echo "no /opt/app/etl"; exit 1; }
NODE=/usr/bin/node
FAILED=""

echo ""
echo "════════════ nightly run $(date -u +%FT%TZ) ════════════"

# ⚠️ Each stage pipes to `tail`, so plain `$?` is TAIL's status (always 0) — that
# is precisely why a failing sync looked successful. ${PIPESTATUS[0]} is the real
# exit code, and it must be read on the very next line.

echo "── 1/4 sync (Botscrew → Supabase) ──"
$NODE sync.mjs 2>&1 | tail -15
RC=${PIPESTATUS[0]}; [ "$RC" -eq 0 ] || FAILED="$FAILED sync"

echo "── 2/4 detect verticals for new bots ──"
$NODE detect-vertical.mjs 2>&1 | tail -6
RC=${PIPESTATUS[0]}; [ "$RC" -eq 0 ] || FAILED="$FAILED detect-vertical"

echo "── 3/4 enrich new conversations ──"
$NODE enrich-fleet.mjs 2>&1 | tail -20
RC=${PIPESTATUS[0]}; [ "$RC" -eq 0 ] || FAILED="$FAILED enrich-fleet"

# Voice Twilio ingest — pull NEW calls' ground-truth facts / inbound / transfers from
# Twilio for the LIVE voice partners (the report.bot_twilio set: 248 Mtn Collective,
# 252 Sipapu, 491 Bromley). Creds resolve from the Botscrew mirror, so every account
# works. Resumable (skips already-checked calls) → a nightly run only fetches the day's
# new calls. call_base + the *_stats matviews are rolled up by the refresh below; the
# transcription stage after it reads the fresh call_transfers. Best-effort: NOT added to
# FAILED (a Twilio hiccup must not false-red the heartbeat). New partner live → add its
# bot id here (and seed report.bot_twilio).
echo "── voice Twilio ingest (248/252/491, best-effort) ──"
for VB in 248 252 491; do
  $NODE build-call-facts.mjs "$VB" 2>&1 | tail -1
  $NODE build-call-inbound.mjs "$VB" 2>&1 | tail -1
  $NODE build-call-transfers.mjs "$VB" 2>&1 | tail -1
done

echo "── 4/4 refresh matviews ──"
$NODE refresh.mjs 2>&1 | tail -6
RC=${PIPESTATUS[0]}; [ "$RC" -eq 0 ] || FAILED="$FAILED refresh"

# Handover transcription — the human/escalation half of NEW transferred calls
# (Whisper) + voicemail detection. Incremental (pending-only), resumable, hard
# $-capped. Best-effort: NOT added to FAILED (a Whisper/Twilio hiccup must not
# false-red the freshness heartbeat). Depends on call_transfers + call_base being
# current (transfer ingest + the refresh above populate recording_sid).
echo "── handover transcription (new transfers, best-effort) ──"
$NODE transcribe-handover.mjs --nightly --cap 20 2>&1 | tail -6

# GA4 site traffic — trigger the Vercel endpoint (it holds the keys + does the
# decrypt/pull). Best-effort: NOT added to FAILED, so a GA4 hiccup can never
# false-red the core freshness heartbeat. Response is logged for spot-checking.
echo "── GA4 site-traffic pull (via Vercel, best-effort) ──"
curl -sS -m 180 -H "x-vercel-cron: 1" https://analytics.getskibots.com/api/ga4-cron | tail -c 500; echo

echo "── health check + heartbeat ──"
$NODE heartbeat.mjs --failed "$(echo $FAILED | xargs)"

echo "════════════ done $(date -u +%FT%TZ) ════════════"
