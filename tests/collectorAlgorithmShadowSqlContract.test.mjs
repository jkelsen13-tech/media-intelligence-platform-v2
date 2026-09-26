import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash, randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {canonicalJson, deriveAlgorithmShadow, PREDECESSOR} from '../supabase/functions/collector-algorithm-shadow-candidate/worker.js'
import {recoverShadowRequest, runDurableAlgorithmShadowWorker} from '../supabase/functions/collector-algorithm-shadow-candidate/durableWorker.js'

const contract=await readFile(new URL('../supabase/qualification/collector-algorithm-shadow/contract.sql',import.meta.url),'utf8')
const sha256=value=>Promise.resolve(createHash('sha256').update(value).digest('hex'))
const implementation='qualification:collector-algorithm-shadow:v1'
const ownerRoles=['mip_shadow_store_owner_v1','mip_shadow_worker_fn_owner_v1',
  'mip_shadow_authority_fn_owner_v1']
const loginRoles=['mip_shadow_runtime_a_fixture','mip_shadow_runtime_b_fixture',
  'mip_shadow_admitter_fixture','mip_shadow_recovery_fixture']
const negativeRoles=['anon','authenticated','service_role','authenticator']

async function fixture(t){
  const db=await PGlite.create();t.after(()=>db.close())
  for(const role of ownerRoles) await db.exec(`create role ${role} nologin noinherit`)
  for(const role of loginRoles) await db.exec(`create role ${role} login noinherit`)
  for(const role of negativeRoles) await db.exec(`create role ${role} nologin noinherit`)
  await db.exec(contract)
  return db
}
async function identity(db,role){
  await db.exec(`set session authorization ${role??'postgres'}`)
}
function memoryJournal(){
  const values=new Map()
  return {
    assertSecurity(expected){assert.deepEqual(expected,{access_controlled:true,encrypted_at_rest:true,
      lease_tokens_redacted_from_logs:true,explicit_retention_policy:true})},
    async putOnce(key,value){
      const encoded=JSON.stringify(value)
      if(values.has(key)&&values.get(key)!==encoded) throw new Error('journal_conflict')
      values.set(key,encoded)
    },
    async get(key){return values.has(key)?JSON.parse(values.get(key)):null},
    values,
  }
}
async function register(db,suffix='a'){
  const source={project_ref:PREDECESSOR.source_project,source_id:`fixture-${suffix}`,
    feed_url:`https://example.com/${suffix}.xml`,registry_revision:`registry-${suffix}`}
  const config={citation_weights:{said:0.8},max_items:10,outlet_names:['Example News']}
  const rights={visibility:'public',basis:'qualification-fixture',policy_version:'v1',approval_id:`approval-${suffix}`}
  const xml=`<rss><channel><item><title>Agency said Example News reported a decision</title><link>https://example.com/article-${suffix}</link><description>Officials approved a review.</description></item></channel></rss>`
  const values=[source.project_ref,source.source_id,source.feed_url,source.registry_revision,
    await sha256(canonicalJson(source)),'2026-09-20T12:00:00Z','application/rss+xml',xml,await sha256(xml),
    rights.visibility,rights.basis,rights.policy_version,rights.approval_id,
    await sha256(canonicalJson(rights)),null,implementation,PREDECESSOR.adapter,
    PREDECESSOR.edge_package_sha256,PREDECESSOR.normalized_source_sha256,
    JSON.stringify(config),await sha256(canonicalJson(config))]
  const result=await db.query(`select collector_shadow_control.register_bundle(
    $1,$2,$3,$4,$5,$6::timestamptz,$7,$8,$9,$10,$11,$12,$13,$14,$15::timestamptz,
    $16,$17,$18,$19,$20::jsonb,$21) refs`,values)
  return result.rows[0].refs
}
async function prepare(db,{runtime=randomUUID(),principal='mip_shadow_runtime_a_fixture',suffix='a'}={}){
  await identity(db,'mip_shadow_admitter_fixture')
  const refs=await register(db,suffix)
  await db.query('select collector_shadow_control.bind_runtime($1,$2::name,$3,$4)',
    [runtime,principal,refs.source_revision,implementation])
  const session=(await db.query("select collector_shadow_control.issue_session($1,interval '15 minutes') token",[runtime])).rows[0].token
  const generation=(await db.query('select collector_shadow_control.admit_generation($1,$2,$3,$4,null) id',
    [refs.capture_revision,refs.rights_revision,refs.config_revision,'new_relevant_evidence'])).rows[0].id
  return {runtime,session,generation,refs,principal}
}
function rpcFor(db){
  return async(operation,args)=>{
    if(operation==='shadow_claim') return (await db.query(
      'select collector_shadow_api.shadow_claim($1,$2,$3) result',
      [args.p_session,args.p_runtime,args.p_request])).rows[0].result
    if(operation==='shadow_complete') return (await db.query(
      'select collector_shadow_api.shadow_complete($1,$2,$3,$4,$5,$6,$7,$8::jsonb) result',
      [args.p_session,args.p_runtime,args.p_request,args.p_generation,args.p_token,
        args.p_input_hash,args.p_implementation,JSON.stringify(args.p_output)])).rows[0].result
    if(operation==='shadow_fail') return (await db.query(
      'select collector_shadow_api.shadow_fail($1,$2,$3,$4,$5,$6,$7,$8) result',
      [args.p_session,args.p_runtime,args.p_request,args.p_generation,args.p_token,
        args.p_input_hash,args.p_implementation,args.p_failure_code])).rows[0].result
    throw new Error('unexpected operation')
  }
}

