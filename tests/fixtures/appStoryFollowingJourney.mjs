import { randomUUID } from 'node:crypto'
import { createReviewedVersionFixture } from '../reviewedPublicVersionFixture.mjs'
import { installStoryFollowingFixture } from '../../scripts/storyFollowingPackage.mjs'

// Disposable restored SQL owners, not a publication or account on a hosted project.
export async function appStoryFollowingJourneyFixture() {
  const f = await createReviewedVersionFixture(), { db, scalar } = f
  await db.exec('create table public.mip_profiles(id uuid primary key)')
  await installStoryFollowingFixture(db)
  const viewer = randomUUID(), secondUser = randomUUID()
  await db.query('insert into public.mip_profiles values($1),($2)', [viewer, secondUser])
  const firstVersion = await f.bindArticle(f.first)
  const secondVersion = await f.bindArticle(f.second, { kind: 'source_report', claims: [] })
  const v1Id = await f.bindStory([firstVersion])
  const v1 = await scalar('select mip_private.reviewed_public_story_payload($1)', [v1Id])
  async function append(members, before) {
    const id = await f.bindStory(members, { review: randomUUID(), predecessor: before.public_version_id, reason: 'Synthetic retained reporting added.' })
    return scalar('select mip_private.reviewed_public_story_payload($1)', [id])
  }
  async function declare(after, before, evidence) {
    return scalar('select mip_private.declare_public_story_material_change_v1($1::jsonb)', [JSON.stringify({
      material_change_id: randomUUID(), story_id: after.story_id, public_version_id: after.public_version_id,
      previous_public_version_id: before.public_version_id, effective_at: '2026-10-01T10:00:00.123456Z',
      reason: 'Synthetic reviewed material declaration for the App journey.', evidence_refs: [evidence],
      review_refs: [after.review_ref], policy_version: after.policy_version, kind: 'update', importance: 'material',
      novelty: 'genuinely_new', event_state: 'unresolved',
    })])
  }
  let queue = Promise.resolve()
  const serial = run => {
    const result = queue.then(run)
    queue = result.catch(() => {})
    return result
  }
  const following = (action, input) => serial(async () => {
    await db.exec('set role service_role')
    try { return await scalar('select public.mip_public_story_following_v1($1,$2::jsonb)', [action, JSON.stringify(input)]) }
    finally { await db.exec('reset role') }
  })
  const publicRpc = (name, input) => serial(async () => {
    await db.exec('set role anon')
    try {
      if (name === 'read_reviewed_public_story_context_v1') return await scalar('select public.read_reviewed_public_story_context_v1($1,$2)', [input.p_story_id,input.p_public_version_id])
      if (name === 'read_reviewed_public_story_directory_v1') return await scalar('select public.read_reviewed_public_story_directory_v1($1,$2)', [input.p_after,input.p_limit])
      throw new Error('Unexpected public RPC: ' + name)
    } finally { await db.exec('reset role') }
  })
  return { ...f, viewer, secondUser, firstVersion, secondVersion, v1, append, declare, serial, following, publicRpc }
}
