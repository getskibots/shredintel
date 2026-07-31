#!/usr/bin/env bash
# ShredIntel nightly pipeline — the whole thing, self-running, on the droplet:
#   sync (Botscrew → Supabase) → detect verticals for new bots → enrich new
#   conversations → refresh every matview → pull GA4 site traffic → health gate
#   + heartbeat.
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

echo "── 1/5 sync (Botscrew → Supabase) ──"
$NODE sync.mjs 2>&1 | tail -15
RC=${PIPESTATUS[0]}; [ "$RC" -eq 0 ] || FAILED="$FAILED sync"

echo "── 2/5 detect verticals for new bots ──"
$NODE detect-vertical.mjs 2>&1 | tail -6
RC=${PIPESTATUS[0]}; [ "$RC" -eq 0 ] || FAILED="$FAILED detect-vertical"

echo "── 3/5 enrich new conversations ──"
$NODE enrich-fleet.mjs 2>&1 | tail -20
RC=${PIPESTATUS[0]}; [ "$RC" -eq 0 ] || FAILED="$FAILED enrich-fleet"

echo "── 4/5 refresh matviews ──"
$NODE refresh.mjs 2>&1 | tail -6
RC=${PIPESTATUS[0]}; [ "$RC" -eq 0 ] || FAILED="$FAILED refresh"

# GA4 site-traffic pull for every connected bot (report.bot_ga4). Independent of
# the matviews (writes report.ga4_*_daily), so it runs BEST-EFFORT and is NOT added
# to FAILED — a GA4 hiccup (revoked token, quota) must never false-red the core
# freshness heartbeat. Its exit code is logged for spot-checking.
echo "── 5/5 pull GA4 site traffic (best-effort) ──"
$NODE ga4-sync.mjs 2>&1 | tail -10
echo "   ga4-sync exit: ${PIPESTATUS[0]}"

echo "── health check + heartbeat ──"
$NODE heartbeat.mjs --failed "$(echo $FAILED | xargs)"

echo "════════════ done $(date -u +%FT%TZ) ════════════"
