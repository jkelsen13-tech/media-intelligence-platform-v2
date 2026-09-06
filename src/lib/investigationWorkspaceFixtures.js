// Local visual/integration fixtures. Injected by tests and DEV preview only.
// Never used as a production fallback.

import { INVESTIGATION_WORKSPACE_CONTRACT } from './investigationWorkspaceClient.js'

export const FIXTURE_USER = Object.freeze({
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  email: 'local-fixture@example.invalid',
})

export const FIXTURE_IDS = Object.freeze({
  comparable: '11111111-1111-4111-8111-111111111111',
  empty: '22222222-2222-4222-8222-222222222222',
  scope: '33333333-3333-4333-8333-333333333333',
  historical: '44444444-4444-4444-8444-444444444444',
  denied: '55555555-5555-4555-8555-555555555555',
  unsupported: '66666666-6666-4666-8666-666666666666',
  conflict: '77777777-7777-4777-8777-777777777777',
})

const POSITION = '9007199254740993'
const UNICODE_SUMMARY = '💡 A report.'
const LONG_BODY = `${'The retained source repeats this sentence for inspector overflow testing. '.repeat(8)}End of retained body.`
const LONG_EXCERPT = LONG_BODY.slice(0, 120)

const hypothesisId = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
const commitmentId = 'bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
const coverageId = 'ccccccc1-cccc-4ccc-8ccc-ccccccccccc1'
const stageCommitment = 'ddddddd1-dddd-4ddd-8ddd-ddddddddddd1'
const stageImpl = 'ddddddd2-dddd-4ddd-8ddd-ddddddddddd2'
const stagePrereq = 'ddddddd3-dddd-4ddd-8ddd-ddddddddddd3'
const assessmentId = 'eeeeeee1-eeee-4eee-8eee-eeeeeeeeeee1'
const candidateId = 'fffffff1-ffff-4fff-8fff-fffffffffff1'
const version1 = '99999991-9999-4999-8999-999999999991'
const version2 = '99999992-9999-4999-8999-999999999992'
const version3 = '99999993-9999-4999-8999-999999999993'
const observation1 = '88888881-8888-4888-8888-888888888881'
const observation2 = '88888882-8888-4888-8888-888888888882'
const receipt1 = '77777771-7777-4777-8777-777777777771'
const eventId = '12345678-1234-4123-8123-123456789abc'

const citation = Object.freeze({
  position: POSITION,
  source_field: 'summary',
  span_start: 2,
  span_end: 11,
  excerpt: 'A report.',
  relation: 'context',
  note: 'Exact synthetic retained excerpt. Matching quotation is source binding, not semantic truth.',
})

const longCitation = Object.freeze({
  position: POSITION,
  source_field: 'body_text',
  span_start: 0,
  span_end: LONG_EXCERPT.length,
  excerpt: LONG_EXCERPT,
  relation: 'supports',
  note: 'Long retained span for overflow and wrapping checks.',
})

function inputRecord() {
  return {
    position: POSITION,
    queued_at: '2019-01-01T00:00:00Z',
    capture: {
      id: 'c0c0c0c0-c0c0-40c0-80c0-c0c0c0c0c0c0',
      payload: {
        title: 'Synthetic evidence',
        summary: UNICODE_SUMMARY,
        body_text: LONG_BODY,
        label: 'Fixture capture',
      },
      published_at: '2019-01-01T00:00:00Z',
      recorded_at: '2019-01-01T00:00:00Z',
    },
    record_version: null,
  }
}

function snapshot(selected = [assessmentId]) {
  return {
    scope_candidate_ids: [candidateId],
    selected_assessment_ids: selected,
    coverage: 'complete_for_explicit_scope',
    watch_keys: [`candidate:${candidateId}`],
    candidates: [{ id: candidateId, event_node_id: eventId, statement: 'A report.' }],
    assessments: [
      {
        id: assessmentId,
        candidate_id: candidateId,
        outcome: 'insufficient_evidence',
        rationale: 'Fixture only; no semantic conclusion.',
        remaining_uncertainty: 'Synthetic retained assessment; no calibrated confidence.',
        stale: false,
        ordinal: POSITION,
      },
    ],
    inputs: [inputRecord()],
  }
}

function observation(id) {
  return {
    id,
    contract_version: 'investigation-observation-1',
    snapshot: snapshot(),
    publicly_eligible: false,
  }
}

