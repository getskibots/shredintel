/**
 * Symmetric encryption for Twilio auth tokens stored in report.bot_twilio.
 *
 * A token entered via the dashboard "Connect Twilio" control is encrypted here
 * (AES-256-GCM) BEFORE it touches the database, and decrypted only server-side
 * (this file for the API + etl/twilio-token.mjs for the ingest scripts, which
 * implement the SAME format). The key lives ONLY in env (TWILIO_TOKEN_ENC_KEY,
 * 32 bytes as 64 hex chars); the DB holds ciphertext and the browser never sees
 * the token. Rotate/lose the key and tokens are simply re-entered.
 *
 * Blob format: "v1:" + base64( iv[12] || authTag[16] || ciphertext )
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

function key(): Buffer | null {
  const raw = (process.env.TWILIO_TOKEN_ENC_KEY || '').trim()
  if (!raw) return null
  // Accept 64-hex (preferred) or base64 of 32 bytes.
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  return buf.length === 32 ? buf : null
}

/** True when a usable 32-byte key is configured (so callers can fail loudly). */
export function tokenCryptoReady(): boolean {
  return key() != null
}

export function encryptToken(plain: string): string {
  const k = key()
  if (!k) throw new Error('TWILIO_TOKEN_ENC_KEY missing or not 32 bytes')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', k, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return 'v1:' + Buffer.concat([iv, tag, ct]).toString('base64')
}

export function decryptToken(blob: string | null | undefined): string | null {
  const k = key()
  if (!k || !blob || !blob.startsWith('v1:')) return null
  try {
    const buf = Buffer.from(blob.slice(3), 'base64')
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const ct = buf.subarray(28)
    const decipher = createDecipheriv('aes-256-gcm', k, iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
