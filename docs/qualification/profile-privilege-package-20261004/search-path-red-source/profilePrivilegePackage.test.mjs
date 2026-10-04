import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile,writeFile,mkdtemp,rm,mkdir,stat,chmod,symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join,dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { profileCatalogQuery,profileBaselineQuery,profileProposal,validateProfileCatalog,
  acceptedProfileCatalog,compileProfileSql,validateProfileInstalledReadback,
  PROFILE_CATALOG_CONTRACT,PROFILE_PROPOSAL_SHA256,PROFILE_PROPOSAL_PATH,sha256 } from '../scripts/profilePrivilegePackage.mjs'
import { compileProfilePrivilegeArtifact,verifyProfilePrivilegeArtifact,profileSourceIdentities } from '../scripts/compileProfilePrivilegePackage.mjs'

const root=new URL('../',import.meta.url)
const own='10000000-0000-4000-8000-000000000001',other='10000000-0000-4000-8000-000000000002',unrelated='10000000-0000-4000-8000-000000000003'
const now=Date.parse('2026-10-04T18:00:00.000Z')
async function fixture(t) {
  const db=new PGlite();t.after(()=>db.close())
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as
      'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;`)
  await db.exec(await readFile(new URL('supabase/migrations/20260813_mip_profiles.sql',root),'utf8')+
    await readFile(new URL('supabase/migrations/20260813_scope_mip_signup_trigger.sql',root),'utf8'))
  await db.exec(`grant all on public.mip_profiles to anon,authenticated,service_role;
    grant references(id),select(id),update(display_name) on public.mip_profiles to anon with grant option;
    grant insert(display_name),select(created_at) on public.mip_profiles to authenticated with grant option;
    grant references(id),select(id),update(display_name) on public.mip_profiles to service_role with grant option;
    alter function public.handle_new_mip_user() set search_path='';
    revoke execute on function public.handle_new_mip_user() from public;
    grant execute on function public.handle_new_mip_user() to service_role;
    select set_config('mip.profile_acl_expected_catalog','preexisting-session-value',false);`)
  await db.query('insert into auth.users values ($1,$2),($3,$2),($4,$5)',[own,'{"app":"mip"}',other,unrelated,'{"app":"other"}'])
  return db
}
async function catalog(db){return (await db.query(await profileCatalogQuery())).rows[0].catalog}
async function accepted(c,{observed=now,accepted=observed}={}) {
  return {contract:PROFILE_CATALOG_CONTRACT,qualification:'SYNTHETIC_PGLITE_ONLY',observed_at_utc:new Date(observed).toISOString(),catalog:c,
    acceptance:{status:'INDEPENDENTLY_ACCEPTED',accepted_by:'synthetic fixture reviewer; no real catalog acceptance',accepted_at_utc:new Date(accepted).toISOString(),
      catalog_sha256:sha256(JSON.stringify(c)),query_sha256:sha256(await profileCatalogQuery()),proposal_sha256:PROFILE_PROPOSAL_SHA256}}
}
async function privateFiles(t,c) {
  const dir=await mkdtemp(join(tmpdir(),'mip-profile-package-'));t.after(()=>rm(dir,{recursive:true,force:true}))
  const catalogPath=join(dir,'accepted.json'),outputPath=join(dir,'artifact.sql')
  await writeFile(catalogPath,JSON.stringify(await accepted(c)),{mode:0o600})
  return {dir,catalogPath,outputPath,now}
}
async function settings(db) {return (await db.query(`select current_setting('lock_timeout') lock_timeout,
  current_setting('statement_timeout') statement_timeout,current_setting('idle_in_transaction_session_timeout') idle_timeout,
  current_setting('mip.profile_acl_expected_catalog',true) baseline`)).rows[0]}

test('byte-exact existing proposal is preserved and its own catalog query is used',async()=>{
  const bytes=await readFile(new URL(PROFILE_PROPOSAL_PATH,root));assert.equal(bytes.length,3870);assert.equal(sha256(bytes),PROFILE_PROPOSAL_SHA256)
  assert.ok((await profileCatalogQuery()).includes(await profileBaselineQuery()))
  assert.equal(await profileProposal(),bytes.toString('utf8'))
})

