import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'

/**
 * Pulse `true` for ~850ms whenever `key` changes (skips the first mount). Drives
 * the "shredding through the data" moment when the date range changes — shared
 * by the main analytics page and the Voice AI overlay so both feel identical.
 */
export function useShredPulse(key: string): boolean {
  const [pulsing, setPulsing] = useState(false)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setPulsing(true)
    const t = setTimeout(() => setPulsing(false), 850)
    return () => clearTimeout(t)
  }, [key])
  return pulsing
}

/**
 * Branded "shredding through the conversations" overlay: a scan band sweeps
 * top→bottom over the content, plus a centered pill. The parent must be
 * `relative`; this is pointer-events-none so it never blocks interaction.
 */
export function ShreddingOverlay({ active }: { active: boolean }) {
  if (!active) return null
  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      <div
        className="absolute inset-x-0 h-28 bg-gradient-to-b from-transparent via-botscrew-400/25 to-transparent"
        style={{ top: '-25%', animation: 'shredintel-scan 0.85s ease-out forwards' }}
      />
      <div className="absolute left-1/2 top-16 -translate-x-1/2">
        <div className="flex items-center gap-2 rounded-full border border-botscrew-100 bg-white/95 px-4 py-2 text-xs font-semibold text-botscrew-700 shadow-lg backdrop-blur">
          <Sparkles className="h-3.5 w-3.5 animate-pulse" strokeWidth={2.2} />
          Shredding through the conversations…
        </div>
      </div>
    </div>
  )
}
