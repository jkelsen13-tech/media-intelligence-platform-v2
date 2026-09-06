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
  evidenceOnly: '88888888-8888-4888-8888-888888888888',
})

const POSITION = '9007199254740993'
export const FIXTURE_POSITION = POSITION
export const FIXTURE_VERSIONS = Object.freeze({
  v1: '99999991-9999-4999-8999-999999999991',
  v2: '99999992-9999-4999-8999-999999999992',
  v3: '99999993-9999-4999-8999-999999999993',
})
export const FIXTURE_COMMITMENT_ID = 'bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbb1'
const UNICODE_SUMMARY = '💡 A report.'
const LONG_BODY = `${'The retained source repeats this sentence for inspector overflow testing. '.repeat(8)}End of retained body.`
const LONG_EXCERPT = LONG_BODY.slice(0, 120)

const hypothesisId = 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
const commitmentId = FIXTURE_COMMITMENT_ID
const coverageId = 'ccccccc1-cccc-4ccc-8ccc-ccccccccccc1'
const stageCommitment = 'ddddddd1-dddd-4ddd-8ddd-ddddddddddd1'
const stageImpl = 'ddddddd2-dddd-4ddd-8ddd-ddddddddddd2'
const stagePrereq = 'ddddddd3-dddd-4ddd-8ddd-ddddddddddd3'
const assessmentId = 'eeeeeee1-eeee-4eee-8eee-eeeeeeeeeee1'
const candidateId = 'fffffff1-ffff-4fff-8fff-fffffffffff1'
const version1 = FIXTURE_VERSIONS.v1
const version2 = FIXTURE_VERSIONS.v2
const version3 = FIXTURE_VERSIONS.v3
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

function snapshot(selected = [assessmentId], extraInputs = []) {
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
    inputs: [inputRecord(), ...extraInputs],
  }
}

const SHARED_SOURCE_TEXT = 'A retained fixture report with enough exact text to propose a shared source without asserting source independence.'
const UNICODE_CUE_TEXT = '🧬 uncorrected text. A correction was published.'
const UNICODE_CUE_START = Array.from(UNICODE_CUE_TEXT.slice(0, UNICODE_CUE_TEXT.indexOf('correction'))).length
const UNICODE_CUE_END = UNICODE_CUE_START + Array.from('correction').length

function evidenceCheckInputs() {
  const sharedCapture = (position, captureId) => ({
    position: String(position),
    queued_at: '2019-01-01T00:00:00Z',
    capture: {
      id: captureId,
      article_id: 'a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1',
      payload: {
        title: `Shared article capture ${position}`,
        outlet: 'Fixture Outlet',
        url: 'https://example.org/shared-capture',
        summary: SHARED_SOURCE_TEXT,
        body_text: SHARED_SOURCE_TEXT,
      },
      published_at: '2019-01-01T00:00:00Z',
      recorded_at: '2019-01-01T00:00:00Z',
    },
    record_version: null,
  })
  return [
    sharedCapture('1', 'c1c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1'),
    sharedCapture('2', 'c2c2c2c2-c2c2-42c2-82c2-c2c2c2c2c2c2'),
    {
      position: '3',
      queued_at: '2019-01-01T00:00:00Z',
      capture: {
        id: 'c3c3c3c3-c3c3-43c3-83c3-c3c3c3c3c3c3',
        article_id: 'a3a3a3a3-a3a3-43a3-83a3-a3a3a3a3a3a3',
        payload: {
          title: 'Correction notice fixture',
          outlet: 'Fixture Desk',
          url: 'https://example.org/correction-notice',
          summary: UNICODE_CUE_TEXT,
          body_text: 'The retained body mentions a correction in passing.',
        },
        published_at: '2019-02-02T00:00:00Z',
        recorded_at: '2019-02-02T00:00:00Z',
      },
      record_version: null,
    },
    {
      position: '4',
      queued_at: '2019-01-01T00:00:00Z',
      capture: null,
      record_version: {
        id: 'r4r4r4r4-r4r4-44r4-84r4-r4r4r4r4r4r4',
        record_kind: 'article',
        payload: {
          title: 'Withdrawn fixture record',
          outlet: 'Fixture Records',
          source_status: 'withdrawn',
        },
      },
    },
    {
      position: '5',
      queued_at: '2019-01-01T00:00:00Z',
      capture: null,
      record_version: {
        id: 'r5r5r5r5-r5r5-45r5-85r5-r5r5r5r5r5r5',
        record_kind: 'graph_node',
        payload: { label: 'Corrected fixture node.' },
      },
    },
    {
      position: '6',
      queued_at: '2019-01-01T00:00:00Z',
      capture: {
        id: 'c6c6c6c6-c6c6-46c6-86c6-c6c6c6c6c6c6',
        article_id: 'a6a6a6a6-a6a6-46a6-86a6-a6a6a6a6a6a6',
        payload: {
          title: 'Unsafe locator fixture',
          outlet: 'Fixture Outlet',
          url: 'javascript:alert(1)',
          summary: 'This locator must render as text, not a link.',
        },
        published_at: '2019-03-03T00:00:00Z',
        recorded_at: '2019-03-03T00:00:00Z',
      },
      record_version: null,
    },
  ]
}

