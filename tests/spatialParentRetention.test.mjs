import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const base = await readFile(new URL('../supabase/migrations/20260909181233_spatial_history_retention.sql', import.meta.url), 'utf8')
const patch = await readFile(new URL('../supabase/migrations/20260909190228_spatial_parent_retention.sql', import.meta.url), 'utf8')
const ancestorPatch = await readFile(new URL('../supabase/retention-contracts/spatial_source_ancestor.sql', import.meta.url), 'utf8')
const source = 'jfnzyvzthzqtczlxhjll', observed = '2026-01-01T00:00:00Z'
const references = [
  {
    "child": "spatial.assertion_revisions",
    "field": "canonical_place_id",
    "parent": "public.geographic_places"
  },
  {
    "child": "spatial.assertions",
    "field": "graph_node_id",
    "parent": "public.nodes"
  },
  {
    "child": "spatial.evidence_artifact_registry",
    "field": "article_id",
    "parent": "public.articles"
  },
  {
    "child": "spatial.evidence_artifact_registry",
    "field": "policy_document_id",
    "parent": "public.policy_documents"
  },
  {
    "child": "spatial.evidence_condition_events",
    "field": "source_change_event_id",
    "parent": "public.source_change_events"
  },
  {
    "child": "spatial.geometry_snapshots",
    "field": "canonical_place_id",
    "parent": "public.geographic_places"
  },
  {
    "child": "spatial.graph_node_authority_snapshots",
    "field": "graph_node_id",
    "parent": "public.nodes"
  },
  {
    "child": "spatial.place_authority_snapshots",
    "field": "canonical_place_id",
    "parent": "public.geographic_places"
  }
]
async function fixture(t) {
  const db = await PGlite.create(); t.after(() => db.close())
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create schema mip_private;')
  await db.exec(base)
  await db.exec(patch)
  await db.exec(ancestorPatch)
  await db.exec('set role service_role')
  return db
}
const retain = (db, relation, rows) => db.query(
  'select mip_private.retain_spatial_rows($1,$2,$3,$4::jsonb) r',
  [source,relation,observed,typeof rows === 'string' ? rows : JSON.stringify(rows)]).then(r => r.rows[0].r)
const count = db => db.query("select count(*)::int n from mip_private.spatial_row_versions where source_relation like 'public.%'").then(r=>r.rows[0].n)

test('every declared spatial parent link can retain independent exact versions without publication', async t => {
  const db = await fixture(t)
  for (const [i,ref] of references.entries()) {
    await retain(db,ref.child,[{id:'child-'+i,[ref.field]:'parent-'+i}])
    const row={id:'parent-'+i,fixture:true,reader_state:'pending_review',source_native_time:'2026-01-01T00:00:00.123456+05:30'}
    assert.equal((await retain(db,ref.parent,[row])).inserted,1)
    assert.equal((await retain(db,ref.parent,[row])).already_retained,1)
  }
  assert.equal(await count(db),8)
  const ref=references[0]
  await retain(db,ref.parent,'[{"id":"parent-0","coordinate":41.123456789012345678,"ordinal":9007199254740993,"revision":"later observation"}]')
  assert.equal(await count(db),9)
  const row=(await db.query("select payload->>'coordinate' as coordinate,payload->>'ordinal' as ordinal from mip_private.spatial_row_versions where payload ? 'coordinate'")).rows[0]
  assert.deepEqual(row,{coordinate:'41.123456789012345678',ordinal:'9007199254740993'})
  assert.equal((await db.query("select count(*)::int n from pg_class where relnamespace='public'::regnamespace and relkind='r'")).rows[0].n,0)
})

test('unrelated IDs, wrong relation/field and self-asserted links cannot bypass the parent reference guard', async t => {
  const db = await fixture(t)
  await retain(db,'spatial.assertions',[{id:'root',graph_node_id:'linked'}])
  for (const [relation,rows] of [
    ['public.nodes',[{id:'unrelated'}]],
    ['public.articles',[{id:'linked'}]],
    ['public.nodes',[{id:'unrelated',graph_node_id:'linked',source_relation:'spatial.assertions'}]],
    ['public.nodes',[{id:'linked'},{id:'unrelated'}]]
  ]) {
    await assert.rejects(retain(db,relation,rows),/spatial_parent_reference_required/)
    assert.equal(await count(db),0,'a later unrelated parent rolls back the whole call')
  }
  await retain(db,'spatial.assertions',[{id:'wrong-field',article_id:'not-a-node'}])
  await assert.rejects(retain(db,'public.nodes',[{id:'not-a-node'}]),/spatial_parent_reference_required/)
  await assert.rejects(db.exec("insert into mip_private.spatial_row_versions(source_project,source_relation,source_key,payload_hash,payload,source_observed_at) values ('jfnzyvzthzqtczlxhjll','public.nodes','direct',encode(sha256(convert_to('{\"id\":\"direct\"}'::jsonb::text,'UTF8')),'hex'),'{\"id\":\"direct\"}'::jsonb,'2026-01-01')"),/spatial_parent_reference_required/)
  assert.equal(await count(db),0)
  assert.equal((await retain(db,'public.nodes',[{id:'linked'}])).inserted,1)
})

test('parent retention preserves closed grants, enabled immutability guards and invoker-only functions', async t => {
  const db = await fixture(t)
  const roles=(await db.query("select r,has_table_privilege(r,'mip_private.spatial_row_versions','select') as readable,has_function_privilege(r,'mip_private.retain_spatial_rows(text,text,timestamptz,jsonb)','execute') as callable from unnest(array['anon','authenticated']) r")).rows
  assert.ok(roles.every(r=>!r.readable&&!r.callable))
  const fns=(await db.query("select proname,prosecdef,proconfig from pg_proc where pronamespace='mip_private'::regnamespace")).rows
  assert.ok(fns.every(r=>!r.prosecdef&&r.proconfig.includes('search_path=""')))
  const guards=(await db.query("select tgname,tgenabled from pg_trigger where tgrelid='mip_private.spatial_row_versions'::regclass and not tgisinternal")).rows
  assert.equal(guards.length,3); assert.ok(guards.every(r=>r.tgenabled==='O'))
  assert.equal((await retain(db,'spatial.policy_artifacts',[{id:'original-scope'}])).inserted,1)
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='mip_private.spatial_row_versions'::regclass")).rows[0].relrowsecurity,true)
})

test('source_record ancestry requires the typed registry mapping rather than an untyped matching identifier', async t => {
  const db = await fixture(t)
  await retain(db,'spatial.evidence_artifact_registry',[{id:'wrong-kind',artifact_type_code:'article',source_record_id:'source'}])
  await assert.rejects(retain(db,'public.sources',[{id:'source',node_id:'node'}]),/spatial_source_record_reference_required/)
  await retain(db,'spatial.evidence_condition_events',[{id:'untyped',source_id:'source'}])
  await assert.rejects(retain(db,'public.sources',[{id:'source',node_id:'node'}]),/spatial_source_record_reference_required/)
  await retain(db,'spatial.evidence_artifact_registry',[{id:'typed',artifact_type_code:'source_record',source_record_id:'source',source_node_id:'node'}])
  assert.equal((await retain(db,'public.sources',[{id:'source',node_id:'node',published_at:'2026-01-01'}])).inserted,1)
  assert.equal((await retain(db,'public.sources',[{id:'source',node_id:'node',published_at:'2026-01-01'}])).already_retained,1)
  await assert.rejects(retain(db,'public.sources',[{id:'different'}]),/spatial_source_record_reference_required/)
  assert.equal(await count(db),1)
})
