/**
 * ShredIntel voice profiles — the *sound* of each persona (pitch / rate / which
 * browser TTS voice to prefer). The matching *personality* (the instructions)
 * lives server-side in api/_lib/voices.ts — keep the ids in sync.
 *
 * Browser voices vary by OS, so `match` is a best-effort name filter; pitch/rate
 * are the reliable character levers that work everywhere.
 */

export interface VoiceProfile {
  id: string
  name: string
  blurb: string
  openaiVoice: string // OpenAI Realtime voice (gpt-realtime)
  pitch: number // 0–2 (1 = normal) — browser-TTS fallback
  rate: number // 0.1–10 (1 = normal) — browser-TTS fallback
  match: RegExp // preferred browser-voice name — fallback
}

export const VOICE_PROFILES: VoiceProfile[] = [
  { id: 'old-man-winter', name: 'Old Man Winter', blurb: 'Gruff, weathered wisdom', openaiVoice: 'ash', pitch: 0.7, rate: 0.92, match: /daniel|david|fred|alex|male|guy/i },
  { id: 'summer', name: 'Summer', blurb: 'Bright and upbeat', openaiVoice: 'alloy', pitch: 1.18, rate: 1.08, match: /samantha|zira|karen|victoria|jenny|female/i },
  { id: 'autumn', name: 'Autumn', blurb: 'Warm and reflective', openaiVoice: 'cedar', pitch: 1.0, rate: 0.98, match: /moira|serena|tessa|aria|female/i },
]

export const DEFAULT_VOICE_ID = 'autumn'

export function profileFor(id: string | undefined): VoiceProfile {
  return VOICE_PROFILES.find((p) => p.id === id) ?? VOICE_PROFILES[0]
}

/** Best-effort pick of an installed browser voice for a persona. */
export function pickBrowserVoice(
  profile: VoiceProfile,
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | undefined {
  const en = voices.filter((v) => /^en(-|_|$)/i.test(v.lang))
  const pool = en.length ? en : voices
  return pool.find((v) => profile.match.test(v.name))
}
