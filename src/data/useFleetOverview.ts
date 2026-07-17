import { useEffect, useState } from 'react'
import { getSupabase, supabaseConfigured } from '../lib/supabase'
import type { ResolvedPeriod } from '../lib/period'

/**
 * Data layer for the /#/fleet master dashboard (GSB-internal).
 *
 * Two sources merged on bot_id:
 *  • report.fleet_overview (matview) — range-INDEPENDENT identity: name,
 *    channel, vertical, all-time volume, last-active. Fetched once.
 *  • report.fleet_usage(from, to) (SECURITY DEFINER rpc) — range-DEPENDENT
 *    usage for the PeriodPicker window: conversations/engaged/messages, the
 *    equal-length prior window (trend delta), an adaptive ≤12-bucket spark,
 *    and the Twilio voice cost rollup. Re-fetched per selection.
 *
 * Plus report.twilio_bill_daily — the TRUE Twilio bill (Usage Records API:
 * calls + number rental + recordings + fees), fleet-level per day. The per-bot
 * voice_cost_usd column is per-call price only, so the bill runs higher.
 */
export interface FleetBill {
  total_usd: number
  calls_usd: number
  numbers_usd: number
  recordings_usd: number
}
export interface FleetBotRow {
  bot_id: number
  name: string
  channel: 'chat' | 'voice'
  vertical: string
  conv_all: number
  last_active: string | null // ISO date
  // range-dependent (report.fleet_usage)
  conversations: number
  engaged: number
  messages: number
  prev_conversations: number
  spark: number[] | null
  voice_calls: number
  voice_minutes: number
  voice_cost_usd: number
  ai_cost_usd: number
}

interface IdentityRow {
  bot_id: number
  name: string
  channel: 'chat' | 'voice'
  vertical: string
  conv_all: number
  last_active: string | null
}

interface UsageRow {
  bot_id: number
  conversations: number
  engaged: number
  messages: number
  user_messages: number
  prev_conversations: number
  spark: number[] | null
  voice_calls: number
  voice_minutes: number
  voice_cost_usd: number
  ai_cost_usd: number
}

export function useFleetOverview(range: ResolvedPeriod): {
  rows: FleetBotRow[]
  bill: FleetBill | null
  isLive: boolean
  isLoading: boolean
} {
  const [identity, setIdentity] = useState<IdentityRow[] | null>(null)
  const [usage, setUsage] = useState<Map<number, UsageRow> | null>(null)
  const [bill, setBill] = useState<FleetBill | null>(null)
  const [failed, setFailed] = useState(false)

  // Identity — once per mount
  useEffect(() => {
    if (!supabaseConfigured) return
    let cancelled = false
    ;(async () => {
      try {
        const supabase = getSupabase()
        if (!supabase) return
        const { data, error } = (await supabase
          .schema('report')
          .from('fleet_overview')
          .select('bot_id, name, channel, vertical, conv_all, last_active')
          .limit(2000)) as { data: IdentityRow[] | null; error: unknown }
        if (cancelled) return
        if (error || !data) setFailed(true)
        else setIdentity(data)
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Usage — per selected range
  useEffect(() => {
    if (!supabaseConfigured) return
    let cancelled = false
    setUsage(null)
    ;(async () => {
      try {
        const supabase = getSupabase()
        if (!supabase) return
        const { data, error } = (await supabase
          .schema('report')
          .rpc('fleet_usage', { p_from: range.from, p_to: range.to })) as {
          data: UsageRow[] | null
          error: unknown
        }
        if (cancelled) return
        if (error || !data) setFailed(true)
        else setUsage(new Map(data.map((r) => [r.bot_id, r])))
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => { cancelled = true }
  }, [range.from, range.to])

  // Twilio bill — per selected range. Non-fatal: page works without it.
  useEffect(() => {
    if (!supabaseConfigured) return
    let cancelled = false
    setBill(null)
    ;(async () => {
      try {
        const supabase = getSupabase()
        if (!supabase) return
        const { data, error } = (await supabase
          .schema('report')
          .from('twilio_bill_daily')
          .select('total_usd, calls_usd, numbers_usd, recordings_usd')
          .gte('day', range.from)
          .lte('day', range.to)
          .limit(2000)) as {
          data: { total_usd: number | null; calls_usd: number | null; numbers_usd: number | null; recordings_usd: number | null }[] | null
          error: unknown
        }
        if (cancelled || error || !data || data.length === 0) return
        const sum = (k: 'total_usd' | 'calls_usd' | 'numbers_usd' | 'recordings_usd') =>
          data.reduce((s, r) => s + Number(r[k] ?? 0), 0)
        setBill({ total_usd: sum('total_usd'), calls_usd: sum('calls_usd'), numbers_usd: sum('numbers_usd'), recordings_usd: sum('recordings_usd') })
      } catch { /* non-fatal */ }
    })()
    return () => { cancelled = true }
  }, [range.from, range.to])

  if (!supabaseConfigured || failed) return { rows: [], bill: null, isLive: false, isLoading: false }
  if (!identity || !usage) return { rows: [], bill: null, isLive: true, isLoading: true }

  const rows: FleetBotRow[] = identity.map((b) => {
    const u = usage.get(b.bot_id)
    return {
      ...b,
      conversations: u?.conversations ?? 0,
      engaged: u?.engaged ?? 0,
      messages: u?.messages ?? 0,
      prev_conversations: u?.prev_conversations ?? 0,
      spark: u?.spark ?? null,
      voice_calls: u?.voice_calls ?? 0,
      voice_minutes: u?.voice_minutes ?? 0,
      voice_cost_usd: Number(u?.voice_cost_usd ?? 0),
      ai_cost_usd: Number(u?.ai_cost_usd ?? 0),
    }
  })
  return { rows, bill, isLive: true, isLoading: false }
}
