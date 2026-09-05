import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import {
  applyConsolidationDelta,
  applyEventScopedPublicArticleCounts,
  applyFoundation,
  applyPublicSurfaceAuthenticatedReviewRevoke,
  applyPublicSurfacePublicationGates,
  applyPublicSurfaceTransfer,
  DESTINATION_FOUNDATION_SQL,
  PUBLIC_SURFACE_AUTHENTICATED_REVIEW_REVOKE,
  restoreEclipseInvestigation,
} from '../scripts/mipConsolidationRestore.mjs'
import {
  insertCyclosporaCohort,
  CYCLOSPORA_ARTICLES,
  CYCLOSPORA_EVENT,
} from '../scripts/mipPublicSurfaceCohort.mjs'

const PENDING_EVENT_ID = '66666666-aaaa-4aaa-8aaa-aaaaaaaaaaa6'
const QUARANTINED_EVENT_ID = '77777777-aaaa-4aaa-8aaa-aaaaaaaaaaa7'
const PENDING_CLAIM_ID = '88888888-aaaa-4aaa-8aaa-aaaaaaaaaaa8'
const DRAFT_POLICY_ID = '99999999-aaaa-4aaa-8aaa-aaaaaaaaaaa9'
const DRAFT_CASE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10'
const DRAFT_EXPLANATION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10'
const PRIVATE_TABLES = [
  'events',
  'claims',
  'article_claims',
  'event_articles',
  'explanations',
  'cross_surface_candidates',
  'claim_evidence_links',
  'claim_corrections',
  'entities',
  'p3_legal_case',
  'p3_legal_case_evidence',
  'p3_policy',
  'p3_policy_track_event',
]

async function applyProductionShapedFoundation(db) {
  await db.exec(DESTINATION_FOUNDATION_SQL)
  const pipeline = await readFile(new URL('../supabase/migrations/20260905082406_evidence_pipeline_reliability.sql', import.meta.url), 'utf8')
  await db.exec(pipeline)
  await applyConsolidationDelta(db)
  await applyEventScopedPublicArticleCounts(db)
  await applyPublicSurfaceTransfer(db)
  await applyPublicSurfacePublicationGates(db)
}

async function scalar(db, sql, params = []) {
  return Object.values((await db.query(sql, params)).rows[0])[0]
}

async function asRole(db, role, fn) {
  await db.exec(`set role ${role}`)
  try {
    return await fn()
  } finally {
    await db.exec('reset role')
  }
}

async function insertPrivateReviewFixtures(db) {
  await db.query(
    `insert into public.events(id, canonical_title, status, comparison_validation_state)
     values
       ($1,'Pending private outbreak review','candidate','pending_review'),
       ($2,'Quarantined private outbreak review','candidate','quarantined')`,
    [PENDING_EVENT_ID, QUARANTINED_EVENT_ID],
  )
  await db.query(
    `insert into public.claims(id, event_id, canonical_text, status, rule_version)
     values ($1,$2,'Pending claim text that must stay private','active','sc-v2-event-projection')`,
    [PENDING_CLAIM_ID, PENDING_EVENT_ID],
  )
  await db.query(
    `insert into public.event_articles(event_id, article_id, membership_method)
     values ($1,$2,'fixture')`,
    [PENDING_EVENT_ID, CYCLOSPORA_ARTICLES[0].id],
  )
  await db.query(
    `insert into public.article_claims(claim_id, article_id, surface_text, is_current)
     values ($1,$2,'Pending surface text that must stay private', true)`,
    [PENDING_CLAIM_ID, CYCLOSPORA_ARTICLES[0].id],
  )
  await db.query(
    `insert into public.explanations(
       id, assertion_id, assertion_type, version, provenance_class, review_status, state, supporting_passage
     ) values ($1,'draft:private','claim_grouping',1,'human_reviewed','draft','explanation_pending','Draft explanation passage')`,
    [DRAFT_EXPLANATION_ID],
  )
  await db.query(
    `insert into public.cross_surface_candidates(
       article_id, candidate_type, target_table, evidence_excerpt, algorithm_version, review_state, remaining_uncertainty
     ) values ($1,'graph_node','nodes','pending candidate excerpt','fixture-v1','pending','isolated fixture')`,
    [CYCLOSPORA_ARTICLES[0].id],
  )
  await db.query(
    `insert into public.p3_policy(id, name, review_status, description)
     values ($1,'Draft private policy','draft','Draft policy text that must stay private')`,
    [DRAFT_POLICY_ID],
  )
  await db.query(
    `insert into public.p3_policy_track_event(policy_id, track, state, review_status, source_passage)
     values ($1,'stated_objective','announced','draft','Draft track passage')`,
    [DRAFT_POLICY_ID],
  )
  await db.query(
    `insert into public.p3_legal_case(id, title, case_status, review_status, verdict_or_disposition)
     values ($1,'Draft private case','open','draft','Draft disposition')`,
    [DRAFT_CASE_ID],
  )
  await db.query(
    `insert into public.p3_legal_case_evidence(case_id, track, description, review_status, source_passage)
     values ($1,'supporting','Draft evidence passage','draft','Draft evidence excerpt')`,
    [DRAFT_CASE_ID],
  )
}