test('default rollback-only artifact installs exact table/column delta inside transaction and restores complete state/settings',async t=>{
  const db=await fixture(t),before=await catalog(db),initialSettings=await settings(db)
  await db.exec('alter table public.mip_profiles force row level security')
  const forceBefore=await catalog(db),sql=await compileProfileSql(forceBefore)
  assert.match(sql,/lock table public\.mip_profiles in access exclusive mode/);assert.match(sql,/rollback;\s*$/)
  assert.equal((sql.match(/^begin;$/gm)||[]).length,1);assert.equal((sql.match(/^commit;$/gm)||[]).length,0)
  // Execute the actual compiled byte prefix, leaving only its mandatory final
  // ROLLBACK for independent fixture observation of the installed state.
  await db.exec(sql.replace(/rollback;\s*$/,''))
  const inside=await catalog(db);validateProfileInstalledReadback(forceBefore,inside)
  assert.deepEqual(await settings(db),{lock_timeout:'5s',statement_timeout:'30s',idle_timeout:'30s',baseline:JSON.stringify(forceBefore.baseline)})
  for(const role of ['anon','authenticated']) {
    for(const privilege of ['TRUNCATE','TRIGGER','REFERENCES','MAINTAIN'])assert.equal(inside.effective.find(e=>e.role===role&&e.scope==='table'&&e.privilege===privilege).allowed,false)
    assert.equal(inside.effective.some(e=>e.role===role&&e.privilege==='REFERENCES'&&e.allowed),false)
  }
  assert.deepEqual(inside.acl_entries.filter(e=>e.grantee==='service_role'),forceBefore.acl_entries.filter(e=>e.grantee==='service_role'))
  assert.deepEqual(inside.rows,before.rows);assert.deepEqual(inside.baseline.signup_trigger,forceBefore.baseline.signup_trigger)
  await db.exec('rollback')
  assert.deepEqual(await catalog(db),forceBefore);assert.deepEqual(await settings(db),initialSettings)
})

test('explicit commit source artifact and actual installed readback preserve CRUD/service/grant options and own-row RLS',async t=>{
  const db=await fixture(t),before=await catalog(db),initialSettings=await settings(db)
  await db.exec(await compileProfileSql(before,{mode:'commit'}))
  const installed=await catalog(db);validateProfileInstalledReadback(before,installed)
  assert.deepEqual(await settings(db),initialSettings)
  assert.ok(installed.acl_entries.some(e=>e.scope==='column'&&e.grantee==='anon'&&e.privilege==='SELECT'&&e.grant_option))
  assert.ok(installed.acl_entries.some(e=>e.scope==='column'&&e.grantee==='authenticated'&&e.privilege==='INSERT'&&e.grant_option))
  await db.exec('set role authenticated')
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[own])
  assert.deepEqual((await db.query('select id from public.mip_profiles')).rows,[{id:own}])
  assert.equal((await db.query('update public.mip_profiles set display_name=$1 where id=$2 returning id',['own',own])).rows.length,1)
  assert.equal((await db.query('update public.mip_profiles set display_name=$1 where id=$2 returning id',['other',other])).rows.length,0)
  await assert.rejects(db.query('update public.mip_profiles set id=$1 where id=$2',[unrelated,own]),/row-level security/)
  await assert.rejects(db.query('insert into public.mip_profiles(id) values ($1)',[unrelated]),/row-level security/)
  assert.equal((await db.query('delete from public.mip_profiles where id=$1 returning id',[other])).rows.length,0)
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[unrelated])
  await db.query('insert into public.mip_profiles(id) values ($1)',[unrelated])
  await db.exec('reset role;set role service_role')
  assert.equal((await db.query('select count(*)::int n from public.mip_profiles')).rows[0].n,3)
  await db.exec('reset role')
})

test('same-owner policy, role-attribute and row drift abort before privilege change and roll back',async t=>{
  const db=await fixture(t)
  for(const mutation of ["alter role authenticated connection limit 7",'alter table public.mip_profiles force row level security',"update public.mip_profiles set display_name='drift' where id='"+own+"'"]) {
    const before=await catalog(db),sql=await compileProfileSql(before)
    await db.exec(mutation);const changed=await catalog(db)
    await assert.rejects(db.exec(sql),/accepted security\/session\/catalog\/row baseline drift/)
    await db.exec('rollback');assert.deepEqual(await catalog(db),changed)
    assert.equal(changed.baseline.owner,before.baseline.owner)
    assert.equal(changed.effective.find(e=>e.role==='anon'&&e.scope==='table'&&e.privilege==='TRUNCATE').allowed,true)
  }
})

