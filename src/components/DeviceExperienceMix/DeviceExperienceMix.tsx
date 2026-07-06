import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { EmptyState, Panel } from '../shared'
import {
  clampPercent,
  deltaTone,
  formatDelta,
  formatNumber,
  formatPercent,
} from '../../lib/formatters'
import type { DeviceExperienceMixProps } from '../../types/analytics'

export type { DeviceExperienceMixProps } from '../../types/analytics'

const DEVICE_COLORS: Record<string, string> = {
  MOBILE: '#0EA5E9',
  DESKTOP: '#94A3B8',
  TABLET: '#7C3AED',
  UNKNOWN: '#CBD5E1',
}

const DEVICE_LABEL: Record<string, string> = {
  MOBILE: 'Mobile',
  DESKTOP: 'Desktop',
  TABLET: 'Tablet',
  UNKNOWN: 'Unknown',
}

export function DeviceExperienceMix({
  devices,
  browsers,
  mobileShare,
  desktopShare,
  tabletShare,
  mobileShareDelta,
}: DeviceExperienceMixProps) {
  const empty =
    !devices ||
    devices.length === 0 ||
    devices.every((d) => d.conversations === 0)

  const headline =
    mobileShare >= 0.6
      ? 'Two-thirds of guests are on mobile.'
      : mobileShare >= 0.5
        ? 'More than half of guests are on mobile.'
        : 'Desktop leads the mix.'

  const pieData = devices
    .filter((d) => d.deviceCategory !== 'UNKNOWN' && d.conversations > 0)
    .map((d) => ({
      name: DEVICE_LABEL[d.deviceCategory],
      value: d.conversations,
      color: DEVICE_COLORS[d.deviceCategory],
    }))

  return (
    <Panel
      eyebrow="Your guests"
      title="Device experience mix"
      description="Mobile, desktop, and tablet behavior across guest conversations."
      action={
        mobileShareDelta !== undefined ? (
          <span
            className={[
              'inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold',
              deltaTone(mobileShareDelta, true),
            ].join(' ')}
          >
            Mobile {formatDelta(mobileShareDelta)} vs. prior
          </span>
        ) : undefined
      }
    >
      {empty ? (
        <EmptyState
          title="Device data is limited for the selected range."
          message="No device category was recorded on conversations in this window."
        />
      ) : (
        <>
          <div className="rounded-2xl border border-sky-200 bg-sky-50/60 px-4 py-3 text-sm font-semibold text-sky-700">
            {headline}{' '}
            <span className="ml-1 font-normal text-sky-700/80">
              Design for thumb-first interactions, especially on checkout pages.
            </span>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[200px_1fr]">
            <div className="relative h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {pieData.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: '1px solid #E2E8F0',
                      fontSize: 12,
                    }}
                    formatter={(value) => [
                      formatNumber(Number(value)),
                      'conversations',
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <div className="font-display text-xl font-semibold tabular-nums text-sky-700">
                  {formatPercent(mobileShare)}
                </div>
                <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                  Mobile
                </div>
              </div>
            </div>

            <div>
              <ul className="space-y-2">
                {devices.map((d) => (
                  <li
                    key={d.deviceCategory}
                    className="grid grid-cols-[100px_1fr_auto] items-center gap-3"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="h-2 w-2 rounded-full"
                        style={{ background: DEVICE_COLORS[d.deviceCategory] }}
                      />
                      <span className="text-sm font-medium text-slate-700">
                        {DEVICE_LABEL[d.deviceCategory]}
                      </span>
                    </div>
                    <div className="relative h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="absolute left-0 top-0 h-full rounded-full"
                        style={{
                          width: `${clampPercent(d.share * 100)}%`,
                          background: DEVICE_COLORS[d.deviceCategory],
                        }}
                      />
                    </div>
                    <div className="text-right text-xs tabular-nums">
                      <div className="font-semibold text-slate-800">
                        {formatPercent(d.share)}
                      </div>
                      <div className="text-slate-500">
                        {formatNumber(d.conversations)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-5 border-t border-slate-100 pt-4">
                <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  Top browsers
                </div>
                <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
                  {browsers.slice(0, 6).map((b) => (
                    <li key={b.browser} className="flex items-center gap-2">
                      <span className="flex-1 truncate text-xs text-slate-700">
                        {b.browser}
                      </span>
                      <span className="text-xs font-semibold tabular-nums text-slate-500">
                        {formatPercent(b.share)}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 text-[10px] text-slate-400">
                  Percentages on devices use known-device conversations only. Mobile
                  + Desktop + Tablet = {formatPercent(mobileShare + desktopShare + tabletShare)}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </Panel>
  )
}
