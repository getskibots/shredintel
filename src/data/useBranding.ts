import { useCallback, useEffect, useState } from 'react'
import { getSupabase } from '../lib/supabase'

export interface Branding {
  overlay: number
  logoUrl?: string
  backgroundUrl?: string
}

/**
 * Per-bot branding (logo + background + overlay), read from the anon-safe
 * report.bot_branding_config view. Image URLs point at /api/branding-image
 * (the bytes live server-side). `reload()` re-reads after an upload.
 */
export function useBranding(botId: number | undefined): { branding: Branding | null; reload: () => void } {
  const [branding, setBranding] = useState<Branding | null>(null)
  const [tick, setTick] = useState(0)
  const reload = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    const sb = getSupabase()
    if (!sb || !botId) {
      setBranding(null)
      return
    }
    let cancelled = false
    ;(
      sb.schema('report').from('bot_branding_config').select('*').eq('bot_id', botId).maybeSingle() as unknown as Promise<{
        data: { has_logo?: boolean; has_background?: boolean; overlay?: number; v?: number } | null
      }>
    )
      .then(({ data }) => {
        if (cancelled) return
        if (!data) {
          setBranding({ overlay: 0.6 })
          return
        }
        const v = data.v ?? 0
        setBranding({
          overlay: data.overlay ?? 0.6,
          logoUrl: data.has_logo ? `/api/branding-image?botId=${botId}&kind=logo&v=${v}` : undefined,
          backgroundUrl: data.has_background ? `/api/branding-image?botId=${botId}&kind=background&v=${v}` : undefined,
        })
      })
      .catch(() => {
        if (!cancelled) setBranding({ overlay: 0.6 })
      })
    return () => {
      cancelled = true
    }
  }, [botId, tick])

  return { branding, reload }
}
