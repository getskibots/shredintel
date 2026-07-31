/**
 * POST /api/ga4-refresh { botId } — pull the last 28 days for ONE connected bot,
 * on demand, so the resort sees numbers the moment they finish connecting (the
 * full history backfill still runs nightly via etl/ga4-sync.mjs).
 *
 * Uses the bot's own OAuth token (report.bot_ga4.oauth_refresh_token_enc) → a
 * short-lived access token → REST runReport → upsert into the anon-readable
 * report.ga4_*_daily tables. Same shape the nightly writes.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPool } from './_lib/db.js'
import { decryptToken } from './_lib/tokenCrypto.js'
import { refreshAccessToken, runReportREST } from './_lib/ga4.js'
import type { Pool } from 'pg'

const DAYS = 28
const ymd = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
const num = (v: string) => Number(v || 0)

async function upsert(pool: Pool, table: string, cols: string[], conflict: string[], rows: Record<string, unknown>[]) {
  if (!rows.length) return 0
  const upd = cols.filter((c) => !conflict.includes(c)).map((c) => `${c} = excluded.${c}`).join(', ')
  let done = 0
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500)
    const params: unknown[] = []
    const values = chunk.map((r, ri) => {
      cols.forEach((c) => params.push(r[c]))
      return `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(', ')})`
    })
    await pool.query(
      `insert into ${table} (${cols.join(', ')}) values ${values.join(', ')}
       on conflict (${conflict.join(', ')}) do update set ${upd}`,
      params,
    )
    done += chunk.length
  }
  return done
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  const botId = Number((req.body as Record<string, unknown>)?.botId)
  if (!botId) return res.status(400).json({ error: 'botId required' })

  const pool = getPool()
  try {
    const { rows } = await pool.query(
      'select ga4_property_id, oauth_refresh_token_enc from report.bot_ga4 where bot_id = $1', [botId],
    )
    const row = rows[0]
    if (!row?.ga4_property_id) return res.status(400).json({ error: 'no GA4 property selected for this bot yet' })
    const refresh = decryptToken(row.oauth_refresh_token_enc)
    if (!refresh) return res.status(400).json({ error: 'this bot is not connected via OAuth' })

    const access = await refreshAccessToken(refresh)
    const property = String(row.ga4_property_id)
    const dateRanges = [{ startDate: `${DAYS}daysAgo`, endDate: 'yesterday' }]

    // 1) traffic by day
    const t = await runReportREST(access, property, {
      dateRanges, dimensions: [{ name: 'date' }],
      metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'screenPageViews' }, { name: 'eventCount' }],
    })
    const nT = await upsert(pool, 'report.ga4_traffic_daily',
      ['bot_id', 'day', 'sessions', 'users', 'pageviews', 'events'], ['bot_id', 'day'],
      t.map((r) => ({
        bot_id: botId, day: ymd(r.dimensionValues[0].value),
        sessions: num(r.metricValues[0].value), users: num(r.metricValues[1].value),
        pageviews: num(r.metricValues[2].value), events: num(r.metricValues[3].value),
      })))

    // 2) pages by day+host+path
    const p = await runReportREST(access, property, {
      dateRanges, dimensions: [{ name: 'date' }, { name: 'hostName' }, { name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'sessions' }], limit: 50000,
    })
    const pMap = new Map<string, Record<string, unknown>>()
    for (const r of p) {
      const host = r.dimensionValues[1].value || ''
      const path = r.dimensionValues[2].value || ''
      const full = host + path
      const key = r.dimensionValues[0].value + '|' + full
      const prev = pMap.get(key)
      const pv = num(r.metricValues[0].value); const ses = num(r.metricValues[1].value)
      if (prev) { prev.pageviews = (prev.pageviews as number) + pv; prev.sessions = (prev.sessions as number) + ses }
      else pMap.set(key, { bot_id: botId, day: ymd(r.dimensionValues[0].value), host, page_path: path, full_path: full, pageviews: pv, sessions: ses })
    }
    const nP = await upsert(pool, 'report.ga4_page_daily',
      ['bot_id', 'day', 'host', 'page_path', 'full_path', 'pageviews', 'sessions'],
      ['bot_id', 'day', 'full_path'], [...pMap.values()])

    // 3) sources by day
    const s = await runReportREST(access, property, {
      dateRanges, dimensions: [{ name: 'date' }, { name: 'sessionSourceMedium' }],
      metrics: [{ name: 'sessions' }, { name: 'activeUsers' }], limit: 50000,
    })
    const nS = await upsert(pool, 'report.ga4_source_daily',
      ['bot_id', 'day', 'source_medium', 'sessions', 'users'], ['bot_id', 'day', 'source_medium'],
      s.map((r) => ({
        bot_id: botId, day: ymd(r.dimensionValues[0].value),
        source_medium: r.dimensionValues[1].value || '(unknown)',
        sessions: num(r.metricValues[0].value), users: num(r.metricValues[1].value),
      })))

    // 4) events by day
    const e = await runReportREST(access, property, {
      dateRanges, dimensions: [{ name: 'date' }, { name: 'eventName' }],
      metrics: [{ name: 'eventCount' }], limit: 50000,
    })
    const nE = await upsert(pool, 'report.ga4_event_daily',
      ['bot_id', 'day', 'event_name', 'event_count'], ['bot_id', 'day', 'event_name'],
      e.map((r) => ({
        bot_id: botId, day: ymd(r.dimensionValues[0].value),
        event_name: r.dimensionValues[1].value || '', event_count: num(r.metricValues[0].value),
      })))

    await pool.query(
      `update report.bot_ga4 set last_synced_at = now(), last_error = null, status = 'connected',
         updated_at = now() where bot_id = $1`, [botId])
    return res.status(200).json({ ok: true, days: nT, pages: nP, sources: nS, events: nE })
  } catch (err) {
    const msg = err instanceof Error ? err.message.slice(0, 400) : 'unknown error'
    await pool.query('update report.bot_ga4 set last_error = $2, updated_at = now() where bot_id = $1', [botId, msg]).catch(() => {})
    console.error('[api/ga4-refresh] failed:', err)
    return res.status(500).json({ error: msg })
  }
}
