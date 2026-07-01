import { useEffect, useMemo, useState } from 'react'
import { getSupabase, supabaseConfigured } from '../lib/supabase'
import { buildMCChatFixtures, type MCChatFixtures, type MCChatPeriodKey } from '../fixtures/mc-chat'
import { buildVoiceFixtures, type VoiceFixtures, type VoicePeriodKey } from '../fixtures/voice'

/**
 * Channel-agnostic result type. The hook returns the same shape whether
 * data is sourced from fixtures or from Supabase.
 */
export interface AnalyticsState<T> {
  data: T | null
  isLoading: boolean
  isLive: boolean            // true = came from Supabase; false = fixtures
  error: Error | null
}

/**
 * Chat analytics (Mountain Collective + Jackson Hole use the same shape).
 * When Supabase is configured, this will eventually query Dru's `report.*`
 * materialized views. Until those view names are locked, it falls back to
 * fixtures so the dashboard keeps rendering.
 */
export function useMCChatAnalytics(period: MCChatPeriodKey): AnalyticsState<MCChatFixtures> {
  const [state, setState] = useState<AnalyticsState<MCChatFixtures>>({
    data: null,
    isLoading: supabaseConfigured,
    isLive: false,
    error: null,
  })

  // Fixture fallback — computed synchronously so we always have something to show.
  const fallback = useMemo(() => buildMCChatFixtures(period), [period])

  useEffect(() => {
    let cancelled = false
    const supabase = getSupabase()

    if (!supabase) {
      // Not configured → use fixtures immediately.
      setState({ data: fallback, isLoading: false, isLive: false, error: null })
      return
    }

    // Configured — attempt a live query. Placeholder for now: try to
    // read from an mv_chat_analytics view if it exists; otherwise fall
    // back to fixtures so the page still renders.
    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('mv_chat_analytics_mc')
          .select('*')
          .eq('period', period)
          .maybeSingle()

        if (cancelled) return
        if (error || !data) {
          // View doesn't exist yet or query failed — fall back gracefully.
          setState({ data: fallback, isLoading: false, isLive: false, error: null })
          return
        }
        // TODO: map Supabase row → MCChatFixtures shape once Dru's schema lands.
        setState({ data: fallback, isLoading: false, isLive: true, error: null })
      } catch (err) {
        if (cancelled) return
        setState({
          data: fallback,
          isLoading: false,
          isLive: false,
          error: err instanceof Error ? err : new Error(String(err)),
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [period, fallback])

  return state
}

/**
 * Voice analytics (Mountain Collective). Same fallback pattern.
 */
export function useVoiceAnalytics(period: VoicePeriodKey): AnalyticsState<VoiceFixtures> {
  const [state, setState] = useState<AnalyticsState<VoiceFixtures>>({
    data: null,
    isLoading: supabaseConfigured,
    isLive: false,
    error: null,
  })

  const fallback = useMemo(() => buildVoiceFixtures(period), [period])

  useEffect(() => {
    let cancelled = false
    const supabase = getSupabase()

    if (!supabase) {
      setState({ data: fallback, isLoading: false, isLive: false, error: null })
      return
    }

    ;(async () => {
      try {
        const { data, error } = await supabase
          .from('mv_voice_analytics_mc')
          .select('*')
          .eq('period', period)
          .maybeSingle()

        if (cancelled) return
        if (error || !data) {
          setState({ data: fallback, isLoading: false, isLive: false, error: null })
          return
        }
        // TODO: map row → VoiceFixtures once Dru's schema lands.
        setState({ data: fallback, isLoading: false, isLive: true, error: null })
      } catch (err) {
        if (cancelled) return
        setState({
          data: fallback,
          isLoading: false,
          isLive: false,
          error: err instanceof Error ? err : new Error(String(err)),
        })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [period, fallback])

  return state
}
