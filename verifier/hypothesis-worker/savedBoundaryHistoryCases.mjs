import {syntheticAuthProvider} from '../../tests/hypothesisAuthProviderFixture.mjs'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {quote as q,guard} from '../integrated/transport.mjs'
import {blocked} from './fixture.mjs'
import {createSavedBoundaryReader,createBoundaryProofAuthority} from '../../supabase/qualification/hypothesis-assessments/savedBoundaryHistory.mjs'

// One actual authenticated PostgreSQL backend and transaction for all coordinator queries.
// This adapter is fixed to disposable GitHub CI; no user DSN, production credential or network target.
function transaction(db,onPid=()=>{}){
 return async(run,signal)=>{
  guard()
  const child=spawn('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','5432','-U','postgres','-d',db],
   {env:{PATH:process.env.PATH,PGPASSWORD:'mip-disposable-ci-only',PGOPTIONS:'-c statement_timeout=20000 -c lock_timeout=15000'},stdio:['pipe','pipe','pipe']})
  let buffer='',pending=null,failed=false
  const fail=()=>{failed=true;if(pending){pending.reject(Error('mip_boundary_native_query_failed'));pending=null}}
  const abort=()=>{fail();child.kill()}
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort()
  child.on('error',fail);child.on('exit',fail);child.stdin.on('error',fail)
  child.stderr.on('data',x=>{if(String(x).includes('ERROR'))fail()})
  child.stdout.on('data',data=>{
   buffer+=data
   let end
   while((end=buffer.indexOf('\n'))>=0){
    const line=buffer.slice(0,end).trim();buffer=buffer.slice(end+1)
    if(line&&pending){const p=pending;pending=null;p.resolve(line)}
   }
  })
  const line=statement=>new Promise((resolve,reject)=>{
   if(failed||pending)return reject(Error('mip_boundary_native_query_failed'))
   const timer=setTimeout(()=>{fail();child.kill()},30000)
   pending={resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}}
   child.stdin.write(statement+';\n')
  })
  try{
   const pid=Number(await line('set session authorization mip_boundary_history_gateway;begin;select pg_backend_pid()'))
   onPid(pid)
   const result=await run(async(sql,args)=>{
    if(sql.startsWith('set local ')||['savepoint probe','rollback to savepoint probe'].includes(sql)){
     await line(sql+";select 'OK'");return {rows:[]}
    }
    const name=sql.match(/^select mip_temporal\.(boundary_history_challenge|consume_boundary_history_permit)\(/)?.[1]
    if(!name)throw Error('mip_test_query_denied')
    const value=JSON.parse(await line('select mip_temporal.'+name+'('+args.map(q).join(',')+')'))
    return {rows:[{value}]}
   })
   await line("commit;select 'COMMITTED'")
   return result
  }catch(error){child.stdin.write('rollback;\n');throw error}
  finally{signal?.removeEventListener('abort',abort);child.stdin.end();child.kill()}
 }
}