test('non-owner runtime security/session identity mismatch refuses before REVOKE',async t=>{
  const db=await fixture(t),before=await catalog(db),sql=await compileProfileSql(before)
  await db.exec('set role authenticated');await assert.rejects(db.exec(sql),/permission denied|baseline drift/)
  await db.exec('rollback;reset role');assert.deepEqual(await catalog(db),before)
  const forged=structuredClone(before);forged.identity.database='different-database'
  await assert.rejects(db.exec(await compileProfileSql(forged)),/baseline drift/)
  await db.exec('rollback');assert.deepEqual(await catalog(db),before)
})

test('PUBLIC and inherited broad grants, unexpected grantors and dependent grants refuse in offline compiler',async t=>{
  const db=await fixture(t)
  await db.exec('grant truncate on public.mip_profiles to public')
  assert.throws(()=>validateProfileCatalog(null),/complete exact/)
  assert.throws(()=>validateProfileCatalog({}),/complete exact/)
  await assert.rejects(compileProfileSql(await catalog(db)),/indirect PUBLIC\/inherited/)
  await db.exec('revoke truncate on public.mip_profiles from public;create role indirect;grant indirect to authenticated;grant trigger on public.mip_profiles to indirect')
  await assert.rejects(compileProfileSql(await catalog(db)),/indirect PUBLIC\/inherited/)
  await db.exec('revoke trigger on public.mip_profiles from indirect;grant truncate on public.mip_profiles to indirect with grant option;set role indirect;grant truncate on public.mip_profiles to anon;reset role')
  await assert.rejects(compileProfileSql(await catalog(db)),/unexpected grantor/)
  await db.exec('set role indirect;revoke truncate on public.mip_profiles from anon;reset role;revoke truncate on public.mip_profiles from indirect;grant truncate on public.mip_profiles to anon with grant option;set role anon;grant truncate on public.mip_profiles to indirect;reset role')
  await assert.rejects(compileProfileSql(await catalog(db)),/dependent browser grant/)
})

test('missing/malformed security identity, dangerous browser role and incomplete ACL/effective matrix refuse offline',async t=>{
  const db=await fixture(t),before=await catalog(db)
  const changes=[c=>delete c.identity.session_user,c=>c.identity.server_version_num='not-a-version',c=>c.baseline.owner='different-owner',
    c=>c.roles.find(r=>r.name==='anon').bypass_rls=true,c=>c.effective.pop(),c=>c.acl_entries.push(c.acl_entries[0]),
    c=>c.browser_paths.pop(),c=>delete c.browser_paths[0].set,
    c=>delete c.baseline.signup_trigger.function_owner,c=>c.baseline.signup_trigger=null,c=>c.baseline.row_security=false]
  for(const mutate of changes){const c=structuredClone(before);mutate(c);await assert.rejects(compileProfileSql(c),/complete exact profile/)}
})

test('accepted bytes enforce duplicate-free UTF8, query/source digest, freshness and explicit independent acceptance',async t=>{
  const db=await fixture(t),c=await catalog(db),doc=await accepted(c)
  assert.deepEqual((await acceptedProfileCatalog(Buffer.from(JSON.stringify(doc)),{now})).catalog,c)
  await assert.rejects(acceptedProfileCatalog(Buffer.from(JSON.stringify(doc)),{now:NaN}),/finite source freshness clock/)
  const mutations=[d=>d.acceptance.status='UNREVIEWED',d=>d.acceptance.catalog_sha256='0'.repeat(64),d=>d.acceptance.query_sha256='0'.repeat(64),
    d=>d.acceptance.proposal_sha256='0'.repeat(64),d=>d.acceptance.accepted_by='',d=>d.observed_at_utc='2026-10-04T17:00:00Z',
    d=>d.acceptance.accepted_at_utc='2026-10-04T18:01:00Z']
  for(const mutate of mutations){const d=structuredClone(doc);mutate(d);await assert.rejects(acceptedProfileCatalog(Buffer.from(JSON.stringify(d)),{now}),/accepted|binding/)}
  const duplicate=JSON.stringify(doc).replace('"current_user":','"current_user":"forged","current_user":')
  await assert.rejects(acceptedProfileCatalog(Buffer.from(duplicate),{now}),/duplicate JSON member/)
  await assert.rejects(acceptedProfileCatalog(Buffer.from([0xff]),{now}),/invalid UTF-8/)
  await assert.rejects(acceptedProfileCatalog(Buffer.from('{'),{now}),/malformed JSON/)
})

