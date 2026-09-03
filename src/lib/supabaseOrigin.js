// Hard origin lock for the MIP browser client.
//
// World View and the account/supabase client talk ONLY to V2:
//   https://qikvmopbtijoebdqosyq.supabase.co
//
// Missing, empty, or any other host (GitHub Pages github.io including
// /media-intelligence-platform-v2/, Manus, the paused original, any other
// supabase.co project, http, extra path/query) fails closed. The canonical
// URL is returned on success so createClient never inherits a raw lookalike.
//
// Leftover host strings elsewhere in this tree are not an origin allowlist.
// Workflow / Pages URL replacement is a separate Trust wiring concern.

export const V2_SUPABASE_REF = 'qikvmopbtijoebdqosyq'
export const V2_SUPABASE_HOST = `${V2_SUPABASE_REF}.supabase.co`
export const V2_SUPABASE_URL = `https://${V2_SUPABASE_HOST}`

export function readViteSupabaseUrl() {
  try {
    return import.meta.env?.VITE_SUPABASE_URL
  } catch {
    return undefined
  }
}

export function readViteSupabaseAnonKey() {
  try {
    const raw = import.meta.env?.VITE_SUPABASE_ANON_KEY
    return typeof raw === 'string' ? raw.trim() : ''
  } catch {
    return ''
  }
}

/**
 * Allowlist V2 only.
 * @returns {{ ok: true, url: string, reason: null } | { ok: false, url: null, reason: 'missing' | 'empty' | 'origin_not_v2' }}
 */
export function resolveV2SupabaseUrl(raw) {
  if (raw == null) return { ok: false, url: null, reason: 'missing' }
  if (typeof raw !== 'string') return { ok: false, url: null, reason: 'origin_not_v2' }
  const trimmed = raw.trim()
  if (trimmed === '') return { ok: false, url: null, reason: 'empty' }

  let parsed
  try {
    parsed = new URL(trimmed)
  } catch {
    return { ok: false, url: null, reason: 'origin_not_v2' }
  }

  const hostname = String(parsed.hostname ?? '').toLowerCase()
  const portOk = parsed.port === '' || parsed.port === '443'
  const pathOk = parsed.pathname === '' || parsed.pathname === '/'
  const noUser = parsed.username === '' && parsed.password === ''
  if (
    parsed.protocol !== 'https:' ||
    hostname !== V2_SUPABASE_HOST ||
    !portOk ||
    !pathOk ||
    parsed.search !== '' ||
    parsed.hash !== '' ||
    !noUser
  ) {
    return { ok: false, url: null, reason: 'origin_not_v2' }
  }

  return { ok: true, url: V2_SUPABASE_URL, reason: null }
}

/** Best-effort URL on a supabase-js client or test fake. Null if unknown. */
export function supabaseClientUrl(client) {
  if (!client || typeof client !== 'object') return null
  if (typeof client.supabaseUrl === 'string') return client.supabaseUrl
  const restUrl = client.rest?.url
  if (typeof restUrl === 'string') {
    try {
      const u = new URL(restUrl)
      return `${u.protocol}//${u.host}`
    } catch {
      return restUrl
    }
  }
  return null
}

/**
 * When a client object carries a URL, it must be V2. Fakes with no URL
 * (unit tests) are not origin-checked here.
 * @returns {null | 'origin_not_v2'}
 */
export function rejectNonV2Client(client) {
  const url = supabaseClientUrl(client)
  if (url == null) return null
  const origin = resolveV2SupabaseUrl(url)
  return origin.ok ? null : 'origin_not_v2'
}
