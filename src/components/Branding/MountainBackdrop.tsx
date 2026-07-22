/**
 * The default on-brand backdrop behind the hero when a bot hasn't uploaded its
 * own image: a calm "bluebird" alpine sky in ShredIntel's blues — light, airy,
 * and open, with two soft, low mountain ridges for gentle depth. Deliberately
 * clean and minimal (lots of open sky, no snow-cap clutter or glow) so it never
 * competes with the hero type. A per-bot uploaded photo overrides it.
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
          {/* soft steel-blue up top (still carries white hero type) → airy pale blue */}
          <stop offset="0%" stopColor="#4b7ea6" />
          <stop offset="50%" stopColor="#8bb8d8" />
          <stop offset="100%" stopColor="#e4f0f9" />
        </linearGradient>
      </defs>
      <rect width="1200" height="480" fill="url(#si-sky)" />
      {/* distant ridge — hazy + light, sits low for gentle depth */}
      <path d="M0,404 L360,378 L680,400 L1000,374 L1200,394 L1200,480 L0,480 Z" fill="#a7c8e0" opacity="0.55" />
      {/* near ridge — soft blue, low and calm (no dark slate, no snow caps) */}
      <path d="M0,438 L300,410 L600,436 L900,408 L1200,430 L1200,480 L0,480 Z" fill="#6c9cc0" opacity="0.9" />
    </svg>
  )
}
