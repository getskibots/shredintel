/**
 * /api/branding — per-bot branding writes (server-side; the anon key can't write
 * report.*). Images are stored as bytes in report.bot_branding.
 *
 *   GET    ?botId=            → { botId, hasLogo, hasBackground, overlay, v }
 *   POST   { botId, kind:'logo'|'background', dataBase64, mime }  → upsert image
 *   POST   { botId, overlay:0..1 }                               → set overlay
 *   DELETE { botId, kind }                                        → clear image
 *
 * Behind the app's password gate. Validates image mime + size cap. A real
 * per-resort auth gate is a later concern (same as the rest of the app).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import pg from 'pg'

let pool: pg.Pool | null = null
function getPool(): pg.Pool {
  if (pool) return pool
  const cfg = process.env.SHREDINTEL_DB_URL
    ? { connectionString: process.env.SHREDINTEL_DB_URL }
    : {
        host: process.env.SUPABASE_DB_HOST,
        port: Number(process.env.SUPABASE_DB_PORT || 5432),
        user: process.env.SUPABASE_DB_USER,
        password: process.env.SUPABASE_DB_PASSWORD,
        database: process.env.SUPABASE_DB_NAME || 'postgres',
      }
  pool = new pg.Pool({ ...cfg, ssl: { rejectUnauthorized: false }, max: 3, idleTimeoutMillis: 10_000 })
  return pool
}

const CAP = { logo: 2 * 1024 * 1024, background: 6 * 1024 * 1024 } // decoded byte caps

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const body = typeof req.body === 'object' && req.body ? req.body : {}

    if (req.method === 'GET') {
      const botId = Number(req.query.botId ?? body.botId)
      if (!botId) return res.status(400).json({ error: 'botId is required' })
      const { rows } = await getPool().query(
        `select bot_id, (logo_data is not null) has_logo, (bg_data is not null) has_bg,
                overlay, extract(epoch from updated_at)::bigint v
           from report.bot_branding where bot_id = $1`,
        [botId],
      )
      const r = rows[0]
      return res.status(200).json({
        botId, hasLogo: !!r?.has_logo, hasBackground: !!r?.has_bg,
        overlay: r?.overlay ?? 0.6, v: r?.v ?? 0,
      })
    }

    const botId = Number(body.botId)
    if (!botId) return res.status(400).json({ error: 'botId is required' })

    if (req.method === 'DELETE') {
      const kind = String(body.kind || '')
      if (kind !== 'logo' && kind !== 'background') return res.status(400).json({ error: 'kind required' })
      const dataCol = kind === 'logo' ? 'logo_data' : 'bg_data'
      const mimeCol = kind === 'logo' ? 'logo_mime' : 'bg_mime'
      await getPool().query(
        `update report.bot_branding set ${dataCol}=null, ${mimeCol}=null, updated_at=now() where bot_id=$1`,
        [botId],
      )
      await getPool().query(`notify pgrst, 'reload schema'`).catch(() => {})
      return res.status(200).json({ ok: true })
    }

    if (req.method === 'POST') {
      // overlay-only update
      if (body.overlay != null && body.kind == null) {
        const overlay = Math.max(0, Math.min(1, Number(body.overlay)))
        await getPool().query(
          `insert into report.bot_branding (bot_id, overlay, updated_at) values ($1,$2,now())
             on conflict (bot_id) do update set overlay=excluded.overlay, updated_at=now()`,
          [botId, overlay],
        )
        return res.status(200).json({ ok: true, overlay })
      }

      const kind = String(body.kind || '')
      if (kind !== 'logo' && kind !== 'background') return res.status(400).json({ error: 'kind required' })
      const mime = String(body.mime || '')
      if (!mime.startsWith('image/')) return res.status(400).json({ error: 'mime must be an image type' })
      const b64 = String(body.dataBase64 || '').replace(/^data:[^,]+,/, '')
      if (!b64) return res.status(400).json({ error: 'dataBase64 required' })
      const buf = Buffer.from(b64, 'base64')
      if (buf.length === 0) return res.status(400).json({ error: 'empty image' })
      if (buf.length > CAP[kind]) {
        return res.status(413).json({ error: `image too large (max ${Math.round(CAP[kind] / 1024 / 1024)}MB)` })
      }

      const dataCol = kind === 'logo' ? 'logo_data' : 'bg_data'
      const mimeCol = kind === 'logo' ? 'logo_mime' : 'bg_mime'
      await getPool().query(
        `insert into report.bot_branding (bot_id, ${dataCol}, ${mimeCol}, updated_at)
           values ($1, $2, $3, now())
         on conflict (bot_id) do update set ${dataCol}=excluded.${dataCol}, ${mimeCol}=excluded.${mimeCol}, updated_at=now()`,
        [botId, buf, mime],
      )
      return res.status(200).json({ ok: true, bytes: buf.length })
    }

    return res.status(405).json({ error: 'method not allowed' })
  } catch (e) {
    console.error('[api/branding] failed:', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'unknown error' })
  }
}
