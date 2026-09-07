import { FIXTURE_BUNDLES } from '../src/lib/investigationWorkspaceFixtures.js'
export function definitionFixture() {
  const after = structuredClone(FIXTURE_BUNDLES.comparable), before = structuredClone(after)
  before.version.id = after.comparison.before_version_id
  before.observation.id = after.comparison.before_observation_id
  before.version.observation_id = before.observation.id
  before.version.revision = 1
  before.version.recorded_at = '2026-08-20T12:00:00Z'
  before.version.state.commitments[0].deadline_text = 'By August 31, 2026.'
  after.version.state.commitments[0].deadline_text = 'By September 30, 2026.'
  after.version.state.commitments[0].stages[1].status = 'observed'
  after.version.state.commitments[0].stages[1].evidence = structuredClone(after.version.state.commitments[0].stages[0].evidence)
  after.version.state.commitments[0].stages[1].note = 'Synthetic retained implementation record; no causal attribution.'
  after.version.state.commitments[0].stages.pop()
  before.version.state.hypotheses[0].statement = 'The commitment may be delayed.'
  before.version.state.hypotheses[0].evidence = []
  before.version.state.coverage[0].limitations = ['One retained source class.']
  before.version.state.unresolved_questions = ['Was the original deadline revised?']
  return { after, before }
}
