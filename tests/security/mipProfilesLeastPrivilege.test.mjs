import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
const proposal = readFileSync(new URL('../../supabase/source-proposals/mip_profiles_least_privilege_2026-10-02.sql', import.meta.url), 'utf8')
const baselineQuery = proposal.split('-- BEGIN BASELINE QUERY')[1].split('-- END BASELINE QUERY')[0].replace('into actual', '')
const tableMigration = readFileSync(new URL('../../supabase/migrations/20260813_mip_profiles.sql', import.meta.url), 'utf8')
const scopeMigration = readFileSync(new URL('../../supabase/migrations/20260813_scope_mip_signup_trigger.sql', import.meta.url), 'utf8')
const own = '10000000-0000-4000-8000-000000000001'
const other = '10000000-0000-4000-8000-000000000002'
const unrelated = '10000000-0000-4000-8000-000000000003'
async function setup(t) {
  const db = new PGlite()
  t.after(() => db.close())
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;`)
  await db.exec(tableMigration + scopeMigration)
  await db.exec(`grant all on public.mip_profiles to anon,authenticated,service_role;
    alter function public.handle_new_mip_user() set search_path='';
    revoke execute on function public.handle_new_mip_user() from public;
    grant execute on function public.handle_new_mip_user() to service_role;`)
  return db
}
async function baseline(db) { return (await db.query(baselineQuery)).rows[0].jsonb_build_object }
async function approveFixture(db) {
  await db.query("select set_config('mip.profile_acl_expected_catalog',$1,false)", [JSON.stringify(await baseline(db))])
}
async function privileges(db) {
  return (await db.query(`select role, privilege, has_table_privilege(role,'public.mip_profiles',privilege) allowed
    from (values ('anon'),('authenticated'),('service_role')) roles(role)
    cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('TRIGGER'),('REFERENCES'),('MAINTAIN')) p(privilege)
    order by role,privilege`)).rows
}

test('profile proposal removes only non-CRUD browser privileges and preserves identity catalog and service grants', async t => {
  const db = await setup(t)
  const before = await baseline(db)
  const oldPrivileges = await privileges(db)
  await approveFixture(db)
  await db.exec(proposal)
  const after = await baseline(db)
  assert.deepEqual({ ...after, acl: null }, { ...before, acl: null })
  for (const row of await privileges(db)) {
    const prior = oldPrivileges.find(p => p.role === row.role && p.privilege === row.privilege)
    assert.equal(row.allowed, row.role !== 'service_role' && ['TRUNCATE','TRIGGER','REFERENCES','MAINTAIN'].includes(row.privilege) ? false : prior.allowed)
  }
})

test('positive control proves broad TRUNCATE bypasses row policies; proposal denies it', async t => {
  const db = await setup(t)
  await db.query("insert into auth.users values ($1,'{\"app\":\"mip\"}')", [own])
  await db.exec('set role anon; truncate public.mip_profiles; reset role')
  assert.equal((await db.query('select count(*)::int n from public.mip_profiles')).rows[0].n, 0)
  await approveFixture(db)
  await db.exec(proposal)
  await db.exec('set role anon')
  await assert.rejects(db.exec('truncate public.mip_profiles'), /permission denied/)
  await db.exec('reset role')
})

test('own-row profile CRUD and MIP-only signup trigger work after proposal; cross-user access remains denied', async t => {
  const db = await setup(t)
  await approveFixture(db)
  await db.exec(proposal)
  await db.query('insert into auth.users values ($1,$2),($3,$2),($4,$5)', [own,'{"app":"mip"}',other,unrelated,'{"app":"other"}'])
  assert.deepEqual((await db.query('select id from public.mip_profiles order by id')).rows, [{ id: own }, { id: other }])
  await db.exec('set role authenticated')
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [own])
  assert.deepEqual((await db.query('select id from public.mip_profiles')).rows, [{ id: own }])
  assert.equal((await db.query('update public.mip_profiles set display_name=$1 where id=$2 returning id', ['Own profile',own])).rows.length, 1)
  assert.equal((await db.query('update public.mip_profiles set display_name=$1 where id=$2 returning id', ['Other profile',other])).rows.length, 0)
  await assert.rejects(db.query('update public.mip_profiles set id=$1 where id=$2', [unrelated,own]), /row-level security/)
  await assert.rejects(db.query('insert into public.mip_profiles(id) values ($1)', [unrelated]), /row-level security/)
  assert.equal((await db.query('delete from public.mip_profiles where id=$1 returning id', [other])).rows.length, 0)
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [unrelated])
  await db.query('insert into public.mip_profiles(id,display_name) values ($1,$2)', [unrelated,'Own inserted profile'])
  assert.deepEqual((await db.query('select id from public.mip_profiles')).rows, [{ id: unrelated }])
  await db.exec('reset role')
  assert.equal((await db.query('select count(*)::int n from public.mip_profiles')).rows[0].n, 3)
})

test('missing baseline, policy drift and indirect effective grants abort atomically', async t => {
  const db = await setup(t)
  await assert.rejects(db.exec(proposal), /exact reviewed catalog baseline/)
  await db.exec('rollback')
  await approveFixture(db)
  await db.exec('drop policy mip_profiles_update_own on public.mip_profiles')
  await assert.rejects(db.exec(proposal), /baseline drift/)
  await db.exec('rollback')
  assert.equal((await privileges(db)).find(p => p.role === 'anon' && p.privilege === 'TRUNCATE').allowed, true)
  await db.exec('grant truncate on public.mip_profiles to public')
  await approveFixture(db)
  await assert.rejects(db.exec(proposal), /broad privileges remain/)
  await db.exec('rollback')
  assert.equal((await privileges(db)).find(p => p.role === 'authenticated' && p.privilege === 'TRUNCATE').allowed, true)
})

test('non-owner execution fails closed; table REFERENCES revoke also removes owned column REFERENCES while preserving column SELECT', async t => {
  const db = await setup(t)
  await approveFixture(db)
  await db.exec('set role authenticated')
  await assert.rejects(db.exec(proposal), /verified table owner/)
  await db.exec('rollback; reset role')
  await db.exec('grant references (id), select (id) on public.mip_profiles to anon')
  await approveFixture(db)
  await db.exec(proposal)
  assert.equal((await db.query("select has_any_column_privilege('anon','public.mip_profiles','REFERENCES') allowed")).rows[0].allowed, false)
  assert.match((await baseline(db)).columns.find(c => c.name === 'id').acl, /r\//)
})