async function assertPrivateTablesDenied(db, role) {
  await asRole(db, role, async () => {
    for (const table of PRIVATE_TABLES) {
      await assert.rejects(db.exec(`select * from ${table}`), /permission denied/, `${role} ${table}`)
    }
    const comparison = (await db.query('select canonical_title from comparison_public')).rows
    assert.equal(comparison.length, 1)
    assert.equal(comparison[0].canonical_title, CYCLOSPORA_EVENT.canonical_title)
    assert.equal(
      comparison.some((row) => String(row.canonical_title).includes('Pending') || String(row.canonical_title).includes('Quarantined')),
      false,
    )
    assert.equal(await scalar(db, 'select count(*)::int from news_detail_public'), 3)
    const coverage = (await db.query('select article_count from graph_coverage_public')).rows[0]
    assert.equal(coverage.article_count, 3)
  })
}

test('ordinary authenticated users cannot read private review bases after a clean install', async (t) => {
  const db = await PGlite.create()
  t.after(() => db.close())
  await applyFoundation(db)
  const rpc = async (action, input = {}) => (await db.query('select public.mip_pipeline_v1($1,$2::jsonb) result', [action, JSON.stringify(input)])).rows[0].result
  await restoreEclipseInvestigation(db, rpc)
  await insertCyclosporaCohort(db)
  await insertPrivateReviewFixtures(db)

  await t.test('anon is denied private bases and still sees published contracts', async () => {
    await assertPrivateTablesDenied(db, 'anon')
  })

  await t.test('ordinary authenticated users do not gain reviewer access', async () => {
    await assertPrivateTablesDenied(db, 'authenticated')
  })

  await t.test('retraction removes downstream reader visibility', async () => {
    await db.query("update events set comparison_validation_state='pending_review' where id=$1", [CYCLOSPORA_EVENT.id])
    await asRole(db, 'anon', async () => {
      assert.equal(await scalar(db, 'select count(*)::int from comparison_public'), 0)
    })
    await asRole(db, 'authenticated', async () => {
      assert.equal(await scalar(db, 'select count(*)::int from comparison_public'), 0)
      await assert.rejects(db.exec('select canonical_title from events'), /permission denied/)
    })
    await db.query("update events set comparison_validation_state='approved' where id=$1", [CYCLOSPORA_EVENT.id])
    await asRole(db, 'authenticated', async () => {
      assert.equal(await scalar(db, 'select count(*)::int from comparison_public'), 1)
    })
  })

  await t.test('service_role operator reads of private review rows still work', async () => {
    await asRole(db, 'service_role', async () => {
      assert.equal(await scalar(db, 'select count(*)::int from events where comparison_validation_state=$1', ['pending_review']), 1)
      assert.equal(await scalar(db, 'select count(*)::int from events where comparison_validation_state=$1', ['quarantined']), 1)
      assert.equal(await scalar(db, 'select canonical_text from claims where id=$1', [PENDING_CLAIM_ID]), 'Pending claim text that must stay private')
      assert.equal(await scalar(db, 'select name from p3_policy where id=$1', [DRAFT_POLICY_ID]), 'Draft private policy')
      assert.equal(await scalar(db, 'select supporting_passage from explanations where id=$1', [DRAFT_EXPLANATION_ID]), 'Draft explanation passage')
    })
  })
})

test('upgrade from the current production-shaped schema then revokes authenticated review reads', async (t) => {
  const db = await PGlite.create()
  t.after(() => db.close())
  await applyProductionShapedFoundation(db)
  const rpc = async (action, input = {}) => (await db.query('select public.mip_pipeline_v1($1,$2::jsonb) result', [action, JSON.stringify(input)])).rows[0].result
  await restoreEclipseInvestigation(db, rpc)
  await insertCyclosporaCohort(db)
  await insertPrivateReviewFixtures(db)

  await asRole(db, 'authenticated', async () => {
    const titles = (await db.query('select canonical_title from events')).rows.map((row) => row.canonical_title)
    assert.ok(titles.includes('Pending private outbreak review'))
    assert.ok(titles.includes('Quarantined private outbreak review'))
    assert.equal(await scalar(db, 'select canonical_text from claims where id=$1', [PENDING_CLAIM_ID]), 'Pending claim text that must stay private')
    assert.equal(await scalar(db, 'select name from p3_policy where id=$1', [DRAFT_POLICY_ID]), 'Draft private policy')
    assert.equal((await db.query('select canonical_title from comparison_public')).rows.length, 1)
  })

  await applyPublicSurfaceAuthenticatedReviewRevoke(db)
  await assertPrivateTablesDenied(db, 'anon')
  await assertPrivateTablesDenied(db, 'authenticated')
  await asRole(db, 'service_role', async () => {
    assert.equal(await scalar(db, 'select count(*)::int from events where comparison_validation_state <> $1', ['approved']), 2)
  })
})

test('authenticated review revoke migration drops blanket policies and does not invent roles', async () => {
  const sql = await readFile(new URL(`../supabase/migrations/${PUBLIC_SURFACE_AUTHENTICATED_REVIEW_REVOKE}`, import.meta.url), 'utf8')
  assert.match(sql, /drop policy if exists events_authenticated_read/)
  assert.match(sql, /drop policy if exists claims_authenticated_read/)
  assert.match(sql, /drop policy if exists p3_policy_read/)
  assert.match(sql, /revoke select on table/)
  assert.match(sql, /to service_role/)
  assert.doesNotMatch(sql, /create role/i)
  assert.doesNotMatch(sql, /using\s*\(\s*true\s*\)/i)
  assert.doesNotMatch(sql, /comparison_validation_state\s*=\s*'approved'/)
})
