/**
 * Read-only data access for the AI layer. The model writes SQL; this module
 * makes sure that SQL can only ever READ, and only from the curated report
 * schema — never raw.* (which holds PII), never a write.
 *
 * Defense in depth:
 *   1. validateSql  — single statement, SELECT/WITH only, no DDL/DML keywords,
 *                     no raw.* / public.* (except public.bots)
 *   2. READ ONLY transaction + statement_timeout at the DB level
 *   3. enforced LIMIT
 *
 * A dedicated read-only Postgres role is the proper hardening (TODO); until
 * then these guards + the READ ONLY txn are the boundary.
 */
import pg from 'pg'

let pool: pg.Pool | null = null
/** Shared pg pool (report/raw DB creds). Reused by the transcript + branding
 *  endpoints so the connection config lives in exactly one place. */
export function getPool(): pg.Pool {
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

/**
 * Two-tier AI prompt layers from report._ai_prompts (bot_id 0 = MASTER/global,
 * else per-bot SLAVE). The table is `_`-prefixed so schemaCatalog() never exposes
 * it to the model. Reads are graceful — empty if the table is missing/unreachable,
 * so the AI always falls back to the fixed grounding in code.
 */
export interface PromptPair { master: string; slave: string }

export async function getPrompts(botId: number): Promise<PromptPair> {
  try {
    const { rows } = await getPool().query<{ bot_id: number; prompt: string }>(
      `select bot_id, prompt from report._ai_prompts where bot_id in (0, $1)`,
      [botId],
    )
    return {
      master: rows.find((r) => r.bot_id === 0)?.prompt?.trim() || '',
      slave: rows.find((r) => r.bot_id === botId)?.prompt?.trim() || '',
    }
  } catch {
    return { master: '', slave: '' }
  }
}

/** Resort IANA timezone for a bot (report.bot_timezone). Defaults to
 *  'America/Denver' when unmapped/unreachable so date logic never breaks. */
export async function getBotTimezone(botId: number): Promise<string> {
  try {
    const { rows } = await getPool().query<{ tz: string }>(
      `select tz from report.bot_timezone where bot_id = $1`, [botId],
    )
    return rows[0]?.tz?.trim() || 'America/Denver'
  } catch {
    return 'America/Denver'
  }
}

/** The date range this bot actually has enriched data for (min/max day on
 *  conversation_intel) — so the AI can honestly say "I only have data from X"
 *  instead of reporting a misleading zero for out-of-range dates. Nulls when the
 *  bot has no enriched data yet. */
export async function getBotDataRange(botId: number): Promise<{ from: string | null; to: string | null }> {
  try {
    const { rows } = await getPool().query<{ mn: string | null; mx: string | null }>(
      `select min(day)::text as mn, max(day)::text as mx from report.conversation_intel where bot_id = $1`,
      [botId],
    )
    return { from: rows[0]?.mn ?? null, to: rows[0]?.mx ?? null }
  } catch {
    return { from: null, to: null }
  }
}

/** Upsert a prompt layer. botId 0 = master (global); else per-bot slave. */
export async function upsertPrompt(botId: number, prompt: string): Promise<void> {
  await getPool().query(
    `insert into report._ai_prompts (bot_id, prompt, updated_at) values ($1, $2, now())
       on conflict (bot_id) do update set prompt = excluded.prompt, updated_at = now()`,
    [botId, String(prompt || '').slice(0, 8000)],
  )
}

const WRITE_KW = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|call|do|merge|vacuum|reindex|comment|refresh)\b/i

export function validateSql(sql: string): { ok: boolean; reason?: string } {
  const s = sql.trim().replace(/;+\s*$/, '')
  if (!s) return { ok: false, reason: 'empty' }
  if (s.includes(';')) return { ok: false, reason: 'multiple statements' }
  if (!/^\s*(select|with)\b/i.test(s)) return { ok: false, reason: 'must start with SELECT or WITH' }
  if (WRITE_KW.test(s)) return { ok: false, reason: 'write/DDL keyword present' }
  if (/\braw\s*\./i.test(s)) return { ok: false, reason: 'raw schema (PII) is off-limits' }
  if (/\bpublic\s*\.(?!bots\b)/i.test(s)) return { ok: false, reason: 'restricted schema' }
  return { ok: true }
}

export async function runReadOnly<T = Record<string, unknown>>(sql: string, rowLimit = 500): Promise<T[]> {
  const v = validateSql(sql)
  if (!v.ok) throw new Error(`rejected SQL: ${v.reason}`)
  const capped = /\blimit\s+\d+\s*$/i.test(sql.trim().replace(/;+\s*$/, ''))
    ? sql.trim().replace(/;+\s*$/, '')
    : `${sql.trim().replace(/;+\s*$/, '')} limit ${rowLimit}`

  const client = await getPool().connect()
  try {
    await client.query('begin read only')
    await client.query("set local statement_timeout = '8000ms'")
    const res = await client.query(capped)
    await client.query('rollback')
    return res.rows as T[]
  } catch (e) {
    try { await client.query('rollback') } catch { /* ignore */ }
    throw e
  } finally {
    client.release()
  }
}

/**
 * Column catalog for the report schema (covers tables, views AND matviews via
 * pg_catalog — information_schema omits matviews). This is what the model sees;
 * it can only query what's listed here.
 */
export async function schemaCatalog(): Promise<string> {
  const { rows } = await getPool().query<{ rel: string; col: string; typ: string }>(`
    select c.relname as rel, a.attname as col, format_type(a.atttypid, a.atttypmod) as typ
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid
     where n.nspname = 'report'
       and c.relkind in ('r', 'v', 'm')
       and a.attnum > 0 and not a.attisdropped
       and c.relname not like '\\_%'
     order by c.relname, a.attnum`)
  const byRel = new Map<string, string[]>()
  for (const r of rows) {
    if (!byRel.has(r.rel)) byRel.set(r.rel, [])
    byRel.get(r.rel)!.push(`${r.col} ${r.typ}`)
  }
  return [...byRel.entries()].map(([rel, cols]) => `report.${rel}(${cols.join(', ')})`).join('\n')
}
