/**
 * GET /api/branding-image?botId=&kind=logo|background[&v=]  — serves a bot's
 * uploaded branding image from report.bot_branding (bytes live in Postgres, not
 * reachable by the anon key). Long-cached + versioned by `v` (the row's
 * updated-at epoch) so a new upload busts the cache.
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const botId = Number(req.query.botId)
    const kind = String(req.query.kind || '')
    if (!botId || (kind !== 'logo' && kind !== 'background')) {
      return res.status(400).json({ error: 'botId and kind (logo|background) are required' })
    }
    const dataCol = kind === 'logo' ? 'logo_data' : 'bg_data'
    const mimeCol = kind === 'logo' ? 'logo_mime' : 'bg_mime'

    const { rows } = await getPool().query(
      `select ${dataCol} as data, ${mimeCol} as mime from report.bot_branding where bot_id = $1`,
      [botId],
    )
    const row = rows[0]
    if (!row || !row.data) return res.status(404).json({ error: 'no image' })

    res.setHeader('Content-Type', row.mime || 'image/png')
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    return res.status(200).send(row.data as Buffer)
  } catch (e) {
    console.error('[api/branding-image] failed:', e)
    return res.status(500).json({ error: e instanceof Error ? e.message : 'unknown error' })
  }
}
