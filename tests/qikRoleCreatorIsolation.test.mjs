import test from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'

// Synthetic, memory-only preliminary coverage. This does not qualify hosted
// PostgreSQL 17.6; record the actual engine version printed by these tests.
const setup = async db => {
  await db.exec('create role nq_parent login createrole nosuperuser nobypassrls; create schema nq_stage authorization nq_parent;')
  await db.exec('set session authorization nq_parent;')
  const { rows: [identity] } = await db.query("select session_user,current_user,rolsuper,rolcreaterole,rolbypassrls from pg_roles where rolname=current_user")
  assert.deepEqual(identity, {session_user:'nq_parent',current_user:'nq_parent',rolsuper:false,rolcreaterole:true,rolbypassrls:false})
}
const install = `begin;
create role nq_creator nologin createrole noinherit;
grant nq_creator to nq_parent with inherit false,set true;
set role nq_creator;
create role nq_owner nologin noinherit;
grant nq_owner to nq_parent with inherit true,set true;
reset role;
grant usage,create on schema nq_stage to nq_owner;
create table nq_stage.sample(id integer primary key);
insert into nq_stage.sample values(7);
alter table nq_stage.sample owner to nq_owner;`
const finalize = `set role nq_creator;
revoke nq_owner from nq_parent cascade;
reset role;
revoke nq_creator from nq_parent;
drop role nq_creator;`
const roles = "select rolname from pg_roles where rolname in ('nq_parent','nq_creator','nq_owner') order by rolname"

test('temporary creator leaves persistent owner without membership edges', async t => {
 const db = new PGlite()
 try {
  t.diagnostic('actual synthetic PostgreSQL '+(await db.query('show server_version')).rows[0].server_version)
  await setup(db)
  await db.exec(install)
  await db.exec(finalize)
  const {rows:[state]}=await db.query(`select session_user,current_user,
   (select count(*)::int from pg_auth_members m join pg_roles r on r.oid=m.roleid or r.oid=m.member where r.rolname='nq_owner') edges,
   (select relowner::regrole::text from pg_class where oid='nq_stage.sample'::regclass) owner,
   (select count(*)::int from pg_roles where rolname='nq_creator') creators`)
  assert.deepEqual(state,{session_user:'nq_parent',current_user:'nq_parent',edges:0,owner:'nq_owner',creators:0})
  await db.exec('commit;')
  await assert.rejects(db.query('select id from nq_stage.sample'),e=>e.code==='42501')
  await assert.rejects(db.exec('set role nq_owner'),e=>e.code==='42501')
  // Closing this memory-only database destroys its synthetic fixture roles.
 } finally {await db.close()}
})

test('failed installation rollback restores role and membership baseline', async t => {
 const db = new PGlite()
 try {
  await setup(db)
  const baseline=(await db.query('select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members order by roleid,member,grantor')).rows
  await db.exec(install)
  await assert.rejects(db.exec("select 1/0"),e=>e.code==='22012')
  await db.exec('rollback;')
  assert.deepEqual((await db.query(roles)).rows,[{rolname:'nq_parent'}])
  assert.deepEqual((await db.query('select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members order by roleid,member,grantor')).rows,baseline)
  assert.equal((await db.query("select to_regclass('nq_stage.sample') is null absent")).rows[0].absent,true)
  assert.equal((await db.query("select nspowner::regrole::text owner from pg_namespace where nspname='nq_stage'")).rows[0].owner,'nq_parent')
  // Fixture baseline survives rollback; db.close removes the memory database.
 } finally {await db.close()}
})
