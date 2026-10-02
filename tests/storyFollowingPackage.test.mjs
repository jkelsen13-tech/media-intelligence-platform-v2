import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { storyFollowingFixture } from './storyFollowingFixture.mjs'
import { storyFollowingCatalogQuery, STORY_FOLLOWING_PROPOSAL, STORY_FOLLOWING_ROLLBACK } from '../scripts/storyFollowingPackage.mjs'
import { randomUUID } from 'node:crypto'

test('exact unapplied Following pack restores dependency catalogue and preserves canonical rows',async t=>{
  const f=await storyFollowingFixture();t.after(()=>f.db.close())
  await f.db.exec('set search_path=pg_catalog')
  const before=(await f.db.query(await storyFollowingCatalogQuery())).rows[0].jsonb_build_object
  const canonical=(await f.db.query('select public.read_reviewed_public_story_v1($1) r',[f.v1.story_id])).rows[0].r
  assert.equal(before.new_objects.length,3)
  await assert.rejects(f.db.exec(await readFile(STORY_FOLLOWING_PROPOSAL,'utf8')),/baseline missing or drifted/)
  await f.db.exec('rollback')
  await f.db.exec(await readFile(STORY_FOLLOWING_ROLLBACK,'utf8'))
  const restored=(await f.db.query(await storyFollowingCatalogQuery())).rows[0].jsonb_build_object
  const expected=(await f.db.query("select current_setting('mip.story_following_expected_catalog')::jsonb r")).rows[0].r
  assert.deepEqual(restored,expected)
  assert.deepEqual((await f.db.query('select public.read_reviewed_public_story_v1($1) r',[f.v1.story_id])).rows[0].r,canonical)
})

test('rollback refuses populated history and leaves all preferences intact',async t=>{
  const f=await storyFollowingFixture();t.after(()=>f.db.close())
  await f.follow('subscribe',{user_id:f.viewer,story_id:f.v1.story_id,subject_type:f.v1.subject_type,subject_id:f.subject,
    public_version_id:f.v1.public_version_id,event_id:randomUUID(),previous_event_id:null})
  await assert.rejects(f.db.exec(await readFile(STORY_FOLLOWING_ROLLBACK,'utf8')),/populated Following history must be preserved/)
  await f.db.exec('rollback')
  assert.equal((await f.follow('read',{user_id:f.viewer,story_id:f.v1.story_id})).subscription.status,'active')
})

test('same-name unrelated overloads retain their owners, ACLs and definitions through install and rollback',async t=>{
  let before
  const signatures=['public.mip_public_story_following_v1(integer,text)','mip_private.public_story_material_payload(text)']
  const snapshot=db=>db.query('select oid::regprocedure::text signature,pg_get_userbyid(proowner) owner,proacl::text acl,pg_get_functiondef(oid) definition from pg_proc where oid=any($1::regprocedure[]) order by oid::regprocedure::text',[signatures]).then(r=>r.rows)
  const f=await storyFollowingFixture({beforeInstall:async db=>{
    await db.exec(`create function public.mip_public_story_following_v1(integer,text) returns text language sql security invoker as 'select $2';
      create function mip_private.public_story_material_payload(text) returns text language sql security invoker as 'select $1';
      alter function public.mip_public_story_following_v1(integer,text) owner to authenticated;
      alter function mip_private.public_story_material_payload(text) owner to authenticated;
      revoke all on function public.mip_public_story_following_v1(integer,text),mip_private.public_story_material_payload(text) from public;
      grant execute on function public.mip_public_story_following_v1(integer,text),mip_private.public_story_material_payload(text) to service_role;`)
    before=await snapshot(db)
  }})
  t.after(()=>f.db.close())
  assert.deepEqual(await snapshot(f.db),before)
  await f.db.exec(await readFile(STORY_FOLLOWING_ROLLBACK,'utf8'))
  assert.deepEqual(await snapshot(f.db),before)
})
