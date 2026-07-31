#!/usr/bin/env bash
# ShredIntel nightly pipeline — the whole thing, self-running, on the droplet:
#   sync (Botscrew → Supabase) → detect verticals for new bots → enrich new
#   conversations → refresh every matview → health gate + heartbeat.
# (GA4 site-traffic pull runs SEPARATELY as a Vercel cron — /api/ga4-cron — because
#  the OAuth encryption key lives on Vercel, not here. See the switch-later note.)
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

echo "── 4/4 refresh matviews ──"
$NODE refresh.mjs 2>&1 | tail -6
RC=${PIPESTATUS[0]}; [ "$RC" -eq 0 ] || FAILED="$FAILED refresh"

echo "── health check + heartbeat ──"
$NODE heartbeat.mjs --failed "$(echo $FAILED | xargs)"

echo "════════════ done $(date -u +%FT%TZ) ════════════"
