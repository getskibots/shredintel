import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const forceFixtures = import.meta.env.VITE_USE_FIXTURES === 'true'

/**
 * True when the app can talk to Supabase (URL + anon key both set,
 * and fixtures aren't forced). Components use this to decide whether
 * to try live queries or fall back to fixtures.
 */
export const supabaseConfigured: boolean = Boolean(url && anonKey) && !forceFixtures

/**
 * Lazy singleton. Returns null when unconfigured (so callers can fall
 * back to fixtures without crashing).
 */
let client: SupabaseClient | null = null
export function getSupabase(): SupabaseClient | null {
  if (!supabaseConfigured) return null
  if (!client) client = createClient(url!, anonKey!, { auth: { persistSession: false } })
  return client
}
