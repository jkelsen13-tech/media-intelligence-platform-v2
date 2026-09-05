import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import {
  DESTINATION_FOUNDATION_SQL,
  applyConsolidationDelta,
  applyEventScopedPublicArticleCounts,
} from '../scripts/mipConsolidationRestore.mjs'

const EVENT_A = '11111111-1111-4111-8111-111111111111'
const EVENT_B = '22222222-2222-4222-8222-222222222222'
const ACTOR = '33333333-3333-4333-8333-333333333333'
const ELIGIBLE = '44444444-4444-4444-8444-444444444444'
const PENDING = '55555555-5555-4555-8555-555555555555'
const WITHHELD = '66666666-6666-4666-8666-666666666666'
const UNRELATED = '77777777-7777-4777-8777-777777777777'

async function applyPipeline(db) {
  const pipeline = await readFile(new URL('../supabase/migrations/20260905082406_evidence_pipeline_reliability.sql', import.meta.url), 'utf8')
  await db.exec(pipeline)
}

async function seedEventsAndArticles(db) {
  await db.query(
    "insert into public.nodes(id, slug, label, type) values($1,'event-a','Event A','event'),($2,'event-b','Event B','event'),($3,'actor-x','Actor X','actor')",
    [EVENT_A, EVENT_B, ACTOR],
  )
  await db.query(
    `insert into public.articles(id, feed, outlet, title, url, reader_state, source_status) values
      ($1,'t','Outlet','Eligible','https://example.org/eligible','eligible','active'),
      ($2,'t','Outlet','Pending','https://example.org/pending','pending_review','active'),
      ($3,'t','Outlet','Withheld','https://example.org/withheld','withheld','active')`,
    [ELIGIBLE, PENDING, WITHHELD],
  )
}

function countSql() {
  return 'select canonical_event_id::text as id, public_article_count from investigation_surface_public order by canonical_event_id'
}

test('unscoped live view counts unrelated articles; corrective membership is event-scoped', async (t) => {
  const db = await PGlite.create()
  t.after(() => db.close())
  await db.exec(DESTINATION_FOUNDATION_SQL)
  await applyPipeline(db)
  await applyConsolidationDelta(db)
  await seedEventsAndArticles(db)

  const before = (await db.query(countSql())).rows
  assert.deepEqual(before, [
    { id: EVENT_A, public_article_count: 1 },
    { id: EVENT_B, public_article_count: 1 },
  ])

  await applyEventScopedPublicArticleCounts(db)
  await db.query(
    "insert into public.articles(id, feed, outlet, title, url, reader_state, source_status) values($1,'t','Outlet','Unrelated','https://example.org/unrelated','eligible','active')",
    [UNRELATED],
  )
  const afterFix = (await db.query(countSql())).rows
  assert.deepEqual(afterFix, [
    { id: EVENT_A, public_article_count: 0 },
    { id: EVENT_B, public_article_count: 0 },
  ])

  await db.query(
    'insert into public.graph_event_article_memberships(event_node_id, article_id) values($1,$2),($1,$3),($1,$4),($5,$3)',
    [EVENT_A, ELIGIBLE, PENDING, WITHHELD, EVENT_B],
  )

  const scoped = Object.fromEntries(
    (await db.query(countSql())).rows.map((row) => [row.id, row.public_article_count]),
  )
  assert.equal(scoped[EVENT_A], 1)
  assert.equal(scoped[EVENT_B], 0)

  await t.test('unrelated eligible articles without memberships are not counted', async () => {
    const counts = (await db.query(countSql())).rows
    assert.ok(counts.every((row) => row.public_article_count <= 1))
    assert.equal(
      (await db.query(
        'select count(*)::int as n from graph_event_article_memberships where article_id=$1',
        [UNRELATED],
      )).rows[0].n,
      0,
    )
  })

  await t.test('pending and withheld memberships never increment the public count', async () => {
    await db.query(
      'insert into public.graph_event_article_memberships(event_node_id, article_id) values($1,$2) on conflict do nothing',
      [EVENT_B, PENDING],
    )
    const counts = Object.fromEntries(
      (await db.query(countSql())).rows.map((row) => [row.id, row.public_article_count]),
    )
    assert.equal(counts[EVENT_A], 1)
    assert.equal(counts[EVENT_B], 0)
  })

  await t.test('memberships cannot attach articles to non-event nodes', async () => {
    await assert.rejects(
      db.query(
        'insert into public.graph_event_article_memberships(event_node_id, article_id) values($1,$2)',
        [ACTOR, ELIGIBLE],
      ),
      /type event/,
    )
  })

  await t.test('anonymous readers see only eligible memberships and keep view grants', async () => {
    await db.exec('set role anon')
    const visible = (await db.query('select article_id::text as id from graph_event_article_memberships order by article_id')).rows
    assert.deepEqual(visible.map((row) => row.id), [ELIGIBLE])
    const surface = Object.fromEntries(
      (await db.query(countSql())).rows.map((row) => [row.id, row.public_article_count]),
    )
    assert.equal(surface[EVENT_A], 1)
    assert.equal(surface[EVENT_B], 0)
    await assert.rejects(
      db.query('insert into public.graph_event_article_memberships(event_node_id, article_id) values($1,$2)', [EVENT_B, UNRELATED]),
      /permission denied/,
    )
    await db.exec('reset role')
    const grants = (await db.query(`
      select
        has_table_privilege('anon', 'public.investigation_surface_public', 'select') as anon_select,
        has_table_privilege('authenticated', 'public.investigation_surface_public', 'select') as authenticated_select,
        has_table_privilege('service_role', 'public.investigation_surface_public', 'select') as service_select
    `)).rows[0]
    assert.equal(grants.anon_select, true)
    assert.equal(grants.authenticated_select, true)
    assert.equal(grants.service_select, true)
  })
})