function stateDocument({ empty = false } = {}) {
  if (empty) {
    return {
      question: 'Local visual fixture: is any hypothesis or commitment recorded yet?',
      scope_note: 'Empty-section fixture. Empty is not disproven, zero uncertainty, or a completed search.',
      canonical_subject: { type: 'graph_node', id: eventId },
      time_range: { from: null, to: null, meaning: 'Unknown source event interval.' },
      unresolved_questions: [],
      coverage: [],
      hypotheses: [],
      commitments: [],
    }
  }
  return {
    question: 'Local visual fixture: what retained evidence shows whether the recorded commitment proceeded?',
    scope_note: 'Synthetic local fixture; one retained report. Not a live investigation.',
    canonical_subject: { type: 'graph_node', id: eventId },
    time_range: {
      from: '2018-01-01T00:00:00Z',
      to: null,
      meaning: 'Source/event context for the retained report, not a database historical query.',
    },
    unresolved_questions: ['Was implementation observed outside this declared search?'],
    coverage: [
      {
        id: coverageId,
        label: 'Fixture collection',
        status: 'limited',
        source_classes: ['fixture'],
        languages: ['en'],
        regions: ['unspecified'],
        from: '2018-01-01T00:00:00Z',
        to: null,
        retained_text: 'summary_only',
        search_status: 'completed_for_declared_scope',
        searched_at: '2026-09-06T07:00:00Z',
        method: 'Declared fixture search. No automated retrieval is implied.',
        limitations: ['Synthetic evidence only.', 'One source class.', 'No independent coverage measurement.'],
      },
    ],
    hypotheses: [
      {
        id: hypothesisId,
        statement: 'The commitment may remain unimplemented.',
        assessment_ids: [assessmentId],
        evidence: [citation, { ...longCitation, relation: 'contradicts' }],
        assumptions: ['The retained report is the only source in this fixture.'],
        would_strengthen: ['An authenticated cancellation document.'],
        would_weaken: ['An authenticated implementation record.'],
        remaining_uncertainty: 'No substantive judgment. Alternatives may coexist. No winning explanation is selected.',
      },
    ],
    commitments: [
      {
        id: commitmentId,
        actor: 'Synthetic institution',
        statement: 'A synthetic commitment.',
        scope: 'Fixture only.',
        conditions: ['Prerequisites unknown.'],
        deadline_text: 'No retained deadline.',
        success_criterion: 'Direct evidence of implementation.',
        remaining_uncertainty: 'No outcome evidence. An observed later event would not prove this commitment caused it.',
        stages: [
          {
            id: stageCommitment,
            kind: 'commitment',
            status: 'reported',
            depends_on: [],
            coverage_ids: [coverageId],
            evidence: [citation],
            note: 'Source reports a commitment; it does not prove an outcome.',
          },
          {
            id: stageImpl,
            kind: 'implementation',
            status: 'no_followup_found',
            depends_on: [stageCommitment],
            coverage_ids: [coverageId],
            evidence: [],
            note: 'No follow-up in this declared fixture search; absence elsewhere is unknown.',
          },
          {
            id: stagePrereq,
            kind: 'prerequisite',
            status: 'not_applicable',
            depends_on: [stageCommitment],
            coverage_ids: [],
            evidence: [],
            note: 'This synthetic branch does not require this stage.',
          },
        ],
      },
    ],
  }
}

function bundle({
  investigationId = FIXTURE_IDS.comparable,
  versionId = version2,
  headVersionId = version2,
  predecessorId = version1,
  revision = 2,
  observationId = observation2,
  accessRole = 'reviewer',
  comparison,
  review = {
    id: receipt1,
    investigation_id: investigationId,
    version_id: version1,
    previous_receipt_id: null,
    recorded_at: '2026-09-06T06:00:00Z',
  },
  state,
  changeReason = 'Synthetic local fixture revision.',
} = {}) {
  return {
    contract_version: INVESTIGATION_WORKSPACE_CONTRACT,
    investigation_id: investigationId,
    head_version_id: headVersionId,
    access_role: accessRole,
    version: {
      id: versionId,
      investigation_id: investigationId,
      revision,
      predecessor_id: predecessorId,
      observation_id: observationId,
      state: state ?? stateDocument(),
      change_reason: changeReason,
      recorded_at: '2026-09-06T07:30:00Z',
    },
    observation: observation(observationId),
    review,
    comparison,
    publicly_eligible: false,
    annotation_status: 'private_analyst_record',
  }
}

