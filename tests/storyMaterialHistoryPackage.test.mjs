import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { storyFollowingFixture } from './storyFollowingFixture.mjs'
import { createReviewedVersionFixture } from './reviewedPublicVersionFixture.mjs'
import { installStoryFollowingFixture, STORY_FOLLOWING_ROLLBACK } from '../scripts/storyFollowingPackage.mjs'

const helper = 'mip_private.public_story_material_history_is_complete(uuid,uuid)'

test('exact helper ACL/ownership and unrelated overload survive empty-package rollback', async t => {
  const overload = 'mip_private.public_story_material_history_is_complete(text,text)'
  const snapshot = db => db.query('select oid::regprocedure::text signature,pg_get_userbyid(proowner) owner,proacl::text acl,pg_get_functiondef(oid) definition from pg_proc where oid=$1::regprocedure', [overload]).then(r => r.rows[0])
  let before
  const f = await storyFollowingFixture({ beforeInstall: async db => {
    await db.exec("create function mip_private.public_story_material_history_is_complete(text,text) returns text language sql security invoker as 'select $1'; alter function mip_private.public_story_material_history_is_complete(text,text) owner to authenticated; revoke all on function mip_private.public_story_material_history_is_complete(text,text) from public; grant execute on function mip_private.public_story_material_history_is_complete(text,text) to service_role;")
    before = await snapshot(db)
  } })
  t.after(() => f.db.close())
  assert.deepEqual(await snapshot(f.db), before)
  const meta = (await f.db.query('select prosecdef,proconfig,pg_get_userbyid(proowner) owner from pg_proc where oid=$1::regprocedure', [helper])).rows[0]
  assert.equal(meta.prosecdef, true); assert.ok(meta.proconfig.includes('search_path=""'))
  assert.equal(meta.owner, await f.db.query("select pg_get_userbyid(relowner) owner from pg_class where oid='mip_private.reviewed_public_story_versions'::regclass").then(r => r.rows[0].owner))
  const grants = (await f.db.query("select case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end grantee from pg_proc p cross join lateral aclexplode(p.proacl) a where p.oid=$1::regprocedure and a.privilege_type='EXECUTE'", [helper])).rows.map(r => r.grantee).sort()
  assert.deepEqual(grants, ['anon','authenticated',meta.owner,'service_role'].sort())
  assert.equal((await f.db.query("select current_setting('mip.story_following_expected_installed_catalog')::jsonb r")).rows[0].r.history_completeness_helper.identity, helper)
  await f.db.exec(await readFile(STORY_FOLLOWING_ROLLBACK, 'utf8'))
  assert.equal((await f.db.query('select to_regprocedure($1) helper', [helper])).rows[0].helper, null)
  assert.deepEqual(await snapshot(f.db), before)
})

test('installed helper authority drift refuses rollback before any package mutation', async t => {
  const f = await storyFollowingFixture(); t.after(() => f.db.close())
  await f.db.exec('grant execute on function mip_private.public_story_material_history_is_complete(uuid,uuid) to public')
  await assert.rejects(f.db.exec(await readFile(STORY_FOLLOWING_ROLLBACK, 'utf8')), /installed catalogue missing or drifted/)
  await f.db.exec('rollback')
  assert.ok((await f.db.query("select to_regclass('mip_private.public_story_follows') r")).rows[0].r)
  assert.ok((await f.db.query('select to_regprocedure($1) r', [helper])).rows[0].r)
})

test('an existing exact helper signature refuses install without replacing its owner or ACL', async t => {
  const f = await createReviewedVersionFixture(); t.after(() => f.db.close())
  await f.db.exec("create table public.mip_profiles(id uuid primary key); create function mip_private.public_story_material_history_is_complete(uuid,uuid) returns boolean language sql security invoker as 'select false'; alter function mip_private.public_story_material_history_is_complete(uuid,uuid) owner to authenticated; revoke all on function mip_private.public_story_material_history_is_complete(uuid,uuid) from public; grant execute on function mip_private.public_story_material_history_is_complete(uuid,uuid) to service_role;")
  const query = 'select pg_get_userbyid(proowner) owner,proacl::text acl,pg_get_functiondef(oid) definition from pg_proc where oid=$1::regprocedure'
  const before = (await f.db.query(query, [helper])).rows[0]
  await assert.rejects(installStoryFollowingFixture(f.db), /package already installed/)
  await f.db.exec('rollback')
  assert.deepEqual((await f.db.query(query, [helper])).rows[0], before)
  assert.equal((await f.db.query("select to_regclass('mip_private.public_story_material_changes') r")).rows[0].r, null)
})
