/**
 * Omni-channel groups — the toggle abstraction.
 *
 * A "group" is one logical entity (a resort/brand) that has analytics across
 * several channels. Each channel resolves to how its data is rendered.
 *
 * TODAY channels live in SEPARATE bot_ids (Mountain Collective chat = bot 2,
 * voice = bot 248), so a channel resolves to a different botId. When BotScrew
 * merges channels onto ONE bot_id (omni-channel), the same channel will resolve
 * to that one botId filtered by `platform` — the toggle UX is identical, only the
 * resolver changes. So this seam is where "two bots today → one bot later" lands,
 * with no change to the toggle or the pages.
 *
 * This is a prototype seed (hardcoded MC) so we can feel the toggle now; later it
 * comes from report.bot_channel (a bot's available platforms).
 */
export type Channel = 'chat' | 'voice'

export interface OmniChannelRef {
  channel: Channel
  /** Today: the bot_id that holds this channel. Later (omni): the shared bot_id. */
  botId: number
}

export interface OmniGroup {
  key: string
  label: string
  /** Ordered — the first is the default channel when entering the group. */
  channels: OmniChannelRef[]
}

export const OMNI_GROUPS: OmniGroup[] = [
  {
    key: 'mtn-collective',
    label: 'Mountain Collective',
    channels: [
      { channel: 'chat', botId: 2 },
      { channel: 'voice', botId: 248 },
    ],
  },
]

export function omniGroupByKey(key: string | null | undefined): OmniGroup | null {
  if (!key) return null
  return OMNI_GROUPS.find((g) => g.key === key) ?? null
}

/** The in-app route that renders a channel (chat dispatches via /bot, voice via /voice). */
export function routeForChannel(ref: OmniChannelRef): string {
  return ref.channel === 'voice' ? `/voice/${ref.botId}` : `/bot/${ref.botId}`
}
