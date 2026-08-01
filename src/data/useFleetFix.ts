import { useEffect, useState } from 'react'
import { getSupabase, supabaseConfigured } from '../lib/supabase'
import type { ResolvedPeriod } from '../lib/period'

/**
 * report.fleet_fix(from, to) — the daily-fix heartbeat (mood / signal / top asks /
 * flavor) aggregated over ANY date range, so the unified Master'Botter view can
 * show the summary for All time, 90d, or a single day (the Daily Fix button).
 * Reads the enrichment table directly, so it never disappears overnight.
 */
export interface FleetFixSummary {
  substantive: number
  positive: number
  neutral: number
  negative: number
  high_urgency: number
  wanted_human: number
  resolved: number
  partial: number
  unresolved: number
  ai_solved: number       // outcome: solved by AI, no human engaged
  got_human: number       // outcome: a real human engaged (ground truth)
  unresolved_open: number // outcome: no human, not resolved
  categories: Record<string, number>
  flavors: Record<string, number>
}

const num = (v: unknown) => Number(v ?? 0)

export function useFleetFix(range: ResolvedPeriod): { summary: FleetFixSummary | null; isLoading: boolean } {
  const [state, setState] = useState<{ summary: FleetFixSummary | null; isLoading: boolean }>({
    summary: null,
    isLoading: supabaseConfigured,
  })

  useEffect(() => {
    if (!supabaseConfigured) return
    let cancelled = false
    setState((s) => ({ ...s, isLoading: true }))
    ;(async () => {
      try {
        const supabase = getSupabase()
        if (!supabase) return
        const { data, error } = (await supabase
          .schema('report')
          .rpc('fleet_fix', { p_from: range.from, p_to: range.to })) as {
          data: Record<string, unknown>[] | null
          error: unknown
        }
        if (cancelled) return
        const r = data?.[0]
        if (error || !r) {
          setState({ summary: null, isLoading: false })
          return
        }
        setState({
          summary: {
            substantive: num(r.substantive), positive: num(r.positive), neutral: num(r.neutral), negative: num(r.negative),
            high_urgency: num(r.high_urgency), wanted_human: num(r.wanted_human),
            resolved: num(r.resolved), partial: num(r.partial), unresolved: num(r.unresolved),
            ai_solved: num(r.ai_solved), got_human: num(r.got_human), unresolved_open: num(r.unresolved_open),
            categories: (r.categories as Record<string, number>) ?? {},
            flavors: (r.flavors as Record<string, number>) ?? {},
          },
          isLoading: false,
        })
      } catch {
        if (!cancelled) setState({ summary: null, isLoading: false })
      }
    })()
    return () => { cancelled = true }
  }, [range.from, range.to])

  return state
}
