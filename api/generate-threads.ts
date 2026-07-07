/**
 * POST /api/generate-threads — the "Ahhh FAQ It" question brain.
 *
 * Generates realistic guest conversation threads for the probe. Each thread is
 * ONE simulated guest: a natural 3–4 question conversation. Runs in two modes:
 *   - MACRO  (scope:"all")      → threads spread across every category for coverage
 *   - FOCUSED (scope:"<key>")   → every thread concentrated in one category
 *                                 (e.g. "ecommerce" = the revenue/checkout path)
 *
 * Categories mirror ShredIntel's knowledge sections so a focused probe maps 1:1
 * to the analytics. GET returns the category list (for the tool's selector).
 *
 * Body: { scope?, guests?, minTurns?, maxTurns?, resort? }
 * → { threads: [{category, persona, questions[]}], coverage: {cat:count}, scope }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { chat } from './_lib/llm.js'

export const maxDuration = 60

// Ski-resort knowledge categories — aligned with ShredIntel's conversation
// sections. Ecommerce first (the revenue path). Each `hint` steers generation.
export const CATEGORIES = [
  { key: 'ecommerce', label: 'Ecommerce & Checkout', hint: 'buying tickets/passes online, pricing by date/age/number of days, promo & discount codes, cart or checkout problems, payment methods, online vs window pricing, changing or refunding an order' },
  { key: 'tickets', label: 'Lift Tickets', hint: 'daily lift ticket price, what a ticket includes, age tiers, multi-day, where to buy, first tracks / early access' },
  { key: 'passes', label: 'Season Passes', hint: 'season pass tiers, Ikon/partner passes, benefits, renewals, blackout dates, pass vs ticket, adding family members' },
  { key: 'lessons', label: 'Lessons & School', hint: 'group vs private lessons, kids vs adult, ages, skill levels, booking, meeting points, what to bring' },
  { key: 'rentals', label: 'Rentals & Demo', hint: 'ski/snowboard rentals, pricing, sizing, demo vs standard, reserving ahead, pickup/return, helmets' },
  { key: 'parking', label: 'Parking & Transit', hint: 'where to park, cost, reservations, lot availability, shuttles, public transit, drop-off, getting to the mountain' },
  { key: 'dining', label: 'Dining & Après', hint: 'on-mountain restaurants, hours, reservations, dietary options, après-ski, food pricing' },
  { key: 'terrain', label: 'Terrain & Trails', hint: 'trail difficulty, terrain parks, grooming, which lifts/runs are open, beginner areas, notable runs' },
  { key: 'lodging', label: 'Lodging', hint: 'on-mountain lodging, ski-in/ski-out, booking, packages, proximity to lifts, pet-friendly stays' },
  { key: 'hours', label: 'Hours & Season', hint: 'operating hours, lift open/close times, opening & closing dates, night skiing, holiday hours' },
  { key: 'conditions', label: 'Weather & Conditions', hint: "today's snow report, base depth, recent snowfall, road & lift status, webcams, what to wear" },
  { key: 'family', label: 'Kids & Family', hint: 'kids programs, childcare, family tickets, age policies, kid-friendly terrain, gear for kids' },
  { key: 'policies', label: 'Policies & Safety', hint: 'uphill/skinning policy, pets, refund & cancellation, weather holds, lost & found, accessibility / adaptive programs' },
  { key: 'activities', label: 'Activities & Events', hint: 'tubing, snowshoeing, events, summer operations, non-ski activities, tram sightseeing, group/wedding inquiries' },
  { key: 'gettinghere', label: 'Getting Here', hint: 'nearest airport, driving directions, distance, road conditions, tire chains, closest town' },
] as const

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    return res.status(200).json({ categories: CATEGORIES.map((c) => ({ key: c.key, label: c.label, hint: c.hint })) })
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  const b = typeof req.body === 'object' && req.body ? req.body : {}
  const scope = String(b.scope || 'all')
  const guests = Math.max(1, Math.min(20, Number(b.guests) || 10))
  const minTurns = Math.max(1, Math.min(6, Number(b.minTurns) || 3))
  const maxTurns = Math.max(minTurns, Math.min(8, Number(b.maxTurns) || 4))
  const resort = String(b.resort || 'the resort').slice(0, 80)

  const focused = CATEGORIES.find((c) => c.key === scope)
  const taxonomy = CATEGORIES.map((c) => `- ${c.label} (${c.key}): ${c.hint}`).join('\n')

  const system = `You are "Ahhh FAQ It", a generator of REALISTIC ski-resort guest questions used to stress-test a resort's AI chatbot. Write questions the way real guests actually type them — short, natural, sometimes vague or with minor typos — in the voice of different personas (first-timer, family with young kids, budget-conscious, season-pass holder, expert, out-of-towner).

Each "guest" is ONE person having ONE short conversation: a coherent thread of ${minTurns}-${maxTurns} questions where each follow-up logically builds on the previous (e.g. ask a price → then a discount → then how to pay). Different guests must sound like different people with different intents; never reuse the same phrasing.

Resort knowledge categories:
${taxonomy}`

  const user = focused
    ? `Generate ${guests} guest threads for ${resort}, ALL focused on "${focused.label}" (${focused.hint}). Vary persona and angle across guests so together they probe the full breadth of this one category. Return JSON: {"threads":[{"category":"${focused.key}","persona":"short label","questions":["...", "..."]}]}`
    : `Generate ${guests} guest threads for ${resort} that TOGETHER cover as many categories above as possible (a macro sweep). Give each guest a primary category and keep its thread coherent within it; spread guests across categories for maximum coverage. Return JSON: {"threads":[{"category":"<category key>","persona":"short label","questions":["...", "..."]}]}`

  try {
    const raw = await chat({ system, user, json: true, maxTokens: 2400, temperature: 0.8 })
    const parsed = JSON.parse(raw) as { threads?: Array<{ category?: string; persona?: string; questions?: unknown[] }> }
    const valid = new Set<string>(CATEGORIES.map((c) => c.key))
    const threads = (Array.isArray(parsed.threads) ? parsed.threads : [])
      .map((t) => ({
        category: valid.has(String(t.category)) ? String(t.category) : (focused?.key || 'general'),
        persona: String(t.persona || '').slice(0, 40),
        questions: (Array.isArray(t.questions) ? t.questions : []).map((q) => String(q).trim()).filter(Boolean).slice(0, maxTurns),
      }))
      .filter((t) => t.questions.length)
      .slice(0, guests)

    const coverage: Record<string, number> = {}
    for (const t of threads) coverage[t.category] = (coverage[t.category] || 0) + 1

    return res.status(200).json({ threads, coverage, scope })
  } catch (e) {
    console.error('[api/generate-threads] failed:', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'generation failed' })
  }
}
