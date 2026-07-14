/**
 * POST /api/twilio-sync — on-demand connect-rate ingest, triggered by the "Sync
 * now" button in the dashboard's Connect Twilio control. This is what makes voice
 * onboarding self-serve: GSB pastes the account SID + number + token, clicks Sync,
 * and the real call volume + connect rate appear — no ETL script, no engineer.
 *
 * It mirrors etl/build-call-inbound.mjs (inbound calls only, the serverless-safe
 * piece): resolve the account+token (dashboard token preferred, env fallback via
 * resolveTwilio), list inbound calls from Twilio to the bot's number(s), upsert
 * report.call_inbound, and rebuild the anon report.call_inbound_stats rollup.
 *
 * Deeper Twilio pulls (per-call durations = call_facts, transfers) are heavier
 * per-call fetches and stay in the ETL scripts / nightly job, not this endpoint.
 *
 * Same posture as /api/bot-twilio: GSB-internal, behind the site password gate,
 * hidden from the resort embed. The token never reaches the client.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getPool } from './_lib/db.js'
import { resolveTwilio } from './_lib/twilio.js'

export const maxDuration = 300

const FLOOR = '2024-10-01'

interface TwilioCall {
  sid: string
  to: string
  status: string
  direction: string
  duration: string | null
  start_time: string | null
}

async function twGet(url: string, auth: string, tries = 4): Promise<Record<string, unknown> & { _err?: number }> {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { headers: { Authorization: auth } })
    if (r.status === 429) { await new Promise((res) => setTimeout(res, 800 * (i + 1))); continue }
    if (!r.ok) return { _err: r.status }
    return (await r.json()) as Record<string, unknown>
  }
  return { _err: 429 }
}

const iso = (s: string | null): string | null => {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })
  const pool = getPool()
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const botId = Number(body.botId)
    if (!botId) return res.status(400).json({ error: 'botId is required' })

    const tw = await resolveTwilio(pool, botId)
    if (!tw) return res.status(400).json({ error: 'Connect the Twilio account and paste its Auth token first.' })
    const auth = 'Basic ' + Buffer.from(`${tw.accountSid}:${tw.token}`).toString('base64')

    const numsRes = await pool.query(
      `select phone_number from report.bot_twilio where bot_id=$1 and phone_number is not null and phone_number <> ''`,
      [botId],
    )
    const numbers = numsRes.rows.map((r) => r.phone_number as string)
    if (!numbers.length) return res.status(400).json({ error: 'Add the inbound number in Connect Twilio first, then sync.' })

    await pool.query(`create table if not exists report.call_inbound (
      call_sid text primary key, bot_id bigint, to_number text, status text,
      duration_sec int, started_at timestamptz, fetched_at timestamptz not null default now())`)
    await pool.query('revoke all on report.call_inbound from anon').catch(() => {})
    await pool.query('create index if not exists call_inbound_bot on report.call_inbound (bot_id)')

    let total = 0
    let pages = 0
    for (const num of numbers) {
      let url: string | null =
        `https://api.twilio.com/2010-04-01/Accounts/${tw.accountSid}/Calls.json?To=${encodeURIComponent(num)}&StartTime%3E=${FLOOR}&PageSize=1000`
      while (url && pages < 200) {
        const j = await twGet(url, auth)
        pages++
        if (j._err) return res.status(502).json({ error: `Twilio request failed (${j._err}). Check the account SID and token.` })
        const calls = ((j.calls as TwilioCall[]) || []).filter((c) => c.direction === 'inbound')
        for (let k = 0; k < calls.length; k += 500) {
          const chunk = calls.slice(k, k + 500)
          const vals: unknown[] = []
          const tuples = chunk.map((c, idx) => {
            const b = idx * 6
            vals.push(c.sid, botId, c.to, c.status, c.duration != null ? Number(c.duration) : null, iso(c.start_time))
            return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6})`
          })
          if (chunk.length) {
            await pool.query(
              `insert into report.call_inbound (call_sid,bot_id,to_number,status,duration_sec,started_at)
               values ${tuples.join(',')}
               on conflict (call_sid) do update set to_number=excluded.to_number, status=excluded.status,
                 duration_sec=excluded.duration_sec, started_at=excluded.started_at, fetched_at=now()`,
              vals,
            )
            total += chunk.length
          }
        }
        url = j.next_page_uri ? `https://api.twilio.com${j.next_page_uri as string}` : null
      }
    }

    // Refresh the anon rollup (shape identical to etl/build-call-inbound.mjs). When it
    // already exists, REFRESH CONCURRENTLY avoids any downtime window — the button can be
    // clicked while a partner is viewing the dashboard. Otherwise create it the first time.
    const exists = (await pool.query(`select to_regclass('report.call_inbound_stats') as rel`)).rows[0]?.rel
    if (exists) {
      await pool.query('refresh materialized view concurrently report.call_inbound_stats')
    } else {
      await pool.query(`create materialized view report.call_inbound_stats as
        select ci.bot_id,
          (ci.started_at at time zone coalesce(tz.tz, 'America/Denver'))::date as day,
          count(*)::int inbound,
          count(*) filter (where ci.status = 'completed')::int completed,
          count(*) filter (where ci.status <> 'completed')::int not_connected
        from report.call_inbound ci
        left join report.bot_timezone tz on tz.bot_id = ci.bot_id
        where ci.started_at is not null
        group by ci.bot_id, 2`)
      await pool.query('create unique index call_inbound_stats_pk on report.call_inbound_stats (bot_id, day)')
      await pool.query('grant select on report.call_inbound_stats to anon, authenticated')
      await pool.query(`notify pgrst, 'reload schema'`)
    }

    const s = (await pool.query(
      `select coalesce(sum(inbound),0)::int inbound, coalesce(sum(completed),0)::int completed
       from report.call_inbound_stats where bot_id=$1`,
      [botId],
    )).rows[0]
    const connectPct = s.inbound ? Math.round((100 * s.completed) / s.inbound) : 0
    return res.status(200).json({ ok: true, ingested: total, inbound: s.inbound, completed: s.completed, connectPct })
  } catch (e) {
    console.error('[api/twilio-sync] failed:', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'unknown error' })
  }
}