test('direct-login worker completes one immutable admitted generation through only three RPCs',async t=>{
  const db=await fixture(t), prepared=await prepare(db), journal=memoryJournal()
  await identity(db,'mip_shadow_admitter_fixture')
  const secondBundle=await register(db,'second-source-same-implementation')
  assert.notEqual(secondBundle.source_revision,prepared.refs.source_revision)
  const replayed=(await db.query('select collector_shadow_control.admit_generation($1,$2,$3,$4,null) id',
    [prepared.refs.capture_revision,prepared.refs.rights_revision,prepared.refs.config_revision,'new_relevant_evidence'])).rows[0].id
  assert.equal(replayed,prepared.generation,'admission replay converges without resetting the job')
  await identity(db,prepared.principal)
  let n=1
  const result=await runDurableAlgorithmShadowWorker({rpc:rpcFor(db),journal,
    runtime:prepared.runtime,session:prepared.session,implementation,sha256,
    requestId:()=>`00000000-0000-4000-8000-${String(n++).padStart(12,'0')}`})
  assert.equal(result.state,'completed')
  await identity(db)
  const state=(await db.query('select state,attempt from collector_shadow_private.jobs')).rows[0]
  assert.deepEqual(state,{state:'completed',attempt:1})
  const output=(await db.query('select output_payload,worker_canonical_sha256 from collector_shadow_private.outputs')).rows[0]
  assert.equal(output.output_payload.output_sha256,output.worker_canonical_sha256)
  assert.equal(output.output_payload.method.provider_result,'disabled')
  assert.equal(output.output_payload.declared_effect_scope.canonical_domain_writes,'forbidden')
  assert.equal((await db.query('select count(*)::int n from collector_shadow_private.request_runs')).rows[0].n,2)
  await identity(db,prepared.principal)
  const idle=await runDurableAlgorithmShadowWorker({rpc:rpcFor(db),journal,
    runtime:prepared.runtime,session:prepared.session,implementation,sha256,
    requestId:()=>`00000000-0000-4000-8000-${String(n++).padStart(12,'0')}`})
  assert.deepEqual(idle,{state:'idle'})
})

test('browser, shared service, and foreign runtime identities cannot use the contract or private tables',async t=>{
  const db=await fixture(t), prepared=await prepare(db)
  for(const role of ['anon','authenticated','service_role','authenticator','mip_shadow_runtime_b_fixture']){
    await identity(db,role)
    await assert.rejects(db.query('select collector_shadow_api.shadow_claim($1,$2,$3)',
      [prepared.session,prepared.runtime,randomUUID()]))
    await assert.rejects(db.query('select * from collector_shadow_private.generations'))
  }
  await identity(db)
  const grants=(await db.query(`select r,
    has_schema_privilege(r,'collector_shadow_private','usage') private_usage,
    has_function_privilege(r,'collector_shadow_api.shadow_claim(uuid,uuid,uuid)','execute') claim
    from unnest(array['anon','authenticated','service_role','authenticator']) r`)).rows
  assert.ok(grants.every(row=>!row.private_usage&&!row.claim))
  const runtime=(await db.query(`select
    has_schema_privilege('mip_shadow_runtime_a_fixture','collector_shadow_private','usage') private_usage,
    has_table_privilege('mip_shadow_runtime_a_fixture',c.oid,'select') table_read,
    has_function_privilege('mip_shadow_runtime_a_fixture',p.oid,'execute') complete
    from pg_class c cross join pg_proc p
    where c.relnamespace='collector_shadow_private'::regnamespace and c.relname='jobs'
      and p.pronamespace='collector_shadow_api'::regnamespace and p.proname='shadow_complete'`)).rows[0]
  assert.deepEqual(runtime,{private_usage:false,table_read:false,complete:true})
  await identity(db,'mip_shadow_admitter_fixture')
  await db.query('select collector_shadow_control.revoke_session($1)',[prepared.session])
  await identity(db,prepared.principal)
  await assert.rejects(db.query('select collector_shadow_api.shadow_claim($1,$2,$3)',
    [prepared.session,prepared.runtime,randomUUID()]))
})

