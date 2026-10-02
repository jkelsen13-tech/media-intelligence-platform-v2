import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync, readdirSync} from 'node:fs'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {randomUUID} from 'node:crypto'
import {PGlite} from '@electric-sql/pglite'

const repoRoot=fileURLToPath(new URL('..',import.meta.url))
const designDir=join(repoRoot,'supabase/qualification/mip-cutover-authority')
const identities=readFileSync(join(designDir,'001_execute_only_identities.sql'),'utf8')
const required=[
  'mip_collector_scheduler_v1','mip_collector_worker_v1','mip_comparison_producer_v1',
  'mip_comparison_worker_v1','mip_projection_builder_v1','mip_projection_publisher_v1',
  'mip_cutover_authority_admin_v1','mip_cutover_recovery_v1','mip_retention_writer_v1',
  'mip_retention_reader_v1','mip_cutover_schema_owner_v1',
  'mip_comparison_worker_owner_v1','mip_comparison_producer_owner_v1','mip_projection_publisher_owner_v1'
]

test('mip_* design SQL is EXECUTE-only, NOLOGIN, and not granted to service_role',()=>{
  for(const name of required) assert.match(identities,new RegExp('create role '+name+' nologin nosuperuser nobypassrls'))
  assert.match(identities,/mip_cutover_authority_not_provisioned/)
  assert.doesNotMatch(identities,/grant execute[^\n]+service_role/i)
  assert.doesNotMatch(identities,/create schema comparison_qualification/)
  assert.doesNotMatch(identities,/create role qual_/)
  assert.match(identities,/Do not rename comparison_qualification/)
  assert.doesNotMatch(identities,/"sub"\s*:/)
  assert.doesNotMatch(identities,/iss\s*=/)
  const migrations=readdirSync(join(repoRoot,'supabase/migrations'))
  assert.ok(!migrations.some(name=>name.includes('mip-cutover-authority')||name.includes('mip_cutover_authority')))
})

test('disposable load: service_role cannot execute worker_complete; worker role is refused as unprovisioned',async t=>{
  const db=await PGlite.create();t.after(()=>db.close())
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;')
  await db.exec(identities)
  const nologin=(await db.query(`select rolname,rolcanlogin,rolbypassrls from pg_roles
    where rolname in ('mip_comparison_worker_v1','mip_comparison_worker_owner_v1','service_role')
    order by rolname`)).rows
  const worker=nologin.find(r=>r.rolname==='mip_comparison_worker_v1')
  const owner=nologin.find(r=>r.rolname==='mip_comparison_worker_owner_v1')
  assert.equal(worker.rolcanlogin,false)
  assert.equal(worker.rolbypassrls,false)
  assert.equal(owner.rolcanlogin,false)
  assert.equal(owner.rolbypassrls,false)
  const grant=(await db.query(`select has_function_privilege('service_role',
    'mip_cutover_authority.worker_complete(uuid,uuid,text,uuid,uuid,text,text,jsonb)','execute') svc,
    has_function_privilege('mip_comparison_worker_v1',
    'mip_cutover_authority.worker_complete(uuid,uuid,text,uuid,uuid,text,text,jsonb)','execute') worker`)).rows[0]
  assert.equal(grant.svc,false)
  assert.equal(grant.worker,true)
  await db.exec('set role service_role')
  await assert.rejects(db.query(
    'select mip_cutover_authority.worker_complete($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',
    [randomUUID(),randomUUID(),'runtime',randomUUID(),randomUUID(),'hash','impl','{}']),
    /permission denied/)
  await db.exec('reset role;set role mip_comparison_worker_v1')
  await assert.rejects(db.query(
    'select mip_cutover_authority.worker_complete($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',
    [randomUUID(),randomUUID(),'runtime',randomUUID(),randomUUID(),'hash','impl','{}']),
    /mip_cutover_authority_not_provisioned/)
  await db.exec('reset role')
})