function observation(id, extraInputs = []) {
  return {
    id,
    contract_version: 'investigation-observation-1',
    snapshot: snapshot(undefined, extraInputs),
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
  extraInputs = evidenceCheckInputs(),
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
  observationRecord,
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
    observation: observationRecord ?? observation(observationId, extraInputs),
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
    extraInputs: [],
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
  evidenceOnly: bundle({
    investigationId: FIXTURE_IDS.evidenceOnly,
    versionId: version2,
    headVersionId: version2,
    predecessorId: version1,
    revision: 2,
    observationId: observation2,
    review: {
      id: receipt1,
      investigation_id: FIXTURE_IDS.evidenceOnly,
      version_id: version1,
      previous_receipt_id: null,
      recorded_at: '2026-09-06T06:00:00Z',
    },
    comparison: {
      mode: 'comparable',
      before_version_id: version1,
      before_observation_id: observation1,
      after_version_id: version2,
      after_observation_id: observation2,
      evidence_changes: [
        { kind: 'evidence_entered_observation', position: POSITION },
      ],
      definition_changes: {
        hypotheses: { added: [], removed: [], updated: [] },
        commitments: { added: [], removed: [commitmentId], updated: [] },
        coverage: { added: [], removed: [], updated: [] },
        question_changed: false,
        scope_changed: false,
        unresolved_questions_changed: false,
      },
    },
    state: {
      question: 'Local visual fixture: did evidence enter after a commitment was removed, with no hypothesis excerpts?',
      scope_note: 'Evidence-only comparison fixture. Added observation input and a removed commitment without hypothesis excerpts.',
      canonical_subject: { type: 'graph_node', id: eventId },
      time_range: { from: '2018-01-01T00:00:00Z', to: null, meaning: 'Source/event context for the retained report.' },
      unresolved_questions: ['Was the removed commitment observed outside this declared search?'],
      coverage: [],
      hypotheses: [],
      commitments: [],
    },
  }),
  evidenceOnlyBefore: bundle({
    investigationId: FIXTURE_IDS.evidenceOnly,
    versionId: version1,
    headVersionId: version2,
    predecessorId: null,
    revision: 1,
    observationId: observation1,
    observationRecord: {
      id: observation1,
      contract_version: 'investigation-observation-1',
      snapshot: {
        scope_candidate_ids: [candidateId],
        selected_assessment_ids: [],
        coverage: 'complete_for_explicit_scope',
        watch_keys: [`candidate:${candidateId}`],
        candidates: [{ id: candidateId, event_node_id: eventId, statement: 'A report.' }],
        assessments: [],
        inputs: [],
      },
      publicly_eligible: false,
    },
    review: {
      id: receipt1,
      investigation_id: FIXTURE_IDS.evidenceOnly,
      version_id: version1,
      previous_receipt_id: null,
      recorded_at: '2026-09-06T06:00:00Z',
    },
    comparison: {
      mode: 'historical_before_review',
      before_version_id: version1,
      before_observation_id: observation1,
      after_version_id: version2,
      after_observation_id: observation2,
      evidence_changes: null,
      definition_changes: {
        hypotheses: { added: [], removed: [], updated: [] },
        commitments: { added: [], removed: [commitmentId], updated: [] },
        coverage: { added: [], removed: [], updated: [] },
        question_changed: false,
        scope_changed: false,
        unresolved_questions_changed: false,
      },
    },
    state: {
      question: 'Local visual fixture: did evidence enter after a commitment was removed, with no hypothesis excerpts?',
      scope_note: 'Before-version fixture. The commitment has no hypothesis excerpts and no retained stage excerpts.',
      canonical_subject: { type: 'graph_node', id: eventId },
      time_range: { from: '2018-01-01T00:00:00Z', to: null, meaning: 'Source/event context for the retained report.' },
      unresolved_questions: ['Was the removed commitment observed outside this declared search?'],
      coverage: [{
        id: coverageId,
        label: 'Fixture collection before evidence entered',
        status: 'limited',
        source_classes: ['fixture'],
        languages: ['en'],
        regions: ['unspecified'],
        from: '2018-01-01T00:00:00Z',
        to: null,
        retained_text: 'none',
        search_status: 'not_run',
        searched_at: null,
        method: 'Declared fixture search. No automated retrieval is implied.',
        limitations: ['Synthetic evidence only.', 'No independent coverage measurement.'],
      }],
      hypotheses: [],
      commitments: [{
        id: commitmentId,
        actor: 'Synthetic institution',
        statement: 'Collect the missing document.',
        scope: 'Fixture only.',
        conditions: ['Prerequisites unknown.'],
        deadline_text: 'No retained deadline.',
        success_criterion: 'Direct evidence of collection.',
        remaining_uncertainty: 'No outcome evidence. An observed later event would not prove this commitment caused it.',
        stages: [{
          id: stageCommitment,
          kind: 'commitment',
          status: 'reported',
          depends_on: [],
          coverage_ids: [coverageId],
          evidence: [],
          note: 'Source reports a commitment; it does not prove an outcome.',
        }],
      }],
    },
  }),
})

export const FIXTURE_SHARED_SOURCE_TEXT = SHARED_SOURCE_TEXT
export const FIXTURE_UNICODE_CUE_TEXT = UNICODE_CUE_TEXT
export const FIXTURE_UNICODE_CUE_SPAN = Object.freeze({ start: UNICODE_CUE_START, end: UNICODE_CUE_END })
export const FIXTURE_CHECKS_REPORT_ID = 'd0d0d0d0-d0d0-40d0-80d0-d0d0d0d0d0d0'

function excerptRef(position, sourceField, raw, start = 0, end = null) {
  const points = Array.from(raw)
  const spanEnd = end == null ? Math.min(160, points.length) : end
  return {
    position: String(position),
    source_field: sourceField,
    span_start: start,
    span_end: spanEnd,
    excerpt: points.slice(start, spanEnd).join(''),
  }
}

