#!/usr/bin/env node
/**
 * build-bot-twilio.mjs — the bot → Twilio account config (step 1 of the telephony
 * pipeline). One row per voice bot: which Twilio project (account_sid) its calls
 * live in, + the inbound phone number (metadata).
 *
 * This is the SERVER-ONLY config the ingest + /api/recording resolve `bot → account`
 * from. It is NOT anon-granted (GSB-internal). The auth TOKEN never lives here — it's
 * in server env, keyed by account_sid (single TWILIO_ACCOUNT_SID/AUTH_TOKEN today, a
 * TWILIO_ACCOUNTS json map for multi-account). The dashboard admin console (later)
 * edits this table; today we seed 248 → the MC account from env.
 *
 * Handles BOTH setup styles: dedicated (1 bot → 1 account) and shared (N bots → 1
 * account, told apart by phone_number) — account_sid is the fetch key, many bots may
 * share it. Idempotent. Prod write.  node build-bot-twilio.mjs
 */
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { config } from 'dotenv'
import pg from 'pg'
config({ path: join(dirname(fileURLToPath(import.meta.url)), '.env') })

const MC_ACCOUNT = (process.env.TWILIO_ACCOUNT_SID || '').trim()

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST, port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER, password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
})
await c.connect()

await c.query(`create table if not exists report.bot_twilio (
  bot_id bigint primary key,
  account_sid text not null,
  phone_number text,        -- the bot's inbound number (the parent call's "to")
  label text,               -- human label for the account/project
  updated_at timestamptz not null default now()
)`)
// Encrypted auth token (dashboard-entered, AES-256-GCM; see etl/twilio-token.mjs).
// Ciphertext only — the key lives in env, never in this table.
await c.query('alter table report.bot_twilio add column if not exists auth_token_enc text')
// GSB-internal config — never expose to the anon key.
await c.query('revoke all on report.bot_twilio from anon').catch(() => {})

if (MC_ACCOUNT) {
  await c.query(
    `insert into report.bot_twilio (bot_id, account_sid, label) values (248, $1, 'Mountain Collective')
     on conflict (bot_id) do update set account_sid = excluded.account_sid, label = excluded.label, updated_at = now()`,
    [MC_ACCOUNT],
  )
  console.log(`✓ report.bot_twilio ready · seeded bot 248 → account ${MC_ACCOUNT.slice(0, 8)}… (Mountain Collective)`)
} else {
  console.log('✓ report.bot_twilio table ready (no TWILIO_ACCOUNT_SID in env → not seeded; add it to seed 248)')
}
const n = (await c.query('select count(*)::int n from report.bot_twilio')).rows[0].n
console.log(`  ${n} bot(s) mapped.`)
await c.end()
