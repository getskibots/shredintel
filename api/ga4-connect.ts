/**
 * /api/ga4-connect — status + property selection for the "Connect Google
 * Analytics" control (the OAuth token exchange itself is in /api/ga4-oauth).
 *
 *   GET  ?botId=2   → { ready, connected, email, propertyId, hasData,
 *                       properties:[{propertyId,displayName,account}] }
 *                     `properties` is the picker list (needs a live token).
 *   POST { botId, propertyId }  → save the chosen property.
 *   POST { botId, disconnect:true } → forget the token + property for this bot.
 *
 * report.bot_ga4 is server-only; the browser only ever sees whether a token
 * exists, never the token. Reads the aggregate ga4_traffic_daily to report
 * whether any data has landed yet.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPool } from './_lib/db.js'
import { decryptToken } from './_lib/tokenCrypto.js'
import { ga4OAuthReady, refreshAccessToken, listProperties } from './_lib/ga4.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const pool = getPool()
  try {
    await pool.query(`create table if not exists report.bot_ga4 (
      bot_id int primary key, ga4_property_id text, label text,
      status text not null default 'connected', note text,
      connected_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      last_synced_at timestamptz, last_error text)`)
    await pool.query('alter table report.bot_ga4 add column if not exists oauth_refresh_token_enc text')
    await pool.query('alter table report.bot_ga4 add column if not exists oauth_email text')
    await pool.query('alter table report.bot_ga4 add column if not exists oauth_connected_at timestamptz')

    if (req.method === 'GET') {
      const botId = Number(req.query.botId)
      if (!botId) return res.status(400).json({ error: 'botId required' })
      const { rows } = await pool.query(
        `select ga4_property_id, oauth_email, status, last_synced_at, last_error,
                (oauth_refresh_token_enc is not null) as has_token
         from report.bot_ga4 where bot_id = $1`,
        [botId],
      )
      const row = rows[0]
      const { rows: dataRows } = await pool.query(
        'select count(*)::int n from report.ga4_traffic_daily where bot_id = $1', [botId],
      ).catch(() => ({ rows: [{ n: 0 }] }))

      const out: Record<string, unknown> = {
        ready: ga4OAuthReady(),
        connected: !!row?.has_token,
        email: row?.oauth_email ?? null,
        propertyId: row?.ga4_property_id ?? null,
        status: row?.status ?? null,
        lastSyncedAt: row?.last_synced_at ?? null,
        lastError: row?.last_error ?? null,
        hasData: (dataRows[0]?.n ?? 0) > 0,
        properties: [],
      }

      // Listing properties needs a token refresh + an Admin API call, so only do it
      // when the UI explicitly asks (?list=1, i.e. the popover is open) — not on
      // every page load's cheap status check.
      if (row?.has_token && req.query.list) {
        const refresh = decryptToken(
          (await pool.query('select oauth_refresh_token_enc from report.bot_ga4 where bot_id = $1', [botId])).rows[0]?.oauth_refresh_token_enc,
        )
        if (refresh) {
          try {
            const access = await refreshAccessToken(refresh)
            out.properties = await listProperties(access)
          } catch (e) {
            out.pickerError = e instanceof Error ? e.message.slice(0, 200) : 'could not list properties'
          }
        }
      }
      return res.status(200).json(out)
    }

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as Record<string, unknown>
      const botId = Number(body.botId)
      if (!botId) return res.status(400).json({ error: 'botId required' })

      if (body.disconnect === true) {
        await pool.query(
          `update report.bot_ga4 set oauth_refresh_token_enc = null, ga4_property_id = null,
             oauth_email = null, status = 'paused', updated_at = now() where bot_id = $1`,
          [botId],
        )
        return res.status(200).json({ ok: true, connected: false })
      }

      const propertyId = String(body.propertyId ?? '').replace(/\D/g, '')
      if (!propertyId) return res.status(400).json({ error: 'propertyId required' })
      await pool.query(
        `update report.bot_ga4 set ga4_property_id = $2, status = 'connected', updated_at = now()
         where bot_id = $1`,
        [botId, propertyId],
      )
      return res.status(200).json({ ok: true, propertyId })
    }

    return res.status(405).json({ error: 'method not allowed' })
  } catch (e) {
    console.error('[api/ga4-connect] failed:', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'unknown error' })
  }
}
