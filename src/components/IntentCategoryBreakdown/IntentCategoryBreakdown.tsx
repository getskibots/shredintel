import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { Panel } from '../shared'
import { clampPercent, formatNumber, formatPercent } from '../../lib/formatters'
import type { CustomerNeedCategory, IntentCategorySummary } from '../../fixtures/voice'

export interface IntentCategoryBreakdownProps {
  categories: IntentCategorySummary[]
}

const CATEGORY_COLOR: Record<CustomerNeedCategory, string> = {
  'Transaction & Checkout': '#0EA5E9', // sky
  'Account & Identity':     '#7C3AED', // violet
  'Friends & Family':       '#F59E0B', // amber
  'Discount & Codes':       '#10B981', // emerald
  'Resort Info & Pricing':  '#6366F1', // indigo
  'Other / Long-tail':      '#CBD5E1', // slate-300
}

const CATEGORY_NOTE: Partial<Record<CustomerNeedCategory, string>> = {
  'Transaction & Checkout': 'Cart, payment, billing, bundle errors',
  'Account & Identity': 'Name, password, order lookup, waivers',
  'Friends & Family': 'F&F redemption, voucher errors',
  'Discount & Codes': 'Renewal codes, referral codes, discounts',
  'Resort Info & Pricing': 'Pricing, parking, tram, perks',
  'Other / Long-tail': 'Many topics, each <1% of volume',
}

export function IntentCategoryBreakdown({ categories }: IntentCategoryBreakdownProps) {
  if (!categories || categories.length === 0) return null
  const total = categories.reduce((s, c) => s + c.conversations, 0)
  const data = categories.map((c) => ({
    name: c.category,
    value: c.conversations,
    color: CATEGORY_COLOR[c.category],
  }))
  const problemCategories: CustomerNeedCategory[] = [
    'Transaction & Checkout',
    'Account & Identity',
    'Friends & Family',
    'Discount & Codes',
  ]
  const problemVolume = categories
    .filter((c) => problemCategories.includes(c.category))
    .reduce((s, c) => s + c.conversations, 0)
  const problemShare = total > 0 ? problemVolume / total : 0

  return (
    <Panel
      eyebrow="§ 1 Guest Intent"
      title="What your guests are calling about"
      description="Top customer needs grouped from the AI's intent classification. Information-seeking is a small minority — most calls are about fixing something."
      action={
        <div className="rounded-2xl border border-sky-200 bg-sky-50/70 px-4 py-2 text-right">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-sky-700">
            Problem-resolution share
          </div>
          <div className="mt-0.5 font-display text-2xl font-semibold tabular-nums text-sky-700">
            {formatPercent(problemShare)}
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_1fr]">
        <div className="relative h-[220px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                innerRadius={65}
                outerRadius={100}
                paddingAngle={2}
                stroke="none"
              >
                {data.map((d) => (
                  <Cell key={d.name} fill={d.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: '1px solid #E2E8F0',
                  fontSize: 12,
                }}
                formatter={(value, name) => [formatNumber(Number(value)), String(name)]}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <div className="font-display text-xl font-semibold tabular-nums text-slate-900">
              {formatNumber(total)}
            </div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
              engaged calls
            </div>
          </div>
        </div>

        <ul className="space-y-3">
          {categories.map((c) => (
            <li
              key={c.category}
              className="grid grid-cols-[1fr_auto] items-center gap-3 sm:grid-cols-[14rem_1fr_auto]"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: CATEGORY_COLOR[c.category] }}
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-slate-800">
                    {c.category}
                  </div>
                  {CATEGORY_NOTE[c.category] && (
                    <div className="truncate text-[10px] text-slate-500">
                      {CATEGORY_NOTE[c.category]}
                    </div>
                  )}
                </div>
              </div>
              <div className="relative h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="absolute left-0 top-0 h-full rounded-full"
                  style={{
                    width: `${clampPercent(c.share * 100)}%`,
                    background: CATEGORY_COLOR[c.category],
                  }}
                />
              </div>
              <div className="text-right text-xs tabular-nums">
                <div className="font-semibold text-slate-800">
                  {formatPercent(c.share)}
                </div>
                <div className="text-slate-500">{formatNumber(c.conversations)}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  )
}
