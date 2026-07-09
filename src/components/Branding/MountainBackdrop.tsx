/**
 * The default on-brand backdrop behind the hero when a bot hasn't uploaded its
 * own image: a clean twilight sky in ShredIntel's blues with a soft horizon glow
 * and two smooth, snow-tipped mountain ranges. Lightweight inline SVG — instant,
 * no licensing, always crisp. Kept intentionally calm so it never competes with
 * the white/blue hero type. A per-bot uploaded photo overrides it.
 */
export function MountainBackdrop() {
  return (
    <svg
      aria-hidden
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 1200 480"
      preserveAspectRatio="xMidYMid slice"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="si-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e2d47" />
          <stop offset="55%" stopColor="#35608a" />
          <stop offset="100%" stopColor="#6fa4cb" />
        </linearGradient>
        <radialGradient id="si-glow" cx="50%" cy="94%" r="60%">
          <stop offset="0%" stopColor="#bcdcf1" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#bcdcf1" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="1200" height="480" fill="url(#si-sky)" />
      <rect width="1200" height="480" fill="url(#si-glow)" />
      {/* back range — light, smooth */}
      <path d="M0,350 L300,290 L600,345 L900,285 L1200,340 L1200,480 L0,480 Z" fill="#4d7aa0" opacity="0.42" />
      {/* front range — darker slate, smooth */}
      <path d="M0,420 L400,350 L800,415 L1120,345 L1200,375 L1200,480 L0,480 Z" fill="#223954" />
      {/* subtle snow caps on the tallest peaks */}
      <path d="M900,285 L925,313 L875,313 Z" fill="#eaf3fa" opacity="0.55" />
      <path d="M300,290 L324,316 L276,316 Z" fill="#eaf3fa" opacity="0.48" />
    </svg>
  )
}
