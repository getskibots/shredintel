/**
 * Embed token bootstrap — the client half of the Botscrew iframe integration.
 *
 * The host (Botscrew admin) mints a short-lived HS256 JWT server-side and hands
 * it to our loader, which opens the iframe at:
 *     https://analytics.getskibots.com/?embed=1#/bot/{id}?token={jwt}
 *
 * On our side we:
 *   - read `token` from the top-level query OR the hash query (HashRouter puts
 *     the route + its query after `#`, so we accept both — same dual pattern as
 *     isEmbedMode() and PasswordGate's readEmbedToken()),
 *   - DECODE (not verify) the payload so we can soft-unlock the PasswordGate and
 *     read the botId for routing, and
 *   - expose authedFetch() so every /api call carries `Authorization: Bearer`.
 *
 * SECURITY BOUNDARY — decoding is NOT verification. The signing secret lives
 * only on the servers, so the client cannot cryptographically trust a token.
 * Client-side checks (issuer + expiry + numeric botId) are a soft gate that
 * keeps casual visitors out — exactly the PasswordGate's stated posture. HARD
 * per-bot enforcement is the server-side JWT verify on the /api endpoints
 * (strict mode, added next). Never treat a decoded token as authorization for
 * anything sensitive; treat it as "a trusted host opened this frame".
 */

const ISSUER = 'botscrew'

export interface EmbedClaims {
  botId: number
  iss: string
  iat?: number
  exp: number
}

/** Read `?token=` from the top-level query, then the hash query. */
function readTokenFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  const top = new URLSearchParams(window.location.search).get('token')
  if (top) return top
  const hash = window.location.hash
  const qIdx = hash.indexOf('?')
  if (qIdx >= 0) {
    const inHash = new URLSearchParams(hash.slice(qIdx + 1)).get('token')
    if (inHash) return inHash
  }
  return null
}

let cachedToken: string | null = null
let tokenRead = false

/** The raw JWT string, cached for the session (read once from the URL). */
export function getEmbedToken(): string | null {
  if (tokenRead) return cachedToken
  tokenRead = true
  cachedToken = readTokenFromUrl()
  return cachedToken
}

function b64urlDecode(input: string): string {
  let s = input.replace(/-/g, '+').replace(/_/g, '/')
  const pad = s.length % 4
  if (pad) s += '='.repeat(4 - pad)
  return atob(s)
}

/** Decode a JWT's payload without verifying its signature. */
export function decodeEmbedClaims(token: string | null): EmbedClaims | null {
  if (!token) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  try {
    const payload = JSON.parse(b64urlDecode(parts[1])) as Record<string, unknown>
    if (
      typeof payload.botId !== 'number' ||
      payload.iss !== ISSUER ||
      typeof payload.exp !== 'number'
    ) {
      return null
    }
    return payload as unknown as EmbedClaims
  } catch {
    return null
  }
}

/**
 * The embed token's claims IF it is structurally valid, botscrew-issued, and
 * unexpired — else null. Used to soft-unlock the gate and to route to the bot.
 * (Structural check only; see the security-boundary note above.)
 */
export function validEmbedClaims(): EmbedClaims | null {
  const claims = decodeEmbedClaims(getEmbedToken())
  if (!claims) return null
  if (claims.exp * 1000 <= Date.now()) return null
  return claims
}

/** fetch() that attaches the embed JWT as a Bearer header when present. */
export async function authedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = getEmbedToken()
  if (!token) return fetch(input, init)
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return fetch(input, { ...init, headers })
}
