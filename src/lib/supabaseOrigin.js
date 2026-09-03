// Hard origin lock for the MIP browser client.
//
// Supabase API origin is V2 only:
//   https://qikvmopbtijoebdqosyq.supabase.co
//
// Confirmed live client page origin (Trust wiring #1, independently verified
// 2026-09-03 — bundle asset talks to V2 once, leftover supabase hosts 0):
//   https://jkelsen13-tech.github.io/media-intelligence-platform-v2/
// World View treats that Pages host as the V2 client origin. It is not a
// PostgREST endpoint; createClient still targets V2 only.
//
// Missing, empty, leftover Manus / paused-original / any other supabase.co
// project, http, extra path/query, or any other github.io site fail closed.

export const V2_SUPABASE_REF = 'qikvmopbtijoebdqosyq'
export const V2_SUPABASE_HOST = `${V2_SUPABASE_REF}.supabase.co`
export const V2_SUPABASE_URL = `https://${V2_SUPABASE_HOST}`

export const V2_CLIENT_PAGE_HOST = 'jkelsen13-tech.github.io'
export const V2_CLIENT_PAGE_PATH = '/media-intelligence-platform-v2'
export const V2_CLIENT_PAGE_ORIGIN = `https://${V2_CLIENT_PAGE_HOST}${V2_CLIENT_PAGE_PATH}`

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

/**
 * Confirmed GitHub Pages client origin for this repo's V2 bundle.
 * Path must be /media-intelligence-platform-v2 or a page under it.
 */
export function isConfirmedV2ClientPageOrigin(raw) {
  if (typeof raw !== 'string') return false
  let parsed
  try {
    parsed = new URL(raw.trim())
  } catch {
    return false
  }
  const hostname = String(parsed.hostname ?? '').toLowerCase()
  const path = parsed.pathname.replace(/\/+$/, '') || '/'
  const portOk = parsed.port === '' || parsed.port === '443'
  const noUser = parsed.username === '' && parsed.password === ''
  if (parsed.protocol !== 'https:' || hostname !== V2_CLIENT_PAGE_HOST || !portOk || !noUser) {
    return false
  }
  return path === V2_CLIENT_PAGE_PATH || path.startsWith(`${V2_CLIENT_PAGE_PATH}/`)
}

/**
 * World View client origin: V2 API or the confirmed Pages client host.
 * Always returns the canonical V2 API URL on success so fetches never
 * target github.io or a leftover supabase project.
 */
export function resolveV2ClientOrigin(raw) {
  const api = resolveV2SupabaseUrl(raw)
  if (api.ok || api.reason === 'missing' || api.reason === 'empty') return api
  if (isConfirmedV2ClientPageOrigin(raw)) {
    return { ok: true, url: V2_SUPABASE_URL, reason: null }
  }
  return { ok: false, url: null, reason: 'origin_not_v2' }
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
  const origin = resolveV2ClientOrigin(url)
  return origin.ok ? null : 'origin_not_v2'
}
