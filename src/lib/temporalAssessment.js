// R4.5 Step 8 — DISPLAY-only Temporal Intelligence.
//
// Reads the shared canonical assessment from public.pipeline_config.
// Never recomputes from News V/F, Source Comparison lagHours, or Arcs
// CoverageGapBar. Never invents expected-range, weather, or a truth score.
//
// Contract: MIP_TEMPORAL_FEATURE_CONTRACT_v0.1
// SHA-256 59a5c56c7ce78bbd8b712f6e06781a47fdc1540bea73e1ec30ae8fb64e399605
//
// Cleveland composer pin (CoS 2026-09-03): sha256 of postgres jsonb::text
// for key temporal.assessment.v0.1.acc55cb2-5ac2-4aed-be36-3f576d2bc443
// must equal CLEVELAND_ASSESSMENT_COMPOSER_SHA256. Any other jsonb fails
// closed to "temporal assessment unavailable".

import { resolveWorldViewClient } from './spatialProjection.js'

export const TEMPORAL_FEATURE_CONTRACT_ID = 'MIP_TEMPORAL_FEATURE_CONTRACT_v0.1'
export const TEMPORAL_FEATURE_CONTRACT_SHA256 =
  '59a5c56c7ce78bbd8b712f6e06781a47fdc1540bea73e1ec30ae8fb64e399605'

export const TEMPORAL_ASSESSMENT_VERSION = 'temporal_assessment_v0.1'
export const TEMPORAL_ASSESSMENT_KEY_PREFIX = 'temporal.assessment.v0.1.'

export const CLEVELAND_CANONICAL_EVENT_ID = 'acc55cb2-5ac2-4aed-be36-3f576d2bc443'
export const CLEVELAND_ASSESSMENT_KEY = `${TEMPORAL_ASSESSMENT_KEY_PREFIX}${CLEVELAND_CANONICAL_EVENT_ID}`
export const CLEVELAND_ASSESSMENT_COMPOSER_SHA256 =
  'cbd97108f963fc2dcbe6e91d2ca02a79bd95649037369f1dd67c9bc8a00cc21e'

// Parent §16 allowed display phrases. No other verdict copy may render.
export const SECTION16_DISPLAY_PHRASES = Object.freeze([
  'within expected range',
  'above expected range',
  'below expected range',
  'cross-signal divergence detected',
  'regime change detected',
  'insufficient history',
  'model disagreement',
  'temporal assessment unavailable',
])

const FORBIDDEN_COPY = Object.freeze([
  'probably false',
  'suspicious source',
  'deceptive trend',
  'verified true',
])

const UNAVAILABLE_PHRASE = 'temporal assessment unavailable'
const INSUFFICIENT_HISTORY_PHRASE = 'insufficient history'

export function temporalAssessmentConfigKey(canonicalEventId) {
  if (!canonicalEventId) return null
  return `${TEMPORAL_ASSESSMENT_KEY_PREFIX}${canonicalEventId}`
}

export function canonicalEventIdFromWorldView(selected, visibleRow) {
  return (
    visibleRow?.subject_graph_node_id ??
    selected?.subject_graph_node_id ??
    selected?.id ??
    null
  )
}

// Postgres jsonb::text spacing: no space after `{`/`[`, `: ` and `, ` separators.
export function encodePostgresJsonbText(value) {
  if (value === null) return 'null'
  const t = typeof value
  if (t === 'number' || t === 'boolean') return JSON.stringify(value)
  if (t === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    return `[${value.map(encodePostgresJsonbText).join(', ')}]`
  }
  if (t === 'object') {
    const keys = Object.keys(value)
    if (keys.length === 0) return '{}'
    return `{${keys.map((k) => `${JSON.stringify(k)}: ${encodePostgresJsonbText(value[k])}`).join(', ')}}`
  }
  return 'null'
}