const comparableComparison = {
  mode: 'comparable',
  before_version_id: version1,
  before_observation_id: observation1,
  after_version_id: version2,
  after_observation_id: observation2,
  evidence_changes: [
    { kind: 'evidence_entered_observation', position: POSITION },
    { kind: 'assessment_added', assessment_id: assessmentId, candidate_id: candidateId },
    {
      kind: 'assessment_dependency_change',
      assessment_id: assessmentId,
      candidate_id: candidateId,
      before_stale: false,
      after_stale: true,
      before_causes: [],
      after_causes: [{ change_position: POSITION }],
    },
    {
      kind: 'assessment_replaced',
      candidate_id: candidateId,
      before_assessment_id: assessmentId,
      after_assessment_id: assessmentId,
      before_outcome: 'insufficient_evidence',
      after_outcome: 'insufficient_evidence',
    },
  ],
  definition_changes: {
    hypotheses: { added: [], removed: [], updated: [hypothesisId] },
    commitments: { added: [], removed: [], updated: [commitmentId] },
    coverage: { added: [], removed: [], updated: [coverageId] },
    question_changed: false,
    scope_changed: false,
    unresolved_questions_changed: true,
  },
}

export const FIXTURE_BUNDLES = Object.freeze({
  comparable: bundle({
    comparison: comparableComparison,
  }),
  empty: bundle({
    investigationId: FIXTURE_IDS.empty,
    versionId: version1,
    headVersionId: version1,
    predecessorId: null,
    revision: 1,
    observationId: observation1,
    review: null,
    comparison: {
      mode: 'not_reviewed',
      before_version_id: null,
      before_observation_id: null,
      after_version_id: version1,
      after_observation_id: observation1,
      evidence_changes: null,
      definition_changes: {
        hypotheses: { added: [], removed: [], updated: [] },
        commitments: { added: [], removed: [], updated: [] },
        coverage: { added: [], removed: [], updated: [] },
        question_changed: false,
        scope_changed: false,
        unresolved_questions_changed: false,
      },
    },
    state: stateDocument({ empty: true }),
  }),
  scope: bundle({
    investigationId: FIXTURE_IDS.scope,
    versionId: version3,
    headVersionId: version3,
    predecessorId: version2,
    revision: 3,
    comparison: {
      mode: 'scope_changed',
      before_version_id: version1,
      before_observation_id: observation1,
      after_version_id: version3,
      after_observation_id: observation2,
      evidence_changes: null,
      definition_changes: {
        hypotheses: { added: [], removed: [hypothesisId], updated: [] },
        commitments: { added: [], removed: [commitmentId], updated: [] },
        coverage: { added: [], removed: [], updated: [] },
        question_changed: true,
        scope_changed: true,
        unresolved_questions_changed: true,
      },
    },
  }),
  historical: bundle({
    investigationId: FIXTURE_IDS.historical,
    versionId: version1,
    headVersionId: version2,
    predecessorId: null,
    revision: 1,
    observationId: observation1,
    comparison: {
      mode: 'historical_before_review',
      before_version_id: version1,
      before_observation_id: observation1,
      after_version_id: version2,
      after_observation_id: observation2,
      evidence_changes: null,
      definition_changes: comparableComparison.definition_changes,
    },
  }),
  viewer: bundle({
    accessRole: 'viewer',
    comparison: comparableComparison,
  }),
  unsupported: {
    contract_version: 'investigation-workspace-0',
    investigation_id: FIXTURE_IDS.unsupported,
    head_version_id: version1,
    access_role: 'reviewer',
    version: { id: version1, investigation_id: FIXTURE_IDS.unsupported, revision: 1, state: {}, recorded_at: '2026-09-06T07:30:00Z' },
    observation: { snapshot: { inputs: [], assessments: [], selected_assessment_ids: [] } },
    review: null,
    comparison: { mode: 'not_reviewed' },
    publicly_eligible: false,
  },
})

function catalogItem(id, question, versionId, revision, role = 'reviewer') {
  return {
    investigation_id: id,
    version_id: versionId,
    revision,
    question,
    access_role: role,
    reviewed_version_id: id === FIXTURE_IDS.empty ? null : version1,
  }
}

export function fixtureCatalog(scenario = 'populated') {
  if (scenario === 'empty' || scenario === 'signed-out') return { contract_version: INVESTIGATION_WORKSPACE_CONTRACT, items: [], has_more: false, next_after: null, publicly_eligible: false }
  const items = [
    catalogItem(FIXTURE_IDS.comparable, FIXTURE_BUNDLES.comparable.version.state.question, version2, 2),
    catalogItem(FIXTURE_IDS.empty, FIXTURE_BUNDLES.empty.version.state.question, version1, 1, 'viewer'),
    catalogItem(FIXTURE_IDS.scope, 'Local visual fixture: candidate scope changed', version3, 3),
    catalogItem(FIXTURE_IDS.historical, 'Local visual fixture: historical version before review', version1, 1),
    catalogItem(FIXTURE_IDS.conflict, FIXTURE_BUNDLES.comparable.version.state.question, version2, 2),
  ]
  return {
    contract_version: INVESTIGATION_WORKSPACE_CONTRACT,
    items,
    has_more: false,
    next_after: null,
    publicly_eligible: false,
  }
}

