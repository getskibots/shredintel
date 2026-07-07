import { chromium } from 'playwright'

/**
 * The probe engine. Drives a live Botscrew chat widget in headless Chromium and
 * captures answers exactly as a guest would see them.
 *
 * A "thread" is one simulated guest: a fresh widget session that asks a natural
 * sequence of questions (multi-turn) in ONE conversation. Many threads run
 * concurrently — many guests peppering the bot at once.
 *
 * Per-thread flow (proven live): the widget-demo page opens a fresh session to a
 * conversation-starters screen with NO composer; the composer (`<input>`) only
 * appears after clicking a starter. So: click a starter → wait for the widget to
 * go quiet (its own reply finished) → then ask each question in the thread in
 * turn, capturing the first NEW received bubble once it stops streaming. The
 * widget messages over WebSocket (no HTTP send endpoint), so this must be a real
 * browser.
 */

export const ALLOWED_HOST = 'bots.getskitickets.com'

// A FRESH browser per run (closed at the end) so memory never accumulates across
// runs — a big parallel run must not leave the process bloated for the next one.
async function launchBrowser() {
  return chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
  })
}

// Runs INSIDE the page. Opens the widget via a conversation starter, waits for it
// to go quiet, then asks each question in `questions` in sequence in the same
// thread. Returns { turns: [{ q, a, ms, err? }], err? }.
async function askThreadInPage(page, questions) {
  return page.evaluate(async (qs) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    const frames = () => Array.from(document.querySelectorAll('iframe'))
      .map((f) => { let d = null; try { d = f.contentDocument } catch { /* x-origin */ } return d ? { doc: d, win: f.contentWindow } : null })
      .filter(Boolean)
    const scanInput = (root) => {
      const e = root.querySelector('input, textarea')
      if (e) return e
      for (const el of root.querySelectorAll('*')) if (el.shadowRoot) { const r = scanInput(el.shadowRoot); if (r) return r }
      return null
    }
    const findComposer = () => { for (const { doc, win } of frames()) { const el = scanInput(doc); if (el) return { doc, win, el } } return null }
    const sendBtnIn = (doc) => Array.from(doc.querySelectorAll('button')).find((b) => (b.getAttribute('aria-label') || '').toLowerCase().includes('send'))

    const RECV = '[class*=bubbleReceived]'
    const ALL = '[class*=bubbleSent], [class*=bubbleReceived]'

    // 1. Get to the composer. OPEN the widget by clicking its launcher bubble
    // (Botscrew #botscrew-custom-bubble-wrap in the MAIN doc — it needs a full
    // pointer-event sequence, not a bare .click()). If the bot still shows
    // conversation starters, clicking one also reveals the composer (fallback).
    const openWidget = () => {
      const bubble = document.querySelector('#botscrew-custom-bubble-wrap')
        || Array.from(document.querySelectorAll('div')).find((d) => {
          const s = getComputedStyle(d); const r = d.getBoundingClientRect()
          return s.position === 'fixed' && r.width > 40 && r.width < 120 && r.height > 40 && r.height < 120
        })
      if (!bubble) return
      const t = bubble.querySelector('img, svg') || bubble
      for (const ev of ['pointerover', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
        t.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true, composed: true, view: window }))
      }
    }
    let c = findComposer()
    const t0 = Date.now()
    while (!c && Date.now() - t0 < 45000) {
      openWidget()
      for (const { doc } of frames()) {
        const starter = Array.from(doc.querySelectorAll('button')).find((b) => {
          const al = (b.getAttribute('aria-label') || '').toLowerCase()
          const tx = (b.textContent || '').trim()
          const r = b.getBoundingClientRect()
          return tx.length > 4 && !/collapse|close|send|reset|minimi/.test(al) && r.width > 0 && r.height > 0
        })
        if (starter) { starter.click(); break }
      }
      await wait(800)
      c = findComposer()
    }
    if (!c) return { err: 'no composer input', turns: [] }
    const doc0 = c.doc

    // 2. Wait for the widget to go quiet (welcome greeting and/or any starter
    // reply finished) before asking. 3s floor so an initial lull doesn't read as
    // quiet; no "must grow" requirement since a starterless bot posts no reply here.
    let sig = '', qStable = Date.now(), qStart = Date.now()
    while (Date.now() - qStart < 30000) {
      await wait(400)
      const bs = doc0.querySelectorAll(ALL)
      const s = bs.length + '|' + (bs.length ? (bs[bs.length - 1].textContent || '').length : 0)
      if (s !== sig) { sig = s; qStable = Date.now() }
      if (Date.now() - qStable > 2500 && Date.now() - qStart > 3000) break
    }

    // 3. Ask each question in the thread, capturing each reply.
    const turns = []
    for (const q of qs) {
      const comp = findComposer()
      if (!comp) { turns.push({ q, a: '', ms: 0, err: 'composer lost' }); break }
      const { doc, win, el } = comp
      const before = doc.querySelectorAll(RECV).length
      const proto = el.tagName === 'TEXTAREA' ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, q)
      el.dispatchEvent(new win.Event('input', { bubbles: true }))
      await wait(200)
      const sb = sendBtnIn(doc)
      if (sb) sb.click()
      else el.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }))

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
      turns.push({ q, a: last, ms: Date.now() - start, err: last ? undefined : 'no reply' })
      await wait(700) // let the turn settle before the next question
    }
    return { turns }
  }, questions)
}

/**
 * Run a batch of THREADS against one widget. Each thread is a fresh guest session
 * asking its questions multi-turn; up to `concurrency` guests at once.
 * @param {{widgetUrl:string, threads:string[][], concurrency?:number}} opts
 * @returns Array<{ turns: [{q,a,ms,err?}], error? }> in input order.
 */
export async function runProbe({ widgetUrl, threads, concurrency = 3 }) {
  const browser = await launchBrowser()
  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    })
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false })
    })

    const results = new Array(threads.length)
    let next = 0
    const worker = async () => {
      const page = await context.newPage()
      try {
        while (true) {
          const i = next++
          if (i >= threads.length) break
          try {
            await page.goto(widgetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
            const r = await askThreadInPage(page, threads[i])
            results[i] = { turns: r.turns || [], error: r.err }
          } catch (e) {
            results[i] = { turns: [], error: (e && e.message) || 'probe failed' }
          }
        }
      } finally {
        await page.close().catch(() => {})
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, threads.length) }, worker))
    return results
  } finally {
    await browser.close().catch(() => {})
  }
}
