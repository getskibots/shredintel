/**
 * _twilio-lib.mjs — shared resilience helpers for the Twilio cost/usage syncs.
 * Long Twilio pagination interleaved with Supabase writes exposed two flaky
 * spots: transient fetch resets and an idle pg socket that Supabase drops
 * mid-run (surfacing as an unhandled 'error' event that crashes the process).
 */
import pg from 'pg'

/** fetch with retry+backoff on transient network errors, 429, and 5xx. */
export async function fetchRetry(url, opts, tries = 5) {
  let lastErr
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, opts)
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}`)
      } else {
        return res // includes 4xx (401/403) — caller decides; not retryable
      }
    } catch (e) {
      lastErr = e // ECONNRESET / ETIMEDOUT / socket hang up
    }
    await new Promise((r) => setTimeout(r, Math.min(15000, 800 * 2 ** i))) // 0.8→1.6→3.2→6.4→12.8s
  }
  throw lastErr
}

/**
 * A pg client that auto-reconnects. Supabase closes idle pooled connections;
 * with a single long-lived client that surfaces as a fatal unhandled 'error'.
 * We swallow the async error event and lazily reconnect on the next query().
 */
export function resilientClient(env) {
  const make = () =>
    new pg.Client({
      host: env.SUPABASE_DB_HOST, port: Number(env.SUPABASE_DB_PORT || 5432),
      user: env.SUPABASE_DB_USER, password: env.SUPABASE_DB_PASSWORD,
      database: env.SUPABASE_DB_NAME || 'postgres', ssl: { rejectUnauthorized: false },
      keepAlive: true, statement_timeout: 600000,
    })

  let client = make()
  let dead = false
  const arm = (c) => c.on('error', () => { dead = true }) // don't let it crash the process

  return {
    async connect() { arm(client); await client.connect() },
    async query(text, params) {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (dead) {
          try { await client.end() } catch { /* already gone */ }
          client = make(); arm(client); await client.connect(); dead = false
        }
        try {
          return await client.query(text, params)
        } catch (e) {
          const transient = /terminat|ECONNRESET|Connection|socket|timeout/i.test(String(e?.message))
          if (transient && attempt === 0) { dead = true; continue }
          throw e
        }
      }
    },
    async end() { try { await client.end() } catch { /* ignore */ } },
  }
}