function checksEnvelope({
  investigationId,
  versionId,
  observationId,
  accessRole = 'reviewer',
  status = 'saved',
  report = null,
} = {}) {
  return {
    contract_version: 'investigation-evidence-checks-1',
    investigation_id: investigationId,
    version_id: versionId,
    observation_id: observationId,
    access_role: accessRole,
    status,
    report,
    publicly_eligible: false,
  }
}

function coverageBlock({
  inputCount,
  inputPositions,
  captureCount,
  textScanPositions,
  textFieldsScanned,
  metadataScanPositions = [],
  unsupportedInputs = [],
  missingBodyPositions = [],
  lineageScannedPositions,
  lineageExcludedPositions = [],
  pairsCompared,
  lineageFound,
  lineageReturned,
  cuesFound,
  cuesReturned,
} = {}) {
  return {
    scope: 'saved_observation_dependency_inputs',
    scope_candidate_ids: [candidateId],
    input_count: inputCount,
    input_positions: inputPositions,
    capture_count: captureCount,
    text_scan_positions: textScanPositions,
    text_fields_scanned: textFieldsScanned,
    metadata_scan_positions: metadataScanPositions,
    unsupported_inputs: unsupportedInputs,
    missing_body_positions: missingBodyPositions,
    lineage_scanned_positions: lineageScannedPositions,
    lineage_excluded_positions: lineageExcludedPositions,
    pairs_compared: pairsCompared,
    lineage_candidates_found: lineageFound,
    lineage_candidates_returned: lineageReturned,
    challenge_cues_found: cuesFound,
    challenge_cues_returned: cuesReturned,
    external_retrieval: 'not_run',
    languages_verified: false,
    semantic_adjudication: 'not_performed',
  }
}

const CHECK_LIMITS = Object.freeze({
  lineage_capture_limit: 100,
  results_per_section: 200,
  identical_text_min_codepoints: 80,
  text_matches_per_field_per_cue: 1,
  cue_language: 'English',
})

const CHECK_LIMITATIONS = Object.freeze([
  'Only retained inputs in this saved observation were searched; this is not the whole source collection or the web.',
  'Matching text or URLs proposes a source relationship; independence and transmission direction remain unknown.',
  'Correction and withdrawal words may concern another claim, be negated, or refer to a different event.',
  'Source status describes this retained record version, not the current live source.',
  'The cue vocabulary is English only. Language, geography and source-class coverage are not verified.',
  'Empty results do not establish that a claim is true or that no follow-up occurred.',
])

function populatedChecksReport(bundle) {
  const sharedExcerpt = excerptRef('1', 'body_text', SHARED_SOURCE_TEXT)
  const sharedRight = excerptRef('2', 'body_text', SHARED_SOURCE_TEXT)
  const cueExcerpt = excerptRef('3', 'summary', UNICODE_CUE_TEXT, UNICODE_CUE_START, UNICODE_CUE_END)
  return {
    id: FIXTURE_CHECKS_REPORT_ID,
    investigation_id: bundle.investigation_id,
    version_id: bundle.version.id,
    algorithm_version: 'retained-evidence-checks-1',
    recorded_at: '2026-09-06T09:00:00Z',
    result: {
      contract_version: 'investigation-evidence-checks-1',
      algorithm_version: 'retained-evidence-checks-1',
      completion: 'completed_bounded_checks',
      lineage_candidates: [
        {
          id: 'pair:1:2',
          status: 'needs_review',
          independence: 'unknown',
          direction: 'undetermined',
          left_position: '1',
          right_position: '2',
          left_capture_id: 'c1c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1',
          right_capture_id: 'c2c2c2c2-c2c2-42c2-82c2-c2c2c2c2c2c2',
          reasons: ['same_saved_article', 'same_retained_url', 'identical_retained_text'],
          left_excerpt: sharedExcerpt,
          right_excerpt: sharedRight,
        },
      ],
      challenge_cues: [
        {
          id: 'cue:3:summary:correction_language',
          kind: 'correction_language',
          status: 'needs_review',
          position: '3',
          capture_id: 'c3c3c3c3-c3c3-43c3-83c3-c3c3c3c3c3c3',
          record_version_id: null,
          reference: cueExcerpt,
          metadata_reference: null,
        },
        {
          id: 'cue:4:source_status',
          kind: 'recorded_source_status',
          status: 'needs_review',
          position: '4',
          capture_id: null,
          record_version_id: 'r4r4r4r4-r4r4-44r4-84r4-r4r4r4r4r4r4',
          reference: null,
          metadata_reference: { position: '4', source_field: 'source_status', value: 'withdrawn' },
        },
      ],
      coverage: coverageBlock({
        inputCount: 7,
        inputPositions: ['1', '2', '3', '4', '5', '6', POSITION],
        captureCount: 5,
        textScanPositions: ['1', '2', '3', '4', '6', POSITION],
        textFieldsScanned: 14,
        metadataScanPositions: ['4'],
        unsupportedInputs: [{ position: '5', record_kind: 'graph_node', reason: 'no_check_for_this_record_kind' }],
        missingBodyPositions: ['4', '6', POSITION],
        lineageScannedPositions: ['1', '2', '3', '6', POSITION],
        lineageExcludedPositions: [],
        pairsCompared: 10,
        lineageFound: 1,
        lineageReturned: 1,
        cuesFound: 2,
        cuesReturned: 2,
      }),
      limits: CHECK_LIMITS,
      limitations: CHECK_LIMITATIONS,
      publicly_eligible: false,
    },
  }
}

