import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import {
  applyConsolidationDelta,
  applyEventScopedPublicArticleCounts,
  applyFoundation,
  applyPublicSurfacePublicationGates,
  applyPublicSurfaceTransfer,
  COMBINED_PUBLIC_SURFACE_DRAFT,
  DESTINATION_FOUNDATION_SQL,
  PUBLIC_SURFACE_PUBLICATION_GATES,
  PUBLIC_SURFACE_TRANSFER_CHUNKS,
  restoreEclipseInvestigation,
} from '../scripts/mipConsolidationRestore.mjs'
import {
  insertCyclosporaCohort,
  CYCLOSPORA_ARTICLES,
} from '../scripts/mipPublicSurfaceCohort.mjs'

const NASA_ARTICLE_ID = 'e5a84674-0176-4704-b56f-e01c8ffa84f4'
const ECLIPSE_NODE_ID = 'acc55cb2-5ac2-4aed-be36-3f576d2bc443'
const ECLIPSE_PLACE_ID = '6034fc7e-b6ab-42b4-8c52-85421bd0d42c'
const PUBLISHED_CITATION_ID = '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaa1'
const PENDING_CITATION_ID = '22222222-aaaa-4aaa-8aaa-aaaaaaaaaaa2'
const WITHHELD_ARTICLE_ID = '33333333-aaaa-4aaa-8aaa-aaaaaaaaaaa3'
const WITHDRAWN_ARTICLE_ID = '44444444-aaaa-4aaa-8aaa-aaaaaaaaaaa4'
const CORRECTED_ARTICLE_ID = '55555555-aaaa-4aaa-8aaa-aaaaaaaaaaa5'
const ADVERSARIAL_HASH = 'sha256:isolated-adversarial-pending-hash'
const ADVERSARIAL_MENTION = 'pending Cleveland totality mention must stay private'

