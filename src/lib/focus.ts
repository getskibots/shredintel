/**
 * Scroll a dashboard section into view and pulse it — the "show you where the
 * data lives" move. The AI answer tags each response with a `focus` section
 * (core / intelligence / identity / context); the hero + voice agent call this.
 */
export function focusSection(id?: string | null) {
  if (!id || id === 'none' || typeof document === 'undefined') return
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  el.classList.add('shredintel-focus')
  window.setTimeout(() => el.classList.remove('shredintel-focus'), 2400)
}
