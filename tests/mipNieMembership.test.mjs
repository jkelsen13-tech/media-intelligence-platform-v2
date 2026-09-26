import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { applyFoundation } from '../scripts/mipConsolidationRestore.mjs'
import { applyStagingPage, fingerprintPayload } from '../scripts/mipLegacyGraphStaging.mjs'
import {
  NIE_PROJECT_REF, prepareNieEventArticle, stageNieEventArticle,
} from '../scripts/mipNieMembership.mjs'

const EVENT = '11111111-1111-4111-8111-111111111111'
const ARTICLE = '22222222-2222-4222-8222-222222222222'
const OTHER = '33333333-3333-4333-8333-333333333333'
const GAP = '44444444-4444-4444-8444-444444444444'
const membership = {
  source_project_ref: NIE_PROJECT_REF,
  event_id: EVENT,
  article_id: ARTICLE,
  membership_method: 'manual',
  membership_confidence: 0.6,
  created_at: '2026-09-20T12:34:56.123456Z',
}

async function asRole(db, role, action) {
  await db.exec(`set role ${role}`)
  try { return await action() } finally { await db.exec('reset role') }
}

async function count(db, sql, values = []) {
  return Number((await db.query(sql, values)).rows[0].n)
}

test('nie membership preserves native composite identity and dependencies in private staging', async (t) => {
  const db = await PGlite.create()
  t.after(() => db.close())
  await applyFoundation(db)
  await db.exec(await readFile(
    new URL('../supabase/qualification/nie-membership/001_private_membership.sql', import.meta.url),
    'utf8',
  ))

  const native = (await db.query(`
    select a.attname
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.conrelid = 'public.event_articles'::regclass and c.contype = 'p'
    order by a.attnum
  `)).rows.map((row) => row.attname)
  assert.deepEqual(native, ['event_id', 'article_id'])
  assert.equal(await count(db, `select count(*)::int n from information_schema.columns
    where table_schema='public' and table_name='event_articles' and column_name='id'`), 0)
  const publicBefore = await count(db, 'select count(*)::int n from public.comparison_public')
  const candidate = prepareNieEventArticle(membership)
  assert.deepEqual(candidate.source_key, [EVENT, ARTICLE])
  assert.equal(candidate.payload_sha256, fingerprintPayload(candidate.payload))
  assert.equal(
    (await db.query('select legacy_graph_staging.fingerprint_payload($1::jsonb) h',
      [JSON.stringify(candidate.payload)])).rows[0].h,
    candidate.payload_sha256,
  )
  assert.throws(() => prepareNieEventArticle({ ...membership, source_project_ref: 'yhbwnrtlqbjtcrrlpbge' }), /exact source project/)
  assert.throws(() => prepareNieEventArticle({ ...membership, comparison_validation_state: 'approved' }), /exact native/)

  await assert.rejects(asRole(db, 'service_role', () => stageNieEventArticle(db, membership)), /missing source-qualified Source Comparison event/)
  await applyStagingPage(db, {
    run_id: 'nie-event-dependency',
    records: [{
      source_project_ref: NIE_PROJECT_REF, source_table: 'events', source_id: EVENT,
      payload: { id: EVENT, canonical_title: 'Synthetic source comparison', status: 'candidate' },
    }],
  })
  await assert.rejects(asRole(db, 'service_role', () => stageNieEventArticle(db, membership)), /missing source-qualified article/)
  await applyStagingPage(db, {
    run_id: 'nie-article-dependency',
    records: [{
      source_project_ref: NIE_PROJECT_REF, source_table: 'articles', source_id: ARTICLE,
      payload: { id: ARTICLE, title: 'Synthetic article', url: 'https://example.invalid/nie-membership' },
    }],
  })

  await applyStagingPage(db, {
    run_id: 'nie-gap-article',
    records: [{
      source_project_ref: NIE_PROJECT_REF, source_table: 'articles', source_id: GAP,
      recovery_status: 'not_restorable_no_pre_import_snapshot',
      payload: { id: GAP, title: 'Synthetic source with missing prior snapshot', url: 'https://example.invalid/nie-gap' },
    }],
  })
  assert.equal((await db.query(
    'select review_state from legacy_graph_staging.staged_records where source_project_ref=$1 and source_table=$2 and source_id=$3',
    [NIE_PROJECT_REF, 'articles', GAP],
  )).rows[0].review_state, 'gap_recorded')
  await assert.rejects(
    asRole(db, 'service_role', () => stageNieEventArticle(db, { ...membership, article_id: GAP })),
    /missing source-qualified article/,
  )
  for (const [field, value] of [
    ['membership_method', '42' ], ['created_at', '42'], ['event_id', '42'],
  ]) {
    const malformed = JSON.stringify({ ...candidate.payload, [field]: 42 })
    await assert.rejects(
      db.query('select legacy_graph_staging.stage_nie_event_article($1::jsonb,$2::text)',
        [malformed, candidate.payload_sha256]),
      /membership requires event, article, method, and creation time/,
    )
  }

  const first = await asRole(db, 'service_role', () => stageNieEventArticle(db, membership))
  assert.equal(first.review_state, 'pending_review')
  assert.equal(first.replayed, false)
  const retry = await asRole(db, 'service_role', () => stageNieEventArticle(db, membership))
  assert.equal(retry.replayed, true)
  assert.equal(await count(db, 'select count(*)::int n from legacy_graph_staging.nie_event_article_versions'), 1)
  const changed = { ...membership, membership_confidence: 0.7 }
  const divergent = await asRole(db, 'service_role', () => stageNieEventArticle(db, changed))
  assert.equal(divergent.review_state, 'quarantined')
  assert.equal(divergent.replayed, false)
  assert.equal((await asRole(db, 'service_role', () => stageNieEventArticle(db, changed))).replayed, true)
  const versions = (await db.query(`
    select ordinal, payload->>'membership_method' method, payload->>'membership_confidence' confidence,
           predecessor_sha256
    from legacy_graph_staging.nie_event_article_versions
    order by ordinal
  `)).rows
  assert.equal(versions.length, 2)
  assert.equal(versions[0].confidence, '0.6')
  assert.equal(versions[1].confidence, '0.7')
  assert.equal(versions[1].predecessor_sha256, first.payload_sha256)
  assert.equal((await db.query(
    'select payload->>\'membership_confidence\' confidence from legacy_graph_staging.nie_event_article_memberships',
  )).rows[0].confidence, '0.6')
  await assert.rejects(
    db.exec('update legacy_graph_staging.nie_event_article_versions set ordinal=3'),
    /append-only/,
  )
  assert.equal(await count(db, 'select count(*)::int n from public.event_articles'), 0)
  assert.equal(await count(db, 'select count(*)::int n from public.comparison_public'), publicBefore)

  await applyStagingPage(db, {
    run_id: 'nie-interrupted-article',
    records: [{
      source_project_ref: NIE_PROJECT_REF, source_table: 'articles', source_id: OTHER,
      payload: { id: OTHER, title: 'Recovered synthetic article', url: 'https://example.invalid/nie-recovered' },
    }],
  })
  await db.exec('begin')
  const transient = await asRole(db, 'service_role', () => stageNieEventArticle(db, { ...membership, article_id: OTHER }))
  assert.equal(transient.review_state, 'pending_review')
  assert.equal(await count(db, 'select count(*)::int n from legacy_graph_staging.nie_event_article_memberships'), 2)
  assert.equal(await count(db, 'select count(*)::int n from legacy_graph_staging.nie_event_article_versions'), 3)
  await db.exec('rollback')
  assert.equal(await count(db, 'select count(*)::int n from legacy_graph_staging.nie_event_article_memberships'), 1)
  assert.equal(await count(db, 'select count(*)::int n from legacy_graph_staging.nie_event_article_versions'), 2)
  const recovered = await asRole(db, 'service_role', () => stageNieEventArticle(db, { ...membership, article_id: OTHER }))
  assert.equal(recovered.review_state, 'pending_review')
  assert.equal(recovered.replayed, false)
  assert.equal(await count(db, 'select count(*)::int n from legacy_graph_staging.nie_event_article_memberships'), 2)
  assert.equal(await count(db, 'select count(*)::int n from legacy_graph_staging.nie_event_article_versions'), 3)

  await asRole(db, 'service_role', async () => {
    assert.equal(await count(db, 'select count(*)::int n from legacy_graph_staging.nie_event_article_memberships'), 2)
    await assert.rejects(db.exec(
      "update legacy_graph_staging.nie_event_article_memberships set payload='{}'::jsonb",
    ), /permission denied/)
    await assert.rejects(db.exec(
      'delete from legacy_graph_staging.nie_event_article_memberships',
    ), /permission denied/)
    await assert.rejects(db.exec(
      'truncate legacy_graph_staging.nie_event_article_memberships',
    ), /permission denied/)
  })

  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`)
    try {
      await assert.rejects(db.exec('select * from legacy_graph_staging.nie_event_article_memberships'), /permission denied/)
      await assert.rejects(db.exec('select * from legacy_graph_staging.nie_event_article_versions'), /permission denied/)
      await assert.rejects(db.query(
        'select legacy_graph_staging.stage_nie_event_article($1::jsonb,$2::text)',
        [JSON.stringify(candidate.payload), candidate.payload_sha256],
      ), /permission denied/)
    } finally {
      await db.exec('reset role')
    }
  }
  assert.equal(await count(db, 'select count(*)::int n from public.comparison_public'), publicBefore)
})