export async function sha256HexUtf8(text) {
  const bytes = new TextEncoder().encode(text)
  if (globalThis.crypto?.subtle) {
    const buf = await globalThis.crypto.subtle.digest('SHA-256', bytes)
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  const { createHash } = await import('node:crypto')
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function allowlistedPhrase(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!SECTION16_DISPLAY_PHRASES.includes(trimmed)) return null
  const lower = trimmed.toLowerCase()
  if (FORBIDDEN_COPY.some((p) => lower.includes(p))) return null
  return trimmed
}

function unavailableView(reason, extras = {}) {
  return Object.freeze({
    status: 'unavailable',
    reason,
    key: extras.key ?? null,
    canonicalEventId: extras.canonicalEventId ?? null,
    sha256: extras.sha256 ?? null,
    panel: UNAVAILABLE_PHRASE,
    copy: UNAVAILABLE_PHRASE,
    displayStatus: null,
    assessmentVersion: extras.assessmentVersion ?? null,
    productionModel: null,
    expectedRange: null,
  })
}

export function temporalAssessmentViewFromValue(value, { key = null, sha256 = null } = {}) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return unavailableView('unreadable', { key, sha256 })
  }
  if (Object.hasOwn(value, 'truth_probability') || Object.hasOwn(value.display ?? {}, 'truth_probability')) {
    return unavailableView('forbidden_field', { key, sha256 })
  }
  const display = value.display
  if (!display || typeof display !== 'object' || display.status == null || String(display.status).trim() === '') {
    return unavailableView('missing_display_status', { key, sha256 })
  }
  const panel = allowlistedPhrase(display.panel) ?? UNAVAILABLE_PHRASE
  const copy = allowlistedPhrase(display.copy)
  if (!copy) return unavailableView('copy_not_section16', { key, sha256 })
  return Object.freeze({
    status: 'ok',
    reason: null,
    key,
    canonicalEventId: value.canonical_event_id ?? null,
    sha256,
    panel,
    copy,
    displayStatus: String(display.status),
    assessmentVersion: value.assessment_version ?? null,
    productionModel: value.provenance?.production_model ?? null,
    expectedRange: null,
  })
}

export async function pinFetchedAssessment(value, key, { hashFn } = {}) {
  try {
    const text = encodePostgresJsonbText(value)
    const digest = await (hashFn ?? sha256HexUtf8)(text)
    if (digest !== CLEVELAND_ASSESSMENT_COMPOSER_SHA256) {
      return unavailableView('sha_mismatch', { key, sha256: digest })
    }
    return temporalAssessmentViewFromValue(value, { key, sha256: digest })
  } catch {
    return unavailableView('hash_unavailable', { key })
  }
}

/**
 * SELECT-only read of the shared assessment. Same V2 origin allowlist as
 * World View. Injected test clients with no URL are not origin-checked.
 */
export async function loadTemporalAssessment(canonicalEventId, options = {}) {
  const key = temporalAssessmentConfigKey(canonicalEventId)
  if (!key) return unavailableView('no_event')

  const resolved = resolveWorldViewClient(options)
  if (!resolved.client) {
    return unavailableView(resolved.reason ?? 'client_not_configured', { key, canonicalEventId })
  }

  let row
  try {
    const { data, error } = await resolved.client
      .from('pipeline_config')
      .select('key, value')
      .eq('key', key)
      .maybeSingle()
    if (error) return unavailableView('read_error', { key, canonicalEventId })
    row = data
  } catch {
    return unavailableView('read_error', { key, canonicalEventId })
  }

  if (!row || row.value == null) return unavailableView('missing_row', { key, canonicalEventId })
  return pinFetchedAssessment(row.value, key)
}

export function temporalAssessmentUnavailableCopy(reason) {
  return UNAVAILABLE_PHRASE
}

export const TEMPORAL_N1_HONEST_COPY = Object.freeze({
  copy: INSUFFICIENT_HISTORY_PHRASE,
  panel: UNAVAILABLE_PHRASE,
})
