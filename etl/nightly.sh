#!/usr/bin/env bash
# ShredIntel nightly pipeline — the whole thing, self-running, on the droplet:
#   sync (Botscrew → Supabase) → detect verticals for new bots → enrich new
#   conversations → refresh every matview.
# Wired via crontab (see the cron entry). Logs to /opt/app/etl/nightly.log.
# Runs from /opt/app/etl (the git clone) with its .env (Supabase + Botscrew MySQL
# + OpenAI). Each step is best-effort — a failure is logged but the pipeline
# continues so one bad step doesn't block the rest.

cd /opt/app/etl || { echo "no /opt/app/etl"; exit 1; }
NODE=/usr/bin/node
echo ""
echo "════════════ nightly run $(date -u +%FT%TZ) ════════════"

echo "── 1/4 sync (Botscrew → Supabase) ──"
$NODE sync.mjs 2>&1 | tail -15

echo "── 2/4 detect verticals for new bots ──"
$NODE detect-vertical.mjs 2>&1 | tail -6

echo "── 3/4 enrich new conversations ──"
$NODE enrich-fleet.mjs 2>&1 | tail -20

echo "── 4/4 refresh matviews ──"
$NODE refresh.mjs 2>&1 | tail -6

echo "════════════ done $(date -u +%FT%TZ) ════════════"
