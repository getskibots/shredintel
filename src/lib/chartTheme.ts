/**
 * ShredIntel chart design tokens.
 *
 * Pulled directly off the live Botscrew admin analytics page
 * (bots.getskitickets.com/admin/bot/2/analytics) so our reports share the
 * visual identity resorts already know: soft blue-grey canvas, white cards,
 * a slate line, and a blue + gold accent pair.
 *
 * SINGLE SOURCE OF TRUTH — chart components must read from here and never
 * hard-code hex values. As we rebuild the report section by section, every
 * new chart spreads these presets so the whole dashboard stays on-brand.
 */

export const brand = {
  blue: '#2182BF', // primary — KPI numbers, primary series, active pills, bars
  blueSoft: '#7FB9DD',
  gold: '#F3B116', // accent — secondary series (the pie slice on the live page)
  slate: '#354052', // line series + strong marks (the "Active users" line)
  heading: '#3A3F62', // card titles, weight 600
  muted: '#616581', // secondary text + axis labels
  ink: '#212529', // body text
  pageBg: '#F4F7FA', // app canvas
  cardBg: '#FFFFFF',
  grid: 'rgba(15, 23, 42, 0.08)', // faint horizontal gridlines only
  axisLine: '#E2E8F0',
} as const

/**
 * Categorical series palette — blue / gold / slate forward, so multi-series
 * charts (categories, devices, channels) stay on brand.
 */
export const seriesColors = [
  '#2182BF', // blue
  '#F3B116', // gold
  '#354052', // slate
  '#7FB9DD', // light blue
  '#E8A33D', // amber
  '#6B7A99', // slate-grey
  '#A9D0E8', // pale blue
  '#C9A227', // dark gold
] as const

/** Pick a series color by index, wrapping if needed. */
export const seriesColor = (i: number) => seriesColors[i % seriesColors.length]

/** Sentiment triad (Positive / Neutral / Negative) for the sentiment section. */
export const sentimentColors = {
  positive: '#2E9B6B',
  neutral: '#94A3B8',
  negative: '#E05252',
} as const

/**
 * Sequential blue ramp for heatmaps (e.g. conversations by time-of-day × day),
 * mirroring the monochrome-blue heatmap on the live page. Light → dark.
 */
export const blueRamp = [
  '#EAF3F9',
  '#CFE4F1',
  '#A9D0E8',
  '#7FB9DD',
  '#4E9BCE',
  '#2182BF',
] as const

/** Map a 0..1 value onto the blue ramp. */
export const rampColor = (t: number) =>
  blueRamp[Math.min(blueRamp.length - 1, Math.max(0, Math.round(t * (blueRamp.length - 1))))]

/**
 * Recharts prop presets — spread onto components for a consistent look.
 * Usage:
 *   <CartesianGrid {...chart.grid} />
 *   <XAxis dataKey="date" {...chart.xAxis} />
 *   <YAxis {...chart.yAxis} />
 *   <Tooltip {...chart.tooltip} />
 *   <Line {...chart.line} dataKey="value" />
 *   <Bar {...chart.bar} dataKey="value" />
 */
export const chart = {
  /** Faint horizontal-only gridlines (matches Chart.js rgba(0,0,0,0.1)). */
  grid: { stroke: brand.grid, strokeDasharray: '3 3', vertical: false },

  xAxis: {
    tick: { fill: brand.muted, fontSize: 11 },
    tickLine: false,
    axisLine: { stroke: brand.axisLine },
  },

  yAxis: {
    tick: { fill: brand.muted, fontSize: 11 },
    tickLine: false,
    axisLine: false,
    width: 40,
  },

  tooltip: {
    contentStyle: {
      borderRadius: 10,
      border: `1px solid ${brand.axisLine}`,
      boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)',
      fontSize: 12,
    },
    cursor: { fill: 'rgba(33, 130, 191, 0.06)' },
  },

  /** Smooth curved slate line with filled dots (the "Active users" chart). */
  line: {
    type: 'monotone' as const,
    stroke: brand.slate,
    strokeWidth: 2,
    dot: { r: 3, fill: brand.slate, strokeWidth: 0 },
    activeDot: { r: 4 },
  },

  /** Rounded-top brand-blue bar. */
  bar: {
    fill: brand.blue,
    radius: [6, 6, 0, 0] as [number, number, number, number],
  },

  /** Pie/donut legend beneath, circular swatches (the live page pattern). */
  pieLegend: { verticalAlign: 'bottom' as const, iconType: 'circle' as const },
} as const

// ── Date axis helpers (shared by every time-series chart) ──────────────────
const TICK_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Axis tick: "2026-07-06" → "Jul 6" (short window) or "Jul '26" (wide span), so a
 *  long timeline reads as clean month markers instead of full ISO dates. */
export function dateTick(iso: string, wide: boolean): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return iso
  return wide ? `${TICK_MONTHS[+m[2] - 1]} '${m[1].slice(2)}` : `${TICK_MONTHS[+m[2] - 1]} ${+m[3]}`
}

/** Tooltip header: the unambiguous full date, "Jul 6, 2026". */
export function dateFull(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${TICK_MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}` : iso
}

/**
 * Ready-to-spread <XAxis> props for a date series: readable, thinned tick labels
 * that adapt to the span (day labels for short windows, month-year once it goes
 * past ~4 months). Pass the series' date strings.
 *   <XAxis dataKey="date" {...chart.xAxis} {...dateAxisProps(rows.map(r => r.date))} />
 */
export function dateAxisProps(dates: (string | null | undefined)[]) {
  const times = dates
    .map((d) => (d ? Date.parse(d) : NaN))
    .filter((n) => !Number.isNaN(n))
  const span = times.length >= 2 ? (Math.max(...times) - Math.min(...times)) / 86_400_000 : 0
  const wide = span > 120
  return {
    tickFormatter: (v: string) => dateTick(v, wide),
    minTickGap: wide ? 48 : 28,
    interval: 'preserveStartEnd' as const,
  }
}
