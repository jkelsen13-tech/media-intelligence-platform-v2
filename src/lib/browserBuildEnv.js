// Build-only Vite boundary. No environment files are loaded here; Vite supplies
// its final exposed values after applying mode, envDir, prefix and process rules.
import { isSafeSupabaseBrowserKey } from './supabaseOrigin.js'

export const BROWSER_KEY_ENV_REFUSED = 'MIP_BROWSER_KEY_ENV_REFUSED'
export const BROWSER_BUILD_DEBUG_REFUSED = 'MIP_BROWSER_BUILD_DEBUG_REFUSED'
const KEY = 'VITE_SUPABASE_ANON_KEY'
const DEFINE_KEY = `import.meta.env.${KEY}`

function refuse(code) {
  const error = new Error(code)
  // Vite CLI displays stacks. Retain only the fixed code, never input values,
  // parser diagnostics, paths, causes or resolved configuration in this error.
  error.stack = code
  throw error
}

function assertPublicOrMissing(value) {
  if (value === undefined || value === null || value === '') return
  if (!isSafeSupabaseBrowserKey(value)) refuse(BROWSER_KEY_ENV_REFUSED)
}

function assertDefine(define) {
  if (!define) return
  // The production configuration uses direct env references. Whole-object
  // replacement is outside this contract; do not evaluate arbitrary code.
  if (Object.hasOwn(define, 'import.meta.env')) refuse(BROWSER_KEY_ENV_REFUSED)
  if (!Object.hasOwn(define, DEFINE_KEY)) return
  const raw = define[DEFINE_KEY]
  let value
  try { value = typeof raw === 'string' && raw !== 'undefined' ? JSON.parse(raw) : raw === 'undefined' ? undefined : raw }
  catch { refuse(BROWSER_KEY_ENV_REFUSED) }
  assertPublicOrMissing(value)
}

export function assertSafeBrowserBuildEnv(config) {
  // Validate the exposed env even when a named JS define replaces it: HTML
  // substitutions can still emit the original resolved env value.
  assertPublicOrMissing(config.env?.[KEY])
  assertDefine(config.define)
  assertDefine(config.environments?.client?.define)
}

export function browserKeyBuildGate() {
  return {
    name: 'mip-browser-key-build-gate',
    apply: 'build',
    enforce: 'pre',
    config() {
      // Vite's loadEnv DEBUG output precedes configResolved. Conservatively
      // refuse diagnostic builds before env loading rather than allow a logger
      // to print a privileged value before the ordinary validation boundary.
      if (process.env.DEBUG) refuse(BROWSER_BUILD_DEBUG_REFUSED)
    },
    configResolved(config) { assertSafeBrowserBuildEnv(config) },
  }
}