async function applyProductionShapedFoundation(db) {
  await db.exec(DESTINATION_FOUNDATION_SQL)
  const pipeline = await readFile(new URL('../supabase/migrations/20260905082406_evidence_pipeline_reliability.sql', import.meta.url), 'utf8')
  await db.exec(pipeline)
  await applyConsolidationDelta(db)
  await applyEventScopedPublicArticleCounts(db)
  await applyPublicSurfaceTransfer(db)
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

async function insertAdversarialFixtures(db) {
  await db.query(
    `insert into public.citations(id, article_id, cited_entity, cited_type, documentation_strength, resolved_node_id)
     values ($1,$2,'Michigan health officials','agency',0.9,$3)`,
    [PUBLISHED_CITATION_ID, CYCLOSPORA_ARTICLES[0].id, ECLIPSE_NODE_ID],
  )
  await db.query(
    `insert into public.citations(id, article_id, cited_entity, cited_type, documentation_strength, resolved_node_id)
     values ($1,$2,'NASA eclipse table','agency',0.4,$3)`,
    [PENDING_CITATION_ID, NASA_ARTICLE_ID, ECLIPSE_NODE_ID],
  )
  await db.query(
    `insert into public.articles(id, feed, outlet, title, url, summary, reader_state, source_status)
     values
       ($1,'fixture','Fixture Outlet','Withheld fixture','https://example.org/withheld-fixture','withheld body','withheld','active'),
       ($2,'fixture','Fixture Outlet','Withdrawn fixture','https://example.org/withdrawn-fixture','withdrawn body','eligible','withdrawn'),
       ($3,'fixture','Fixture Outlet','Corrected fixture','https://example.org/corrected-fixture','corrected body','eligible','corrected')`,
    [WITHHELD_ARTICLE_ID, WITHDRAWN_ARTICLE_ID, CORRECTED_ARTICLE_ID],
  )
  await db.query(
    `insert into public.citations(article_id, cited_entity, cited_type, documentation_strength)
     values
       ($1,'withheld citation','entity',0.1),
       ($2,'withdrawn citation','entity',0.1),
       ($3,'corrected citation','entity',0.1)`,
    [WITHHELD_ARTICLE_ID, WITHDRAWN_ARTICLE_ID, CORRECTED_ARTICLE_ID],
  )
  await db.query(
    `insert into public.node_location_mentions(
       node_id, article_id, place_id, mention_text, text_field,
       location_role, literal_status, resolution_method, review_state
     ) values
       ($1,$2,$3,$4,'summary','observed_location','literal','manual','pending'),
       ($1,$5,$3,'published mention text','summary','observed_location','literal','manual','pending')`,
    [ECLIPSE_NODE_ID, NASA_ARTICLE_ID, ECLIPSE_PLACE_ID, ADVERSARIAL_MENTION, CYCLOSPORA_ARTICLES[0].id],
  )
  await db.query(
    `insert into public.sky_verifications(
       article_id, observed_azimuth_deg, observed_altitude_deg, captured_at,
       centroid_lat, centroid_lng, confidence_radius_km, sensor_quality, image_hash, method
     ) values
       ($1, 180.00, 45.00, now(), 41.499320, -81.694360, 1.5, 'high', $2, 'shadow_assisted'),
       ($3, 90.00, 30.00, now(), 42.331400, -83.045800, 2.0, 'medium', 'sha256:isolated-published-hash', 'shadow_assisted')`,
    [NASA_ARTICLE_ID, ADVERSARIAL_HASH, CYCLOSPORA_ARTICLES[0].id],
  )
}

async function assertClosedForRole(db, role) {
  await asRole(db, role, async () => {
    assert.equal(await scalar(db, 'select count(*)::int from articles'), 3)
    assert.equal(await scalar(db, 'select count(*)::int from news_detail_public'), 3)
    assert.equal(
      await scalar(db, 'select count(*)::int from news_detail_public where article_id=$1', [NASA_ARTICLE_ID]),
      0,
    )
    const citations = (await db.query('select id, cited_entity, article_id from citations')).rows
    assert.equal(citations.length, 1)
    assert.equal(citations[0].id, PUBLISHED_CITATION_ID)
    assert.equal(citations.some((row) => row.cited_entity.includes('NASA') || row.article_id === NASA_ARTICLE_ID), false)
    assert.equal(citations.some((row) => ['withheld citation', 'withdrawn citation', 'corrected citation'].includes(row.cited_entity)), false)

    await assert.rejects(db.exec('select mention_text from node_location_mentions'), /permission denied/)
    await assert.rejects(db.exec(`select centroid_lat, image_hash from sky_verifications`), /permission denied/)

    const coverage = (await db.query('select * from graph_coverage_public')).rows[0]
    assert.equal(coverage.article_count, 3)
    assert.equal(coverage.articles_with_published_node, 1)
    assert.equal(coverage.published_node_count, 1)

    const projection = (await db.query('select * from spatial_projection_v1')).rows
    assert.equal(projection.length, 1)
    assert.equal(projection[0].subject_graph_node_id, ECLIPSE_NODE_ID)
  })
}

test('publication gates close related-table and coverage bypasses for anon and authenticated', async (t) => {
  const db = await PGlite.create()
  t.after(() => db.close())
  await applyFoundation(db)
  const rpc = async (action, input = {}) => (await db.query('select public.mip_pipeline_v1($1,$2::jsonb) result', [action, JSON.stringify(input)])).rows[0].result
  await restoreEclipseInvestigation(db, rpc)
  await insertCyclosporaCohort(db)
  await insertAdversarialFixtures(db)

  await t.test('anon cannot read ineligible related rows or unreleased geography', async () => {
    await assertClosedForRole(db, 'anon')
  })

  await t.test('ordinary authenticated users do not gain reviewer access', async () => {
    await assertClosedForRole(db, 'authenticated')
  })

  await t.test('retraction removes downstream public visibility', async () => {
    await db.query("update articles set source_status='withdrawn' where id=$1", [CYCLOSPORA_ARTICLES[0].id])
    await asRole(db, 'anon', async () => {
      assert.equal(await scalar(db, 'select count(*)::int from citations'), 0)
      assert.equal(await scalar(db, 'select count(*)::int from articles'), 2)
      const coverage = (await db.query('select * from graph_coverage_public')).rows[0]
      assert.equal(coverage.article_count, 2)
      assert.equal(coverage.articles_with_published_node, 0)
      assert.equal(await scalar(db, 'select count(*)::int from comparison_public'), 1)
    })
    await asRole(db, 'authenticated', async () => {
      assert.equal(await scalar(db, 'select count(*)::int from citations'), 0)
      const coverage = (await db.query('select * from graph_coverage_public')).rows[0]
      assert.equal(coverage.article_count, 2)
    })
    await db.query("update articles set source_status='active' where id=$1", [CYCLOSPORA_ARTICLES[0].id])
    await asRole(db, 'anon', async () => {
      assert.equal(await scalar(db, 'select count(*)::int from citations'), 1)
      assert.equal((await db.query('select * from graph_coverage_public')).rows[0].article_count, 3)
    })
  })
})

test('upgrade from the production-shaped leaky schema then applies the forward gates', async (t) => {
  const db = await PGlite.create()
  t.after(() => db.close())
  await applyProductionShapedFoundation(db)
  const rpc = async (action, input = {}) => (await db.query('select public.mip_pipeline_v1($1,$2::jsonb) result', [action, JSON.stringify(input)])).rows[0].result
  await restoreEclipseInvestigation(db, rpc)
  await insertCyclosporaCohort(db)
  await insertAdversarialFixtures(db)

  await asRole(db, 'anon', async () => {
    const citations = (await db.query('select cited_entity from citations')).rows.map((row) => row.cited_entity)
    assert.ok(citations.includes('NASA eclipse table'))
    assert.ok(citations.includes('withheld citation'))
    const mentions = (await db.query('select mention_text from node_location_mentions')).rows.map((row) => row.mention_text)
    assert.ok(mentions.includes(ADVERSARIAL_MENTION))
    const sky = (await db.query('select image_hash, centroid_lat from sky_verifications')).rows
    assert.ok(sky.some((row) => row.image_hash === ADVERSARIAL_HASH))
    assert.equal((await db.query('select * from graph_coverage_public')).rows[0].article_count, 7)
  })

  await applyPublicSurfacePublicationGates(db)
  await assertClosedForRole(db, 'anon')
  await assertClosedForRole(db, 'authenticated')
})

test('repository history matches recorded production chunks and does not replay the combined draft', async () => {
  const chunkSql = []
  for (const filename of PUBLIC_SURFACE_TRANSFER_CHUNKS) {
    const sql = await readFile(new URL(`../supabase/migrations/${filename}`, import.meta.url), 'utf8')
    chunkSql.push(sql)
    assert.match(sql, /Production-recorded public-surface transfer chunk/)
    assert.match(sql, /Do not replay this file on production/)
  }
  const combined = await readFile(new URL(`../supabase/migrations/${COMBINED_PUBLIC_SURFACE_DRAFT}`, import.meta.url), 'utf8')
  assert.match(combined, /never recorded on production/)
  assert.doesNotMatch(combined, /create table if not exists public\.citations/i)
  assert.doesNotMatch(combined, /using \(true\)/)
  const gates = await readFile(new URL(`../supabase/migrations/${PUBLIC_SURFACE_PUBLICATION_GATES}`, import.meta.url), 'utf8')
  assert.match(gates, /Production-recorded public-surface publication-gate correction/)
  assert.match(gates, /citations_public_read/)
  assert.match(gates, /reader_state = 'eligible'/)
  assert.match(gates, /revoke select on table public\.node_location_mentions/)
  assert.match(gates, /revoke select on table public\.sky_verifications/)
  assert.doesNotMatch(gates, /create policy[\s\S]*node_location_mentions[\s\S]*using/i)
  assert.doesNotMatch(gates, /create policy[\s\S]*sky_verifications[\s\S]*using/i)
  assert.match(chunkSql.join('\n'), /create policy citations_public_read[\s\S]*using \(true\)/)
})
