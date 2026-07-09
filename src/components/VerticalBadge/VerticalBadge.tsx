/**
 * VerticalBadge — a small chip showing a bot's auto-detected business vertical
 * (report.bot_vertical). Renders nothing for unclassified/generic bots. Gives the
 * dashboard header the same vertical context the directory groups by.
 */
import { useBotVertical } from '../../data/useAnalytics'
import { verticalMeta } from '../../lib/verticalLabels'

export function VerticalBadge({ botId }: { botId: number }) {
  const { vertical, also } = useBotVertical(botId)
  if (!vertical || vertical === 'generic') return null
  const keys = [vertical, ...also].filter((k) => k && k !== 'generic')
  const label = keys.map((k) => verticalMeta(k).label).join(' + ')
  const emoji = keys.map((k) => verticalMeta(k).emoji).join(' ')
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600"
      title={`Auto-detected vertical: ${label}`}
    >
      <span aria-hidden>{emoji}</span>
      {label}
    </span>
  )
}
