/**
 * bot_id → widget-demo test URL for the Ahhh FAQ It tool.
 *
 * The Botscrew `widgetId` isn't in our Supabase (it lives in Botscrew), and it's
 * different from bot_id (JH is bot 43 but widget b924a927…). So we seed this map
 * as we collect test URLs from the Botscrew admin. A resort without an entry
 * still shows in the roster — you just paste its URL to run it.
 *
 * TODO: promote to a Supabase table (report.probe_targets) once we bulk-collect
 * widget IDs, so the roster is data-driven instead of hardcoded.
 */
export const PROBE_TARGETS: Record<number, string> = {
  43: 'https://bots.getskitickets.com/widget-demo/b924a927-14f8-4955-ac87-0a74e73408df?isTestMode=true',
}

export const probeUrlFor = (botId: number): string | undefined => PROBE_TARGETS[botId]

/** Any bots.getskitickets.com widget URL is valid; the probe domain-locks to it. */
export const isValidWidgetUrl = (url: string): boolean =>
  /^https:\/\/bots\.getskitickets\.com\/widget-demo\//.test(url.trim())
