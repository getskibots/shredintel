/**
 * shredintel embed — drop-in web component for host pages (Botscrew admin,
 * partner dashboards, anywhere).
 *
 * Usage (host page):
 *   <script src="https://shred.getskibots.com/embed.js" async></script>
 *   <shredintel-analytics bot-id="1"></shredintel-analytics>
 *
 * That's the entire integration surface. The element renders an iframe
 * pointing at shred.getskibots.com, listens for height messages from that
 * iframe, and auto-sizes itself. Changing `bot-id` at runtime re-navigates.
 *
 * Attributes (all optional except bot-id):
 *   bot-id   — required. The Botscrew bot_id to show analytics for.
 *   period   — '7d' | '30d' | '90d' | 'all' | 'custom'  (default: '7d')
 *   from     — ISO YYYY-MM-DD, only used when period='custom'
 *   to       — ISO YYYY-MM-DD, only used when period='custom'
 *   min-height — CSS length for the initial iframe height (default: 800px)
 *
 * Multi-instance: safe. Each element only listens to its own iframe's
 * messages (filtered via event.source === iframe.contentWindow).
 */
;(function () {
  'use strict'

  // Where the iframe should point. Auto-detected from the script src so this
  // file works both on shred.getskibots.com (prod) and localhost (dev).
  var IFRAME_ORIGIN = (function () {
    try {
      var s = document.currentScript && document.currentScript.src
      if (s) return new URL(s).origin
    } catch (e) {}
    return 'https://shred.getskibots.com'
  })()

  var TAG_NAME = 'shredintel-analytics'
  if (customElements.get(TAG_NAME)) return // already registered

  var MESSAGE_SOURCE = 'shredintel'

  function buildSrc(el) {
    var botId = el.getAttribute('bot-id') || '1'
    var period = el.getAttribute('period')
    var from = el.getAttribute('from')
    var to = el.getAttribute('to')
    var q = new URLSearchParams({ embed: '1' })
    if (period) q.set('period', period)
    if (from) q.set('from', from)
    if (to) q.set('to', to)
    // HashRouter — routes live after the #, query params before it.
    return IFRAME_ORIGIN + '/?' + q.toString() + '#/bot/' + encodeURIComponent(botId)
  }

  class ShredintelAnalytics extends HTMLElement {
    static get observedAttributes() {
      return ['bot-id', 'period', 'from', 'to', 'min-height']
    }

    connectedCallback() {
      if (this._iframe) return

      var iframe = document.createElement('iframe')
      iframe.title = 'shredintel analytics'
      iframe.style.width = '100%'
      iframe.style.border = '0'
      iframe.style.display = 'block'
      iframe.style.minHeight = this.getAttribute('min-height') || '800px'
      iframe.src = buildSrc(this)
      iframe.setAttribute('loading', 'lazy')

      this.appendChild(iframe)
      this._iframe = iframe

      var self = this
      this._onMessage = function (e) {
        // Only accept messages from OUR iframe and OUR origin
        if (e.source !== iframe.contentWindow) return
        if (e.origin !== IFRAME_ORIGIN) return
        var d = e.data
        if (!d || d.source !== MESSAGE_SOURCE) return
        if (d.type === 'height' && typeof d.height === 'number' && d.height > 0) {
          iframe.style.height = d.height + 'px'
          // Fire a custom event so hosts can react (e.g., scroll into view)
          self.dispatchEvent(new CustomEvent('shredintel:resize', {
            detail: { height: d.height },
            bubbles: true,
          }))
        }
      }
      window.addEventListener('message', this._onMessage)
    }

    disconnectedCallback() {
      if (this._onMessage) window.removeEventListener('message', this._onMessage)
      this._onMessage = null
      this._iframe = null
    }

    attributeChangedCallback(name, oldVal, newVal) {
      if (oldVal === newVal) return
      if (!this._iframe) return
      if (name === 'min-height') {
        this._iframe.style.minHeight = newVal || '800px'
        return
      }
      // Any URL-affecting attribute → re-navigate the iframe
      this._iframe.src = buildSrc(this)
    }
  }

  customElements.define(TAG_NAME, ShredintelAnalytics)
})();
