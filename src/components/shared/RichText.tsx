import type { ReactNode } from 'react'

/**
 * Minimal, XSS-safe markdown → React nodes. The bots reply in markdown
 * (**bold**, *italic*, `code`, [label](url) links, bullet lines, blank-line
 * paragraph breaks); rendered as plain text that shows up as literal syntax.
 * This converts the common cases the bots actually emit.
 *
 * Safety: we build React elements from parsed tokens — never
 * dangerouslySetInnerHTML — so there is no HTML-injection surface. Links are
 * restricted to http(s) and open in a new tab with rel="noreferrer".
 *
 * Output is inline-level (text, <strong>, <em>, <code>, <a>, <br/>) so it's
 * valid inside a <p> or after an inline label — callers keep their layout.
 */

// Ordered alternation: **bold** / __bold__ win over *italic* / _italic_.
const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g

function safeHref(url: string): string | null {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}

function renderInline(text: string, kp: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = new RegExp(INLINE.source, 'g')
  let last = 0
  let i = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const t = m[0]
    const key = `${kp}-${i++}`
    if (t.startsWith('**') || t.startsWith('__')) {
      // Bold intentionally dropped — the bots bold aggressively, which reads
      // busy. Still strip the ** / __ markers so no raw markdown shows; just
      // render the words plainly.
      out.push(t.slice(2, -2))
    } else if (t.startsWith('`')) {
      out.push(
        <code key={key} className="rounded bg-slate-100 px-1 py-0.5 text-[0.9em] text-slate-700">
          {t.slice(1, -1)}
        </code>,
      )
    } else if (t.startsWith('[')) {
      const mm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(t)
      const href = mm ? safeHref(mm[2]) : null
      out.push(
        mm && href ? (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-botscrew-600 underline decoration-botscrew-300 underline-offset-2 hover:text-botscrew-700"
          >
            {mm[1]}
          </a>
        ) : (
          t
        ),
      )
    } else {
      out.push(<em key={key}>{t.slice(1, -1)}</em>)
    }
    last = m.index + t.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export function RichText({ text }: { text: string }): ReactNode {
  const lines = (text ?? '').split(/\r?\n/)
  const nodes: ReactNode[] = []
  lines.forEach((line, idx) => {
    // Bullet lines (- / * / •) become a real bullet glyph; stays inline so the
    // whole thing remains valid inside a <p> and after an inline sender label.
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line)
    const content = bullet ? `• ${bullet[1]}` : line
    if (idx > 0) nodes.push(<br key={`br-${idx}`} />)
    nodes.push(...renderInline(content, `l${idx}`))
  })
  return <>{nodes}</>
}
