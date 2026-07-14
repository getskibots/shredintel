/**
 * FREERIDE — the query engine.
 *
 * Turns a bounded slice request into ONE safe, parameterized SQL query over the
 * fact table. The dimension columns and measure expressions come ONLY from the
 * trusted cube catalog (src/lib/cube.ts), never from user or AI text; filter
 * VALUES are always bound parameters ($n). So a slice can never be malformed or
 * injected — the AI's only freedom is choosing which catalog keys to combine.
 * That is what makes every number correct-by-construction and reproducible.
 *
 * Date range filters on `day` (UTC) to tie out exactly with the dashboard, which
 * filters the same column. Time FACES (hour/dow/…) group on their resort-local
 * columns; that is display grouping, not the range filter.
 */
import { DIM_BY_KEY, MEASURE_BY_KEY, CUBE_FACT, type Dimension } from '../../src/lib/cube.js'
import { getPool } from './db.js'

export interface SliceRequest {
  botId: number
  from: string                       // 'YYYY-MM-DD' inclusive (UTC day)
  to: string                         // 'YYYY-MM-DD' inclusive
  source?: 'chat' | 'voice'
  dims: string[]                     // 1-2 dimension keys
  measure?: string                   // measure key (default 'conversations')
  filters?: Record<string, string>   // dimKey -> exact value (bound as a param)
  limit?: number                     // row cap (default 100, max 500)
}

export interface SliceSpec {
  source: 'chat' | 'voice'
  from: string
  to: string
  dims: { key: string; label: string }[]
  measure: { key: string; label: string; format: string }
  filters: { key: string; label: string; value: string }[]
}

export interface BuiltSlice { sql: string; params: unknown[]; spec: SliceSpec }
export interface SliceResult extends BuiltSlice { rows: Record<string, string | number>[] }

const ISO = /^\d{4}-\d{2}-\d{2}$/

/**
 * Pure: validate + compile a slice request into parameterized SQL. Throws on any
 * key not in the catalog, so nothing unbounded ever reaches the DB. Deterministic
 * — the same request always yields the same SQL, which is what makes it testable.
 */
export function buildSlice(req: SliceRequest): BuiltSlice {
  const source: 'chat' | 'voice' = req.source === 'voice' ? 'voice' : 'chat'
  const fact = CUBE_FACT[source]

  if (!Number.isInteger(req.botId) || req.botId <= 0) throw new Error('bad botId')
  if (!ISO.test(req.from) || !ISO.test(req.to) || req.from > req.to) throw new Error('bad date range')

  const dimKeys = (req.dims || []).slice(0, 2)
  if (dimKeys.length === 0) throw new Error('at least one dimension is required')
  const dims: Dimension[] = dimKeys.map((k) => {
    const d = DIM_BY_KEY[k]
    if (!d) throw new Error(`unknown dimension: ${k}`)
    return d
  })

  const measure = MEASURE_BY_KEY[req.measure || 'conversations']
  if (!measure) throw new Error(`unknown measure: ${req.measure}`)

  // $1 botId, $2 from, $3 to, then one bound param per filter value.
  const params: unknown[] = [req.botId, req.from, req.to]
  const where: string[] = ['bot_id = $1', 'substantive', 'day between $2 and $3']
  const filtersSpec: SliceSpec['filters'] = []
  for (const [k, v] of Object.entries(req.filters || {})) {
    const d = DIM_BY_KEY[k]
    if (!d) throw new Error(`unknown filter dimension: ${k}`)
    params.push(v)
    where.push(`${d.column} = $${params.length}`)
    filtersSpec.push({ key: k, label: d.label, value: v })
  }
  // Drop null buckets on the charted faces (a null bar is noise).
  for (const d of dims) where.push(`${d.column} is not null`)

  const selectDims = dims.map((d) => `${d.column} as "${d.key}"`).join(', ')
  const groupBy = dims.map((d) => d.column).join(', ')
  // Time faces read chronologically; every other face reads ranked by the measure.
  const primary = dims[0]
  const orderBy = primary.group === 'time' ? `"${primary.key}"` : `"value" desc`
  const limit = Math.min(Math.max(req.limit ?? 100, 1), 500)

  const sql =
    `select ${selectDims}, ${measure.expr} as "value"\n` +
    `  from report.${fact}\n` +
    ` where ${where.join(' and ')}\n` +
    ` group by ${groupBy}\n` +
    ` order by ${orderBy}\n` +
    ` limit ${limit}`

  const spec: SliceSpec = {
    source,
    from: req.from,
    to: req.to,
    dims: dims.map((d) => ({ key: d.key, label: d.label })),
    measure: { key: measure.key, label: measure.label, format: measure.format },
    filters: filtersSpec,
  }
  return { sql, params, spec }
}

/** Execute a slice: build, then run read-only with a timeout. */
export async function runSlice(req: SliceRequest): Promise<SliceResult> {
  const built = buildSlice(req)
  const client = await getPool().connect()
  try {
    await client.query('begin read only')
    await client.query("set local statement_timeout = '8000ms'")
    const res = await client.query(built.sql, built.params)
    await client.query('rollback')
    return { ...built, rows: res.rows as Record<string, string | number>[] }
  } catch (e) {
    try { await client.query('rollback') } catch { /* ignore */ }
    throw e
  } finally {
    client.release()
  }
}
