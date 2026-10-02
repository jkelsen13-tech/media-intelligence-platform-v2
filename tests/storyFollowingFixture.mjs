import { randomUUID } from 'node:crypto'
import { installStoryFollowingFixture } from '../scripts/storyFollowingPackage.mjs'
import { createReviewedVersionFixture } from './reviewedPublicVersionFixture.mjs'

// Disposable shared restored baseline; real capture/publication owners and
// exact canonical public-version and Following proposals run.
export async function storyFollowingFixture({beforeInstall}={}) {
  const foundation=await createReviewedVersionFixture(),{db}=foundation
  await db.exec('create table public.mip_profiles(id uuid primary key)')
  await beforeInstall?.(db)
  await installStoryFollowingFixture(db)
  const viewer = randomUUID(), secondUser = randomUUID()
  await db.query('insert into public.mip_profiles values($1),($2)', [viewer, secondUser])
  const subject = foundation.graph_node_id
  const pipeline = async (action, input = {}) => (await db.query('select public.mip_pipeline_v1($1,$2::jsonb) r', [action, JSON.stringify(input)])).rows[0].r
  const source = async (name, summary = 'Synthetic source reporting.') => {
    await pipeline('enqueue', { run_id: 'story-following', article: { url: `https://example.org/story-following/${name}`, title: `Synthetic ${name}`, outlet: name, summary, published_at: '2020-01-01T00:00:00Z' } })
    const job = await pipeline('claim'), capture = await pipeline('finish', { job_id: job.id, lease_token: job.lease_token })
    await db.query("update public.articles set reader_state='eligible' where id=$1", [capture.article_id])
    await db.query("insert into public.citations(article_id,cited_entity,cited_type,documentation_strength,resolved_node_id) values($1,'Synthetic source','event',1,$2)", [capture.article_id, subject])
    const cap = (await db.query('select content_hash from evidence_pipeline.article_captures where id=$1', [capture.capture_id])).rows[0]
    const publicVersionId = (await db.query(`select mip_private.bind_reviewed_public_article_version($1,$2,$3,'source_report',$4,'fixture-policy-v1','Synthetic report permission only.') v`, [capture.article_id, capture.capture_id, cap.content_hash, `source-review:${name}`])).rows[0].v
    return { ...capture, publicVersionId }
  }
  const storyVersion = async (members, previous = null, review = randomUUID()) => {
    const id = (await db.query(`select mip_private.bind_reviewed_public_story_version('graph_node',$1,$2::uuid[],$3,'fixture-policy-v1',$4,$5) v`, [subject, members.map(m => m.publicVersionId), review, previous?.public_version_id ?? null, previous ? 'Synthetic new retained reporting.' : null])).rows[0].v
    return (await db.query('select mip_private.reviewed_public_story_payload($1) v', [id])).rows[0].v
  }
  const follow = async (action, input) => {
    await db.exec('set role service_role')
    try { return (await db.query('select public.mip_public_story_following_v1($1,$2::jsonb) r', [action, JSON.stringify(input)])).rows[0].r }
    finally { await db.exec('reset role') }
  }
  const declare = async (story, before, evidence) => {
    const input = { material_change_id: randomUUID(), story_id: story.story_id, public_version_id: story.public_version_id,
      previous_public_version_id: before.public_version_id, effective_at: '2020-01-01T00:00:00Z',
      reason: 'A reviewed source-report version added retained reporting; no proposition admission.',
      evidence_refs: [evidence.publicVersionId], review_refs: [story.review_ref], policy_version: story.policy_version,
      kind: 'update', importance: 'material', novelty: 'genuinely_new', event_state: 'unresolved' }
    const data = (await db.query('select mip_private.declare_public_story_material_change_v1($1::jsonb) r', [JSON.stringify(input)])).rows[0].r
    return { input, data }
  }
  const first = await source('First'), v1 = await storyVersion([first])
  return { db, viewer, secondUser, subject, first, v1, source, storyVersion, follow, declare }
}
