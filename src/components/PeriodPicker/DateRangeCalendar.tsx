import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  daysBetween,
  formatISO,
  formatRangeHuman,
  parseISO,
  type PresetKey,
} from '../../lib/period'

interface DateRangeCalendarProps {
  initialFrom: string
  initialTo: string
  minDate: string
  maxDate: string
  onApply: (from: string, to: string) => void
  onCancel: () => void
  onPickPreset: (preset: PresetKey) => void
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTHS_FULL = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

const SIDE_PRESETS: Array<{ key: PresetKey; label: string }> = [
  { key: '7d',  label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: '90d', label: 'Last 90 days' },
  { key: 'all', label: 'All time' },
]

/**
 * Two-month side-by-side calendar with range selection. The user's first
 * click sets the start; the second sets the end (order-independent — we
 * swap if they click "before" the start). While pending, hovering
 * previews the range.
 */
export function DateRangeCalendar({
  initialFrom,
  initialTo,
  minDate,
  maxDate,
  onApply,
  onCancel,
  onPickPreset,
}: DateRangeCalendarProps) {
  const [selection, setSelection] = useState<{ from: string; to: string | null }>({
    from: initialFrom,
    to: initialTo,
  })
  const [hover, setHover] = useState<string | null>(null)

  // View month = start of the right-hand calendar
  const initialViewMonth = useMemo(() => {
    const d = parseISO(initialTo || initialFrom)
    d.setUTCDate(1)
    return d
  }, [initialTo, initialFrom])
  const [rightMonth, setRightMonth] = useState<Date>(initialViewMonth)

  const leftMonth = useMemo(() => {
    const d = new Date(rightMonth)
    d.setUTCMonth(d.getUTCMonth() - 1)
    return d
  }, [rightMonth])

  const maxViewMonth = useMemo(() => {
    const d = parseISO(maxDate)
    d.setUTCDate(1)
    return d
  }, [maxDate])
  const minViewMonth = useMemo(() => {
    const d = parseISO(minDate)
    d.setUTCDate(1)
    return d
  }, [minDate])

  const canGoBack = leftMonth > minViewMonth
  const canGoForward = rightMonth < maxViewMonth

  const goBack = () => {
    if (!canGoBack) return
    const d = new Date(rightMonth); d.setUTCMonth(d.getUTCMonth() - 1); setRightMonth(d)
  }
  const goForward = () => {
    if (!canGoForward) return
    const d = new Date(rightMonth); d.setUTCMonth(d.getUTCMonth() + 1); setRightMonth(d)
  }

  const handleDayClick = (iso: string) => {
    if (selection.to !== null) {
      // Start a new selection
      setSelection({ from: iso, to: null })
      return
    }
    // Second click — complete the range (swap if needed)
    if (iso < selection.from) {
      setSelection({ from: iso, to: selection.from })
    } else {
      setSelection({ from: selection.from, to: iso })
    }
  }

  // While waiting for the second click, use the hovered date as tentative "to"
  const effectiveTo = selection.to ?? hover
  const effectiveRange = useMemo(() => {
    if (!effectiveTo) return { from: selection.from, to: selection.from }
    if (effectiveTo < selection.from) return { from: effectiveTo, to: selection.from }
    return { from: selection.from, to: effectiveTo }
  }, [selection.from, effectiveTo])

  const daysInSelection = selection.to
    ? daysBetween(selection.from, selection.to)
    : null

  // Enter to apply, when a complete range exists
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && selection.to) {
        onApply(selection.from, selection.to)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selection, onApply])

  return (
    <div className="flex">
      {/* Sidebar presets */}
      <div className="flex w-[132px] shrink-0 flex-col border-r border-slate-100 py-2">
        {SIDE_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onPickPreset(p.key)}
            className="px-4 py-2 text-left text-[12px] font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Calendar body */}
      <div className="flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Custom range
            </div>
            <div className="mt-0.5 text-sm font-semibold text-slate-900">
              {selection.to
                ? formatRangeHuman(selection.from, selection.to)
                : `${formatRangeHuman(effectiveRange.from, effectiveRange.to)}`}
              {daysInSelection !== null && (
                <span className="ml-2 text-xs font-medium text-slate-400">
                  · {daysInSelection} day{daysInSelection === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={goBack}
              disabled={!canGoBack}
              aria-label="Previous month"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={goForward}
              disabled={!canGoForward}
              aria-label="Next month"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Two months */}
        <div className="flex gap-6 px-4 py-4" onMouseLeave={() => setHover(null)}>
          <MonthGrid
            monthStart={leftMonth}
            range={effectiveRange}
            firstClicked={selection.from}
            secondClicked={selection.to}
            minDate={minDate}
            maxDate={maxDate}
            onDayClick={handleDayClick}
            onDayHover={setHover}
          />
          <MonthGrid
            monthStart={rightMonth}
            range={effectiveRange}
            firstClicked={selection.from}
            secondClicked={selection.to}
            minDate={minDate}
            maxDate={maxDate}
            onDayClick={handleDayClick}
            onDayHover={setHover}
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
          <div className="text-[11px] text-slate-400">
            Tip: click a start date, then an end date. Enter to apply.
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => selection.to && onApply(selection.from, selection.to)}
              disabled={!selection.to}
              className="rounded-md bg-botscrew-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-botscrew-600 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────

interface MonthGridProps {
  monthStart: Date
  range: { from: string; to: string }
  firstClicked: string
  secondClicked: string | null
  minDate: string
  maxDate: string
  onDayClick: (iso: string) => void
  onDayHover: (iso: string | null) => void
}

function MonthGrid({
  monthStart,
  range,
  firstClicked,
  secondClicked,
  minDate,
  maxDate,
  onDayClick,
  onDayHover,
}: MonthGridProps) {
  const year = monthStart.getUTCFullYear()
  const month = monthStart.getUTCMonth()
  const monthLabel = `${MONTHS_FULL[month]} ${year}`

  // First day of month + leading blank cells so week starts on Sunday
  const firstDay = new Date(Date.UTC(year, month, 1))
  const leadBlanks = firstDay.getUTCDay() // 0 = Sun
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()

  const cells: Array<{ iso: string | null; day: number | null }> = []
  for (let i = 0; i < leadBlanks; i++) cells.push({ iso: null, day: null })
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = formatISO(new Date(Date.UTC(year, month, d)))
    cells.push({ iso, day: d })
  }

  const isInRange = (iso: string) => iso >= range.from && iso <= range.to
  const isStart = (iso: string) => iso === range.from
  const isEnd = (iso: string) => iso === range.to && range.from !== range.to
  const isFirstClicked = (iso: string) => iso === firstClicked && secondClicked === null
  const isDisabled = (iso: string) => iso < minDate || iso > maxDate

  return (
    <div className="w-[224px] shrink-0">
      <div className="mb-3 text-center text-[13px] font-semibold text-slate-800">
        {monthLabel}
      </div>
      <div
        className="grid gap-y-0.5"
        style={{ gridTemplateColumns: 'repeat(7, 32px)' }}
      >
        {WEEKDAYS.map((w, i) => (
          <div
            key={i}
            className="mb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400"
          >
            {w}
          </div>
        ))}
        {cells.map((c, i) => {
          if (c.iso === null) return <div key={i} />
          const iso = c.iso
          const disabled = isDisabled(iso)
          const inRange = !disabled && isInRange(iso)
          const start = !disabled && isStart(iso)
          const end = !disabled && isEnd(iso)
          const firstOnly = !disabled && isFirstClicked(iso)
          const isSingle = start && end === false && (range.from === range.to)

          // Range highlight: rounded on endpoints only, flat middle
          const isEndpoint = start || end || firstOnly || isSingle
          const bgClass = disabled
            ? ''
            : isEndpoint
              ? 'bg-botscrew-500 text-white'
              : inRange
                ? 'bg-botscrew-50 text-botscrew-700'
                : 'text-slate-700 hover:bg-slate-100'

          // Rounding: fully rounded if endpoint that's also start-of-range or
          // end-of-range only; flat sides for interior range highlight so
          // pieces visually connect.
          const rounding =
            disabled ? 'rounded-md' :
            isSingle ? 'rounded-md' :
            start && !end ? 'rounded-l-md' :
            end && !start ? 'rounded-r-md' :
            start && end ? 'rounded-md' :
            firstOnly ? 'rounded-md' :
            inRange ? '' :
            'rounded-md'

          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onMouseEnter={() => !disabled && onDayHover(iso)}
              onClick={() => !disabled && onDayClick(iso)}
              className={[
                'h-8 w-8 text-center text-[12px] font-medium transition-colors',
                bgClass,
                rounding,
                disabled ? 'cursor-not-allowed text-slate-300' : 'cursor-pointer',
              ].join(' ')}
            >
              {c.day}
            </button>
          )
        })}
      </div>
    </div>
  )
}

