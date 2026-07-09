import { MountainBackdrop } from './MountainBackdrop'

/**
 * The backdrop behind a hero (chat + voice): a per-bot uploaded image, or the
 * on-brand mountain default when none is set. A dark legibility scrim sits on
 * top so the WHITE hero text reads cleanly over ANY image or brand color;
 * `overlay` (0..1) tunes the scrim strength (higher = darker = more legible,
 * less image). Fades to white at the very bottom to blend into the light
 * dashboard below.
 */
export function BrandingBackdrop({ url, overlay }: { url?: string; overlay: number }) {
  const wash = Math.max(0, Math.min(1, overlay))
  const s = (base: number, span: number) => (base + wash * span).toFixed(3)
  // A custom photo can be bright/busy → a stronger, overlay-tunable scrim. The
  // on-brand mountain default is designed text-friendly → a lighter scrim so the
  // peaks stay visible (its white text leans on its own shadow for legibility).
  // Top-weighted so the wordmark/tagline sit on a darker band (crisp white/blue
  // type), easing off below so the sky + peaks read. A custom photo can be
  // brighter/busier, so its scrim is a touch stronger + overlay-tunable.
  const scrim = url
    ? `linear-gradient(180deg, rgba(16,24,40,${s(0.40, 0.30)}) 0%, rgba(16,24,40,${s(0.26, 0.24)}) 46%, rgba(16,24,40,${s(0.20, 0.24)}) 100%)`
    : 'linear-gradient(180deg, rgba(18,27,44,0.52) 0%, rgba(18,27,44,0.22) 44%, rgba(18,27,44,0.12) 100%)'
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {/* the image, or the on-brand mountain default */}
      {url ? (
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${url})` }} />
      ) : (
        <MountainBackdrop />
      )}
      {/* single clean legibility scrim — keeps white hero text readable on any backdrop */}
      <div className="absolute inset-0" style={{ background: scrim }} />
      {/* fade to white into the content below */}
      <div
        className="absolute inset-x-0 bottom-0 h-16"
        style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0), #ffffff)' }}
      />
    </div>
  )
}