test('exclusive private artifact pair verifies, refuses collisions and accepted bytes/SQL/receipt tampering/incomplete pairs',async t=>{
  const db=await fixture(t),options=await privateFiles(t,await catalog(db))
  const receipt=await compileProfilePrivilegeArtifact(options)
  assert.equal(receipt.mode,'rollback-only');assert.equal(receipt.live_operations,0)
  assert.equal((await stat(options.outputPath)).mode&0o777,0o600);assert.equal((await stat(options.outputPath+'.sha256.json')).mode&0o777,0o600)
  assert.equal((await verifyProfilePrivilegeArtifact(options)).status,'SOURCE_ARTIFACT_BYTES_MATCH')
  const sql=await readFile(options.outputPath),receiptBytes=await readFile(options.outputPath+'.sha256.json'),acceptedBytes=await readFile(options.catalogPath)
  await assert.rejects(compileProfilePrivilegeArtifact(options),/EEXIST/)
  assert.deepEqual(await readFile(options.outputPath),sql);assert.deepEqual(await readFile(options.outputPath+'.sha256.json'),receiptBytes)
  await writeFile(options.catalogPath,Buffer.concat([acceptedBytes,Buffer.from('\n')]))
  await assert.rejects(verifyProfilePrivilegeArtifact(options),/accepted\/source\/original bytes drifted/)
  await writeFile(options.catalogPath,acceptedBytes)
  await chmod(options.catalogPath,0o644)
  await assert.rejects(verifyProfilePrivilegeArtifact(options),/private regular/)
  await chmod(options.catalogPath,0o600)
  await symlink(options.catalogPath,join(options.dir,'accepted-link.json'))
  await assert.rejects(compileProfilePrivilegeArtifact({...options,catalogPath:join(options.dir,'accepted-link.json'),outputPath:join(options.dir,'linked.sql')}),/private regular/)
  await writeFile(options.outputPath,Buffer.concat([sql,Buffer.from('-- tampered\n')]))
  await assert.rejects(verifyProfilePrivilegeArtifact(options),/SQL bytes drifted/)
  await writeFile(options.outputPath,sql)
  const altered=JSON.parse(receiptBytes);altered.source_artifacts[0].sha256='0'.repeat(64)
  await writeFile(options.outputPath+'.sha256.json',JSON.stringify(altered))
  await assert.rejects(verifyProfilePrivilegeArtifact(options),/source\/original bytes drifted/)
  await writeFile(options.outputPath+'.sha256.json',receiptBytes)
  await rm(options.outputPath);await assert.rejects(verifyProfilePrivilegeArtifact(options),/ENOENT/)
  await rm(options.outputPath+'.sha256.json');await writeFile(options.outputPath,'existing collision')
  await assert.rejects(compileProfilePrivilegeArtifact(options),/EEXIST/)
  assert.equal(await readFile(options.outputPath,'utf8'),'existing collision');await assert.rejects(stat(options.outputPath+'.sha256.json'),/ENOENT/)
})

test('verification refuses actual source drift in an isolated complete imported-helper source copy',async t=>{
  const db=await fixture(t),options=await privateFiles(t,await catalog(db))
  await compileProfilePrivilegeArtifact(options)
  const clone=join(options.dir,'source-copy')
  for(const identity of await profileSourceIdentities()) {
    const path=join(clone,identity.path);await mkdir(dirname(path),{recursive:true});await writeFile(path,await readFile(new URL(identity.path,root)))
  }
  const module=await import(pathToFileURL(join(clone,'scripts/compileProfilePrivilegePackage.mjs')).href)
  assert.equal((await module.verifyProfilePrivilegeArtifact(options)).status,'SOURCE_ARTIFACT_BYTES_MATCH')
  const path=join(clone,'scripts/profilePrivilegeCatalog.sql');await writeFile(path,(await readFile(path,'utf8'))+'\n-- source drift\n')
  await assert.rejects(module.verifyProfilePrivilegeArtifact(options),/query\/proposal\/catalog binding/)
})

