/**
 * Twilio auth-token encryption for the ETL scripts — the .mjs mirror of
 * api/_lib/tokenCrypto.ts. Same AES-256-GCM scheme + blob format, so a token
 * encrypted by the API (on dashboard save) decrypts here for the ingest, and
 * vice versa. Key comes from TWILIO_TOKEN_ENC_KEY (32 bytes, 64 hex chars) in
 * etl/.env; it must MATCH the key set in Vercel env.
 *
 * Blob format: "v1:" + base64( iv[12] || authTag[16] || ciphertext )
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

function key() {
  const raw = (process.env.TWILIO_TOKEN_ENC_KEY || '').trim()
  if (!raw) return null
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  return buf.length === 32 ? buf : null
}

export function tokenCryptoReady() {
  return key() != null
}

export function encryptToken(plain) {
  const k = key()
  if (!k) throw new Error('TWILIO_TOKEN_ENC_KEY missing or not 32 bytes')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', k, iv)
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return 'v1:' + Buffer.concat([iv, tag, ct]).toString('base64')
}

export function decryptToken(blob) {
  const k = key()
  if (!k || !blob || !blob.startsWith('v1:')) return null
  try {
    const buf = Buffer.from(blob.slice(3), 'base64')
    const iv = buf.subarray(0, 12)
    const tag = buf.subarray(12, 28)
    const ct = buf.subarray(28)
    const d = createDecipheriv('aes-256-gcm', k, iv)
    d.setAuthTag(tag)
    return Buffer.concat([d.update(ct), d.final()]).toString('utf8')
  } catch {
    return null
  }
}
