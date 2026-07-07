import { chromium } from 'playwright'

/**
 * The probe engine. Drives a live Botscrew chat widget in headless Chromium and
 * captures each answer exactly as a guest would see it.
 *
 * The widget is a same-origin iframe. On a FRESH session it opens to a
 * conversation-starters screen with NO composer — the composer only appears once
 * you click a starter (which enters the chat). So the proven flow is:
 *   1. wait for the composer; if absent, click a conversation starter to reveal it
 *   2. let the starter's own reply settle (so we don't capture it as ours)
 *   3. type the real question, send, and poll the received bubble until it stabilises
 * The widget messages over WebSocket (no HTTP send endpoint), so this must be a
 * real browser.
 */

export const ALLOWED_HOST = 'bots.getskitickets.com'

// One browser for the whole process; a fresh page (fresh widget session) per
// question. Launched lazily, reused across requests.
let browserPromise = null
async function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
    })
  }
  return browserPromise
}

// Runs INSIDE the page (same-origin as the widget iframe).
async function askInPage(page, question) {
  return page.evaluate(async (q) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    const frames = () => Array.from(document.querySelectorAll('iframe'))
      .map((f) => { let d = null; try { d = f.contentDocument } catch { /* x-origin */ } return d ? { doc: d, win: f.contentWindow } : null })
      .filter(Boolean)
    // scan light + shadow DOM for a text field
    const scanInput = (root) => {
      const e = root.querySelector('input, textarea')
      if (e) return e
      for (const el of root.querySelectorAll('*')) if (el.shadowRoot) { const r = scanInput(el.shadowRoot); if (r) return r }
      return null
    }
    const findComposer = () => { for (const { doc, win } of frames()) { const el = scanInput(doc); if (el) return { doc, win, el } } return null }

    // 1. Get to the composer. On a fresh session it's hidden behind conversation
    // starters — click a starter (a text button that isn't collapse/close/send)
    // to reveal it. Never click the collapse button (it minimises the widget).
    let c = findComposer()
    const t0 = Date.now()
    while (!c && Date.now() - t0 < 45000) {
      for (const { doc } of frames()) {
        const starter = Array.from(doc.querySelectorAll('button')).find((b) => {
          const al = (b.getAttribute('aria-label') || '').toLowerCase()
          const tx = (b.textContent || '').trim()
          const r = b.getBoundingClientRect()
          return tx.length > 4 && !/collapse|close|send|reset|minimi/.test(al) && r.width > 0 && r.height > 0
        })
        if (starter) { starter.click(); break }
      }
      await wait(700)
      c = findComposer()
    }
    if (!c) {
      const diag = {
        frames: frames().map(({ doc }) => ({ inp: !!scanInput(doc), btns: doc.querySelectorAll('button').length })),
        body: document.body.innerText.replace(/\s+/g, ' ').slice(0, 140),
      }
      return { a: '', ms: 0, err: 'no composer input :: ' + JSON.stringify(diag) }
    }

    const { doc, win, el } = c
    const RECV = '[class*=bubbleReceived]'
    const ALL = '[class*=bubbleSent], [class*=bubbleReceived]'

    // 2. Wait for the widget to go QUIET before asking. The starter's own reply is
    // inbound; don't settle until a received bubble has appeared SINCE the composer
    // opened (that reply, not just the welcome) and things are then unchanged for
    // 2.5s — with a 6s floor so a brief lull before the reply streams doesn't read
    // as "quiet" (which would leave us one bubble off and capture the starter's answer).
    const startRecv = doc.querySelectorAll(RECV).length
    let sig = '', qStable = Date.now(), qStart = Date.now()
    while (Date.now() - qStart < 35000) {
      await wait(500)
      const bs = doc.querySelectorAll(ALL)
      const s = bs.length + '|' + (bs.length ? (bs[bs.length - 1].textContent || '').length : 0)
      if (s !== sig) { sig = s; qStable = Date.now() }
      const grew = doc.querySelectorAll(RECV).length > startRecv
      if (grew && Date.now() - qStable > 2500 && Date.now() - qStart > 6000) break
    }
    const before = doc.querySelectorAll(RECV).length

    // 3. Send our question.
    const proto = el.tagName === 'TEXTAREA' ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, q)
    el.dispatchEvent(new win.Event('input', { bubbles: true }))
    await wait(200)
    const sb = Array.from(doc.querySelectorAll('button')).find((b) => (b.getAttribute('aria-label') || '').toLowerCase().includes('send'))
    if (sb) sb.click()
    else el.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }))

    // 4. Capture the first NEW received bubble (index `before`) once it stops streaming.
    const start = Date.now()
    let last = '', ansStable = Date.now()
    while (Date.now() - start < 42000) {
      await wait(400)
      const recv = doc.querySelectorAll(RECV)
      if (recv.length > before) {
        const txt = (recv[before].textContent || '').replace(/\s+/g, ' ').trim()
        if (txt && txt === last) { if (Date.now() - ansStable > 1800) break } else { last = txt; ansStable = Date.now() }
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
  // Look like a real desktop Chrome, not headless automation.
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  })
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
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
          await page.goto(widgetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
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
