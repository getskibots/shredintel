/**
 * CarveLoader — the loading state for a bot dashboard. A white ski track carves
 * an S-turn down a snowy blue slope, weaving through a glade of pines, with a
 * gold ski-edge biting the leading tip. Blue-gradient hero to match the homepage.
 * Ties to the "Carve through your conversations" wordmark. Pure CSS/SVG (no deps);
 * respects prefers-reduced-motion.
 */

// The carve — one slalom weaving down the slope. pathLength=1 lets the draw
// animate in 0..1 units; the gold edge rides the SAME path via offset-path.
const CARVE_D = 'M 20 64 C 78 64 84 112 140 104 S 224 60 284 92 S 360 116 384 90'
// A simple two-tier pine silhouette, centered on its base.
const PINE = 'M0 -18 L9 -3 L4 -3 L11 10 L-11 10 L-4 -3 L-9 -3 Z'
const TREES = [
  { x: 58, y: 116, s: 1 },
  { x: 132, y: 110, s: 0.82 },
  { x: 210, y: 117, s: 1.12 },
  { x: 300, y: 108, s: 0.9 },
  { x: 360, y: 120, s: 0.76 },
]

export function CarveLoader({ label }: { label?: string }) {
  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center gap-6 rounded-2xl px-6"
      style={{ background: 'linear-gradient(180deg,#3f5c7a 0%,#6b90b3 55%,#a7c6dd 100%)' }}
    >
      <style>{`
        @keyframes cl-draw {
          0%   { stroke-dashoffset: 1; opacity: 0; }
          12%  { opacity: 1; }
          70%  { stroke-dashoffset: 0; opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 0; }
        }
        @keyframes cl-ride {
          0%   { offset-distance: 0%;   opacity: 0; }
          12%  { opacity: 1; }
          70%  { offset-distance: 100%; opacity: 1; }
          100% { offset-distance: 100%; opacity: 0; }
        }
        @keyframes cl-sway { 0%,100% { opacity: .5 } 50% { opacity: .82 } }
        @keyframes cl-dots { 0%,100% { opacity: .35 } 50% { opacity: 1 } }
        .cl-path { stroke-dasharray: 1; stroke-dashoffset: 1; animation: cl-draw 1.9s ease-in-out infinite; }
        .cl-edge { offset-path: path('${CARVE_D}'); animation: cl-ride 1.9s ease-in-out infinite; }
        .cl-trees > * { animation: cl-sway 2.4s ease-in-out infinite; }
        .cl-trees > *:nth-child(2) { animation-delay: .3s; }
        .cl-trees > *:nth-child(3) { animation-delay: .6s; }
        .cl-trees > *:nth-child(4) { animation-delay: .9s; }
        .cl-trees > *:nth-child(5) { animation-delay: 1.2s; }
        .cl-ellipsis { animation: cl-dots 1.9s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .cl-path { animation: none; stroke-dashoffset: 0; opacity: 1; }
          .cl-edge { animation: none; offset-distance: 100%; }
          .cl-trees > * { animation: none; opacity: .6; }
          .cl-ellipsis { animation: none; }
        }
      `}</style>
      <svg width="400" height="160" viewBox="0 0 400 160" fill="none" role="img" aria-label="Loading">
        <path
          d="M0 150 L64 120 L128 140 L208 108 L288 138 L360 116 L400 140 L400 160 L0 160 Z"
          fill="rgba(255,255,255,0.12)"
        />
        <g className="cl-trees" fill="rgba(255,255,255,0.26)">
          {TREES.map((t, i) => (
            <path key={i} d={PINE} transform={`translate(${t.x} ${t.y}) scale(${t.s})`} />
          ))}
        </g>
        <path
          className="cl-path"
          d={CARVE_D}
          pathLength={1}
          stroke="#ffffff"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle className="cl-edge" r="6" fill="#F3B116" />
      </svg>
      <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.92)' }}>
        Carving through {label ?? 'the data'}
        <span className="cl-ellipsis">…</span>
      </p>
    </div>
  )
}