export function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

export function createLocalInvestigationWorkspaceClient({
  scenario = 'populated',
  delayMs = 0,
  listResult,
  readResults = {},
  markResults = {},
  pendingReads = {},
} = {}) {
  const wait = async () => {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  const fail = (code) => ({ data: null, error: { code } })
  const ok = (data) => ({ data, error: null })
  return Object.freeze({
    async list(input = {}) {
      await wait()
      if (typeof listResult === 'function') return listResult(input)
      if (scenario === 'unavailable') return fail('service_unavailable')
      if (scenario === 'signed-out') return fail('authentication_required')
      return ok(fixtureCatalog(scenario))
    },
    async read(investigationId, versionId) {
      await wait()
      const pending = pendingReads[`${investigationId}:${versionId ?? 'head'}`]
      if (pending) return pending.promise
      if (typeof readResults[investigationId] === 'function') {
        return readResults[investigationId](investigationId, versionId)
      }
      if (investigationId === FIXTURE_IDS.denied) return fail('access_denied')
      if (investigationId === FIXTURE_IDS.unsupported) return ok(FIXTURE_BUNDLES.unsupported)
      if (investigationId === FIXTURE_IDS.empty) return ok(FIXTURE_BUNDLES.empty)
      if (investigationId === FIXTURE_IDS.scope) return ok(FIXTURE_BUNDLES.scope)
      if (investigationId === FIXTURE_IDS.historical) {
        if (versionId === version1 || versionId == null) return ok(FIXTURE_BUNDLES.historical)
      }
      if (investigationId === FIXTURE_IDS.comparable || investigationId === FIXTURE_IDS.conflict) {
        if (versionId === version1) {
          return ok(bundle({
            investigationId,
            versionId: version1,
            headVersionId: version2,
            predecessorId: null,
            revision: 1,
            observationId: observation1,
            comparison: {
              mode: 'historical_before_review',
              before_version_id: version1,
              before_observation_id: observation1,
              after_version_id: version2,
              after_observation_id: observation2,
              evidence_changes: null,
              definition_changes: comparableComparison.definition_changes,
            },
          }))
        }
        return ok(FIXTURE_BUNDLES.comparable)
      }
      return fail('access_denied')
    },
    async markReviewed(payload) {
      await wait()
      if (typeof markResults === 'function') return markResults(payload)
      if (payload?.investigationId === FIXTURE_IDS.conflict || scenario === 'conflict') {
        return fail('version_conflict')
      }
      if (scenario === 'transport') return fail('request_failed')
      return ok({
        id: payload.receiptId,
        investigation_id: payload.investigationId,
        version_id: payload.versionId,
        previous_receipt_id: payload.previousReceiptId ?? null,
        recorded_at: '2026-09-06T08:00:00Z',
      })
    },
  })
}

export function previewAuthFor(mode) {
  if (mode === 'signed-out') return { session: null, user: null, loading: false }
  if (mode === 'loading') return { session: null, user: null, loading: true }
  return { session: { user: FIXTURE_USER, access_token: 'local-fixture' }, user: FIXTURE_USER, loading: false }
}

export function readInvestigationWorkspacePreview(search, env = (typeof import.meta !== 'undefined' ? import.meta.env : {})) {
  if (env?.DEV !== true) return null
  const mode = new URLSearchParams(search ?? '').get('privateInvestigationFixture')
  const allowed = ['populated', 'empty', 'signed-out', 'denied', 'historical', 'scope', 'conflict', 'unavailable', 'loading']
  if (!allowed.includes(mode)) return null
  return {
    mode,
    client: createLocalInvestigationWorkspaceClient({
      scenario: mode === 'denied' ? 'populated' : mode,
      readResults: mode === 'denied'
        ? { [FIXTURE_IDS.comparable]: () => ({ data: null, error: { code: 'access_denied' } }) }
        : {},
    }),
    auth: previewAuthFor(mode),
    initialInvestigationId: mode === 'denied' || mode === 'populated' || mode === 'conflict'
      ? FIXTURE_IDS.comparable
      : mode === 'historical'
        ? FIXTURE_IDS.historical
        : mode === 'scope'
          ? FIXTURE_IDS.scope
          : mode === 'empty'
            ? null
            : null,
  }
}
