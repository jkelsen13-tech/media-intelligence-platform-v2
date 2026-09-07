import { FIXTURE_BUNDLES, FIXTURE_VERSIONS } from '../src/lib/investigationWorkspaceFixtures.js'
export function versionNavigationFixture() {
  const ids = [FIXTURE_VERSIONS.v1, FIXTURE_VERSIONS.v2, FIXTURE_VERSIONS.v3]
  return ids.map((id, i) => {
    const bundle = structuredClone(FIXTURE_BUNDLES.comparable)
    bundle.head_version_id = ids[2]
    Object.assign(bundle.version, { id, revision: i + 1, predecessor_id: ids[i - 1] ?? null,
      recorded_at: `2026-09-06T07:3${i}:00Z`, change_reason: `Synthetic revision ${i + 1} reason.` })
    bundle.version.state.question = `Synthetic question at revision ${i + 1}?`
    bundle.version.state.commitments[0].deadline_text = `Synthetic deadline ${i + 1}.`
    bundle.review.version_id = ids[1]
    Object.assign(bundle.comparison, { mode: i === 0 ? 'historical_before_review' : 'comparable',
      before_version_id: ids[1], before_observation_id: bundle.observation.id, after_version_id: id, after_observation_id: bundle.observation.id })
    if (i === 0) { bundle.comparison.definition_changes = null; bundle.comparison.evidence_changes = null }
    return bundle
  })
}