function emptyChecksReport(bundle) {
  return {
    id: 'e0e0e0e0-e0e0-40e0-80e0-e0e0e0e0e0e0',
    investigation_id: bundle.investigation_id,
    version_id: bundle.version.id,
    algorithm_version: 'retained-evidence-checks-1',
    recorded_at: '2026-09-06T09:05:00Z',
    result: {
      contract_version: 'investigation-evidence-checks-1',
      algorithm_version: 'retained-evidence-checks-1',
      completion: 'completed_bounded_checks',
      lineage_candidates: [],
      challenge_cues: [],
      coverage: coverageBlock({
        inputCount: bundle.observation?.snapshot?.inputs?.length ?? 0,
        inputPositions: (bundle.observation?.snapshot?.inputs ?? []).map((input) => String(input.position)),
        captureCount: (bundle.observation?.snapshot?.inputs ?? []).filter((input) => input.capture).length,
        textScanPositions: (bundle.observation?.snapshot?.inputs ?? []).filter((input) => input.capture || input.record_version?.record_kind === 'article').map((input) => String(input.position)),
        textFieldsScanned: 0,
        metadataScanPositions: [],
        unsupportedInputs: [],
        missingBodyPositions: [],
        lineageScannedPositions: [],
        lineageExcludedPositions: [],
        pairsCompared: 0,
        lineageFound: 0,
        lineageReturned: 0,
        cuesFound: 0,
        cuesReturned: 0,
      }),
      limits: CHECK_LIMITS,
      limitations: CHECK_LIMITATIONS,
      publicly_eligible: false,
    },
  }
}

function partialChecksReport(bundle) {
  const report = populatedChecksReport(bundle)
  report.id = 'f0f0f0f0-f0f0-40f0-80f0-f0f0f0f0f0f0'
  report.result.completion = 'partial'
  report.result.coverage.lineage_excluded_positions = ['101']
  report.result.coverage.lineage_candidates_found = 250
  report.result.coverage.lineage_candidates_returned = 1
  report.result.coverage.challenge_cues_found = 220
  report.result.coverage.challenge_cues_returned = 2
  report.result.coverage.pairs_compared = 4950
  return report
}

function truncatedChecksReport(bundle) {
  const report = populatedChecksReport(bundle)
  report.id = 'e1e1e1e1-e1e1-41e1-81e1-e1e1e1e1e1e1'
  report.result.completion = 'partial'
  report.result.coverage.lineage_excluded_positions = []
  report.result.coverage.challenge_cues_found = 201
  report.result.coverage.challenge_cues_returned = 2
  return report
}

export function fixtureEvidenceChecks(kind, bundle, accessRole) {
  const role = accessRole ?? bundle.access_role ?? 'reviewer'
  if (kind === 'not_run') {
    return checksEnvelope({
      investigationId: bundle.investigation_id,
      versionId: bundle.version.id,
      observationId: bundle.observation.id,
      accessRole: role,
      status: 'not_run',
      report: null,
    })
  }
  const report = kind === 'partial'
    ? partialChecksReport(bundle)
    : kind === 'truncated'
      ? truncatedChecksReport(bundle)
      : kind === 'zero'
        ? emptyChecksReport(bundle)
        : populatedChecksReport(bundle)
  return checksEnvelope({
    investigationId: bundle.investigation_id,
    versionId: bundle.version.id,
    observationId: bundle.observation.id,
    accessRole: role,
    status: 'saved',
    report,
  })
}

