import test from 'node:test'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'

const root='../supabase/qualification/comparison-generations/'
const contract=await readFile(new URL(root+'contract.sql',import.meta.url),'utf8')
const selection=await readFile(new URL(root+'selection.sql',import.meta.url),'utf8')
const capability=await readFile(new URL(root+'capability.sql',import.meta.url),'utf8')
const runtime='isolated-runtime-1'
const expires="'2999-01-01'"

async function fixture(t){
  const db=await PGlite.create();t.after(()=>db.close())
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;')
  await db.exec(contract);await db.exec(selection);await db.exec(capability)
  return db
}
async function session(db,principal){
  const id=(await db.query(
    `select comparison_qualification.issue_session($1,$2,${expires}::timestamptz) id`,[principal,runtime]
  )).rows[0].id
  return id
}
async function bind(db,principal,rpc){
  await db.query('select comparison_qualification.bind_runtime($1,$2,$3)',[runtime,principal,rpc])
}
async function asRole(db,role,sql,params=[]){
  await db.exec('reset role;set role '+role)
  try{return await db.query(sql,params)}
  finally{await db.exec('reset role')}
}

test('bound worker completes; scheduler cannot complete; publisher cannot claim',async t=>{
  const db=await fixture(t)
  await bind(db,'qual_comparison_producer','producer_enqueue')
  await bind(db,'qual_comparison_worker','worker_claim')
  await bind(db,'qual_comparison_worker','worker_complete')
  await bind(db,'qual_comparison_scheduler','scheduler_claim')
  await bind(db,'qual_publisher','publisher_release')
  const producer=await session(db,'qual_comparison_producer')
  const worker=await session(db,'qual_comparison_worker')
  const scheduler=await session(db,'qual_comparison_scheduler')
  const publisher=await session(db,'qual_publisher')
  const generation=(await asRole(db,'qual_comparison_producer',
    'select comparison_qualification.producer_enqueue($1,$2,$3,$4,$5::jsonb,$6,$7::timestamptz) id',
    [randomUUID(),producer,runtime,'source',JSON.stringify({n:9007199254740993}),'fixture','2026-01-01'])).rows[0].id
  const claimed=(await asRole(db,'qual_comparison_worker',
    'select comparison_qualification.worker_claim($1,$2,$3) j',[randomUUID(),worker,runtime])).rows[0].j
  assert.equal(claimed.generation_id,generation)
  assert.ok(claimed.lease_token)
  await assert.rejects(asRole(db,'qual_comparison_scheduler',
    'select comparison_qualification.worker_complete($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',
    [randomUUID(),scheduler,runtime,claimed.generation_id,claimed.lease_token,claimed.input_hash,claimed.implementation_ref,'{"claims":[]}']),
    /permission denied/)
  await assert.rejects(asRole(db,'qual_publisher',
    'select comparison_qualification.worker_claim($1,$2,$3)',[randomUUID(),publisher,runtime]),/permission denied/)
  const state=(await asRole(db,'qual_comparison_worker',
    'select comparison_qualification.worker_complete($1,$2,$3,$4,$5,$6,$7,$8::jsonb) state',
    [randomUUID(),worker,runtime,claimed.generation_id,claimed.lease_token,claimed.input_hash,claimed.implementation_ref,'{"claims":[]}'])).rows[0].state
  assert.equal(state,'completed')
})

