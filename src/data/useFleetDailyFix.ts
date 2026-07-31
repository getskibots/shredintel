import { useEffect, useState } from 'react'
import { getSupabase, supabaseConfigured } from '../lib/supabase'

/**
 * report.fleet_daily_fix — one row per day, fleet-wide heartbeat behind the
 * "Daily Fix" tab. We read the last COMPLETE day (day < today UTC, since the
 * current day is always mid-enrichment) plus a short trailing window for trend.
 */
export interface DailyFixRow {
  day: string
  conversations: number
  engaged: number
  messages: number
  chat_conversations: number
  voice_conversations: number
  substantive: number
  positive: number
  neutral: number
  negative: number
  high_urgency: number
  wanted_human: number
  resolved: number
  partial: number
  unresolved: number
  voice_calls: number
  voice_minutes: number
  twilio_usd: number
  openai_usd: number
  categories: Record<string, number>
  flavors: Record<string, number>
}

const num = (v: unknown) => Number(v ?? 0)

function coerce(r: Record<string, unknown>): DailyFixRow {
  return {
    day: String(r.day),
    conversations: num(r.conversations), engaged: num(r.engaged), messages: num(r.messages),
    chat_conversations: num(r.chat_conversations), voice_conversations: num(r.voice_conversations),
    substantive: num(r.substantive), positive: num(r.positive), neutral: num(r.neutral), negative: num(r.negative),
    high_urgency: num(r.high_urgency), wanted_human: num(r.wanted_human),
    resolved: num(r.resolved), partial: num(r.partial), unresolved: num(r.unresolved),
    voice_calls: num(r.voice_calls), voice_minutes: num(r.voice_minutes),
    twilio_usd: num(r.twilio_usd), openai_usd: num(r.openai_usd),
    categories: (r.categories as Record<string, number>) ?? {},
    flavors: (r.flavors as Record<string, number>) ?? {},
  }
}

export function useFleetDailyFix(): {
  today: DailyFixRow | null
  prev: DailyFixRow | null
  trend: DailyFixRow[]
  isLive: boolean
  isLoading: boolean
} {
  const [state, setState] = useState<{ today: DailyFixRow | null; prev: DailyFixRow | null; trend: DailyFixRow[]; isLive: boolean; isLoading: boolean }>({
    today: null, prev: null, trend: [], isLive: false, isLoading: supabaseConfigured,
  })

  useEffect(() => {
    if (!supabaseConfigured) return
    let cancelled = false
    ;(async () => {
      try {
        const supabase = getSupabase()
        if (!supabase) return
        const todayUTC = new Date().toISOString().slice(0, 10) // exclude the partial current day
        const { data, error } = (await supabase
          .schema('report')
          .from('fleet_daily_fix')
          .select('*')
          .lt('day', todayUTC)
          .gt('substantive', 0)
          .order('day', { ascending: false })
          .limit(14)) as { data: Record<string, unknown>[] | null; error: unknown }
        if (cancelled) return
        if (error || !data || data.length === 0) {
          setState({ today: null, prev: null, trend: [], isLive: false, isLoading: false })
          return
        }
        const rows = data.map(coerce)
        setState({
          today: rows[0],
          prev: rows[1] ?? null,
          trend: rows.slice().reverse(), // oldest → newest, for a sparkline
          isLive: true,
          isLoading: false,
        })
      } catch {
        if (!cancelled) setState({ today: null, prev: null, trend: [], isLive: false, isLoading: false })
      }
    })()
    return () => { cancelled = true }
  }, [])

  return state
}