export async function savedBoundaryHistoryCases(t,f,prepared){
 await f.admin(await readFile(new URL('../../supabase/qualification/hypothesis-assessments/023_saved_boundary_history.sql',import.meta.url),'utf8'))
 const consumeSql='select mip_temporal.consume_boundary_history_permit($1::uuid,$2::uuid) as value'
 const challengeSql='select mip_temporal.boundary_history_challenge($1::uuid) as value'
 const receipt=p=>({schema:'mip_saved_boundary_delivery_receipt_v2',delivery_id:p.permit_id,delivered:true,historical_time_qualified:false,publication_allowed:false})
 async function context(t){
  const x=await prepared(t)
  const identity=JSON.parse(await f.admin("select jsonb_build_object('user',author_id,'iid',investigation_id) from mip_hypothesis.revisions where id="+q(x.revisions[0])))
  const provider=syntheticAuthProvider(identity.user)
  let observedClaim,observedPermit
  const issue=async(session,claim)=>{
   observedClaim=structuredClone(claim)
   const p=JSON.parse(await f.admin('set session authorization mip_boundary_proof_issuer;select mip_temporal.issue_boundary_history_permit('+[session,claim].map(q).join(',')+')'))
   observedPermit=p;return p
  }
  const authority=createBoundaryProofAuthority({authConfiguration:provider.configuration,registration:x.b.registration,
   observationEpoch:f.observationEpoch,...x.options,journal:x.b.journal(),withAuthority:x.b.withAuthority,issuePermit:issue,sourceSession:x.b.session})
  const request={authorization:'Bearer '+provider.token(),investigationId:identity.iid,captureIds:x.options.captureIds,
   terminalCapture:x.options.terminalCapture,targetMarker:x.options.targetMarker}
  return {...x,identity,provider,authority,request,claim:()=>observedClaim,permit:()=>observedPermit,
   reader:extra=>createSavedBoundaryReader({authority,withTransaction:transaction(f.db),...extra})}
 }
 await t.test('sealed SQL intersects prefix before gateway delivery; direct gateway cannot escape into later same-investigation history',async t=>{
  const x=await context(t),later=randomUUID()
  // Native fixture fault: exact accepted row/binding copy representing a later revision,
  // deliberately committed after the saved marker. No semantic-generation claim.
  await f.admin('insert into mip_hypothesis.revisions select '+q(later)+',investigation_id,'+q(randomUUID())+
   ",author_id,id,revision+1,request_arguments,assessment||jsonb_build_object('id',"+q(later)+",'revision',revision+1,'predecessor_id',id),clock_timestamp() from mip_hypothesis.revisions where id="+q(x.revisions[0])+
   ";insert into mip_hypothesis.acceptance_bindings select (jsonb_populate_record(null::mip_hypothesis.acceptance_bindings,to_jsonb(b)||jsonb_build_object('revision_id',"+q(later)+'))).* from mip_hypothesis.acceptance_bindings b where revision_id='+q(x.revisions[0])+';')
  assert.ok((await f.gateway('read_bound_history',[x.identity.user,x.identity.iid])).entries.some(e=>e.revision_id===later))
  let payload
  await x.reader()(x.request,value=>{payload=value})
  assert.ok(payload.entries.some(e=>e.revision_id===x.revisions[0]));assert.ok(!payload.entries.some(e=>e.revision_id===later))
  assert.equal(Object.hasOwn(payload,'revision_ids'),false)
  for(const k of ['source_authority_qualified','user_history_qualified','historical_time_qualified','publication_allowed'])assert.equal(payload[k],false)
  await assert.rejects(()=>f.admin('set session authorization mip_boundary_history_gateway;select mip_temporal.read_boundary_history('+x.revisions.map(q).join(',')+')'))
  await assert.rejects(()=>f.admin('set session authorization mip_boundary_history_gateway;select mip_hypothesis.read_bound_history('+[x.identity.user,x.identity.iid].map(q).join(',')+')'))
  await assert.rejects(()=>f.admin('set session authorization mip_boundary_history_gateway;update mip_temporal.boundary_history_permits set revision_ids=array['+q(later)+'::uuid]'))
  await assert.rejects(()=>f.admin('set session authorization mip_boundary_history_gateway;select mip_temporal.consume_boundary_history_permit('+[x.permit().permit_id,x.permit().request_id].map(q).join(',')+')'))
 })
 await t.test('selected reader does not evaluate unrelated revision bindings and enforces selected cardinality',async t=>{
  const x=await context(t),later=randomUUID()
  await f.admin('insert into mip_hypothesis.revisions select '+q(later)+',investigation_id,'+q(randomUUID())+
   ",author_id,id,revision+1,request_arguments,assessment||jsonb_build_object('id',"+q(later)+",'revision',revision+1,'predecessor_id',id),clock_timestamp() from mip_hypothesis.revisions where id="+q(x.revisions[0])+
   ";insert into mip_hypothesis.acceptance_bindings select (jsonb_populate_record(null::mip_hypothesis.acceptance_bindings,to_jsonb(b)||jsonb_build_object('revision_id',"+q(later)+",'metadata',jsonb_build_object('poison','unselected')))).* from mip_hypothesis.acceptance_bindings b where revision_id="+q(x.revisions[0]))
  // The old whole-investigation reader evaluates the deliberately invalid unselected metadata.
  await assert.rejects(()=>f.gateway('read_bound_history',[x.identity.user,x.identity.iid]))
  let payload
  await x.reader()(x.request,v=>{payload=v})
  assert.deepEqual(payload.entries.map(e=>e.revision_id),[x.revisions[0]])
  const ids=JSON.parse(await f.admin("with added as (insert into mip_hypothesis.revisions select gen_random_uuid(),r.investigation_id,gen_random_uuid(),r.author_id,r.id,r.revision+n,r.request_arguments,r.assessment,clock_timestamp() from mip_hypothesis.revisions r cross join generate_series(2,130) n where r.id="+q(x.revisions[0])+" returning id) select jsonb_agg(id) from added"))
  await assert.rejects(()=>f.admin('set session authorization mip_hypothesis_owner;select mip_hypothesis.read_selected_bound_history('+[x.identity.user,x.identity.iid].map(q).join(',')+',array['+ids.map(q).join(',')+']::uuid[])'))
  for(const role of ['mip_boundary_history_gateway','mip_boundary_proof_issuer','mip_boundary_permit_cleanup'])
   await assert.rejects(()=>f.admin('set session authorization '+role+';select mip_hypothesis.read_selected_bound_history('+[x.identity.user,x.identity.iid].map(q).join(',')+',array['+q(x.revisions[0])+']::uuid[])'))
 })

 await t.test('permit metadata has no payload; concurrent user quota and expiry-only cleanup remain table-blind',async t=>{
  const x=await context(t)
  await x.reader()(x.request,()=>{})
  const id=x.permit().permit_id
  const row=JSON.parse(await f.admin('select to_jsonb(p) from mip_temporal.boundary_history_permits p where id='+q(id)))
  assert.equal(Object.hasOwn(row,'payload'),false)
  assert.match(row.payload_digest,/^[0-9a-f]{64}$/)
  assert.ok(row.payload_bytes>0);assert.ok(row.payload_entries>0)
  const copySql=(count,age=false)=>"insert into mip_temporal.boundary_history_permits select (jsonb_populate_record(null::mip_temporal.boundary_history_permits,to_jsonb(p)||jsonb_build_object('id',gen_random_uuid(),'request_id',gen_random_uuid(),'created_at',clock_timestamp()"+(age?"-interval '20 seconds'":"")+",'expires_at',clock_timestamp()"+(age?"-interval '10 seconds'":"+interval '9 seconds'")+",'consumed',false))).* from mip_temporal.boundary_history_permits p cross join generate_series(1,"+count+") n where p.id="+q(id)
  await f.admin('set session authorization mip_temporal_advance_owner;'+copySql(30))
  const races=await Promise.allSettled([1,2].map(()=>f.admin('set session authorization mip_temporal_advance_owner;'+copySql(1))))
  assert.equal(races.filter(r=>r.status==='fulfilled').length,1)
  assert.equal(await f.admin('select count(*) from mip_temporal.boundary_history_permits where user_id='+q(x.identity.user)),'32')
  // Direct deletion of a fresh permit is denied even to the metadata owner.
  await assert.rejects(()=>f.admin('set session authorization mip_temporal_advance_owner;delete from mip_temporal.boundary_history_permits where id='+q(id)))
  for(const role of ['mip_boundary_history_gateway','mip_boundary_proof_issuer','mip_boundary_permit_cleanup']){
   await assert.rejects(()=>f.admin('set session authorization '+role+';select * from mip_temporal.boundary_history_permits'))
   if(role!=='mip_boundary_permit_cleanup')
    await assert.rejects(()=>f.admin('set session authorization '+role+';select mip_temporal.cleanup_boundary_history_permits()'))
  }
  // Wait for natural expiry, then invoke the bounded custodian entrypoint.
  await new Promise(resolve=>setTimeout(resolve,10500))
  const removed=Number(await f.admin('set session authorization mip_boundary_permit_cleanup;select mip_temporal.cleanup_boundary_history_permits()'))
  assert.ok(removed>0&&removed<=256)
  assert.equal(await f.admin('select count(*) from mip_temporal.boundary_history_permits where user_id='+q(x.identity.user)),'0')
  assert.equal(await f.admin("select rolcanlogin or rolbypassrls or rolsuper from pg_roles where rolname='mip_boundary_permit_cleanup'"),'f')
 })

 await t.test('verified Auth is inside admission; alternate valid member/investigation and caller identity fields cannot impersonate',async t=>{
  const x=await context(t),other=await f.investigation();let delivered=false
  for(const request of [
   {...x.request,verifiedUserId:other.user},
   {...x.request,authorization:'Bearer '+x.provider.token({sub:other.user})},
   {...x.request,investigationId:other.iid},
   {...x.request,authorization:'Bearer '+x.provider.token({exp:0})},
  ])await assert.rejects(()=>x.reader()(request,()=>{delivered=true}))
  x.provider.state.userOverride={id:other.user,aud:'authenticated',role:'authenticated',is_anonymous:false}
  await assert.rejects(()=>x.reader()(x.request,()=>{delivered=true}));assert.equal(delivered,false)
  x.provider.state.userOverride=null
  await x.reader()(x.request,()=>{delivered=true});assert.equal(delivered,true)
 })
 await t.test('permit scope is immutable; direct roles are disjoint; native owner RLS search_path and exact callable signatures are checked',async t=>{
  const roles=['anon','authenticated','service_role','mip_hypothesis_gateway','mip_temporal_recorder','mip_temporal_ack_gateway','mip_comparison_worker_v1','mip_boundary_proof_issuer','mip_boundary_history_gateway']
  const signatures={issue:'mip_temporal.issue_boundary_history_permit(uuid,jsonb)',consume:'mip_temporal.consume_boundary_history_permit(uuid,uuid)',payload:'mip_temporal.boundary_history_payload(uuid,uuid,uuid[])'}
  for(const role of roles)for(const [kind,signature] of Object.entries(signatures))
   assert.equal(await f.admin('select has_function_privilege('+[role,signature,'EXECUTE'].map(q).join(',')+')'),
    ((kind==='issue'&&role==='mip_boundary_proof_issuer')||(kind==='consume'&&role==='mip_boundary_history_gateway'))?'t':'f')
  for(const a of ['mip_boundary_proof_issuer','mip_boundary_history_gateway'])for(const b of ['mip_boundary_proof_issuer','mip_boundary_history_gateway','mip_temporal_advance_owner'])
   if(a!==b)assert.equal(await f.admin('select pg_has_role('+[a,b,'MEMBER'].map(q).join(',')+')'),'f')
  const catalog=JSON.parse(await f.admin("select jsonb_agg(jsonb_build_object('name',p.proname,'owner',r.rolname,'definer',p.prosecdef,'config',p.proconfig)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname='mip_temporal' and p.proname in('issue_boundary_history_permit','consume_boundary_history_permit','boundary_history_payload')"))
  assert.equal(catalog.length,3)
  for(const p of catalog){assert.equal(p.owner,'mip_temporal_advance_owner');assert.equal(p.definer,true);assert.deepEqual(p.config,['search_path=""'])}
  assert.equal(await f.admin("select relrowsecurity and relforcerowsecurity from pg_class where oid='mip_temporal.boundary_history_permits'::regclass"),'t')
  assert.equal(await f.admin("select to_regprocedure('mip_temporal.read_boundary_history(uuid,uuid,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid)') is null"),'t')
 })
 await t.test('same-transaction savepoint replay returns identical sealed payload without new receipt identity; new transaction and changed request deny',async t=>{
  const x=await context(t),signal=new AbortController().signal;let permit
  await transaction(f.db)(async query=>{
   const challenge=(await query(challengeSql,[randomUUID()])).rows[0].value
   await x.authority.withPermit(x.request,challenge,signal,async p=>{
    permit=p;await query('savepoint probe',[])
    const first=(await query(consumeSql,[p.permit_id,p.request_id])).rows[0].value
    await query('rollback to savepoint probe',[])
    const again=(await query(consumeSql,[p.permit_id,p.request_id])).rows[0].value
    assert.deepEqual(again.payload,first.payload);assert.equal(again.expires_at,first.expires_at)
    assert.equal(again.permit_id,first.permit_id);assert.ok(again.remaining_ms<=first.remaining_ms)
    return receipt(p)
   })
  },signal)
  assert.equal(await f.admin('select count(*) from mip_temporal.boundary_history_permits where id='+q(permit.permit_id)+' and consumed'),'1')
  for(const request of [permit.request_id,randomUUID()])
   await assert.rejects(()=>transaction(f.db)(q1=>q1(consumeSql,[permit.permit_id,request]),signal))
 })
 await t.test('source/member revocation before admission deny; material revocation during delivery waits until snapshot completes',async t=>{
  for(const fault of ['source','membership','material']){
   const x=await context(t)
   if(fault==='source')await f.admin(x.b.revokeSql)
   if(fault==='membership')await f.pub('mip_investigation_workspace_v1','set_access',{investigation_id:x.identity.iid,user_id:x.identity.user,access_role:'revoked',reason:'Synthetic.'})
   if(fault!=='material'){await assert.rejects(()=>x.reader()(x.request,()=>{throw Error('unexpected_delivery')}));continue}
   let ready,release,pid
   const entered=new Promise(r=>ready=r),gate=new Promise(r=>release=r)
   const read=x.reader({withTransaction:transaction(f.db,v=>pid=v)})(x.request,async()=>{ready();await gate})
   await Promise.race([entered,read.then(()=>{throw Error('delivery_missing')})])
   const revoke=f.admin("update mip_identity.operation_evidence_heads set active=false where scope->>'material_version' in (select e->>'material_hash' from mip_hypothesis.acceptance_bindings b cross join lateral jsonb_array_elements(b.metadata) e where b.revision_id="+q(x.revisions[0])+")");revoke.catch(()=>{})
   try{await blocked(f,pid)}finally{release();await Promise.all([read,revoke])}
   let next
   await x.reader()(x.request,v=>{next=v})
   assert.equal(next.entries.find(e=>e.revision_id===x.revisions[0]).status,'withheld')
  }
 })

 await t.test('cooperative material/session expiry rolls back; expired JWT denies before admission',async t=>{
  for(const fault of ['material','session','jwt']){
   const x=await context(t);let restore;let observedSignal;let pid
   if(fault==='material'){
    const revisions=await f.admin("select jsonb_agg(jsonb_build_object('revision',v.revision,'expires_at',v.expires_at)) from mip_identity.operation_evidence_versions v where revision in (select (p->>'revision')::uuid from mip_hypothesis.acceptance_bindings b cross join lateral jsonb_array_elements(b.metadata) e cross join lateral jsonb_array_elements(e->'permissions') p where b.revision_id="+q(x.revisions[0])+")")
    restore="alter table mip_identity.operation_evidence_versions disable trigger immutable;update mip_identity.operation_evidence_versions v set expires_at=r.expires_at from jsonb_to_recordset("+q(JSON.parse(revisions))+"::jsonb) r(revision uuid,expires_at timestamptz) where v.revision=r.revision;alter table mip_identity.operation_evidence_versions enable trigger immutable"
    await f.admin("alter table mip_identity.operation_evidence_versions disable trigger immutable;update mip_identity.operation_evidence_versions set expires_at=clock_timestamp()+interval '5 seconds' where revision in (select (p->>'revision')::uuid from mip_hypothesis.acceptance_bindings b cross join lateral jsonb_array_elements(b.metadata) e cross join lateral jsonb_array_elements(e->'permissions') p where b.revision_id="+q(x.revisions[0])+");alter table mip_identity.operation_evidence_versions enable trigger immutable")
   }
   if(fault==='session'){
    const original=await f.admin('select expires_at from mip_identity.sessions where session_id='+q(x.b.session()))
    restore='alter table mip_identity.sessions disable trigger user;update mip_identity.sessions set expires_at='+q(original)+' where session_id='+q(x.b.session())+';alter table mip_identity.sessions enable trigger user'
    await f.admin("alter table mip_identity.sessions disable trigger user;update mip_identity.sessions set expires_at=clock_timestamp()+interval '5 seconds' where session_id="+q(x.b.session())+";alter table mip_identity.sessions enable trigger user")
   }
   if(fault==='jwt'){
    x.request.authorization='Bearer '+x.provider.token({exp:0})
    let delivered=false
    await assert.rejects(()=>x.reader()(x.request,()=>{delivered=true}),/mip_boundary_history_denied/)
    assert.equal(delivered,false)
    continue
   }
   try{
    const start=Date.now()
    await assert.rejects(()=>x.reader({withTransaction:transaction(f.db,v=>pid=v)})(x.request,async(_,signal)=>{
     observedSignal=signal;await new Promise(()=>{})
    }),/mip_boundary_delivery_aborted/)
    assert.ok(observedSignal?.aborted);assert.ok(Date.now()-start<8000)
    assert.equal(await f.admin('select count(*) from pg_stat_activity where pid='+pid),'0')
   }finally{if(restore)await f.admin(restore)}
  }
 })

 await t.test('hung delivery expires aborts and rolls back; malformed response keys never deliver; native field mutations deny',async t=>{
  const x=await context(t);let signalSeen,pid
  const started=Date.now()
  await assert.rejects(()=>x.reader({withTransaction:transaction(f.db,v=>pid=v)})(x.request,async(_,signal)=>{
   signalSeen=signal;await new Promise(()=>{})
  }),/mip_boundary_delivery_aborted/)
  assert.ok(signalSeen.aborted);assert.ok(Date.now()-started<30000)
  assert.equal(await f.admin('select count(*) from pg_stat_activity where pid='+pid),'0')
  assert.equal(await f.admin('select consumed from mip_temporal.boundary_history_permits where id='+q(x.permit().permit_id)),'f')
  await assert.rejects(()=>transaction(f.db)(query=>query(consumeSql,[x.permit().permit_id,x.permit().request_id]),new AbortController().signal))
  for(const field of ['envelope','payload','entry']){
   const decorated=async(run,signal)=>transaction(f.db)(query=>run(async(sql,args)=>{
    const r=await query(sql,args)
    if(sql===consumeSql){const e=r.rows[0].value;if(field==='envelope')e.unexpected=true;else if(field==='payload')e.payload.unexpected=true;else e.payload.entries[0].unexpected=true}
    return r
   }),signal)
   await assert.rejects(()=>x.reader({withTransaction:decorated})(x.request,()=>{throw Error('unexpected_delivery')}))
  }

  // Required fields, types, nested contracts and status-disclosure shapes all fail closed.
  const mutations=[
   e=>{const a=e.payload.entries[0];e.payload.entries[0]={revision_id:a.revision_id,revision:a.revision,completed_at:a.completed_at,status:'withheld'}},
   e=>{const a=e.payload.entries[0];e.payload.entries[0]={revision_id:a.revision_id,revision:a.revision,completed_at:a.completed_at,status:'withheld',reason:42}},
   e=>delete e.payload.entries[0].revision,
   e=>{e.payload.entries[0].revision='1'},
   e=>delete e.payload.entries[0].completed_at,
   e=>{e.payload.entries[0].current_context='true'},
   e=>{e.payload.entries[0].assessment.question_id=randomUUID()},
   e=>{e.payload.entries[0].assessment.hypotheses[0].confidence={kind:'not_estimated'}},
   e=>{e.payload.entries[0].assessment.evidence[0].source_span.start='0'},
   e=>{e.payload.entries[0].assessment.evidence[0].source_span.unexpected=true},
   e=>{e.payload.entries[0].assessment.comparison.favored_ids=42},
   e=>{e.payload.entries[0].assessment.arguments[0].evidence_ids=['unknown']},
   e=>{e.payload.entries[0].status='withheld';e.payload.entries[0].reason='current_permission_or_binding_denied'},
  ]
  for(const mutate of mutations){
   let delivered=false
   const decorated=async(run,signal)=>transaction(f.db)(query=>run(async(sql,args)=>{
    const r=await query(sql,args);if(sql===consumeSql)mutate(r.rows[0].value);return r
   }),signal)
   await assert.rejects(()=>x.reader({withTransaction:decorated})(x.request,()=>{delivered=true}))
   assert.equal(delivered,false)
  }
  let stalled=false
  await assert.rejects(()=>x.reader()(x.request,()=>{
   // Synthetic event-loop stall: cannot retract transmission, but must not issue a success receipt.
   const end=performance.now()+11000
   while(performance.now()<end){}
   stalled=true
  }),/mip_boundary_delivery_aborted/)
  assert.equal(stalled,true)

  const claim={...x.claim(),auth_until:new Date(Date.now()+60000).toISOString()},session=x.b.session()
  for(const key of ['binding_id','incarnation_id','contract_digest','source_id','stream_epoch','observation_epoch','terminal_capture','target_marker','covered_through','user_id','investigation_id']){
   const bad={...claim,request_id:randomUUID(),[key]:key==='covered_through'?'0/0':randomUUID()}
   await assert.rejects(()=>f.admin('set session authorization mip_boundary_proof_issuer;select mip_temporal.issue_boundary_history_permit('+[session,bad].map(q).join(',')+')'))
  }
  await assert.rejects(()=>f.admin('set session authorization mip_boundary_proof_issuer;select mip_temporal.issue_boundary_history_permit('+[randomUUID(),{...claim,request_id:randomUUID()}].map(q).join(',')+')'))
 })
}