test('committed install recovery is exact-source/readback-bound HOLD with no regrant and preserves installed state',async t=>{
  const db=await fixture(t),before=await catalog(db),original=await privateFiles(t,before)
  await compileProfilePrivilegeArtifact({...original,mode:'commit'})
  await db.exec(await readFile(original.outputPath,'utf8'))
  const installed=await catalog(db),catalogPath=join(original.dir,'installed.json'),outputPath=join(original.dir,'hold.sql')
  await writeFile(catalogPath,JSON.stringify(await accepted(installed,{observed:now+1000})),{mode:0o600})
  const recovery={catalogPath,outputPath,mode:'recovery-hold',originalCatalogPath:original.catalogPath,originalArtifactPath:original.outputPath,now:now+1000}
  const receipt=await compileProfilePrivilegeArtifact(recovery),sql=await readFile(outputPath,'utf8')
  assert.equal(receipt.recovery,'HOLD_PRESERVE_STATE_NO_REGRANT');assert.doesNotMatch(sql,/^\s*(?:grant|revoke|update|delete|insert|truncate|alter|drop)\b/im)
  assert.match(sql,/rollback;\s*$/);await db.exec(sql);assert.deepEqual(await catalog(db),installed)
  assert.equal((await verifyProfilePrivilegeArtifact(recovery)).status,'SOURCE_ARTIFACT_BYTES_MATCH')
  const bytes=await readFile(original.outputPath+'.sha256.json');await writeFile(original.outputPath+'.sha256.json',Buffer.concat([bytes,Buffer.from('\n')]))
  await assert.rejects(verifyProfilePrivilegeArtifact(recovery),/bytes drifted/)
  await writeFile(original.outputPath+'.sha256.json',bytes)
  const changed=structuredClone(installed);changed.rows[0].display_name='post-install drift'
  await writeFile(catalogPath,JSON.stringify(await accepted(changed,{observed:now+1000})))
  await assert.rejects(compileProfilePrivilegeArtifact({...recovery,outputPath:join(original.dir,'drift-hold.sql')}),/unexpected catalog\/row\/ACL\/grantor\/options delta/)
})

test('recovery refuses missing/tampered original bytes and a rollback-only artifact presented as committed provenance',async t=>{
  const db=await fixture(t),original=await privateFiles(t,await catalog(db))
  await compileProfilePrivilegeArtifact(original)
  const options={...original,outputPath:join(original.dir,'hold.sql'),mode:'recovery-hold'}
  await assert.rejects(compileProfilePrivilegeArtifact(options),/installed broad privilege remains/)
  await db.exec(await compileProfileSql(await catalog(db),{mode:'commit'}))
  await writeFile(original.catalogPath+'.installed',JSON.stringify(await accepted(await catalog(db),{observed:now+1000})),{mode:0o600})
  const recovery={...options,catalogPath:original.catalogPath+'.installed',now:now+1000}
  await assert.rejects(compileProfilePrivilegeArtifact(recovery),/original commit artifact pair/)
  await assert.rejects(compileProfilePrivilegeArtifact({...recovery,originalCatalogPath:original.catalogPath,originalArtifactPath:original.outputPath}),/original explicit commit/)
})

test('browser SET true INHERIT false broad-role path refuses before source compilation',async t=>{
  const db=await fixture(t)
  await db.exec('create role switch_target;grant truncate on public.mip_profiles to switch_target;grant switch_target to authenticated with inherit false,set true')
  const before=await catalog(db)
  assert.deepEqual((await db.query("select pg_has_role('authenticated','switch_target','USAGE') inherits,pg_has_role('authenticated','switch_target','SET') can_set")).rows,[{inherits:false,can_set:true}])
  // Reproduce the actual permitted switching path in a browser session context.
  await db.exec('set session authorization authenticated;set role switch_target')
  assert.deepEqual((await db.query("select session_user,current_user,has_table_privilege(current_user,'public.mip_profiles','TRUNCATE') broad")).rows,[{session_user:'authenticated',current_user:'switch_target',broad:true}])
  await db.exec('reset role;reset session authorization')
  await assert.rejects(compileProfileSql(before),/browser role path/)
})

test('browser SET path to table owner or a superuser refuses offline',async t=>{
  const db=await fixture(t)
  await db.exec('grant postgres to authenticated with inherit false,set true')
  const before=await catalog(db)
  await db.exec('set session authorization authenticated;set role postgres')
  assert.deepEqual((await db.query("select session_user,current_user,has_table_privilege(current_user,'public.mip_profiles','TRUNCATE') broad")).rows,[{session_user:'authenticated',current_user:'postgres',broad:true}])
  await db.exec('reset role;reset session authorization')
  await assert.rejects(compileProfileSql(before),/browser role path/)
})

