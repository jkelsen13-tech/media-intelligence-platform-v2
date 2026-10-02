import { PGlite } from '@electric-sql/pglite'
import { applyFoundation } from '../scripts/mipConsolidationRestore.mjs'
import { installReviewedPublicVersionFixture } from '../scripts/reviewedPublicVersionPackage.mjs'

export async function createReviewedVersionFixture() {
  const db = await PGlite.create()
  await applyFoundation(db)
  await installReviewedPublicVersionFixture(db)
  const scalar = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0]
  const rpc = (action, input = {}) => scalar('select public.mip_pipeline_v1($1,$2::jsonb)', [action,JSON.stringify(input)])
  async function ingest(article, run = 'synthetic-reviewed-version') {
    await rpc('enqueue', { run_id: run, article })
    const job = await rpc('claim')
    const result = await rpc('finish', { job_id: job.id, lease_token: job.lease_token })
    const capture_hash = await scalar('select content_hash from evidence_pipeline.article_captures where id=$1', [result.capture_id])
    return { ...result, capture_hash }
  }
  const article = { url: 'https://example.invalid/vessel', title: 'Recorded vessel source report', outlet: 'Synthetic source A',
    summary: '😀 A source reports a vessel arrival.', published_at: '2026-10-01T10:00:00.123456Z' }
  const first = await ingest(article)
  const second = await ingest({ ...article, url: 'https://example.invalid/vessel-secondary', outlet: 'Synthetic source B' })
  // Explicit disposable administrator publication; no genuine reviewer or
  // source rights/admission is asserted by this qualification fixture.
  await db.query("update public.articles set reader_state='eligible' where id=any($1::uuid[])", [[first.article_id,second.article_id]])
  const event_id = await scalar("insert into public.events(canonical_title,comparison_validation_state) values('Synthetic vessel event','approved') returning id")
  await db.query("insert into public.event_articles(event_id,article_id,membership_method) values($1,$2,'synthetic-owner'),($1,$3,'synthetic-owner')", [event_id,first.article_id,second.article_id])
  const excerpt = 'A source reports a vessel arrival.'
  const claim_id = await scalar("insert into public.claims(event_id,canonical_text,status,rule_version) values($1,$2,'active','sc-v2-event-projection') returning id", [event_id,excerpt])
  const article_claim_id = await scalar("insert into public.article_claims(article_id,claim_id,surface_text,char_start,char_end,evidence_source_field,evidence_excerpt,auditability_state) values($1,$2,$3,2,$4,'summary',$3,'verified_retained_source') returning id", [first.article_id,claim_id,excerpt,2+Array.from(excerpt).length])
  const graph_node_id = await scalar("insert into public.nodes(type,label) values('event','Synthetic canonical vessel subject') returning id")
  for (const member of [first,second]) await db.query("insert into public.citations(article_id,cited_entity,cited_type,documentation_strength,resolved_node_id) values($1,'Synthetic vessel','event',1,$2)", [member.article_id,graph_node_id])
  async function bindArticle(source, { kind = 'reviewed_proposition', review = 'synthetic-review-v1', predecessor = null, reason = null,
    claims = [article_claim_id], uncertainty = 'Synthetic source statement, independent truth and rights unqualified.' } = {}) {
    return scalar('select mip_private.bind_reviewed_public_article_version($1,$2,$3,$4,$5,$6,$7,$8::uuid[],$9,$10)',
      [source.article_id,source.capture_id,source.capture_hash,kind,review,'synthetic-policy-v1',uncertainty,claims,predecessor,reason])
  }
  const bindStory = (members, { type = 'graph_node', subject = graph_node_id, review = 'synthetic-story-review-v1', predecessor = null, reason = null } = {}) =>
    scalar('select mip_private.bind_reviewed_public_story_version($1,$2,$3::uuid[],$4,$5,$6,$7)',
      [type,subject,members,review,'synthetic-story-policy-v1',predecessor,reason])
  const readArticle = (id, version = null) => scalar('select public.read_reviewed_public_article_v1($1,$2)', [id,version])
  const readStory = (id, version = null) => scalar('select public.read_reviewed_public_story_v1($1,$2)', [id,version])
  return { db, scalar, rpc, ingest, article, first, second, event_id, claim_id, article_claim_id, graph_node_id,
    bindArticle, bindStory, readArticle, readStory }
}
