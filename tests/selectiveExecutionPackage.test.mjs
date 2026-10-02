import test from 'node:test'
import assert from 'node:assert/strict'
import{readFile,writeFile}from'node:fs/promises'
import{selectiveExecutionPrerequisites}from'./selectiveExecutionPackageFixture.mjs'
import{selectiveExecutionCatalogQuery,selectiveExecutionInstalledCatalogQuery,installSelectiveExecutionFixture,SELECTIVE_EXECUTION_PROPOSAL,SELECTIVE_EXECUTION_EMPTY_ROLLBACK,SELECTIVE_EXECUTION_ROLLBACK}from'../scripts/selectiveExecutionPackage.mjs'
const cases=[]
const scalar=async(db,sql,params=[])=>(await db.query(sql,params)).rows[0].jsonb_build_object
const catalog=async db=>{await db.exec('set search_path=pg_catalog');return scalar(db,await selectiveExecutionCatalogQuery())}
const pin=(db,key,value)=>db.query('select set_config($1,$2,false)',[key,JSON.stringify(value)])
const proposal=await readFile(SELECTIVE_EXECUTION_PROPOSAL,'utf8')
const nativeObjects=async db=>(await db.query("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='evidence_pipeline' and c.relname like 'selective_%'")).rows[0].n
const fixture=async t=>{const db=await selectiveExecutionPrerequisites();t.after(()=>db.close());return db}
const record=(name,result={})=>cases.push({name,status:'PASS',...result})
test.after(async()=>{if(process.env.MIP_SELECTIVE_CATALOG_RECEIPT)await writeFile(process.env.MIP_SELECTIVE_CATALOG_RECEIPT,JSON.stringify({status:'SOURCE_QUALIFIED_UNAPPLIED',live_operations:0,cases},null,2)+'\n')})

test('missing expected catalog denies before any creation; standalone preflight also requires pinned equality',async t=>{
 const db=await fixture(t),before=await catalog(db)
 await assert.rejects(db.exec(proposal),/catalog baseline missing or drifted/);await db.exec('rollback');assert.deepEqual(await catalog(db),before);assert.equal(await nativeObjects(db),0)
 const preflight=await readFile(new URL('../supabase/source-proposals/selective-intake-pack/preflight-install.sql',import.meta.url),'utf8')
 await assert.rejects(db.exec(preflight),/preflight catalog baseline missing or drifted/);await db.exec('rollback')
 await pin(db,'mip.selective_execution_expected_catalog',before);await db.exec(preflight);assert.deepEqual(await catalog(db),before)
 record('missing install/preflight baseline denied with no partial changes')
})

test('canonical catalog pins every native routine overload and authority/default/RLS/column change',async t=>{
 const mutations=[
  ['native exact body',"create or replace function evidence_pipeline.workspace_keys(p jsonb,keys text[]) returns void language plpgsql immutable security invoker set search_path='' as $$begin raise exception 'fixture changed native function';end$$"],
  ['native owner',"create role fixture_owner;grant usage,create on schema evidence_pipeline to fixture_owner;alter function evidence_pipeline.workspace_uuid(jsonb) owner to fixture_owner"],
  ['native ACL',"revoke execute on function public.mip_investigation_workspace_v1(text,jsonb) from service_role"],
  ['native same-name overload',"create function evidence_pipeline.workspace_uuid(integer) returns integer language sql as $$select $1$$"],
  ['cross-schema same-name overload',"create schema fixture_shadow;create function fixture_shadow.workspace_uuid(integer) returns integer language sql as $$select $1$$"],
  ['schema ACL',"grant create on schema evidence_pipeline to authenticated"],
  ['default ACL',"alter default privileges in schema evidence_pipeline grant select on tables to authenticated"],
  ['role attributes',"alter role service_role connection limit 7"],
  ['role membership options',"create role fixture_membership;grant fixture_membership to service_role with admin option"],
  ['column default',"alter table evidence_pipeline.investigations alter column created_at set default now()"],
  ['column ACL',"grant update(created_at) on evidence_pipeline.investigations to authenticated"],
  ['RLS',"alter table evidence_pipeline.investigations disable row level security"],
  ['policy',"create policy fixture_permissive on evidence_pipeline.investigations for select to authenticated using(true)"],
 ]
 for(const[name,mutation]of mutations)await t.test(name,async t=>{
  const db=await fixture(t),before=await catalog(db);await pin(db,'mip.selective_execution_expected_catalog',before);await db.exec(mutation);const changed=await catalog(db);assert.notDeepEqual(changed,before)
  await assert.rejects(db.exec(proposal),/catalog baseline missing or drifted/);await db.exec('rollback');assert.deepEqual(await catalog(db),changed);assert.equal(await nativeObjects(db),0)
  record('catalog mutation refusal: '+name,{partial_changes:0})
 })
})

