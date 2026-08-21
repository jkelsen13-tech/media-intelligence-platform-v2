// Track B Step 3 item 1 — shared epistemic component kit.
// Pins the addendum's system-convention invariants on the pure seam
// (src/lib/epistemicModel.js) plus a static drift guard on the
// evidence-state bar component source.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  BADGE_STATES,
  badgeState,
  confidenceToBadgeState,
  TYPE_PILLS,
  typePillLabel,
  validateEvidenceCounts,
  missingScopeRequired,
  MISSING_SCOPE_FALLBACK,
  reviewedLine,
} from '../src/lib/epistemicModel.js'

const here = dirname(fileURLToPath(import.meta.url))
const componentSource = (name) =>
  readFileSync(join(here, '..', 'src', 'components', name), 'utf8')

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

// --- Badge system (addendum: icon + color + text, never color alone) ---

test('badge vocabulary is exactly the three locked states', () => {
  assert.deepEqual(Object.keys(BADGE_STATES).sort(), ['confirmed', 'contested', 'inferred'])
})

test('the three states are distinguishable without color (icon, dash, label)', () => {
  const c = badgeState('confirmed')
  const x = badgeState('contested')
  const i = badgeState('inferred')
  // Distinct text labels.
  assert.equal(c.label, 'Documented record')
  assert.equal(x.label, 'Contested')
  assert.equal(i.label, 'Inferred')
  // The documented-record state carries a check; the other two carry a question mark.
  assert.equal(c.icon, 'check')
  assert.equal(x.icon, 'question')
  assert.equal(i.icon, 'question')
  // The dashed treatment is load-bearing on Inferred and unique to it.
  assert.equal(c.dashed, false)
  assert.equal(x.dashed, false)
  assert.equal(i.dashed, true)
})

test('unknown badge state renders nothing (no masquerading)', () => {
  assert.equal(badgeState('corroborated'), null)
  assert.equal(badgeState('verified'), null)
  assert.equal(badgeState(''), null)
  assert.equal(badgeState(null), null)
  assert.equal(badgeState(undefined), null)
})

// --- Confidence mapping (contested is never inferred from confidence) ---

test('live confidence vocabulary maps onto badge states honestly', () => {
  assert.equal(confidenceToBadgeState('confirmed'), 'confirmed')
  assert.equal(confidenceToBadgeState('corroborated'), 'confirmed')
  assert.equal(confidenceToBadgeState('inferred'), 'inferred')
  assert.equal(confidenceToBadgeState('unknown-string'), null)
  assert.equal(confidenceToBadgeState(null), null)
  assert.equal(confidenceToBadgeState(undefined), null)
})

test('no confidence value ever maps to contested', () => {
  const probes = [
    'confirmed', 'corroborated', 'inferred', 'contested', 'disputed',
    'low', 'weak', '0', '', 'unverified', 'pending',
  ]
  for (const p of probes) {
    assert.notEqual(confidenceToBadgeState(p), 'contested', `probe: ${p}`)
  }
})

// --- Type pills (locked seven-type vocabulary + humanized fallback) ---

test('locked type-pill labels render verbatim', () => {
  assert.deepEqual(TYPE_PILLS, {
    legislation: 'Legislation',
    ruling: 'Ruling',
    incident: 'Incident',
    coverage: 'Coverage & review',
    policy: 'Policy',
    news: 'News',
    evidence: 'Evidence',
  })
  assert.equal(typePillLabel('coverage'), 'Coverage & review')
})

test('unknown types humanize rather than leak machine vocabulary', () => {
  assert.equal(typePillLabel('court_order'), 'Court order')
  assert.equal(typePillLabel('press-release'), 'Press release')
  assert.equal(typePillLabel(''), null)
  assert.equal(typePillLabel('___'), null)
  assert.equal(typePillLabel(null), null)
  assert.equal(typePillLabel(42), null)
})

// --- Evidence-state counts (never summed; guardrail 4 scope) ---

test('validateEvidenceCounts returns exactly the three counts', () => {
  const out = validateEvidenceCounts({ supporting: 7, contested: 3, missing: 4 })
  assert.deepEqual(Object.keys(out).sort(), ['contested', 'missing', 'supporting'])
  assert.deepEqual(out, { supporting: 7, contested: 3, missing: 4 })
  assert.ok(Object.isFrozen(out))
})

test('validateEvidenceCounts rejects malformed counts', () => {
  assert.throws(() => validateEvidenceCounts({ supporting: -1, contested: 0, missing: 0 }))
  assert.throws(() => validateEvidenceCounts({ supporting: 1.5, contested: 0, missing: 0 }))
  assert.throws(() => validateEvidenceCounts({ supporting: '7', contested: 0, missing: 0 }))
  assert.throws(() => validateEvidenceCounts({ supporting: 7, contested: 0 }))
  assert.throws(() => validateEvidenceCounts(null))
  assert.throws(() => validateEvidenceCounts(undefined))
})

test('guardrail 4: scope is required exactly when missing > 0', () => {
  assert.equal(missingScopeRequired(0), false)
  assert.equal(missingScopeRequired(1), true)
  assert.equal(missingScopeRequired(4), true)
  assert.equal(missingScopeRequired(undefined), false)
  assert.equal(missingScopeRequired('4'), false)
  assert.match(MISSING_SCOPE_FALLBACK, /not recorded/)
})

// --- Trust footer (no fabricated review dates) ---

test('reviewedLine omits the line when no review date exists', () => {
  assert.equal(reviewedLine('Aug 15, 2026'), 'Reviewed Aug 15, 2026')
  assert.equal(reviewedLine(null), null)
  assert.equal(reviewedLine(''), null)
  assert.equal(reviewedLine('   '), null)
  assert.equal(reviewedLine(undefined), null)
})

// --- Static drift guards on the component sources ---

test('EvidenceStateBar source can never sum the three counts', () => {
  // Amendment A applied to this component: no addition operator and no
  // "total"-style aggregate label may ever enter this file. (Comments are
  // stripped first so this guard text can state what it forbids.)
  const src = stripComments(componentSource('EvidenceStateBar.jsx'))
  assert.ok(!/\+/.test(src), 'addition operator found in EvidenceStateBar.jsx')
  assert.ok(!/\btotal\b/i.test(src), 'aggregate label found in EvidenceStateBar.jsx')
})

test('new kit files carry no hardcoded hex colors (Step 1 token bar)', () => {
  for (const name of [
    'StatusBadge.jsx',
    'EpistemicBanner.jsx',
    'EvidenceStateBar.jsx',
    'TrustFooter.jsx',
    'RemainingUncertaintyBlock.jsx',
    'TypePill.jsx',
    'SourceAttributionLine.jsx',
    'epistemic.css',
  ]) {
    const src = componentSource(name)
    assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(src), `hardcoded hex in ${name}`)
  }
})

test('Inferred dashed treatment is marked load-bearing in CSS', () => {
  const css = componentSource('epistemic.css')
  assert.match(css, /\.ep-badge-dashed\s+\.ep-badge-icon\s*\{[^}]*border-style:\s*dashed/)
  assert.match(css, /load-bearing/i)
})
