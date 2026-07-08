#!/usr/bin/env node
/**
 * setup-nightly-refresh.mjs — reliable nightly report-layer refresh.
 *
 * Fixes the pg_cron job that had been FAILING every night: the old
 * report.refresh_all_materialized_views() used REFRESH ... CONCURRENTLY (slow,
 * needs unique indexes) with a 15-min timeout, and only covered 5 of the 20
 * report matviews — so it timed out AND never refreshed conversation_page /
 * conversation_geo / the voice call_* views (hence the staleness we hit).
 *
 * This rewrites the function to PLAIN refresh (fast, lock-during-refresh is fine
 * nightly), no statement timeout, covering ALL report matviews in dependency
 * order (call_base first — the voice call_* views read from it). Then reschedules
 * it via pg_cron at 09:00 UTC (after the ~08:00 raw pull) and runs it once to
 * verify it completes. Idempotent.
 *
 * NOTE: this fixes the REFRESH half only. The raw pull (raw.* from Botscrew MySQL)
 * is a separate external job — confirmed running (data fresh). Keep that running.
 *   node setup-nightly-refresh.mjs
 */
import 'dotenv/config'
import pg from 'pg'

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()

// Dependency order: call_base first (call_volume/geo/hours/callers/*_stats read it),
// then everything else (they read from tables or from call_base).
const VIEWS = [
  'call_base',
  'call_volume', 'call_geo', 'call_hours', 'call_callers', 'call_caller_stats',
  'call_transfer_stats', 'call_facts_stats', 'call_inbound_stats',
  'bot_channel', 'conversation_depth', 'conversation_page', 'conversation_geo',
  'conversion_pulse', 'demand_heatmap', 'outcome_timeline', 'sender_mix_stack',
  'knowledge_layer_mix', 'knowledge_layer_by_section', 'lead_capture_funnel',
]
const arr = VIEWS.map((v) => `'report.${v}'`).join(', ')

await c.query(`create or replace function report.refresh_all_materialized_views()
  returns void language plpgsql security definer set statement_timeout to '0' as $fn$
  declare v_name text; v_start timestamptz; v_views text[] := array[${arr}];
  begin
    execute 'set statement_timeout to ''0''';   -- belt & suspenders: no cap during refresh
    foreach v_name in array v_views loop
      v_start := clock_timestamp();
      begin
        execute format('refresh materialized view %s', v_name);
        raise notice 'refreshed % in %s', v_name, round(extract(epoch from clock_timestamp()-v_start),1);
      exception when others then
        raise warning 'refresh % FAILED: %', v_name, sqlerrm;
      end;
    end loop;
  end $fn$`)
console.log('✓ refresh_all_materialized_views() rewritten — plain refresh, no timeout, all 20 views (call_base first)')

// (re)schedule via pg_cron
try { await c.query(`select cron.unschedule('nightly-report-refresh')`) } catch { /* not scheduled yet */ }
await c.query(`select cron.schedule('nightly-report-refresh', '0 9 * * *', $$select report.refresh_all_materialized_views()$$)`)
console.log('✓ scheduled pg_cron job "nightly-report-refresh" @ 09:00 UTC')

console.log('running one refresh now to verify it completes (timing)…')
await c.query("set statement_timeout to '0'") // lift this client's cap for the verify
const t0 = Date.now()
await c.query('select report.refresh_all_materialized_views()')
console.log(`✓ full refresh completed in ${((Date.now() - t0) / 1000).toFixed(1)}s`)

const jobs = (await c.query(`select jobname, schedule, active from cron.job`)).rows
console.log('cron jobs now:', JSON.stringify(jobs))
await c.end()
