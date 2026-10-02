import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { applyFoundation } from '../scripts/mipConsolidationRestore.mjs'
import { reviewedVersionCatalogQuery, reviewedVersionInstalledCatalogQuery, installReviewedPublicVersionFixture, REVIEWED_VERSION_PROPOSAL } from '../scripts/reviewedPublicVersionPackage.mjs'
import { createReviewedVersionFixture } from './reviewedPublicVersionFixture.mjs'

test('unapplied install requires exact fresh owner catalog; guarded empty rollback restores predecessor contract',async t=>{
  const db=await PGlite.create()
  t.after(()=>db.close())
  await applyFoundation(db)
  const sql=await readFile(REVIEWED_VERSION_PROPOSAL,'utf8')
  await assert.rejects(db.exec(sql),/catalog baseline missing or drifted/)
  await db.exec('rollback;set search_path=pg_catalog')
  const original=(await db.query(await reviewedVersionCatalogQuery())).rows[0].jsonb_build_object
  const drift={...original,roles:[]}
  await db.query("select set_config('mip.public_reviewed_versions_expected_catalog',$1,false)",[JSON.stringify(drift)])
  await assert.rejects(db.exec(sql),/catalog baseline missing or drifted/)
  await db.exec('rollback')
  assert.equal((await db.query("select to_regclass('mip_private.reviewed_public_stories') name")).rows[0].name,null)
  await installReviewedPublicVersionFixture(db)
  await db.exec('set search_path=pg_catalog')
  const installed=(await db.query(await reviewedVersionInstalledCatalogQuery())).rows[0].jsonb_build_object
  const rollback=await readFile(new URL('../supabase/source-proposals/public-reviewed-versions-v1.rollback.sql',import.meta.url),'utf8')
  await assert.rejects(db.exec(rollback),/rollback baselines required/)
  await db.exec('rollback')
  await db.query("select set_config('mip.public_reviewed_versions_original_catalog',$1,false)",[JSON.stringify(original)])
  await db.query("select set_config('mip.public_reviewed_versions_rollback_expected_catalog',$1,false)",[JSON.stringify({...installed,package_functions:[]})])
  await assert.rejects(db.exec(rollback),/rollback catalog drift/)
  await db.exec('rollback')
  await db.query("select set_config('mip.public_reviewed_versions_rollback_expected_catalog',$1,false)",[JSON.stringify(installed)])
  await db.exec(rollback)
  await db.exec('set search_path=pg_catalog')
  const restored=(await db.query(await reviewedVersionCatalogQuery())).rows[0].jsonb_build_object
  // GRANT appends restored ACL entries. Native permission tuples must be
  // identical even when PostgreSQL serializes that array in a new order.
  async function canonicalCatalog(catalog) {
    const result=structuredClone(catalog)
    for(const relation of result.relations) {
      relation.acl=(await db.query('select jsonb_agg(to_jsonb(x) order by x.grantor,x.grantee,x.privilege_type,x.is_grantable) acl from aclexplode($1::aclitem[])x',[relation.acl])).rows[0].acl
    }
    return result
  }
  assert.deepEqual(await canonicalCatalog(restored),await canonicalCatalog(original))
})

test('rollback never deletes admitted history or cascades other owner dependencies',async t=>{
  const f=await createReviewedVersionFixture()
  t.after(()=>f.db.close())
  const version=await f.bindArticle(f.first)
  await f.db.exec('set search_path=pg_catalog')
  const installed=(await f.db.query(await reviewedVersionInstalledCatalogQuery())).rows[0].jsonb_build_object
  const original={...installed.base,new_objects:[]}
  await f.db.query("select set_config('mip.public_reviewed_versions_original_catalog',$1,false)",[JSON.stringify(original)])
  await f.db.query("select set_config('mip.public_reviewed_versions_rollback_expected_catalog',$1,false)",[JSON.stringify(installed)])
  const rollback=await readFile(new URL('../supabase/source-proposals/public-reviewed-versions-v1.rollback.sql',import.meta.url),'utf8')
  await assert.rejects(f.db.exec(rollback),/admitted history exists; destructive rollback refused/)
  await f.db.exec('rollback')
  assert.equal((await f.readArticle(f.first.article_id)).public_version_id,version)
  assert.ok(!/^\s*drop.*cascade/im.test(rollback))
})