export const FIXTURE_CHECKS = Object.freeze({
  comparable: fixtureEvidenceChecks('saved', FIXTURE_BUNDLES.comparable),
  comparablePartial: fixtureEvidenceChecks('partial', FIXTURE_BUNDLES.comparable),
  comparableTruncated: fixtureEvidenceChecks('truncated', FIXTURE_BUNDLES.comparable),
  viewer: fixtureEvidenceChecks('saved', FIXTURE_BUNDLES.viewer, 'viewer'),
  empty: fixtureEvidenceChecks('not_run', FIXTURE_BUNDLES.empty, 'viewer'),
  emptyZero: fixtureEvidenceChecks('zero', FIXTURE_BUNDLES.empty),
  historical: fixtureEvidenceChecks('not_run', FIXTURE_BUNDLES.historical),
  historicalZero: fixtureEvidenceChecks('zero', FIXTURE_BUNDLES.historical),
  scope: fixtureEvidenceChecks('zero', FIXTURE_BUNDLES.scope),
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
  if (scenario === 'evidence-only') {
    return {
      contract_version: INVESTIGATION_WORKSPACE_CONTRACT,
      items: [
        catalogItem(
          FIXTURE_IDS.evidenceOnly,
          FIXTURE_BUNDLES.evidenceOnly.version.state.question,
          version2,
          2,
        ),
      ],
      has_more: false,
      next_after: null,
      publicly_eligible: false,
    }
  }
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
      if (investigationId === FIXTURE_IDS.evidenceOnly) {
        if (versionId === version1) return ok(FIXTURE_BUNDLES.evidenceOnlyBefore)
        return ok(FIXTURE_BUNDLES.evidenceOnly)
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

export function createLocalInvestigationEvidenceChecksClient({
  scenario = 'populated',
  delayMs = 0,
  pendingReads = {},
  pendingRuns = {},
  readResults = {},
  runResults = {},
} = {}) {
  const wait = async () => {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  const fail = (code) => ({ data: null, error: { code } })
  const ok = (data) => ({ data, error: null })
  const saved = new Map()
  const keyFor = (investigationId, versionId) => `${investigationId}:${versionId}`
  const bundleFor = (investigationId, versionId) => {
    if (investigationId === FIXTURE_IDS.empty) return FIXTURE_BUNDLES.empty
    if (investigationId === FIXTURE_IDS.historical) return FIXTURE_BUNDLES.historical
    if (investigationId === FIXTURE_IDS.scope) return FIXTURE_BUNDLES.scope
    if (investigationId === FIXTURE_IDS.evidenceOnly) {
      return versionId === FIXTURE_VERSIONS.v1 ? FIXTURE_BUNDLES.evidenceOnlyBefore : FIXTURE_BUNDLES.evidenceOnly
    }
    if (investigationId === FIXTURE_IDS.comparable || investigationId === FIXTURE_IDS.conflict) {
      if (versionId === FIXTURE_VERSIONS.v1) {
        return bundle({
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
        })
      }
      return investigationId === FIXTURE_IDS.conflict ? FIXTURE_BUNDLES.comparable : FIXTURE_BUNDLES.comparable
    }
    return null
  }
  const defaultRead = (investigationId, versionId) => {
    const remembered = saved.get(keyFor(investigationId, versionId))
    if (remembered) return ok(remembered)
    if (investigationId === FIXTURE_IDS.denied) return fail('access_denied')
    if (investigationId === FIXTURE_IDS.empty) return ok(FIXTURE_CHECKS.empty)
    if (investigationId === FIXTURE_IDS.historical) return ok(FIXTURE_CHECKS.historical)
    if (investigationId === FIXTURE_IDS.scope) return ok(FIXTURE_CHECKS.scope)
    if (investigationId === FIXTURE_IDS.evidenceOnly) return ok(fixtureEvidenceChecks('not_run', versionId === FIXTURE_VERSIONS.v1 ? FIXTURE_BUNDLES.evidenceOnlyBefore : FIXTURE_BUNDLES.evidenceOnly))
    if (investigationId === FIXTURE_IDS.comparable || investigationId === FIXTURE_IDS.conflict) {
      if (versionId === FIXTURE_VERSIONS.v1) {
        const historicalComparable = bundleFor(investigationId, versionId)
        return ok(fixtureEvidenceChecks('not_run', historicalComparable))
      }
      if (scenario === 'partial') return ok(FIXTURE_CHECKS.comparablePartial)
      if (scenario === 'truncated') return ok(FIXTURE_CHECKS.comparableTruncated)
      return ok(FIXTURE_CHECKS.comparable)
    }
    return fail('access_denied')
  }
  return Object.freeze({
    async read(investigationId, versionId) {
      await wait()
      const pending = pendingReads[keyFor(investigationId, versionId)]
      if (pending) return pending.promise
      if (typeof readResults[investigationId] === 'function') {
        return readResults[investigationId](investigationId, versionId)
      }
      if (scenario === 'unavailable') return fail('service_unavailable')
      if (scenario === 'signed-out') return fail('authentication_required')
      return defaultRead(investigationId, versionId)
    },
    async run(investigationId, versionId) {
      await wait()
      const pending = pendingRuns[keyFor(investigationId, versionId)]
      if (pending) return pending.promise
      if (typeof runResults[investigationId] === 'function') {
        return runResults[investigationId](investigationId, versionId)
      }
      if (scenario === 'unavailable') return fail('service_unavailable')
      if (scenario === 'signed-out') return fail('authentication_required')
      if (investigationId === FIXTURE_IDS.denied) return fail('access_denied')
      if (investigationId === FIXTURE_IDS.empty) return fail('access_denied')
      const current = bundleFor(investigationId, versionId)
      if (!current) return fail('access_denied')
      const key = keyFor(investigationId, versionId)
      if (!saved.has(key)) {
        const existing = defaultRead(investigationId, versionId)
        if (existing.data?.status === 'saved') saved.set(key, existing.data)
        else saved.set(key, fixtureEvidenceChecks('zero', current, current.access_role))
      }
      return ok(saved.get(key))
    },
  })
}

export const FIXTURE_REVIEW_EVENT_ID = 'b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1'
export const FIXTURE_REVIEW_EVENT_ID_2 = 'b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2'

function reviewEvent({
  id,
  reportId,
  revision,
  targetKind,
  targetId,
  previousEventId = null,
  decision,
  rationale,
  evidence,
  authoredByYou = true,
  recordedAt = '2026-09-06T12:00:00Z',
  preview = false,
} = {}) {
  const event = {
    id,
    report_id: reportId,
    revision: String(revision),
    target_kind: targetKind,
    target_id: targetId,
    previous_event_id: previousEventId,
    decision,
    authored_by_you: authoredByYou,
    recorded_at: recordedAt,
  }
  if (preview) {
    event.rationale_preview = String(rationale ?? '').slice(0, 240)
    return event
  }
  return { ...event, rationale, evidence }
}

function overviewTargets(checks, decisions = {}) {
  const items = []
  for (const pair of checks.report?.result?.lineage_candidates ?? []) {
    const decided = decisions[`source_link:${pair.id}`]
    items.push({
      target_kind: 'source_link',
      target_id: pair.id,
      decision: decided?.decision ?? 'needs_review',
      latest_event: decided?.latest_event ?? null,
    })
  }
  for (const cue of checks.report?.result?.challenge_cues ?? []) {
    const decided = decisions[`evidence_cue:${cue.id}`]
    items.push({
      target_kind: 'evidence_cue',
      target_id: cue.id,
      decision: decided?.decision ?? 'needs_review',
      latest_event: decided?.latest_event ?? null,
    })
  }
  return items
}

function summaryFromTargets(targets) {
  return {
    returned_targets: targets.length,
    never_reviewed: targets.filter((item) => item.latest_event == null).length,
    needs_review: targets.filter((item) => item.decision === 'needs_review').length,
    relevant: targets.filter((item) => item.decision === 'relevant').length,
    not_relevant: targets.filter((item) => item.decision === 'not_relevant').length,
    disputed: targets.filter((item) => item.decision === 'disputed').length,
  }
}

export function fixtureEvidenceReviews(kind, bundle, checks, accessRole) {
  const role = accessRole ?? checks.access_role ?? bundle.access_role ?? 'reviewer'
  if (!checks?.report?.id) return null
  const reportId = checks.report.id
  let decisions = {}
  let revision = '0'
  if (kind === 'decided' || kind === 'history') {
    const cue = checks.report.result.challenge_cues[0]
    const evidence = cue.reference
      ? [{ ...cue.reference, relation: 'context', note: 'Exact retained context; fixture only, no factual verdict.' }]
      : [cue.metadata_reference]
    const event = reviewEvent({
      id: FIXTURE_REVIEW_EVENT_ID,
      reportId,
      revision: 1,
      targetKind: 'evidence_cue',
      targetId: cue.id,
      decision: 'relevant',
      rationale: 'Retain this cue for contextual follow-up. Fixture only.',
      evidence,
      preview: true,
    })
    decisions = { [`evidence_cue:${cue.id}`]: { decision: 'relevant', latest_event: event } }
    revision = '1'
  }
  if (kind === 'reopened') {
    const cue = checks.report.result.challenge_cues[0]
    const event = reviewEvent({
      id: FIXTURE_REVIEW_EVENT_ID_2,
      reportId,
      revision: 2,
      targetKind: 'evidence_cue',
      targetId: cue.id,
      previousEventId: FIXTURE_REVIEW_EVENT_ID,
      decision: 'needs_review',
      rationale: 'Reopened for another look. Fixture only.',
      evidence: [{ ...cue.reference, relation: 'context', note: 'Reopened with the same retained span.' }],
      preview: true,
    })
    decisions = { [`evidence_cue:${cue.id}`]: { decision: 'needs_review', latest_event: event } }
    revision = '2'
  }
  const targets = overviewTargets(checks, decisions)
  return {
    contract_version: 'investigation-evidence-reviews-1',
    investigation_id: bundle.investigation_id,
    version_id: bundle.version.id,
    observation_id: bundle.observation.id,
    report_id: reportId,
    access_role: role,
    publicly_eligible: false,
    mode: 'overview',
    revision,
    targets,
    summary: summaryFromTargets(targets),
    coverage: checks.report.result.coverage,
    review_scope: 'returned_report_targets_only',
    independence: 'unknown',
    assessment_effect: 'none',
  }
}

function cueEvidence(checks) {
  const cue = checks.report.result.challenge_cues[0]
  return [{ ...cue.reference, relation: 'context', note: 'Exact retained context; fixture only, no factual verdict.' }]
}

export function fixtureReviewHistory(checks, { atRevision = '1', beforeRevision = null, pages = false } = {}) {
  const cue = checks.report.result.challenge_cues[0]
  const evidence = cueEvidence(checks)
  const events = []
  const last = Number(atRevision)
  for (let revision = last; revision >= 1; revision -= 1) {
    events.push(reviewEvent({
      id: revision === 1 ? FIXTURE_REVIEW_EVENT_ID : `00000000-0000-4000-8000-${String(revision).padStart(12, '0')}`,
      reportId: checks.report.id,
      revision,
      targetKind: 'evidence_cue',
      targetId: cue.id,
      previousEventId: revision === 1 ? null : (revision === 2 ? FIXTURE_REVIEW_EVENT_ID : `00000000-0000-4000-8000-${String(revision - 1).padStart(12, '0')}`),
      decision: revision % 2 ? 'relevant' : 'disputed',
      rationale: `Fixture history event ${revision}. Relevance only.`,
      evidence,
      authoredByYou: revision === last,
    }))
  }
  const eligible = events.filter(event => beforeRevision == null || BigInt(event.revision) < BigInt(beforeRevision))
  const page = eligible.slice(0, 20)
  const hasMore = eligible.length > 20
  return {
    contract_version: 'investigation-evidence-reviews-1',
    investigation_id: checks.investigation_id,
    version_id: checks.version_id,
    observation_id: checks.observation_id,
    report_id: checks.report.id,
    access_role: checks.access_role,
    publicly_eligible: false,
    mode: 'history',
    revision: String(atRevision),
    target_kind: 'evidence_cue',
    target_id: cue.id,
    events: page,
    next_before_revision: hasMore ? page[page.length - 1].revision : null,
  }
}

export const FIXTURE_REVIEWS = Object.freeze({
  comparable: fixtureEvidenceReviews('unread', FIXTURE_BUNDLES.comparable, FIXTURE_CHECKS.comparable),
  comparableDecided: fixtureEvidenceReviews('decided', FIXTURE_BUNDLES.comparable, FIXTURE_CHECKS.comparable),
  comparableReopened: fixtureEvidenceReviews('reopened', FIXTURE_BUNDLES.comparable, FIXTURE_CHECKS.comparable),
  comparablePartial: fixtureEvidenceReviews('unread', FIXTURE_BUNDLES.comparable, FIXTURE_CHECKS.comparablePartial),
  comparableTruncated: fixtureEvidenceReviews('unread', FIXTURE_BUNDLES.comparable, FIXTURE_CHECKS.comparableTruncated),
  viewer: fixtureEvidenceReviews('unread', FIXTURE_BUNDLES.viewer, FIXTURE_CHECKS.viewer, 'viewer'),
  scope: fixtureEvidenceReviews('unread', FIXTURE_BUNDLES.scope, FIXTURE_CHECKS.scope),
})

export function createLocalInvestigationEvidenceReviewsClient({
  scenario = 'populated',
  delayMs = 0,
  pendingReads = {},
  pendingDecides = {},
  pendingHistories = {},
  readResults = {},
  decideResults = {},
  historyResults = {},
} = {}) {
  const wait = awaiter(delayMs)
  const fail = (code) => ({ data: null, error: { code } })
  const ok = (data) => ({ data, error: null })
  const ledgers = new Map()
  const keyFor = (investigationId, versionId, reportId) => `${investigationId}:${versionId}:${reportId}`
  const checksFor = (investigationId, versionId) => {
    if (investigationId === FIXTURE_IDS.empty) return FIXTURE_CHECKS.empty
    if (investigationId === FIXTURE_IDS.historical) return FIXTURE_CHECKS.historical
    if (investigationId === FIXTURE_IDS.scope) return FIXTURE_CHECKS.scope
    if (investigationId === FIXTURE_IDS.comparable || investigationId === FIXTURE_IDS.conflict) {
      if (versionId === FIXTURE_VERSIONS.v1) return fixtureEvidenceChecks('not_run', FIXTURE_BUNDLES.comparable)
      if (scenario === 'partial') return FIXTURE_CHECKS.comparablePartial
      if (scenario === 'truncated') return FIXTURE_CHECKS.comparableTruncated
      return FIXTURE_CHECKS.comparable
    }
    return null
  }
  const bundleFor = (investigationId, versionId) => {
    if (investigationId === FIXTURE_IDS.scope) return FIXTURE_BUNDLES.scope
    if (investigationId === FIXTURE_IDS.comparable || investigationId === FIXTURE_IDS.conflict) {
      return versionId === FIXTURE_VERSIONS.v1 ? null : FIXTURE_BUNDLES.comparable
    }
    if (investigationId === FIXTURE_IDS.empty) return FIXTURE_BUNDLES.empty
    return null
  }
  const defaultOverview = (investigationId, versionId, reportId) => {
    const remembered = ledgers.get(keyFor(investigationId, versionId, reportId))
    if (remembered?.overview) return ok(remembered.overview)
    if (investigationId === FIXTURE_IDS.denied) return fail('access_denied')
    const checks = checksFor(investigationId, versionId)
    const bundle = bundleFor(investigationId, versionId)
    if (!checks?.report?.id || checks.report.id !== reportId || !bundle) return fail('access_denied')
    const kind = scenario === 'decided' ? 'decided' : scenario === 'reopened' ? 'reopened' : 'unread'
    const role = investigationId === FIXTURE_IDS.empty ? 'viewer' : (bundle.access_role ?? 'reviewer')
    return ok(fixtureEvidenceReviews(kind, bundle, checks, role === 'viewer' ? 'viewer' : role))
  }
  return Object.freeze({
    async read(investigationId, versionId, reportId) {
      await wait()
      const pending = pendingReads[keyFor(investigationId, versionId, reportId)]
      if (pending) return pending.promise
      if (typeof readResults[investigationId] === 'function') {
        return readResults[investigationId](investigationId, versionId, reportId)
      }
      if (scenario === 'unavailable' || scenario === 'reviews-unavailable') return fail('service_unavailable')
      if (scenario === 'signed-out') return fail('authentication_required')
      return defaultOverview(investigationId, versionId, reportId)
    },
    async decide(input) {
      await wait()
      const key = keyFor(input.investigation_id, input.version_id, input.report_id)
      const pending = pendingDecides[key]
      if (pending) return pending.promise
      if (typeof decideResults[input.investigation_id] === 'function') {
        return decideResults[input.investigation_id](input)
      }
      if (scenario === 'unavailable' || scenario === 'reviews-unavailable') return fail('service_unavailable')
      if (scenario === 'conflict' || input.investigation_id === FIXTURE_IDS.conflict) return fail('version_conflict')
      const current = defaultOverview(input.investigation_id, input.version_id, input.report_id)
      if (current.error) return current
      const overview = current.data
      if (overview.access_role !== 'reviewer') return fail('access_denied')
      const target = overview.targets.find((item) => item.target_kind === input.target_kind && item.target_id === input.target_id)
      if (!target) return fail('invalid_request')
      const ledger = ledgers.get(key) ?? { events: [], overview }
      const existing = ledger.events.find((event) => event.id === input.event_id)
      if (existing) {
        return ok({
          ...overview,
          mode: 'receipt',
          revision: overview.revision,
          replayed: true,
          event: existing,
        })
      }
      const predecessor = target.latest_event?.id ?? null
      if (predecessor !== (input.previous_event_id ?? null)) return fail('version_conflict')
      const nextRevision = String(BigInt(overview.revision) + 1n)
      const event = reviewEvent({
        id: input.event_id,
        reportId: input.report_id,
        revision: nextRevision,
        targetKind: input.target_kind,
        targetId: input.target_id,
        previousEventId: input.previous_event_id,
        decision: input.decision,
        rationale: input.rationale,
        evidence: input.evidence,
      })
      const nextTargets = overview.targets.map((item) => {
        if (item.target_kind !== input.target_kind || item.target_id !== input.target_id) return item
        return {
          target_kind: item.target_kind,
          target_id: item.target_id,
          decision: input.decision,
          latest_event: reviewEvent({ id: event.id, reportId: event.report_id, revision: event.revision,
            targetKind: event.target_kind, targetId: event.target_id, previousEventId: event.previous_event_id,
            decision: event.decision, authoredByYou: event.authored_by_you, recordedAt: event.recorded_at,
            preview: true, rationale: event.rationale, evidence: event.evidence }),
        }
      })
      const nextOverview = {
        ...overview,
        revision: nextRevision,
        targets: nextTargets,
        summary: summaryFromTargets(nextTargets),
      }
      ledger.events.push(event)
      ledger.overview = nextOverview
      ledgers.set(key, ledger)
      return ok({
        ...overview,
        mode: 'receipt',
        revision: nextRevision,
        replayed: false,
        event,
      })
    },
    async history(input) {
      await wait()
      const pending = pendingHistories[`${input.report_id}:${input.target_id}:${input.at_revision}:${input.before_revision}`]
      if (pending) return pending.promise
      if (typeof historyResults[input.investigation_id] === 'function') {
        return historyResults[input.investigation_id](input)
      }
      if (scenario === 'unavailable' || scenario === 'reviews-unavailable') return fail('service_unavailable')
      const checks = checksFor(input.investigation_id, input.version_id)
      if (!checks?.report || checks.report.id !== input.report_id) return fail('access_denied')
      const ledger = ledgers.get(keyFor(input.investigation_id, input.version_id, input.report_id))
      const all = (ledger?.events ?? []).filter((event) => (
        event.target_kind === input.target_kind
        && event.target_id === input.target_id
        && BigInt(event.revision) <= BigInt(input.at_revision)
        && (input.before_revision == null || BigInt(event.revision) < BigInt(input.before_revision))
      )).slice().sort((a, b) => (BigInt(a.revision) < BigInt(b.revision) ? 1 : -1))
      const fallback = ledger
        ? all
        : ((scenario === 'decided' || scenario === 'history' || scenario === 'reopened') && input.target_kind === 'evidence_cue'
          ? fixtureReviewHistory(checks, { atRevision: input.at_revision, beforeRevision: input.before_revision }).events.filter((event) => (
            BigInt(event.revision) <= BigInt(input.at_revision)
            && (input.before_revision == null || BigInt(event.revision) < BigInt(input.before_revision))
          ))
          : [])
      const page = fallback.slice(0, 20)
      return ok({
        contract_version: 'investigation-evidence-reviews-1',
        investigation_id: input.investigation_id,
        version_id: input.version_id,
        observation_id: checks.observation_id,
        report_id: input.report_id,
        access_role: checks.access_role,
        publicly_eligible: false,
        mode: 'history',
        revision: input.at_revision,
        target_kind: input.target_kind,
        target_id: input.target_id,
        events: page,
        next_before_revision: fallback.length > 20 ? page[page.length - 1].revision : null,
      })
    },
  })
}

function awaiter(delayMs) {
  return async () => {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
}

export function previewAuthFor(mode) {
  if (mode === 'signed-out') return { session: null, user: null, loading: false }
  if (mode === 'loading') return { session: null, user: null, loading: true }
  return { session: { user: FIXTURE_USER, access_token: 'local-fixture' }, user: FIXTURE_USER, loading: false }
}

export function readInvestigationWorkspacePreview(search, env = (typeof import.meta !== 'undefined' ? import.meta.env : {})) {
  if (env?.DEV !== true) return null
  const mode = new URLSearchParams(search ?? '').get('privateInvestigationFixture')
  const allowed = ['populated', 'empty', 'signed-out', 'denied', 'historical', 'scope', 'conflict', 'unavailable', 'loading', 'evidence-only', 'partial', 'truncated', 'checks-unavailable', 'reviews-unavailable', 'reviews-decided']
  if (!allowed.includes(mode)) return null
  const populatedWorkspace = mode === 'denied' || mode === 'partial' || mode === 'truncated' || mode === 'checks-unavailable' || mode === 'reviews-unavailable' || mode === 'reviews-decided'
  const reviewsScenario = mode === 'reviews-unavailable' ? 'reviews-unavailable'
    : mode === 'reviews-decided' ? 'decided'
    : mode === 'denied' ? 'populated'
    : mode === 'partial' ? 'partial'
    : mode === 'truncated' ? 'truncated'
    : mode === 'checks-unavailable' ? 'unavailable'
    : mode
  return {
    mode,
    client: createLocalInvestigationWorkspaceClient({
      scenario: populatedWorkspace ? 'populated' : mode,
      readResults: mode === 'denied'
        ? { [FIXTURE_IDS.comparable]: () => ({ data: null, error: { code: 'access_denied' } }) }
        : {},
    }),
    checksClient: createLocalInvestigationEvidenceChecksClient({
      scenario: mode === 'denied' || mode === 'reviews-unavailable' || mode === 'reviews-decided' ? 'populated'
        : mode === 'partial' ? 'partial'
        : mode === 'truncated' ? 'truncated'
        : mode === 'checks-unavailable' ? 'unavailable'
        : mode,
      readResults: mode === 'denied'
        ? { [FIXTURE_IDS.comparable]: () => ({ data: null, error: { code: 'access_denied' } }) }
        : {},
    }),
    reviewsClient: createLocalInvestigationEvidenceReviewsClient({
      scenario: reviewsScenario,
      readResults: mode === 'denied'
        ? { [FIXTURE_IDS.comparable]: () => ({ data: null, error: { code: 'access_denied' } }) }
        : {},
    }),
    auth: previewAuthFor(mode === 'reviews-unavailable' || mode === 'reviews-decided' ? 'populated' : mode),
    initialInvestigationId: mode === 'denied' || mode === 'populated' || mode === 'conflict' || mode === 'partial' || mode === 'truncated' || mode === 'checks-unavailable' || mode === 'reviews-unavailable' || mode === 'reviews-decided'
      ? FIXTURE_IDS.comparable
      : mode === 'historical'
        ? FIXTURE_IDS.historical
        : mode === 'scope'
          ? FIXTURE_IDS.scope
          : mode === 'evidence-only'
            ? FIXTURE_IDS.evidenceOnly
            : mode === 'empty'
              ? null
              : null,
  }
}
