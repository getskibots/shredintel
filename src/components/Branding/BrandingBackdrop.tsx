/**
 * The per-bot background image behind a hero (chat + voice), with a subtle
 * dashboard-toned tint and a fade to white so content below reads cleanly.
 * `overlay` (0..1) tunes how washed-out the image is. Renders nothing without
 * a background image — the hero looks exactly as before.
 */
export function BrandingBackdrop({ url, overlay }: { url?: string; overlay: number }) {
  if (!url) return null
  const wash = Math.max(0, Math.min(1, overlay))
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${url})` }} />
      {/* dashboard-toned tint */}
      <div
        className="absolute inset-0"
        style={{ background: 'radial-gradient(120% 90% at 20% 0%, rgba(33,130,191,0.12), transparent 62%)' }}
      />
      {/* white wash by overlay strength */}
      <div className="absolute inset-0" style={{ backgroundColor: `rgba(255,255,255,${wash})` }} />
      {/* fade to white into the content below */}
      <div
        className="absolute inset-x-0 bottom-0 h-2/5"
        style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0), #ffffff)' }}
      />
    </div>
  )
}
