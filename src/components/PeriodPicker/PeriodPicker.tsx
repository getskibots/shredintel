import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, X } from 'lucide-react'
import {
  formatRangeHuman,
  resolveSelection,
  todayISO,
  addDays,
  type PeriodSelection,
  type PresetKey,
} from '../../lib/period'
import { DateRangeCalendar } from './DateRangeCalendar'

const PRESETS: Array<{ key: PresetKey; label: string; shortLabel: string }> = [
  { key: '7d',  label: 'Last 7 days',  shortLabel: '7d'  },
  { key: '30d', label: 'Last 30 days', shortLabel: '30d' },
  { key: '90d', label: 'Last 90 days', shortLabel: '90d' },
  { key: 'all', label: 'All time',     shortLabel: 'All' },
]

interface PeriodPickerProps {
  value: PeriodSelection
  onChange: (next: PeriodSelection) => void
  /** Earliest date the user can select (inclusive). Defaults to ~2 years back. */
  minDate?: string
  /** Latest date the user can select (inclusive). Defaults to today. */
  maxDate?: string
  /** Which edge of the picker the calendar popover anchors to. */
  align?: 'start' | 'end'
  className?: string
}

/**
 * Chip row of preset periods + a Custom chip that opens a two-month
 * calendar popover for arbitrary date ranges.
 *
 * Modern-2026 pattern: fast-access chips for the 90% case, calendar behind
 * the last chip for power users.
 */
export function PeriodPicker({
  value,
  onChange,
  minDate,
  maxDate,
  align = 'end',
  className,
}: PeriodPickerProps) {
  const [popoverOpen, setPopoverOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const today = maxDate ?? todayISO()
  const earliest = minDate ?? addDays(today, -730)

  // Close popover on outside click
  useEffect(() => {
    if (!popoverOpen) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setPopoverOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [popoverOpen])

  // Close on escape
  useEffect(() => {
    if (!popoverOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPopoverOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [popoverOpen])

  const isCustom = value.kind === 'custom'
  const customLabel = useMemo(() => {
    if (value.kind !== 'custom') return null
    return formatRangeHuman(value.from, value.to)
  }, [value])

  const activePreset = value.kind === 'preset' ? value.preset : null

  const chipClass = (active: boolean) =>
    [
      'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
      active
        ? 'bg-botscrew-500 text-white shadow-sm'
        : 'text-slate-600 hover:bg-slate-100',
    ].join(' ')

  const chipRowClass =
    'inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5'

  return (
    <div ref={rootRef} className={['relative flex items-center gap-1.5', className].filter(Boolean).join(' ')}>
      <div className={chipRowClass}>
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => {
              onChange({ kind: 'preset', preset: p.key })
              setPopoverOpen(false)
            }}
            aria-pressed={activePreset === p.key}
            aria-label={p.label}
            className={chipClass(activePreset === p.key)}
          >
            <span className="sm:hidden">{p.shortLabel}</span>
            <span className="hidden sm:inline">{p.label}</span>
          </button>
        ))}

        <div className="mx-0.5 h-4 w-px bg-slate-200" aria-hidden />

        <button
          type="button"
          onClick={() => setPopoverOpen((v) => !v)}
          aria-expanded={popoverOpen}
          aria-haspopup="dialog"
          className={chipClass(isCustom)}
        >
          <CalendarDays className="h-3.5 w-3.5" strokeWidth={2} />
          <span className="hidden sm:inline">{isCustom ? customLabel : 'Custom'}</span>
        </button>
      </div>

      {isCustom && (
        <button
          type="button"
          onClick={() => onChange({ kind: 'preset', preset: '7d' })}
          aria-label="Clear custom range"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
      )}

      {popoverOpen && (
        <div
          role="dialog"
          aria-label="Custom date range"
          className={[
            'absolute top-[calc(100%+8px)] z-50 rounded-2xl border border-slate-200 bg-white shadow-xl',
            align === 'end' ? 'right-0' : 'left-0',
          ].join(' ')}
        >
          <DateRangeCalendar
            initialFrom={value.kind === 'custom' ? value.from : resolveSelection(value).from}
            initialTo={value.kind === 'custom' ? value.to : resolveSelection(value).to}
            minDate={earliest}
            maxDate={today}
            onApply={(from, to) => {
              onChange({ kind: 'custom', from, to })
              setPopoverOpen(false)
            }}
            onCancel={() => setPopoverOpen(false)}
            onPickPreset={(preset) => {
              onChange({ kind: 'preset', preset })
              setPopoverOpen(false)
            }}
          />
        </div>
      )}
    </div>
  )
}