test('all new target relation/type/index/sequence/exact signature collisions refuse before mutation even when freshly pinned',async t=>{
 const collisions=[
  ['table',"create table evidence_pipeline.selective_criteria_versions(fixture integer)"],
  ['row type',"create type evidence_pipeline.selective_source_authorizations as (fixture integer)"],
  ['array type',"create type evidence_pipeline._selective_fetch_permits as (fixture integer)"],
  ['index',"create index selective_discovery_head on evidence_pipeline.investigations(id)"],
  ['implicit primary index',"create index selective_criteria_versions_pkey on evidence_pipeline.investigations(id)"],
  ['sequence',"create sequence evidence_pipeline.selective_discovery_receipts_ordinal_seq"],
  ['implicit unique index',"create index selective_execution_receipts_declaration_receipt_id_key on evidence_pipeline.investigations(id)"],
  ['exact public function',"create function public.mip_selective_execution_v1(text,jsonb) returns jsonb language sql as $$select $2$$"],
  ['exact decision function',"create function evidence_pipeline.selective_metadata_decision(jsonb,jsonb) returns jsonb language sql as $$select $2$$"],
 ]
 for(const[name,collision]of collisions)await t.test(name,async t=>{
  const db=await fixture(t);await db.exec(collision);const before=await catalog(db);await pin(db,'mip.selective_execution_expected_catalog',before)
  await assert.rejects(db.exec(proposal),/target name occupied/);await db.exec('rollback');assert.deepEqual(await catalog(db),before);record('freshly pinned collision refusal: '+name,{partial_changes:0})
 })
})

test('guarded install and exact empty rollback preserve unrelated overload definitions/owners/ACL sentinels and restore native catalog',async t=>{
 const db=await fixture(t)
 await db.exec("create role fixture_overload_owner;create schema fixture_shadow;grant usage,create on schema public,evidence_pipeline,fixture_shadow to fixture_overload_owner;create function public.mip_selective_execution_v1(integer) returns integer language sql as $$select $1+37$$;alter function public.mip_selective_execution_v1(integer) owner to fixture_overload_owner;revoke all on function public.mip_selective_execution_v1(integer) from public;grant execute on function public.mip_selective_execution_v1(integer) to anon;create function fixture_shadow.selective_metadata_decision(integer) returns integer language sql as $$select $1+41$$;alter function fixture_shadow.selective_metadata_decision(integer) owner to fixture_overload_owner;")
 const before=await catalog(db),sentinels=before.functions.filter(f=>f.signature.includes('integer'))
 const{catalog:original,installed}=await installSelectiveExecutionFixture(db);assert.deepEqual(original,before);assert.deepEqual(installed.functions.filter(f=>f.signature.includes('integer')),sentinels)
 const remove=await readFile(SELECTIVE_EXECUTION_EMPTY_ROLLBACK,'utf8')
 await pin(db,'mip.selective_execution_rollback_expected_catalog',{...installed,roles:[]});await assert.rejects(db.exec(remove),/rollback catalog missing or drifted/);await db.exec('rollback');assert.deepEqual(await catalog(db),installed)
 await pin(db,'mip.selective_execution_rollback_expected_catalog',installed);await pin(db,'mip.selective_execution_original_catalog',{...before,roles:[]});await assert.rejects(db.exec(remove),/did not restore exact original catalog/);await db.exec('rollback');assert.deepEqual(await catalog(db),installed)
 await pin(db,'mip.selective_execution_original_catalog',before);await db.exec(remove);assert.deepEqual(await catalog(db),before);assert.deepEqual((await catalog(db)).functions.filter(f=>f.signature.includes('integer')),sentinels)
 record('empty exact reverse restore and unrelated overload owner/ACL/definition preservation',{sentinels:sentinels.map(f=>({signature:f.signature,owner:f.owner,acl:f.acl}))})
})

