// G2 — vocabulary drift guards: the locked shared uncertainty vocabulary must
// not silently diverge. These tests fail FIRST if (a) the fixture and the
// single-source document disagree, (b) a legacy mapping path changes, (c) the
// precedence rules are weakened, or (d) a rival definition appears elsewhere.
// Lock: docs/UNCERTAINTY_VOCABULARY.md @ G2-locked-2026-07-28, owner-countersigned.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import * as V from './harness/vocabulary.mjs'

const vocab = V.loadVocabulary()
const doc = readFileSync(join(V.repoRoot, 'docs/UNCERTAINTY_VOCABULARY.md'), 'utf8')
const mappingCases = JSON.parse(readFileSync(join(V.repoRoot, 'tests/golden/fixtures/uncertainty_mapping_cases.json'), 'utf8'))

test('fixture: six axes, 24 levels, precedence P1–P5, >=3 disagreement cases', () => {
  assert.deepEqual(Object.keys(vocab.axes).sort(), [
    'authentication', 'evidence_strength', 'relationship_type',
    'remaining_uncertainty', 'review_status', 'source_reliability',
  ])
  const total = Object.values(vocab.axes).reduce((n, a) => n + a.levels.length, 0)
  assert.equal(total, 24)
  assert.deepEqual(Object.keys(vocab.precedence), ['P1', 'P2', 'P3', 'P4', 'P5'])
  assert.ok(vocab.disagreement_cases.length >= 3)
})

test('single source: doc declares itself and names the fixture', () => {
  assert.match(doc, /[Ss]ingle source of truth/)
  assert.ok(doc.includes('tests/golden/fixtures/uncertainty_vocabulary.json'))
  assert.equal(vocab.single_source, 'docs/UNCERTAINTY_VOCABULARY.md')
})

test('doc/fixture sync: every level appears in the doc, in fixture order per axis', () => {
  for (const [axisName, axis] of Object.entries(vocab.axes)) {
    let last = -1
    for (const level of axis.levels) {
      const i = doc.indexOf('`' + level + '`')
      assert.ok(i !== -1, `level ${level} (${axisName}) missing from single-source doc`)
      assert.ok(i > last, `level ${level} (${axisName}) out of order in doc`)
      last = i
    }
    if (axis.level_names) {
      for (const [level, name] of Object.entries(axis.level_names)) {
        assert.ok(doc.includes(name), `level name ${level}="${name}" missing from doc`)
      }
    }
  }
})

test('doc/fixture sync: worked-example row ids in fixture are cited in the doc', () => {
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  let cited = 0
  for (const axis of Object.values(vocab.axes)) {
    for (const examples of Object.values(axis.worked_examples)) {
      for (const ex of examples) {
        for (const id of ex.split('/')) {
          if (uuidRe.test(id)) {
            assert.ok(doc.includes(id), `worked-example id ${id} not cited in doc`)
            cited++
          }
        }
      }
    }
  }
  assert.ok(cited >= 20, `expected >=20 cited ids, found ${cited}`)
})

test('legacy mapping cases: every input maps to its locked level (or RETIRED)', () => {
  for (const c of mappingCases.cases) {
    const fn = V[c.fn]
    assert.equal(typeof fn, 'function', `harness missing ${c.fn}`)
    assert.deepEqual(fn(...c.input), c.expect, `${c.fn}(${JSON.stringify(c.input)}) -> expected ${JSON.stringify(c.expect)} (mapping table row ${c.source_row})`)
  }
})

test('precedence P2: reliable source can never raise weak evidence (case 1)', () => {
  const p = V.resolvePresentation({ authentication: 'A3', evidence_strength: 'E4', source_reliability: 'R1', review_status: 'V0', remaining_uncertainty: 'U1' })
  assert.equal(p.standing, 'E4')
  assert.equal(p.governing, 'evidence_strength')
  assert.ok(p.reliableSourceNote, 'R1 note lost')
  assert.notEqual(p.standing, 'R1')
  assert.ok(p.alleged)
  assert.ok(p.uncertaintyShown)
})

test('precedence P2: causal language with unreviewed authentication stays alleged (case 2)', () => {
  const p = V.resolvePresentation({ authentication: 'A2', evidence_strength: 'E3', source_reliability: 'R2', review_status: 'V0', remaining_uncertainty: 'U0' })
  assert.equal(p.standing, 'E3')
  assert.ok(p.alleged, 'unreviewed provenance presented as established')
})