test('global request identity, revocation fence, and exact replay deny changed or stale authority',async t=>{
  const db=await fixture(t), prepared=await prepare(db), journal=memoryJournal()
  await identity(db,prepared.principal)
  const rpc=rpcFor(db), claimRequest=randomUUID()
  await db.exec('begin isolation level repeatable read')
  await assert.rejects(rpc('shadow_claim',{p_session:prepared.session,p_runtime:prepared.runtime,
    p_request:randomUUID()}),/read_committed_required/)
  await db.exec('rollback')
  const claim=await rpc('shadow_claim',{p_session:prepared.session,p_runtime:prepared.runtime,p_request:claimRequest})
  const replay=await rpc('shadow_claim',{p_session:prepared.session,p_runtime:prepared.runtime,p_request:claimRequest})
  assert.equal(replay.generation_id,claim.generation_id)
  assert.equal(replay.replay,true)
  assert.equal(replay.lease_token,undefined,'claim replay must never reissue the token')
  await assert.rejects(rpc('shadow_fail',{p_session:prepared.session,p_runtime:prepared.runtime,
    p_request:claimRequest,p_generation:claim.generation_id,p_token:claim.lease_token,
    p_input_hash:claim.input_hash,p_implementation:claim.implementation_ref,
    p_failure_code:'mip_shadow_bounded_algorithm_failure'}),/request_conflict/)
  const completionRequest=randomUUID()
  const parsed=JSON.parse(claim.input_text)
  const output=await deriveAlgorithmShadow(parsed,sha256)
  const alteredSource=structuredClone(output);alteredSource.source.feed_url='https://example.com/forged.xml'
  await assert.rejects(rpc('shadow_complete',{p_session:prepared.session,p_runtime:prepared.runtime,
    p_request:randomUUID(),p_generation:claim.generation_id,p_token:claim.lease_token,
    p_input_hash:claim.input_hash,p_implementation:claim.implementation_ref,p_output:alteredSource}),/output_binding/)
  const promoted=structuredClone(output);promoted.items[0].taint.promotion_eligible=true
  await assert.rejects(rpc('shadow_complete',{p_session:prepared.session,p_runtime:prepared.runtime,
    p_request:randomUUID(),p_generation:claim.generation_id,p_token:claim.lease_token,
    p_input_hash:claim.input_hash,p_implementation:claim.implementation_ref,p_output:promoted}),/output_binding/)
  const falselyQualified=structuredClone(output);falselyQualified.method.qualification='qualified'
  await assert.rejects(rpc('shadow_complete',{p_session:prepared.session,p_runtime:prepared.runtime,
    p_request:randomUUID(),p_generation:claim.generation_id,p_token:claim.lease_token,
    p_input_hash:claim.input_hash,p_implementation:claim.implementation_ref,p_output:falselyQualified}),/output_binding/)
  await rpc('shadow_complete',{p_session:prepared.session,p_runtime:prepared.runtime,p_request:completionRequest,
    p_generation:claim.generation_id,p_token:claim.lease_token,p_input_hash:claim.input_hash,
    p_implementation:claim.implementation_ref,p_output:output})
  const key=`shadow_complete:${completionRequest}`
  await journal.putOnce(key,{version:1,operation:'shadow_complete',args:{p_runtime:prepared.runtime,
    p_request:completionRequest,p_generation:claim.generation_id,p_token:claim.lease_token,
    p_input_hash:claim.input_hash,p_implementation:claim.implementation_ref,p_output:output}})
  await identity(db,'mip_shadow_admitter_fixture')
  const freshSession=(await db.query("select collector_shadow_control.issue_session($1,interval '15 minutes') token",[prepared.runtime])).rows[0].token
  await identity(db,prepared.principal)
  assert.equal(await recoverShadowRequest({rpc,journal,runtime:prepared.runtime,
    session:freshSession,key}),'completed','fresh current authority can replay a committed request')
  await identity(db,'mip_shadow_admitter_fixture')
  await db.query('select collector_shadow_control.revoke_rights($1)',[prepared.refs.rights_revision])
  await identity(db,prepared.principal)
  await assert.rejects(recoverShadowRequest({rpc,journal,runtime:prepared.runtime,
    session:freshSession,key}))
})

