export const HOUR = 60 * 60 * 1000
export const EPOCH = Date.parse('2026-10-01T00:00:00Z')
export const time = hour => new Date(EPOCH + hour * HOUR).toISOString()
export function newsContext(specs = [{ at: 0 }], { report = false } = {}) {
  const members = specs.map((spec, index) => {
    const source = {
      public_version_id: `source-version-${index + 1}`, article_id: 'article-1', capture_id: `capture-${index + 1}`, capture_hash: 'a'.repeat(64),
      contract: 'mip-reviewed-public-version-v1', review_state: 'reviewed', visibility_state: 'public',
      admission_kind: report ? 'source_report' : 'reviewed_proposition',
      is_current_source_version: true, superseded_by_public_version_id: null,
      source_outlet: 'Synthetic publisher', source_url: 'https://example.invalid/report', title: 'Retained source headline', summary: 'Retained source summary',
      published_at: time(spec.reportAt ?? spec.at), fetched_at: time(-24), captured_at: time(spec.declaredAt ?? spec.at),
      reviewed_at: time(spec.declaredAt ?? spec.at), review_ref: 'synthetic-owner-review', policy_version: 'synthetic-publication-v1',
      correction_reason: spec.kind === 'correction' ? 'Exact source correction' : null,
      predecessor_public_version_id: index ? `source-version-${index}` : null,
    }
    if (report) source.source_report = { source_id: source.article_id, source_version_id: source.capture_id, capture_hash: source.capture_hash,
      report_time: source.published_at, fetch_time: null, article_original_fetched_at: source.fetched_at, capture_retained_at: source.captured_at,
      review_uncertainty: 'Source reports this development; reconciliation is incomplete.' }
    return source
  })
  const changes = specs.map((spec, index) => ({
    material_change_id: `change-${index + 1}`, story_id: 'story-1', subject_type: 'article', subject_id: 'article-1',
    public_version_id: `story-version-${index + 1}`, previous_public_version_id: index ? `story-version-${index}` : null, sequence: String(index + 1), materiality_owner: 'reviewed_publication_owner',
    effective_at: time(spec.at), declared_at: time(spec.declaredAt ?? spec.at), reason: spec.reason ?? 'Synthetic reviewer records new major evidence.',
    evidence_refs: [members[index].public_version_id], review_refs: ['synthetic-owner-review'], policy_version: 'synthetic-material-v1',
    kind: spec.kind ?? (index ? 'update' : 'event_established'), importance: spec.importance ?? 'major',
    novelty: spec.kind === 'correction' ? 'correction' : 'genuinely_new', event_state: spec.event_state ?? 'active',
  }))
  return { story: { contract: 'mip-reviewed-public-story-v1', story_id: 'story-1', subject_type: 'article', subject_id: 'article-1',
    public_version_id: `story-version-${specs.length}`, sequence: String(specs.length), review_ref: 'synthetic-owner-review', policy_version: 'synthetic-publication-v1',
    reviewed_at: time(specs.at(-1).declaredAt ?? specs.at(-1).at), visible_at: time(specs.at(-1).declaredAt ?? specs.at(-1).at),
    review_state: 'reviewed', visibility_state: 'public', members: [members.at(-1)],
  }, material_changes: changes, evidence_versions: members, coverage: 'declared_material_changes_only' }
}

export const fixtureUuid = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`
// Explicit synthetic owner envelopes for the real shared response normalizers.
// This does not replace SQL admission tests or grant a production review.
export function ownerNewsContext(specs = [{ at: 0 }], options = {}) {
  const context = newsContext(specs, options)
  const sourceId = n => fixtureUuid(100 + n)
  const storyVersion = n => fixtureUuid(200 + n)
  const sources = context.evidence_versions.map((member, index) => ({ ...member,
    public_version_id: sourceId(index + 1), article_id: fixtureUuid(1), capture_id: fixtureUuid(300 + index), source_version_id: fixtureUuid(300 + index),
    sequence: String(index + 1), predecessor_public_version_id: index ? sourceId(index) : null,
    correction_reason: index ? member.correction_reason ?? 'Reviewed source update' : null,
    reviewed_by: 'synthetic-publication-owner', visible_at: member.reviewed_at,
    remaining_uncertainty: 'Synthetic evidence is limited to this retained source.', pending_revision: false,
    fetched_at_semantics: 'article_original_fetch',
    evidence: options.report ? [] : [{ article_claim_id: fixtureUuid(400 + index), claim_id: fixtureUuid(500 + index),
      capture_id: fixtureUuid(300 + index), capture_hash: member.capture_hash, source_field: 'body_text', span_start: 0, span_end: 5,
      excerpt: 'Exact', excerpt_hash: 'b'.repeat(64), surface_text: 'Reviewed exact claim', canonical_text: 'Reviewed exact claim' }],
  }))
  // The owner normalizer constructs the canonical report envelope from the
  // explicit report admission fields; it does not trust a caller's nested copy.
  sources.forEach(member => { delete member.source_report })
  context.story = { ...context.story, story_id: fixtureUuid(2), subject_id: fixtureUuid(1), subject_kind: 'article',
    public_version_id: storyVersion(specs.length + 1), sequence: String(specs.length + 1),
    predecessor_public_version_id: storyVersion(specs.length), correction_reason: 'Reviewed story revision',
    reviewed_by: 'synthetic-publication-owner', members: [sources.at(-1)] }
  context.material_changes = context.material_changes.map((change, index) => ({ ...change,
    material_change_id: fixtureUuid(600 + index), story_id: fixtureUuid(2), subject_id: fixtureUuid(1),
    public_version_id: storyVersion(index + 2), previous_public_version_id: storyVersion(index + 1), sequence: String(index + 2),
    evidence_refs: [sourceId(index + 1)],
  }))
  context.evidence_versions = sources
  context.contract = 'mip-public-story-context-v1'; context.has_more = false
  return context
}
