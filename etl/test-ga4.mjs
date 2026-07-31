#!/usr/bin/env node
/**
 * test-ga4.mjs — prove the GA4 Data API connection end to end.
 *   node test-ga4.mjs <numericPropertyId>
 * Reads GA4_SA_KEY (base64 of the service-account JSON) from etl/.env, runs a
 * couple of runReport calls, and prints the numbers. If this works, the
 * connector auth + read path is validated.
 */
import 'dotenv/config'
import { BetaAnalyticsDataClient } from '@google-analytics/data'

const propertyId = (process.argv[2] || '').replace(/\D/g, '')
if (!propertyId) {
  console.error('usage: node test-ga4.mjs <numericPropertyId>   (from GA4 → Admin → Property details)')
  process.exit(1)
}
const b64 = process.env.GA4_SA_KEY
if (!b64) { console.error('GA4_SA_KEY missing in etl/.env'); process.exit(1) }

let credentials
try { credentials = JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) }
catch (e) { console.error('GA4_SA_KEY is not valid base64 JSON:', e.message); process.exit(1) }
console.log('service account:', credentials.client_email)
console.log('property:', propertyId, '\n')

const client = new BetaAnalyticsDataClient({ credentials })

try {
  // 1) traffic — proves auth + a real report comes back
  const [traffic] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: '28daysAgo', endDate: 'yesterday' }],
    metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'screenPageViews' }, { name: 'eventCount' }],
  })
  const m = traffic.rows?.[0]?.metricValues ?? []
  console.log('=== last 28 days (whole property) ===')
  console.log(`  sessions ${m[0]?.value ?? 0} · users ${m[1]?.value ?? 0} · pageviews ${m[2]?.value ?? 0} · events ${m[3]?.value ?? 0}`)

  // 2) top events — shows whether the widget events (widget_opened, outbound_click…) are flowing
  const [events] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: '90daysAgo', endDate: 'yesterday' }],
    dimensions: [{ name: 'eventName' }],
    metrics: [{ name: 'eventCount' }],
    orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
    limit: 25,
  })
  console.log('\n=== top events (last 90 days) ===')
  for (const r of events.rows ?? []) console.log(`  ${(r.dimensionValues?.[0]?.value ?? '').padEnd(24)} ${r.metricValues?.[0]?.value}`)
  const names = new Set((events.rows ?? []).map((r) => r.dimensionValues?.[0]?.value))
  const widgetEvents = ['widget_opened', 'conversation_started', 'outbound_click', 'handoff_to_human'].filter((e) => names.has(e))
  console.log('\nwidget events present:', widgetEvents.length ? widgetEvents.join(', ') : 'none yet (expected until the new Chat UI ships)')

  // 3) top pages — the join key to report.conversation_page (page_path)
  const [pages] = await client.runReport({
    property: `properties/${propertyId}`,
    dateRanges: [{ startDate: '28daysAgo', endDate: 'yesterday' }],
    dimensions: [{ name: 'pagePath' }],
    metrics: [{ name: 'screenPageViews' }, { name: 'sessions' }],
    orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
    limit: 10,
  })
  console.log('\n=== top pages (last 28 days) — these join to conversation_page on page_path ===')
  for (const r of pages.rows ?? []) console.log(`  ${r.metricValues?.[0]?.value?.padStart(7)}  ${r.dimensionValues?.[0]?.value}`)

  console.log('\n✅ GA4 connection works.')
} catch (e) {
  console.error('\n❌ GA4 call failed:', e.message)
  if (String(e.message).match(/permission|PERMISSION_DENIED|403/i))
    console.error('   → the service account is not a Viewer on this property yet (add it in GA4 Admin → Property access management), or the Property ID is wrong.')
  process.exit(1)
}
