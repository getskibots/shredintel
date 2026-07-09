#!/usr/bin/env bash
#
# cron-sync.sh — nightly ShredIntel raw pull, run on the GSB droplet (whose IP is
# whitelisted on the Botscrew MySQL). Moves the sync off Brandon's laptop.
#
# Runs sync.mjs: Botscrew MySQL -> Supabase raw.*, then refreshes the report.*
# matviews. (The Supabase pg_cron job "nightly-report-refresh" @ 09:00 UTC is the
# belt-and-suspenders second refresh.) Appends to sync.log next to this script.
#
# SETUP on the droplet (one time):
#   1) cd into the etl folder of the repo checkout, then:  chmod +x cron-sync.sh
#   2) Confirm the droplet can reach both DBs (no writes):  node sync.mjs --test
#   3) Add to crontab (crontab -e). The `-lc` runs a LOGIN shell so node/nvm are on
#      PATH. Adjust the path to where the repo lives on the droplet:
#        0 8 * * * /bin/bash -lc '/root/shredintel/etl/cron-sync.sh'
#   4) Test it end-to-end now:  /bin/bash -lc '/root/shredintel/etl/cron-sync.sh'
#      then check the tail:      tail -n 40 /root/shredintel/etl/sync.log
#
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")"
{
  echo "=== sync start $(date -u +%FT%TZ) ==="
  node sync.mjs
  echo "=== sync done  $(date -u +%FT%TZ) ==="
  echo
} >> sync.log 2>&1
