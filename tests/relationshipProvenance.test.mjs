import test from 'node:test'
import assert from 'node:assert/strict'

import { buildRelationshipPanelView } from '../src/lib/relationshipProvenance.js'

// A sourced, human-reviewed edge (mirrors the 3 live rows with real sourcing).
const SOURCED_EDGE = {
  id: 'a209ab4f-3345-4c9c-9f3e-845c51d3ae77',
  type: 'actor',
  label: 'issued by',
  doc_strength: 'documented',
  signal_source: 'citation',
  claimed_by: 'source_document',
  reliability: 1,
}
const SOURCED_EXPLANATION = {
  review_status: 'reviewed',
  relationship_type: 'inferred',
  source_ids: ['9065c820-2e60-4cf9-a82a-9d5a96deef16'],
  supporting_passage: 'Recovered source (retrieval pass 2026-07-29): Federal Register document …',
  archived_sources: { status: 'missing', note: 'source records not archived at assertion creation' },
  contradicting_evidence: { status: 'missing', note: 'contradicting evidence not checked at creation' },
  falsification_condition: 'Falsified if the Federal Register document names an issuing agency other than the MSPB.',
  correction_history: [{ decision: 'needs-source-first', reason: 'owner deferred confirmation', at: '2026-07-29T07:52:08Z' }],
  remaining_uncertainty: 'Exact source passage not archived for this edge.',
  state: 'ok',
}
const RESOLVED_SOURCE = {
  kind: 'document',
  id: '9065c820-2e60-4cf9-a82a-9d5a96deef16',
  name: 'Federal Register',
  title: 'Promoting Employee Accountability',
  url: 'https://www.federalregister.gov/documents/2026/07/02/2026-13445/promoting-employee-accountability',
  publishedAt: '2026-07-02',
}

// An unsourced machine edge (mirrors the 368 awaiting_review live rows).
const MACHINE_EDGE = {
  id: 'd27247b2-09a3-4b69-8c79-0991872910d0',
  type: 'sequence',
  label: 'sequence: after',
  signal_source: 'shared_entity',
  claimed_by: 'reporting',
}
const MACHINE_EXPLANATION = {
  review_status: 'awaiting_review',
  relationship_type: 'sequential',
  source_ids: [],
  supporting_passage: 'Machine-generated graph edge: "sequence: after" … Exact source passage was not captured at creation.',
  archived_sources: { status: 'missing', note: 'source records not archived at assertion creation' },
  contradicting_evidence: { status: 'missing', note: 'contradicting evidence not checked at creation' },
  falsification_condition: 'missing: falsification condition not recorded at assertion creation; to be defined at first human review',
  correction_history: [],
  remaining_uncertainty: 'Exact source passage and pipeline model version not archived for this edge.',
  state: 'insufficient_evidence',
}

test('sourced edge: named sources, grounding, and real axis values render', () => {
  const v = buildRelationshipPanelView({
    edge: SOURCED_EDGE,
    explanation: SOURCED_EXPLANATION,
    sources: [RESOLVED_SOURCE],
    enabled: true,
  })
  assert.equal(v.sources.length, 1)
  assert.equal(v.sources[0].name, 'Federal Register')
  assert.equal(v.grounding.recorded, true)
  assert.match(v.grounding.text, /Federal Register/)
  const axes = Object.fromEntries(v.axes.map((a) => [a.key, a]))
  assert.equal(axes.source_reliability.value, '1 of 4 — highest reliability')
  assert.equal(axes.source_reliability.tone, 'value')
  assert.equal(axes.evidence_strength.value, 'documented')
  assert.equal(axes.review_status.value, 'Reviewed — human confirmed')
  assert.equal(axes.relationship_type.value, 'Stored graph type: actor; Edge-specific provenance classification: inferred — recorded')
  assert.equal(axes.remaining_uncertainty.tone, 'value')
  assert.ok(v.falsificationCondition)
  assert.equal(v.correctionHistory.length, 1)
})

test('sourced edge: authentication honestly reports not-archived', () => {
  const v = buildRelationshipPanelView({
    edge: SOURCED_EDGE,
    explanation: SOURCED_EXPLANATION,
    sources: [RESOLVED_SOURCE],
    enabled: true,
  })
  const auth = v.axes.find((a) => a.key === 'authentication')
  assert.equal(auth.value, 'Not archived — authentication not yet available')
  assert.equal(auth.tone, 'unavailable')
})

test('independence is always unverified — never asserted without lineage', () => {
  for (const args of [
    { edge: SOURCED_EDGE, explanation: SOURCED_EXPLANATION, sources: [RESOLVED_SOURCE], enabled: true },
    { edge: MACHINE_EDGE, explanation: MACHINE_EXPLANATION, sources: [], enabled: true },
    { edge: MACHINE_EDGE, explanation: null, sources: [], enabled: true },
  ]) {
    const v = buildRelationshipPanelView(args)
    assert.equal(v.independence, 'Unverified — source lineage not yet tracked')
  }
})

