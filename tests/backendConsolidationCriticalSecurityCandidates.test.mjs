import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const root = new URL(
  '../supabase/production-candidates/backend-consolidation-security/',
  import.meta.url,
)
const read = name => fs.readFileSync(new URL(name, root), 'utf8')
const readme = read('README.md')
const yhb = read('yhb_browser_authority_containment.sql')
const rollback = read('yhb_browser_authority_containment_rollback.sql')
const qik = read('qik_private_predicate_revoke.sql')
const edge = read('edge_function_auth_gates.md')
const gdelt = read('yhb_gdelt_function_containment_v1.sql')
const gdeltInverse = read('yhb_gdelt_function_containment_v1_inverse.sql')

const signatures = [
  'articles_source_status_propagate()',
  'handle_new_mip_user()',
  'mip_approve_arc_membership_candidate(uuid)',
  'mip_arc_membership_projection_state_change()',
  'mip_ingest_rss_schedule_authorized(text)',
  'mip_intercept_direct_arc_attachment()',
  'mip_invalidate_arc_membership_approvals()',
  'mip_project_approved_arc_membership(uuid)',
  'mip_queue_source_comparison_enrichment()',
  'mip_refresh_arc_projection_milestone(uuid)',
  'mip_retract_arc_membership_projection(uuid)',
  'mip_seed_arc_membership_candidates(integer)',
  'mip_source_comparison_schedule_authorized(text)',
  'mip_sync_arc_source_comparison_events(integer)',
  'mip_touch_arc_membership_candidate()',
  'mip_v2_apply_article_claim_auditability()',
  'mip_v2_assert_ingestion_writer_key(text)',
  'mip_v2_gdelt_attach_batch(text,integer)',
  'mip_v2_gdelt_close_staging(text)',
  'mip_v2_gdelt_materialize_batch(text,integer)',
  'mip_v2_gdelt_originate_batch(text,integer)',
  'mip_v2_gdelt_stage_batch(text,jsonb)',
  'mip_v2_ingestion_begin_run(text,text,timestamp with time zone,timestamp with time zone,text,text,text)',
  'mip_v2_ingestion_finish_run(text,text,jsonb,text,text)',
  'mip_v2_ingestion_write_batch(text,text,integer,jsonb,text)',
  'mip_v2_promote_deterministic_article_claims(uuid)',
  'mip_v2_promote_deterministic_article_claims_after_insert()',
]

test('yhb containment names all 27 reviewed SECURITY DEFINER signatures', () => {
  assert.equal(new Set(signatures).size, 27)
  for (const signature of signatures) {
    assert.ok(yhb.includes(`public.${signature}`), signature)
    assert.ok(rollback.includes(`public.${signature}`), `rollback ${signature}`)
  }
  assert.match(yhb, /p\.prosecdef/)
  assert.match(yhb, /FROM PUBLIC, anon, authenticated/)
  assert.match(yhb, /TO service_role/)
})

test('owner-view quarantine is exact and rollback-ready', () => {
  for (const view of [
    'authors_public',
    'comparison_public',
    'graph_coverage_public',
    'news_detail_public',
  ]) {
    assert.ok(yhb.includes(`public.${view}`), view)
    assert.ok(rollback.includes(`public.${view}`), `rollback ${view}`)
  }
  assert.match(yhb, /REVOKE SELECT[\s\S]+FROM PUBLIC, anon, authenticated/)
  assert.match(rollback, /GRANT SELECT[\s\S]+TO anon, authenticated/)
})

test('qik cleanup is bounded to the two private predicates', () => {
  for (const name of [
    'mip_private.arc_event_candidate_is_approved(uuid)',
    'mip_private.arc_has_approved_membership(uuid)',
  ]) {
    assert.ok(qik.includes(name), name)
  }
  assert.match(qik, /FROM PUBLIC, anon, authenticated/)
  assert.match(qik, /TO service_role/)
})

test('active record separates completed containment from the unapplied owner-gated GDELT unit', () => {
  assert.match(readme, /completed live units preserved/i)
  assert.match(readme, /Live application status:[\s\S]+UNAPPLIED[\s\S]+READY_FOR_AUTHORIZATION/i)
  assert.match(readme, /separate owner authorization/i)
  assert.match(edge, /Immediate containment/)
  assert.match(edge, /BACKFILL_LEGACY_RUN_KEY/)
  assert.match(edge, /POLICY_INGEST_RUN_KEY/)
  assert.match(edge, /Only after this point: read SUPABASE_SERVICE_ROLE_KEY/i)
  assert.match(edge, /reset=1[\s\S]+separately disabled/i)
  for (const sql of [yhb, rollback, qik, gdelt, gdeltInverse]) {
    assert.doesNotMatch(sql, /\b(?:INSERT\s+INTO|UPDATE\s+[^\n;]+\s+SET|DELETE\s+FROM|TRUNCATE|DROP\s+(?:TABLE|SCHEMA)|ALTER\s+TABLE)\b/i)
  }
})