test('populated empty rollback refuses atomically; exact revoke-only rollback retains history and overload sentinels',async t=>{
 const db=await fixture(t);await db.exec("create function public.mip_selective_execution_v1(integer) returns integer language sql as $$select $1+17$$;revoke all on function public.mip_selective_execution_v1(integer) from public;grant execute on function public.mip_selective_execution_v1(integer) to anon")
 await installSelectiveExecutionFixture(db)
 const rules={contract_version:'selective-metadata-rules-1',analyze_signals:['explicit_scope','correction','new_relevant_input'],low_value_domains:['sports','entertainment'],religion_shared_scope:true}
 await db.query("insert into evidence_pipeline.selective_criteria_versions values('fixture','1','policy-fixture','synthetic:accepted',$1)",[rules])
 const before=await catalog(db),sentinel=before.functions.find(f=>f.signature==='public.mip_selective_execution_v1(integer)')
 await assert.rejects(db.exec(await readFile(SELECTIVE_EXECUTION_EMPTY_ROLLBACK,'utf8')),/populated selective history must be retained/);await db.exec('rollback');assert.deepEqual(await catalog(db),before)
 const stop=await readFile(SELECTIVE_EXECUTION_ROLLBACK,'utf8');await pin(db,'mip.selective_execution_rollback_expected_catalog',{...before,functions:[]});await assert.rejects(db.exec(stop),/rollback catalog missing or drifted/);await db.exec('rollback');assert.deepEqual(await catalog(db),before)
 await pin(db,'mip.selective_execution_rollback_expected_catalog',before);await db.exec(stop)
 assert.equal((await db.query("select has_function_privilege('service_role','public.mip_selective_execution_v1(text,jsonb)','EXECUTE') yes")).rows[0].yes,false)
 assert.equal((await db.query('select count(*)::int n from evidence_pipeline.selective_criteria_versions')).rows[0].n,1)
 assert.deepEqual((await catalog(db)).functions.find(f=>f.signature===sentinel.signature),sentinel)
 record('populated audit history retained; exact service stop leaves unrelated overload untouched',{rows_retained:1})
})


test('freshly pinned unexpected default grants deny before creation; known reader defaults are explicitly removed on new sequences',async t=>{
 const db=await fixture(t);await db.exec("create role fixture_unexpected;alter default privileges in schema evidence_pipeline grant select on tables to fixture_unexpected")
 const before=await catalog(db);await pin(db,'mip.selective_execution_expected_catalog',before);await assert.rejects(db.exec(proposal),/unexpected default-privilege grantee/);await db.exec('rollback');assert.deepEqual(await catalog(db),before);assert.equal(await nativeObjects(db),0)
 await db.exec("alter default privileges in schema evidence_pipeline revoke select on tables from fixture_unexpected;alter default privileges in schema evidence_pipeline grant usage on sequences to anon")
 await installSelectiveExecutionFixture(db)
 assert.equal((await db.query("select has_sequence_privilege('anon','evidence_pipeline.selective_discovery_receipts_ordinal_seq','USAGE') yes")).rows[0].yes,false)
 assert.equal((await db.query("select has_sequence_privilege('service_role','evidence_pipeline.selective_discovery_receipts_ordinal_seq','USAGE') yes")).rows[0].yes,true)
 record('unsafe fresh defaults denied; exact new sequence default reader ACL removed')
})