test('session revocation blocks bound completion immediately; unbound service_role complete still works',async t=>{
  const db=await fixture(t)
  await bind(db,'qual_comparison_producer','producer_enqueue')
  await bind(db,'qual_comparison_worker','worker_claim')
  await bind(db,'qual_comparison_worker','worker_complete')
  const producer=await session(db,'qual_comparison_producer')
  const worker=await session(db,'qual_comparison_worker')
  await asRole(db,'qual_comparison_producer',
    'select comparison_qualification.producer_enqueue($1,$2,$3,$4,$5::jsonb,$6,$7::timestamptz)',
    [randomUUID(),producer,runtime,'source','{"v":1}','fixture','2026-01-01'])
  const claimed=(await asRole(db,'qual_comparison_worker',
    'select comparison_qualification.worker_claim($1,$2,$3) j',[randomUUID(),worker,runtime])).rows[0].j
  await db.query('select comparison_qualification.revoke_session($1)',[worker])
  const diagnosis=(await asRole(db,'qual_comparison_worker',
    'select comparison_qualification.diagnose_bound_call($1,$2,$3,$4) j',
    ['worker_complete','qual_comparison_worker',worker,runtime])).rows[0].j
  assert.equal(diagnosis.current_user,'qual_comparison_worker')
  assert.equal(diagnosis.code,'mip_authz_revoked_session')
  await assert.rejects(asRole(db,'qual_comparison_worker',
    'select comparison_qualification.worker_complete($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',
    [randomUUID(),worker,runtime,claimed.generation_id,claimed.lease_token,claimed.input_hash,claimed.implementation_ref,'{"claims":[]}']),
    /mip_authz_revoked_session/)
  await db.exec('set role service_role')
  const ambient=(await db.query('select comparison_qualification.complete($1,$2,$3,$4,$5::jsonb) state',
    [claimed.generation_id,claimed.lease_token,claimed.input_hash,claimed.implementation_ref,'{"claims":[]}'])).rows[0].state
  await db.exec('reset role')
  assert.equal(ambient,'completed','ambient service_role APIs ignore session revocation')
})

test('binding revocation is distinct from catalog grant denial; request replay omits the lease token',async t=>{
  const db=await fixture(t)
  await bind(db,'qual_comparison_producer','producer_enqueue')
  await bind(db,'qual_comparison_worker','worker_claim')
  const producer=await session(db,'qual_comparison_producer')
  const worker=await session(db,'qual_comparison_worker')
  await asRole(db,'qual_comparison_producer',
    'select comparison_qualification.producer_enqueue($1,$2,$3,$4,$5::jsonb,$6,$7::timestamptz)',
    [randomUUID(),producer,runtime,'source','{"v":1}','fixture','2026-01-01'])
  const request=randomUUID()
  const first=(await asRole(db,'qual_comparison_worker',
    'select comparison_qualification.worker_claim($1,$2,$3) j',[request,worker,runtime])).rows[0].j
  assert.ok(first.lease_token)
  const replay=(await asRole(db,'qual_comparison_worker',
    'select comparison_qualification.worker_claim($1,$2,$3) j',[request,worker,runtime])).rows[0].j
  assert.equal(replay.generation_id,first.generation_id)
  assert.equal(replay.lease_token,null)
  assert.equal(replay.diagnostic_code,'mip_request_replay_omits_token')
  await db.query("select comparison_qualification.revoke_binding($1,'qual_comparison_worker','worker_claim')",[runtime])
  await assert.rejects(asRole(db,'qual_comparison_worker',
    'select comparison_qualification.worker_claim($1,$2,$3)',[randomUUID(),worker,runtime]),/mip_authz_revoked_principal/)
  const runs=(await db.query("select outcome,diagnostic_code from comparison_qualification.request_runs where rpc_name='worker_claim'")).rows
  assert.equal(runs.length,1)
  assert.equal(runs[0].outcome,'lease_issued')
})