test('browser SET path to BYPASSRLS role exposes other profiles and refuses offline',async t=>{
  const db=await fixture(t)
  await db.exec('create role bypass_target bypassrls;grant select on public.mip_profiles to bypass_target;grant bypass_target to authenticated with inherit false,set true')
  const before=await catalog(db)
  await db.exec('set session authorization authenticated')
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[own])
  assert.equal((await db.query('select count(*)::int n from public.mip_profiles')).rows[0].n,1)
  await db.exec('set role bypass_target')
  assert.equal((await db.query('select count(*)::int n from public.mip_profiles')).rows[0].n,2)
  await db.exec('reset role;reset session authorization')
  await assert.rejects(compileProfileSql(before),/browser role path/)
})

test('browser ADMIN-only membership can enable dangerous SET path and refuses offline',async t=>{
  const db=await fixture(t)
  await db.exec('create role admin_target;grant truncate on public.mip_profiles to admin_target;grant admin_target to authenticated with admin true,inherit false,set false')
  const before=await catalog(db)
  assert.equal((await db.query("select pg_has_role('authenticated','admin_target','SET') can_set")).rows[0].can_set,false)
  await db.exec('set session authorization authenticated;grant admin_target to authenticated with set true;set role admin_target')
  assert.equal((await db.query("select has_table_privilege(current_user,'public.mip_profiles','TRUNCATE') broad")).rows[0].broad,true)
  await db.exec('reset role;reset session authorization')
  await assert.rejects(compileProfileSql(before),/browser role path/)
})

test('multi-hop SET, inherited owner and reachable role-admin paths refuse; inert or benign memberships stay allowed',async t=>{
  const db=await fixture(t)
  await db.exec('create role middle;create role dangerous;grant trigger on public.mip_profiles to dangerous;grant dangerous to middle with inherit false,set true;grant middle to authenticated with inherit false,set true')
  await assert.rejects(compileProfileSql(await catalog(db)),/browser role path/)
  await db.exec('revoke middle from authenticated;grant postgres to anon with inherit true,set false')
  await assert.rejects(compileProfileSql(await catalog(db)),/indirect PUBLIC\/inherited|browser role path/)
  await db.exec('revoke postgres from anon;grant dangerous to middle with admin true,inherit false,set false;grant middle to authenticated with inherit false,set true')
  await assert.rejects(compileProfileSql(await catalog(db)),/browser role path/)
  await db.exec('revoke middle from authenticated;revoke dangerous from middle;grant dangerous to authenticated with inherit false,set false;create role benign;grant select on public.mip_profiles to benign;grant benign to anon with inherit false,set true')
  const before=await catalog(db);await db.exec(await compileProfileSql(before,{mode:'commit'}));validateProfileInstalledReadback(before,await catalog(db))
  await db.exec('set session authorization anon;set role benign')
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[own])
  assert.deepEqual((await db.query('select id from public.mip_profiles')).rows,[{id:own}])
  await db.exec('reset role;reset session authorization')
})

test('SET into a separate superuser or CREATEROLE role refuses even without explicit broad ACL grants',async t=>{
  const db=await fixture(t)
  await db.exec('create role super_target superuser;grant super_target to anon with inherit false,set true')
  await assert.rejects(compileProfileSql(await catalog(db)),/browser role path/)
  await db.exec('revoke super_target from anon;create role creator createrole;grant creator to anon with inherit false,set true')
  await assert.rejects(compileProfileSql(await catalog(db)),/browser role path/)
})

test('temp catalog role masking cannot hide a real browser BYPASSRLS attribute',async t=>{
  const db=await fixture(t)
  await db.exec(`alter role anon bypassrls;create temporary view pg_roles as
    select p.oid,p.rolname,p.rolsuper,p.rolinherit,p.rolcreaterole,p.rolcreatedb,p.rolcanlogin,
    p.rolreplication,false as rolbypassrls,p.rolconnlimit,p.rolvaliduntil,p.rolconfig from pg_catalog.pg_roles p`)
  assert.equal((await db.query("select rolbypassrls from pg_catalog.pg_roles where rolname='anon'")).rows[0].rolbypassrls,true)
  assert.equal((await db.query("select rolbypassrls from pg_temp.pg_roles where rolname='anon'")).rows[0].rolbypassrls,false)
  const before=await catalog(db)
  await assert.rejects(compileProfileSql(before),/browser role bypasses RLS/)
})
