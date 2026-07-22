/*!
 * ShredIntel embed loader
 * -----------------------------------------------------------------------------
 * BotScrew includes this one script on the admin:
 *     <script src="https://analytics.getskibots.com/embed.js" defer></script>
 *
 * On the analytics route (/admin/bot/{id}/analytics) it:
 *   1. fetches a short-lived token from the host's session-authed endpoint
 *      (GET /api/private/analytics-token?botId={id}, same-origin cookies),
 *   2. swaps the page's <main> for the ShredIntel dashboard iframe, scoped to
 *      that bot, and
 *   3. auto-sizes the iframe from postMessage height updates.
 * It removes the frame when the admin navigates away, and is safe to include
 * more than once. Dependency-free, no console noise.
 *
 * Optional host config (set BEFORE this script loads):
 *   window.SHREDINTEL_EMBED = {
 *     appOrigin:      'https://analytics.getskibots.com', // where the dashboard is hosted
 *     tokenEndpoint:  '/api/private/analytics-token',     // host endpoint returning { token }
 *     mountSelector:  'main',                             // where to inject the iframe
 *   }
 */
(function () {
  'use strict'
  if (window.__shredintelEmbedLoaded) return
  window.__shredintelEmbedLoaded = true

  var CFG = window.SHREDINTEL_EMBED || {}
  var APP_ORIGIN = (CFG.appOrigin || 'https://analytics.getskibots.com').replace(/\/$/, '')
  var TOKEN_ENDPOINT = CFG.tokenEndpoint || '/api/private/analytics-token'
  var MOUNT_SELECTOR = CFG.mountSelector || 'main'
  var ROUTE_RE = /\/admin\/bot\/(\d+)\/analytics/
  var FRAME_ID = 'shredintel-frame'
  var WRAP_ID = 'shredintel-wrap'
  var FALLBACK_ID = 'shredintel-fallback'

  var currentBot = null // bot id currently framed, or null

  // ---- mount discovery: SPA content can render late, so retry briefly --------
  function findMount(cb) {
    var deadline = Date.now() + 3000
    ;(function attempt() {
      var el =
        document.querySelector(MOUNT_SELECTOR) ||
        document.querySelector('main') ||
        document.getElementById('root')
      if (el) return cb(el)
      if (Date.now() > deadline) return cb(null)
      setTimeout(attempt, 100)
    })()
  }

  // The host admin is a React SPA and OWNS the <main> subtree. We must never add
  // or remove children INSIDE it (that breaks React's reconciliation on the next
  // navigation). Instead we HIDE <main> and park our element as its sibling; React
  // keeps rendering into the hidden node harmlessly, and our inline display:none
  // isn't something React manages, so it won't be clobbered.
  var hiddenMount = null

  function restoreMount() {
    if (!hiddenMount) return
    hiddenMount.style.display = hiddenMount.getAttribute('data-shredintel-prev-display') || ''
    hiddenMount.removeAttribute('data-shredintel-prev-display')
    hiddenMount = null
  }

  function clearInjected() {
    var w = document.getElementById(WRAP_ID) // wrapper holds the iframe
    if (w && w.parentNode) w.parentNode.removeChild(w)
    var fb = document.getElementById(FALLBACK_ID)
    if (fb && fb.parentNode) fb.parentNode.removeChild(fb)
    restoreMount()
  }

  function placeBesideMount(mount, el) {
    if (mount !== hiddenMount) {
      restoreMount()
      mount.setAttribute('data-shredintel-prev-display', mount.style.display || '')
      mount.style.display = 'none'
      hiddenMount = mount
    }
    if (mount.parentNode) mount.parentNode.insertBefore(el, mount.nextSibling)
    else mount.appendChild(el) // no parent (shouldn't happen) — degrade gracefully
  }

  function renderFallback(mount) {
    clearInjected()
    var div = document.createElement('div')
    div.id = FALLBACK_ID
    div.style.cssText =
      'padding:32px;font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#64748b;text-align:center'
    div.textContent = 'Analytics is temporarily unavailable — please refresh.'
    placeBesideMount(mount, div)
  }

  function injectFrame(mount, botId, token) {
    clearInjected()
    var iframe = document.createElement('iframe')
    iframe.id = FRAME_ID
    iframe.title = 'ShredIntel Analytics'
    iframe.src =
      APP_ORIGIN + '/?embed=1#/bot/' + botId + '?token=' + encodeURIComponent(token)
    iframe.setAttribute('frameborder', '0')
    // Delegate mic + audio into the frame so the realtime voice feature works
    // when embedded. A cross-origin iframe gets NEITHER without this, so voice
    // would fail with "Permission denied" (the host must grant, not the app).
    iframe.setAttribute('allow', 'microphone; autoplay')
    iframe.style.cssText = 'width:100%;border:0;display:block;min-height:80vh'

    // The frame is parked BESIDE the hidden <mount>, so it does not inherit the
    // host's content framing (background, padding). The dashboard renders
    // transparent + edge-to-edge on purpose, so copy the mount's own background
    // and padding onto a wrapper — the frame then visually REPLACES <mount> in
    // ANY host (BotScrew's #F7FAFE + 40px-left today, auto-adapting elsewhere).
    var wrap = document.createElement('div')
    wrap.id = WRAP_ID
    try {
      var cs = window.getComputedStyle(mount)
      wrap.style.background = cs.backgroundColor
      wrap.style.padding = cs.padding
    } catch (e) { /* getComputedStyle unavailable — degrade to no framing */ }
    wrap.style.boxSizing = 'border-box'
    wrap.appendChild(iframe)

    placeBesideMount(mount, wrap)
    currentBot = botId
  }

  function activate(botId) {
    // Idempotent: already showing this bot's frame → nothing to do.
    if (currentBot === botId && document.getElementById(FRAME_ID)) return
    findMount(function (mount) {
      if (!mount) return
      var url = TOKEN_ENDPOINT + (TOKEN_ENDPOINT.indexOf('?') >= 0 ? '&' : '?') + 'botId=' + botId
      fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
        .then(function (r) {
          if (!r.ok) throw new Error('token ' + r.status)
          return r.json()
        })
        .then(function (data) {
          if (!data || !data.token) throw new Error('no token')
          injectFrame(mount, botId, data.token)
        })
        .catch(function () {
          currentBot = null
          renderFallback(mount)
        })
    })
  }

  function deactivate() {
    if (currentBot === null && !document.getElementById(FRAME_ID)) return
    clearInjected()
    currentBot = null
  }

  function syncRoute() {
    var m = ROUTE_RE.exec(window.location.pathname)
    if (m) activate(m[1])
    else deactivate()
  }

  // ---- height auto-resize (origin-checked) -----------------------------------
  window.addEventListener('message', function (e) {
    if (e.origin !== APP_ORIGIN) return
    var d = e.data
    if (!d || d.source !== 'shredintel' || d.type !== 'height') return
    var f = document.getElementById(FRAME_ID)
    if (f && typeof d.height === 'number' && d.height > 0) {
      f.style.height = d.height + 'px'
    }
  })

  // ---- SPA route watching: wrap pushState/replaceState + popstate -------------
  function wrap(method) {
    var orig = history[method]
    history[method] = function () {
      var ret = orig.apply(this, arguments)
      // let the SPA update the DOM first, then reconcile our frame
      setTimeout(syncRoute, 0)
      return ret
    }
  }
  wrap('pushState')
  wrap('replaceState')
  window.addEventListener('popstate', function () { setTimeout(syncRoute, 0) })

  // Initial reconcile (in case the admin loads directly on the analytics route)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncRoute)
  } else {
    syncRoute()
  }
})()