test('precedence P3+P4: reviewed label never suppresses remaining uncertainty (case 3)', () => {
  const p = V.resolvePresentation({ authentication: 'A1', evidence_strength: 'E2', source_reliability: 'R1', review_status: 'V2', remaining_uncertainty: 'U1' })
  assert.deepEqual(p.labels, ['reviewed'])
  assert.ok(p.uncertaintyShown, 'U1 suppressed by V2 label')
  assert.equal(p.standing, 'E2')
})

test('precedence P4: U3 blocks settled presentation regardless of other axes', () => {
  const p = V.resolvePresentation({ authentication: 'A1', evidence_strength: 'E1', source_reliability: 'R1', review_status: 'V3', remaining_uncertainty: 'U3' })
  assert.ok(p.settledBlocked)
  assert.ok(p.uncertaintyShown)
})

test('no master score: resolvePresentation never returns a numeric composite', () => {
  const p = V.resolvePresentation({ authentication: 'A1', evidence_strength: 'E1', source_reliability: 'R1', review_status: 'V3', remaining_uncertainty: 'U0' })
  for (const v of Object.values(p)) assert.ok(typeof v !== 'number', 'numeric score leaked into presentation')
})

test('no rival definition: level tokens appear only in G2 docs and golden suite files', () => {
  const allow = new Set([
    'UNCERTAINTY_VOCABULARY.md', 'UNCERTAINTY_LEGACY_MAPPING.md',
    'G2_DECISION_LOG.md', 'G2_FIXTURE_EXTENSION_PROPOSAL.md',
    // Verbatim owner attachment uses product/release labels, not rival uncertainty definitions.
    // Its header explicitly defers vocabulary definitions to the single-source document.
    'MIP_GOVERNING_WORK_PLAN_2026-09-07.md',
  ])
  const docsDir = join(V.repoRoot, 'docs')
  const tokenRe = /\b(R1|R2|R3|R4|E1|E2|E3|E4|A1|A2|A3|A4|V0|V1|V2|V3|U0|U1|U2|U3|RT-causal|RT-sequence|RT-actor|RT-constrained_by)\b/
  for (const f of readdirSync(docsDir)) {
    if (!f.endsWith('.md') || allow.has(f)) continue
    const body = readFileSync(join(docsDir, f), 'utf8')
    assert.ok(!tokenRe.test(body), `rival vocabulary use in docs/${f} — cite UNCERTAINTY_VOCABULARY.md instead`)
  }
})

test('retired signals stay retired in golden docs (weight words are never reintroduced as levels)', () => {
  assert.equal(V.mapEdgeWeight('heavy'), 'RETIRED')
  assert.equal(V.mapEdgeWeight('medium'), 'RETIRED')
  assert.equal(V.mapEdgeWeight('light'), 'RETIRED')
  // legend-only types must remain absent from the locked RT level set
  const rt = vocab.axes.relationship_type.levels
  for (const retired of ['financial', 'conflict', 'documentary', 'sourced', 'MIP-hypothesis']) {
    assert.ok(!rt.some((l) => l.toLowerCase().includes(retired.toLowerCase())), `retired legend type ${retired} reintroduced`)
  }
})

test('mutation proof: tampered fixture level order FAILS the sync test', () => {
  const tampered = JSON.parse(JSON.stringify(vocab))
  tampered.axes.source_reliability.levels = ['R4', 'R3', 'R2', 'R1']
  let last = -1
  let inOrder = true
  for (const level of tampered.axes.source_reliability.levels) {
    const i = doc.indexOf('`' + level + '`')
    if (i <= last) { inOrder = false; break }
    last = i
  }
  assert.equal(inOrder, false, 'tampered order was not detected — guard is toothless')
})

test('archived owner work plan preserves the shared vocabulary authority', () => {
  const plan = readFileSync(join(V.repoRoot, 'docs/MIP_GOVERNING_WORK_PLAN_2026-09-07.md'), 'utf8')
  assert.ok(plan.includes('Uncertainty definitions remain in [the single-source vocabulary](UNCERTAINTY_VOCABULARY.md).'))
  assert.ok(plan.includes('Text below preserves the document'))
})