test('lost claim token requires explicit expired requeue and a fresh attempt/token',async t=>{
  const db=await fixture(t), prepared=await prepare(db)
  await identity(db,prepared.principal)
  const rpc=rpcFor(db), first=await rpc('shadow_claim',{p_session:prepared.session,
    p_runtime:prepared.runtime,p_request:randomUUID()})
  await identity(db)
  await db.query("update collector_shadow_private.jobs set lease_expires_at=clock_timestamp()-interval '1 second' where generation_id=$1",[prepared.generation])
  await identity(db,'mip_shadow_recovery_fixture')
  await assert.rejects(db.query('select collector_shadow_control.requeue_expired($1,null) state',[prepared.generation]),/recovery_precondition/)
  assert.equal((await db.query('select collector_shadow_control.requeue_expired($1,1) state',[prepared.generation])).rows[0].state,'requeued')
  await identity(db)
  await db.query("update collector_shadow_private.jobs set available_at=clock_timestamp()-interval '1 second' where generation_id=$1",[prepared.generation])
  await identity(db,prepared.principal)
  const second=await rpc('shadow_claim',{p_session:prepared.session,p_runtime:prepared.runtime,p_request:randomUUID()})
  assert.equal(second.attempt,2)
  assert.notEqual(second.lease_token,first.lease_token)
  await assert.rejects(rpc('shadow_fail',{p_session:prepared.session,p_runtime:prepared.runtime,
    p_request:randomUUID(),p_generation:first.generation_id,p_token:first.lease_token,
    p_input_hash:first.input_hash,p_implementation:first.implementation_ref,
    p_failure_code:'mip_shadow_bounded_algorithm_failure'}))
  assert.equal(await rpc('shadow_fail',{p_session:prepared.session,p_runtime:prepared.runtime,
    p_request:randomUUID(),p_generation:second.generation_id,p_token:second.lease_token,
    p_input_hash:second.input_hash,p_implementation:second.implementation_ref,
    p_failure_code:'mip_shadow_bounded_algorithm_failure'}),'failed')
  await identity(db)
  assert.equal((await db.query('select count(*)::int n from collector_shadow_private.recovery_events')).rows[0].n,1)
})

test('qualification inventory has forced RLS, fixed search paths, and no PUBLIC function execution',async t=>{
  const db=await fixture(t)
  const tables=(await db.query(`select c.relname,c.relrowsecurity,c.relforcerowsecurity
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='collector_shadow_private' and c.relkind='r'`)).rows
  assert.ok(tables.length>=13)
  assert.ok(tables.every(row=>row.relrowsecurity&&row.relforcerowsecurity))
  const functions=(await db.query(`select n.nspname,p.proname,p.proconfig,
    has_function_privilege('public',p.oid,'execute') public_execute
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname like 'collector_shadow_%'`)).rows
  assert.ok(functions.length>=10)
  assert.ok(functions.every(fn=>fn.proconfig?.includes('search_path=""')&&!fn.public_execute))
  const memberships=(await db.query(`select count(*)::int n from pg_auth_members m
    join pg_roles r on r.oid=m.member where r.rolname like 'mip_shadow_runtime_%'`)).rows[0].n
  assert.equal(memberships,0)
  const identities=(await db.query(`select rolname,rolcanlogin,rolinherit,rolsuper,rolbypassrls,
    rolcreaterole,rolcreatedb,rolreplication from pg_roles
    where rolname like 'mip_shadow_%'`)).rows
  assert.ok(identities.filter(r=>r.rolname.includes('_runtime_')).every(r=>r.rolcanlogin&&!r.rolinherit))
  assert.ok(identities.filter(r=>r.rolname.includes('_owner_')).every(r=>!r.rolcanlogin&&!r.rolinherit))
  assert.ok(identities.every(r=>!r.rolsuper&&!r.rolbypassrls&&!r.rolcreaterole&&!r.rolcreatedb&&!r.rolreplication))
  const controlNames=['revoke_rights','revoke_session','revoke_runtime','retire_source',
    'retire_implementation','retire_config','requeue_expired']
  const controls=(await db.query(`select p.proname,
    has_function_privilege('mip_shadow_admitter_fixture',p.oid,'execute') admitter,
    has_function_privilege('mip_shadow_runtime_a_fixture',p.oid,'execute') runtime
    from pg_proc p where p.pronamespace='collector_shadow_control'::regnamespace
      and p.proname=any($1::text[])`,[controlNames])).rows
  assert.equal(controls.length,controlNames.length)
  assert.ok(controls.every(row=>!row.runtime))
  assert.ok(controls.filter(row=>row.proname!=='requeue_expired').every(row=>row.admitter))
})