test('selection withdrawal records withdrawn publication; release and auto-approval stay disabled',async t=>{
  const db=await fixture(t)
  await bind(db,'qual_comparison_producer','producer_enqueue')
  await bind(db,'qual_comparison_worker','worker_claim')
  await bind(db,'qual_comparison_worker','worker_complete')
  await bind(db,'qual_selector','selector_select')
  await bind(db,'qual_publisher','publisher_propose')
  await bind(db,'qual_publisher','publisher_release')
  await bind(db,'qual_membership_scorer','membership_auto_approve')
  const producer=await session(db,'qual_comparison_producer')
  const worker=await session(db,'qual_comparison_worker')
  const selector=await session(db,'qual_selector')
  const publisher=await session(db,'qual_publisher')
  const scorer=await session(db,'qual_membership_scorer')
  await asRole(db,'qual_comparison_producer',
    'select comparison_qualification.producer_enqueue($1,$2,$3,$4,$5::jsonb,$6,$7::timestamptz)',
    [randomUUID(),producer,runtime,'source','{"v":1}','fixture','2026-01-01'])
  const claimed=(await asRole(db,'qual_comparison_worker',
    'select comparison_qualification.worker_claim($1,$2,$3) j',[randomUUID(),worker,runtime])).rows[0].j
  await asRole(db,'qual_comparison_worker',
    'select comparison_qualification.worker_complete($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',
    [randomUUID(),worker,runtime,claimed.generation_id,claimed.lease_token,claimed.input_hash,claimed.implementation_ref,'{"claims":[]}'])
  const out=(await db.query('select generation_id,output_hash from comparison_qualification.outputs')).rows[0]
  const first=randomUUID()
  await asRole(db,'qual_selector',
    'select comparison_qualification.selector_select($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)',
    [randomUUID(),selector,runtime,first,'source',null,out.generation_id,out.output_hash,
      '{"quantity":9007199254740993,"publication":"not-authorized"}'])
  const unpublished=(await db.query("select state,input_hash,output_hash from comparison_qualification.publication_history")).rows
  assert.equal(unpublished[0].state,'unpublished')
  assert.ok(unpublished[0].input_hash)
  await asRole(db,'qual_publisher',
    'select comparison_qualification.publisher_propose($1,$2,$3,$4)',[randomUUID(),publisher,runtime,'source'])
  await assert.rejects(asRole(db,'qual_publisher',
    'select comparison_qualification.publisher_release($1,$2,$3,$4)',[randomUUID(),publisher,runtime,'source']),
    /mip_publication_disabled/)
  await assert.rejects(asRole(db,'qual_membership_scorer',
    'select comparison_qualification.membership_auto_approve($1,$2,$3,$4)',[randomUUID(),scorer,runtime,'source']),
    /mip_membership_auto_approval_disabled/)
  const withdraw=randomUUID()
  await asRole(db,'qual_selector',
    'select comparison_qualification.selector_select($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)',
    [randomUUID(),selector,runtime,withdraw,'source',first,null,null,'{}'])
  const head=(await db.query(`select h.state,h.generation_id from comparison_qualification.publication_heads p
    join comparison_qualification.publication_history h on h.id=p.publication_id`)).rows[0]
  assert.equal(head.state,'withdrawn')
  assert.equal(head.generation_id,null)
  await assert.rejects(asRole(db,'qual_publisher',
    'select comparison_qualification.publisher_propose($1,$2,$3,$4)',[randomUUID(),publisher,runtime,'source']),
    /unbound publication/)
  const reader=(await asRole(db,'qual_public_reader','select count(*)::int n from comparison_qualification.publication_history')).rows[0].n
  assert.equal(reader,0,'RLS hides unpublished and withdrawn rows from the public reader')
})

