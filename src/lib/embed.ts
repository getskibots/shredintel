/**
 * Embed mode — shredintel as an iframeable dashboard.
 *
 * When the host page passes `?embed=1` in the URL, we:
 *   1. Hide our sidebar + top bar (host provides its own chrome)
 *   2. Post content height to the parent frame via postMessage so the
 *      iframe can grow to fit content (no inner scrollbar needed)
 *
 * Contract with the host page:
 *   iframe src:  https://shred.getskibots.com/#/bot/1?embed=1
 *   parent receives:  { source: 'shredintel', type: 'height', height: <px> }
 *   parent should update the iframe's height attribute accordingly.
 */

import { useEffect } from 'react'

const EMBED_QUERY_PARAM = 'embed'
const HEIGHT_MESSAGE_TYPE = 'height'
const MESSAGE_SOURCE = 'shredintel'

/**
 * Read `?embed=1` from either the top-level query string OR the hash query.
 * HashRouter puts our routes after `#`, so hosts can pass ?embed=1 either
 * before the hash (as a plain query) or inside the hash — we accept both.
 */
export function isEmbedMode(): boolean {
  if (typeof window === 'undefined') return false
  const top = new URLSearchParams(window.location.search)
  if (top.get(EMBED_QUERY_PARAM) === '1') return true
  const hash = window.location.hash
  const qIdx = hash.indexOf('?')
  if (qIdx >= 0) {
    const hashParams = new URLSearchParams(hash.slice(qIdx + 1))
    if (hashParams.get(EMBED_QUERY_PARAM) === '1') return true
  }
  return false
}

interface HeightMessage {
  source: typeof MESSAGE_SOURCE
  type: typeof HEIGHT_MESSAGE_TYPE
  height: number
}

function postHeight(height: number): void {
  if (window.parent === window) return // not in a frame
  const msg: HeightMessage = { source: MESSAGE_SOURCE, type: HEIGHT_MESSAGE_TYPE, height }
  // Target origin '*' — the host page validates the `source` field.
  // Sending only non-sensitive layout info, so '*' is acceptable.
  window.parent.postMessage(msg, '*')
}

const EMBED_CLASS = 'shredintel-embed'

/**
 * When embedded:
 *   1. Tag html+body so the embed-mode CSS overrides apply (transparent bg,
 *      neutralized sticky offsets)
 *   2. Observe body size and post height updates to the parent iframe on
 *      every layout change, route change, or asset load
 * No-op when not embedded.
 */
export function useEmbedHeightSync(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    if (typeof window === 'undefined') return

    document.documentElement.classList.add(EMBED_CLASS)
    document.body.classList.add(EMBED_CLASS)

    let lastHeight = 0
    const emit = () => {
      // Use scrollHeight so we capture content beyond viewport
      const h = document.documentElement.scrollHeight
      if (h > 0 && h !== lastHeight) {
        lastHeight = h
        postHeight(h)
      }
    }

    // ResizeObserver alone misses late Recharts/async layout — fire at
    // multiple checkpoints for the first few seconds to catch them all.
    emit()
    const timerIds: number[] = []
    ;[16, 100, 500, 1500, 3000].forEach((ms) => {
      timerIds.push(window.setTimeout(emit, ms))
    })

    const ro = new ResizeObserver(emit)
    ro.observe(document.body)
    ro.observe(document.documentElement)

    // Also emit on route change (hashchange for HashRouter)
    window.addEventListener('hashchange', emit)
    // And on any child image/font load that might extend the layout
    window.addEventListener('load', emit)

    return () => {
      timerIds.forEach((t) => window.clearTimeout(t))
      ro.disconnect()
      window.removeEventListener('hashchange', emit)
      window.removeEventListener('load', emit)
      document.documentElement.classList.remove(EMBED_CLASS)
      document.body.classList.remove(EMBED_CLASS)
    }
  }, [enabled])
}
