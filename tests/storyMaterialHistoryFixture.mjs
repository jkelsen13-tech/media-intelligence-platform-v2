import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { createReviewedVersionFixture } from './reviewedPublicVersionFixture.mjs'
import { installStoryFollowingFixture } from '../scripts/storyFollowingPackage.mjs'
import { createStoryFollowingBackend } from '../src/lib/storyFollowingClient.js'

// Local SQL/HTTP fixture only: real owner packages and SDK, no hosted requests.
export async function createMaterialHistoryFixture(t, { proposalSource = null } = {}) {
  const f = await createReviewedVersionFixture()
  const { db, scalar } = f
  t.after(() => db.close())
  const sources = [f.first, f.second]
  for (const letter of ['C', 'D']) {
    const source = await f.ingest({ ...f.article, url: `https://example.invalid/history-${letter}`, outlet: `Synthetic source ${letter}` })
    await db.query("update public.articles set reader_state='eligible' where id=$1", [source.article_id])
    await db.query("insert into public.event_articles(event_id,article_id,membership_method) values($1,$2,'synthetic-owner')", [f.event_id,source.article_id])
    await db.query("insert into public.citations(article_id,cited_entity,cited_type,documentation_strength,resolved_node_id) values($1,'Synthetic vessel','event',1,$2)", [source.article_id,f.graph_node_id])
    sources.push(source)
  }
  await db.exec('create table public.mip_profiles(id uuid primary key)')
  if (proposalSource === null) await installStoryFollowingFixture(db)
  else {
    // Qualification of the exact frozen proposal, never a mocked row omission.
    await db.exec('set search_path=pg_catalog')
    const query = proposalSource.split('-- BEGIN STORY FOLLOWING BASELINE')[1].split('-- END STORY FOLLOWING BASELINE')[0].replace('into actual;', ';')
    const catalog = (await db.query(query)).rows[0].jsonb_build_object
    await db.query("select set_config('mip.story_following_expected_catalog',$1,false)", [JSON.stringify(catalog)])
    await db.exec(proposalSource)
    await db.exec('reset search_path')
  }
  const sourceVersions = []
  const excerpt = 'A source reports a vessel arrival.'
  for (const [index, source] of sources.entries()) {
    const claim = await scalar("insert into public.claims(event_id,canonical_text,status,rule_version) values($1,$2,'active','sc-v2-event-projection') returning id", [f.event_id,`Synthetic admitted history claim ${index}`])
    const articleClaim = await scalar("insert into public.article_claims(article_id,claim_id,surface_text,char_start,char_end,evidence_source_field,evidence_excerpt,auditability_state) values($1,$2,$3,2,$4,'summary',$3,'verified_retained_source') returning id", [source.article_id,claim,excerpt,2+Array.from(excerpt).length])
    sourceVersions.push(await f.bindArticle(source, { review: randomUUID(), claims: [articleClaim] }))
  }
  const initialId = await f.bindStory([sourceVersions[3]], { review: randomUUID() })
  const storyId = await scalar('select story_id from mip_private.reviewed_public_story_versions where public_version_id=$1', [initialId])
  const initial = await f.readStory(storyId, initialId)
  let latest = initial
  async function append(index, { effectiveAt, declaration = true, kind = 'update', novelty = 'genuinely_new', reason = randomUUID(), sourceVersion = sourceVersions[index], members = [sourceVersion], evidenceRefs = members } = {}) {
    const id = await f.bindStory(members, { review: randomUUID(), predecessor: latest.public_version_id, reason: 'Synthetic reviewed publication update' })
    const story = await f.readStory(storyId, id)
    let change = null
    if (declaration) change = await scalar('select mip_private.declare_public_story_material_change_v1($1::jsonb)', [JSON.stringify({
      material_change_id: randomUUID(), story_id: storyId, public_version_id: id,
      previous_public_version_id: latest.public_version_id, effective_at: effectiveAt,
      reason, evidence_refs: evidenceRefs, review_refs: [story.review_ref], policy_version: story.policy_version,
      kind, importance: 'major', novelty, event_state: 'active',
    })])
    latest = story
    return { story, change, sourceVersion, source: sources[index] }
  }
  const client = createClient('https://qikvmopbtijoebdqosyq.supabase.co', 'sb_publishable_fixture', {
    auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: async (url, init) => {
      if (new URL(url).pathname !== '/rest/v1/rpc/read_reviewed_public_story_context_v1') throw new Error('Unexpected fixture request')
      const body = JSON.parse(init.body)
      await db.exec('set role anon')
      try {
        const data = await scalar('select public.read_reviewed_public_story_context_v1($1,$2)', [body.p_story_id,body.p_public_version_id])
        return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })
      } finally { await db.exec('reset role') }
    } },
  })
  const backend = createStoryFollowingBackend(client)
  const context = version => backend.loadStoryContext(storyId, { publicVersionId: version ?? null })
  const withdraw = index => db.query("update public.articles set source_status='withdrawn' where id=$1", [sources[index].article_id])
  return { ...f, sources, sourceVersions, storyId, initial, append, context, withdraw }
}