test('unsourced machine edge: every gap is an explicit honest state', () => {
  const v = buildRelationshipPanelView({
    edge: MACHINE_EDGE,
    explanation: MACHINE_EXPLANATION,
    sources: [],
    enabled: true,
  })
  assert.equal(v.sources.length, 0)
  // Grounding passage exists on machine rows and is shown as recorded text.
  assert.equal(v.grounding.recorded, true)
  const axes = Object.fromEntries(v.axes.map((a) => [a.key, a]))
  assert.match(axes.source_reliability.value, /Not yet available/)
  assert.equal(axes.source_reliability.tone, 'unavailable')
  assert.match(axes.evidence_strength.value, /Not yet available/)
  assert.equal(axes.review_status.value, 'Awaiting review')
  assert.equal(axes.review_status.tone, 'unverified')
  assert.equal(axes.relationship_type.value, 'Stored graph type: sequence; Edge-specific provenance classification: sequential — recorded')
  assert.equal(axes.relationship_type.tone, 'value')
  // A 'missing:' falsification condition is never rendered as a real one.
  assert.equal(v.falsificationCondition, null)
  assert.equal(v.correctionHistory.length, 0)
})

test('missing evidence is not contradicting evidence', () => {
  const v = buildRelationshipPanelView({
    edge: MACHINE_EDGE,
    explanation: MACHINE_EXPLANATION,
    sources: [],
    enabled: true,
  })
  assert.match(v.contradicting, /Not checked/)
  assert.doesNotMatch(v.contradicting, /none|no contradictions/i)
})

test('no explanation row: provenance states degrade honestly, edge detail kept', () => {
  const v = buildRelationshipPanelView({
    edge: MACHINE_EDGE,
    explanation: null,
    sources: [],
    enabled: true,
  })
  assert.equal(v.hasExplanation, false)
  assert.equal(v.reviewBadge.label, 'No provenance recorded yet')
  assert.match(v.grounding.text, /No provenance recorded/)
  assert.equal(v.grounding.recorded, false)
  const axes = Object.fromEntries(v.axes.map((a) => [a.key, a]))
  assert.equal(axes.relationship_type.value, 'Stored graph type: sequence; Edge-specific provenance classification: not yet recorded')
  assert.equal(axes.relationship_type.tone, 'value')
  assert.match(axes.remaining_uncertainty.value, /Not yet available/)
  // Extraction detail still comes from the edge itself.
  assert.equal(v.rawLabel, 'sequence: after')
  assert.ok(v.extraction.some((r) => r.label === 'Signal source' && r.value === 'shared_entity'))
})

test('flag off: provenance withheld entirely, edge-level meaning kept', () => {
  const v = buildRelationshipPanelView({
    edge: SOURCED_EDGE,
    explanation: null,
    sources: [],
    enabled: false,
  })
  assert.equal(v.provenanceEnabled, false)
  assert.equal(v.axes.length, 0)
  assert.equal(v.reviewBadge, null)
  assert.equal(v.meaning, 'involves')
})

test('sequence meaning line carries the item-4 causal distinction', () => {
  const v = buildRelationshipPanelView({
    edge: MACHINE_EDGE,
    explanation: MACHINE_EXPLANATION,
    sources: [],
    enabled: true,
  })
  assert.equal(v.meaning, 'happened before — temporal order only, no causation claimed')
})

test('causal meaning line marks a causation claim; actor stays bare phrase', () => {
  const causal = buildRelationshipPanelView({
    edge: { ...SOURCED_EDGE, type: 'causal', label: 'caused' },
    enabled: false,
  })
  assert.equal(causal.meaning, 'led to — a causation claim')
  const actor = buildRelationshipPanelView({ edge: SOURCED_EDGE, enabled: false })
  assert.equal(actor.meaning, 'involves')
})

test('unresolved source ids stay visible as honest gaps', () => {
  const v = buildRelationshipPanelView({
    edge: SOURCED_EDGE,
    explanation: SOURCED_EXPLANATION,
    sources: [{ kind: 'unresolved', id: 'deadbeef-0000' }],
    enabled: true,
  })
  assert.equal(v.sources[0].kind, 'unresolved')
})

test('empty input is safe', () => {
  const v = buildRelationshipPanelView({})
  assert.equal(v.meaning, '')
  assert.equal(v.sources.length, 0)
  assert.equal(v.axes.length, 0)
  assert.equal(v.independence, 'Unverified — source lineage not yet tracked')
})