test('owner fixture can qualify release then withdrawal becomes revoked; default gates remain off',async t=>{
  const db=await fixture(t)
  await bind(db,'qual_comparison_producer','producer_enqueue')
  await bind(db,'qual_comparison_worker','worker_claim')
  await bind(db,'qual_comparison_worker','worker_complete')
  await bind(db,'qual_selector','selector_select')
  await bind(db,'qual_publisher','publisher_propose')
  await bind(db,'qual_publisher','publisher_release')
  const producer=await session(db,'qual_comparison_producer')
  const worker=await session(db,'qual_comparison_worker')
  const selector=await session(db,'qual_selector')
  const publisher=await session(db,'qual_publisher')
  await asRole(db,'qual_comparison_producer',
    'select comparison_qualification.producer_enqueue($1,$2,$3,$4,$5::jsonb,$6,$7::timestamptz)',
    [randomUUID(),producer,runtime,'source','{"v":1}','fixture','2026-01-01'])
  const claimed=(await asRole(db,'qual_comparison_worker',
    'select comparison_qualification.worker_claim($1,$2,$3) j',[randomUUID(),worker,runtime])).rows[0].j
  await asRole(db,'qual_comparison_worker',
    'select comparison_qualification.worker_complete($1,$2,$3,$4,$5,$6,$7,$8::jsonb)',
    [randomUUID(),worker,runtime,claimed.generation_id,claimed.lease_token,claimed.input_hash,claimed.implementation_ref,'{"claims":[]}'])
  const out=(await db.query('select generation_id,output_hash from comparison_qualification.outputs')).rows[0]
  const first=randomUUID()
  await asRole(db,'qual_selector',
    'select comparison_qualification.selector_select($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)',
    [randomUUID(),selector,runtime,first,'source',null,out.generation_id,out.output_hash,'{}'])
  await asRole(db,'qual_publisher',
    'select comparison_qualification.publisher_propose($1,$2,$3,$4)',[randomUUID(),publisher,runtime,'source'])
  await db.exec('update comparison_qualification.operating_gates set publication_release_enabled=true')
  assert.equal((await asRole(db,'qual_publisher',
    'select comparison_qualification.publisher_release($1,$2,$3,$4) state',[randomUUID(),publisher,runtime,'source'])).rows[0].state,'released')
  await db.exec('update comparison_qualification.operating_gates set publication_release_enabled=false')
  const gates=(await db.query('select publication_release_enabled,membership_auto_approval_enabled from comparison_qualification.operating_gates')).rows[0]
  assert.deepEqual(gates,{publication_release_enabled:false,membership_auto_approval_enabled:false})
  await asRole(db,'qual_selector',
    'select comparison_qualification.selector_select($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)',
    [randomUUID(),selector,runtime,randomUUID(),'source',first,null,null,'{}'])
  const head=(await db.query(`select h.state from comparison_qualification.publication_heads p
    join comparison_qualification.publication_history h on h.id=p.publication_id`)).rows[0]
  assert.equal(head.state,'revoked')
})

test('parity retain copies pending jobs as pending; browser roles stay denied; diagnosis names ambient grants',async t=>{
  const db=await fixture(t)
  await bind(db,'qual_comparison_producer','producer_enqueue')
  await bind(db,'qual_comparison_producer','retain_parity')
  const producer=await session(db,'qual_comparison_producer')
  await asRole(db,'qual_comparison_producer',
    'select comparison_qualification.producer_enqueue($1,$2,$3,$4,$5::jsonb,$6,$7::timestamptz)',
    [randomUUID(),producer,runtime,'source','{"v":1}','fixture','2026-01-01'])
  const n=(await asRole(db,'qual_comparison_producer',
    'select comparison_qualification.retain_parity($1,$2,$3,$4,$5) n',
    [randomUUID(),producer,runtime,'archive-a','source'])).rows[0].n
  assert.equal(n,1)
  const row=(await db.query('select job_state,output_hash from comparison_qualification.retained_parity')).rows[0]
  assert.equal(row.job_state,'pending')
  assert.equal(row.output_hash,null)
  assert.equal((await db.query("select state from comparison_qualification.jobs")).rows[0].state,'pending')
  for(const role of ['anon','authenticated']){
    await assert.rejects(asRole(db,role,'select comparison_qualification.producer_enqueue($1,$2,$3,$4,$5::jsonb,$6,$7::timestamptz)',
      [randomUUID(),producer,runtime,'source','{"v":1}','fixture','2026-01-01']),/permission denied/)
    await assert.rejects(asRole(db,role,'select * from comparison_qualification.request_runs'),/permission denied/)
  }
  const report=(await asRole(db,'qual_comparison_worker',"select comparison_qualification.diagnose_authorization('worker_complete') j")).rows[0].j
  assert.equal(report.current_user,'qual_comparison_worker')
  assert.equal(report.bypassrls,false)
  assert.equal(report.execute_complete,false)
  const ambient=(await asRole(db,'service_role',"select comparison_qualification.effective_authority() j")).rows[0].j
  assert.equal(ambient.bypassrls,true)
  assert.equal(ambient.execute_complete,true)
  assert.equal(ambient.execute_worker_complete,false)
  await db.exec('reset role')
  await assert.rejects(db.exec('delete from comparison_qualification.request_runs'),/immutable/)
})
