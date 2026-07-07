import { chromium } from 'playwright'

/**
 * The probe engine. Drives a live Botscrew chat widget in headless Chromium and
 * captures each answer exactly as a guest would see it — the proven "Ahhh FAQ
 * It" mechanism: the widget runs in a SAME-ORIGIN iframe, so we set the React
 * input via the native setter, click send, and poll the received bubble until
 * its text stabilises. The widget messages over WebSocket, so this must be a
 * real browser (no HTTP send endpoint to replicate).
 */

export const ALLOWED_HOST = 'bots.getskitickets.com'

// One browser for the whole process; a fresh page (fresh widget session) per
// question. Launched lazily, reused across requests.
let browserPromise = null
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    })
  }
  return browserPromise
}

// Runs INSIDE the page (same-origin as the widget iframe).
async function askInPage(page, question) {
  return page.evaluate(async (q) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    const frameDoc = () => {
      for (const fr of Array.from(document.querySelectorAll('iframe'))) {
        try { if (fr.contentDocument) return fr.contentDocument } catch { /* cross-origin */ }
      }
      return null
    }
    let doc = null
    for (let i = 0; i < 50 && !doc; i++) { doc = frameDoc(); if (!doc) await wait(300) }
    if (!doc) return { a: '', ms: 0, err: 'no widget iframe' }
    const frameEl = Array.from(document.querySelectorAll('iframe')).find((f) => { try { return f.contentDocument === doc } catch { return false } })
    const win = frameEl.contentWindow

    const input = () => doc.querySelector('input')
    const sendBtn = () => Array.from(doc.querySelectorAll('button')).find((b) => (b.getAttribute('aria-label') || '').toLowerCase().includes('send'))

    // open the widget if the composer isn't visible yet
    if (!input() || input().offsetParent === null) {
      const opener = Array.from(doc.querySelectorAll('button')).find((b) => /open|launch|chat/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.className || '')))
        || Array.from(document.querySelectorAll('button, [class*=launcher], [class*=bubble]')).find((el) => el.offsetParent !== null)
      opener && opener.click()
      for (let i = 0; i < 20 && (!input() || input().offsetParent === null); i++) await wait(300)
    }
    const el = input()
    if (!el) return { a: '', ms: 0, err: 'no composer input' }

    const sel = '[class*=bubbleReceived]'
    const before = doc.querySelectorAll(sel).length
    const setter = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set
    setter.call(el, q)
    el.dispatchEvent(new win.Event('input', { bubbles: true }))
    await wait(150)
    sendBtn() && sendBtn().click()

    const start = Date.now()
    let last = '', stableAt = Date.now()
    while (Date.now() - start < 28000) {
      await wait(400)
      const recv = doc.querySelectorAll(sel)
      if (recv.length > before) {
        const txt = Array.from(recv).slice(before).map((e) => (e.textContent || '').replace(/\s+/g, ' ').trim()).join(' ')
        if (txt && txt === last) { if (Date.now() - stableAt > 1600) break } else { last = txt; stableAt = Date.now() }
      }
    }
    return { a: last, ms: Date.now() - start, err: last ? undefined : 'no reply' }
  }, question)
}

/**
 * Run a batch of questions against one widget. Each question runs in a fresh
 * page (a fresh widget session), up to `concurrency` at once.
 * @returns Array<{ q, a, ms, error? }> in input order.
 */
export async function runProbe({ widgetUrl, questions, concurrency = 4 }) {
  const browser = await getBrowser()
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  // Skip heavy assets so page loads are quick.
  await context.route('**/*', (route) => {
    const t = route.request().resourceType()
    return ['image', 'media', 'font'].includes(t) ? route.abort() : route.continue()
  })

  const results = new Array(questions.length)
  let next = 0
  const worker = async () => {
    const page = await context.newPage()
    try {
      while (true) {
        const i = next++
        if (i >= questions.length) break
        const q = questions[i]
        try {
          await page.goto(widgetUrl, { waitUntil: 'networkidle', timeout: 45000 })
          const r = await askInPage(page, q)
          results[i] = { q, a: r.a || '', ms: r.ms || 0, error: r.err }
        } catch (e) {
          results[i] = { q, a: '', ms: 0, error: (e && e.message) || 'probe failed' }
        }
      }
    } finally {
      await page.close().catch(() => {})
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, questions.length) }, worker))
  } finally {
    await context.close().catch(() => {})
  }
  return results
}
