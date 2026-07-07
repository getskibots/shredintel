/**
 * Widget test-URL resolution for the Ahhh FAQ It tool.
 *
 * The widget-demo URL is keyed by the bot's Botscrew UUID (`public_identifier`),
 * NOT the numeric bot_id (JH is bot 43 but UUID 776bd241…). That UUID is synced
 * into public.bots, so we DERIVE each resort's URL — no manual lookup:
 *   https://bots.getskitickets.com/widget-demo/{public_identifier}?isTestMode=true
 *
 * PROBE_TARGETS is a manual override for special cases (e.g. pointing a bot at a
 * sandbox clone). Empty by default now that URLs derive from public_identifier.
 */
const WIDGET_BASE = 'https://bots.getskitickets.com/widget-demo'

/** Derive the live test URL from a bot's public_identifier (Botscrew UUID). */
export const widgetUrlFor = (publicIdentifier?: string | null): string | undefined =>
  publicIdentifier ? `${WIDGET_BASE}/${publicIdentifier}?isTestMode=true` : undefined

/** Manual per-bot overrides. Jackson Hole (43) kept as an explicit fallback. */
export const PROBE_TARGETS: Record<number, string> = {
  43: `${WIDGET_BASE}/776bd241-fbc3-4e17-92c7-8af31e84e6dd?isTestMode=true`,
}

export const probeUrlFor = (botId: number): string | undefined => PROBE_TARGETS[botId]

/** Any bots.getskitickets.com widget URL is valid; the probe domain-locks to it. */
export const isValidWidgetUrl = (url: string): boolean =>
  /^https:\/\/bots\.getskitickets\.com\/widget-demo\//.test(url.trim())
