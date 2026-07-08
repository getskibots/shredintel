/**
 * ChannelToggle — the omni-channel switcher shown in the report header.
 *
 * Given an omni group + the active channel, renders a segmented Chat / Voice
 * control. Switching navigates to that channel's route, preserving the ?omni
 * group key (+ any other query params) so the toggle persists across channels.
 *
 * Prototype today: channels are separate bot_ids. When channels merge onto one
 * bot_id, only routeForChannel/the group resolver changes — this stays put.
 */
import { useNavigate, useSearchParams } from 'react-router-dom'
import { MessageSquare, Headphones } from 'lucide-react'
import type { Channel, OmniGroup, OmniChannelRef } from '../../lib/omniGroups'
import { routeForChannel } from '../../lib/omniGroups'

const ICON = { chat: MessageSquare, voice: Headphones }
const LABEL: Record<Channel, string> = { chat: 'Chat', voice: 'Voice' }

export function ChannelToggle({ group, active }: { group: OmniGroup; active: Channel }) {
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const go = (ref: OmniChannelRef) => {
    if (ref.channel === active) return
    const sp = new URLSearchParams(params)
    sp.set('omni', group.key)
    const qs = sp.toString()
    navigate(`${routeForChannel(ref)}${qs ? `?${qs}` : ''}`)
  }

  return (
    <div className="inline-flex items-center gap-2">
      <span className="hidden text-xs font-medium text-slate-500 sm:inline">{group.label}</span>
      <div className="inline-flex rounded-lg bg-slate-100 p-0.5" role="tablist" aria-label="Channel">
        {group.channels.map((ref) => {
          const Icon = ICON[ref.channel]
          const on = ref.channel === active
          return (
            <button
              key={ref.channel}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => go(ref)}
              className={[
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition',
                on ? 'bg-white text-botscrew-700 shadow-sm' : 'text-slate-500 hover:text-slate-700',
              ].join(' ')}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={2} />
              {LABEL[ref.channel]}
            </button>
          )
        })}
      </div>
    </div>
  )
}
