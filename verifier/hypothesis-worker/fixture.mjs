// Synthetic-only, GitHub disposable PostgreSQL. No live DSN or material retrieval.
import {readFile,readdir} from 'node:fs/promises'
import {randomUUID,createHash,randomBytes} from 'node:crypto'
import {spawn} from 'node:child_process'
import {fixture as brokerFixture,workerRole} from '../integrated/fixture.mjs'
import {raw,quote as q,guard,transport} from '../integrated/transport.mjs'
import {encryptedRemoteJournal} from '../../supabase/qualification/mip-cutover-authority/brokerSession.js'
export {q,raw,workerRole}
const sha=s=>createHash('sha256').update(s).digest('hex')
const base=new URL('../../',import.meta.url)
export async function setup(t) {
 guard()
 await raw('postgres',"alter system set log_min_error_statement='panic';alter system set log_min_messages='panic';alter system set log_statement='none';select pg_reload_conf();")
 await raw('postgres',"do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon;create role authenticated;create role service_role bypassrls;end if;end $$;")
 const f=await brokerFixture(t)
 const source='synthetic-hypothesis-worker',implementation='synthetic-hypothesis-method-v1',method=randomUUID()
 const read=p=>readFile(new URL(p,base),'utf8')
 await f.admin("alter table public.articles alter column id set default gen_random_uuid();alter table public.articles add unique(url);alter table public.articles add feed text default 'synthetic';alter table public.articles add fetched_at timestamptz default now();alter table public.articles add ingestion_run_id text;alter table public.articles add reader_state text default 'pending_review';alter table public.articles add source_status text default 'active';")
 const schema=await read('tests/changeQueueFixture.sql')
 await f.admin('create schema spatial;'+schema.slice(schema.indexOf('create table public.nodes'),schema.indexOf('create table public.pipeline_config'))+
  schema.slice(schema.indexOf('create table spatial.assertions')))
 await f.admin('create table public.mip_profiles(id uuid primary key)')
 for(const name of ['claims','article_claims','claim_evidence_links','claim_corrections','explanations','story_arcs','edges','arc_events','arc_milestones','arc_membership_candidates'])
  await f.admin('create table public.'+name+'(id uuid primary key,payload jsonb not null)')
 for(const name of ['007_survivor_release.sql','008_operation_evidence.sql'])
  await f.admin(await read('supabase/qualification/mip-cutover-authority/'+name))
 await f.admin("update public.articles set url='https://example.invalid/broker-fixture/'||id::text where url is null")
 const migrations=await readdir(new URL('supabase/migrations/',base))
 for(const suffix of ['evidence_pipeline_reliability','evidence_change_queue_v1','evidence_assessment_dependencies_v1','investigation_change_briefings_v1','investigation_workspace_batch_v1']) {
  const paths=migrations.filter(x=>x.endsWith('_'+suffix+'.sql'))
  if(paths.length!==1)throw Error('mip_fixture_migration_ambiguous')
  await f.admin(await read('supabase/migrations/'+paths[0])).catch(e=>{throw Error('mip_fixture_install_'+suffix+'_'+e.message)})
 }
 for(const name of ['001_revision_store.sql','002_retained_observation_reader.sql','003_bound_acceptance.sql','004_bound_history.sql','005_reassessment_causes.sql','006_reassessment_completion.sql','007_human_reconsideration.sql','008_authoring_reads.sql','009_generation_worker.sql','010_generation_ledger.sql','011_method_change_signals.sql','012_generation_recovery.sql','013_recovery_lineage.sql','014_review_acknowledgements.sql','015_committed_observations.sql','016_observation_delivery.sql'])
  await f.admin(await read('supabase/qualification/hypothesis-assessments/'+name)).catch(e=>{throw Error('mip_fixture_install_'+name+'_'+e.message)})
 await f.admin('update mip_hypothesis.observation_epoch set enabled=true where id')
 await f.admin('insert into mip_hypothesis.method_versions values('+[method,implementation,'none','synthetic_mechanism_only','synthetic-fixture-method-only',{}].map(q).join(',')+',clock_timestamp());insert into mip_hypothesis.method_heads values('+[implementation,method,true].map(q).join(',')+');')
 for(const runtime of ['runtime-a','runtime-b']) {
  await f.admin('select comparison_qualification.bind_source_scope('+[runtime,source].map(q).join(',')+');select comparison_qualification.bind_evaluated_implementation('+[runtime,implementation].map(q).join(',')+');')
  for(const op of ['worker_claim','worker_complete','worker_fail'])
   await f.admin('select comparison_qualification.bind_runtime('+[runtime,workerRole,'hypothesis_'+op].map(q).join(',')+');')
 }
 const call=async(role,name,args)=>JSON.parse(await raw(f.db,'set session authorization '+role+';select mip_hypothesis.'+name+'('+args.map(q).join(',')+');')||'null')
 const gateway=(name,args)=>call('mip_hypothesis_gateway',name,args)
 const signatures={worker_claim:['p_request','p_session','p_runtime'],worker_complete:['p_request','p_session','p_runtime','p_generation','p_token','p_input_hash','p_implementation','p_output'],worker_fail:['p_request','p_session','p_runtime','p_generation','p_token','p_input_hash','p_implementation']}
 const rpc=(name,args)=>{if(!Object.hasOwn(signatures,name)||Object.keys(args).length!==signatures[name].length)throw Error('mip_rpc_invalid');return call(workerRole,name,signatures[name].map(k=>args[k]))}
 const pub=async(name,action,input)=>JSON.parse(await f.admin('select public.'+name+'('+[action,input].map(q).join(',')+');'))
 const keys=new Map()
 const journal=session=>encryptedRemoteJournal({sql:transport(f.db,'mip_journal_gateway_v2'),session,
  keyProvider:(runtime,version)=>{const k=keys.get(runtime);if(!k||(version&&k.version!==version))throw Error('mip_journal_key_unavailable');return k}})
 async function investigation() {
  const runtime='synthetic-'+randomUUID(),mapping=randomUUID(),method=randomUUID(),implementation='synthetic-hypothesis-'+randomUUID()
  await f.admin('insert into mip_identity.mapping_versions select '+q(mapping)+','+q(runtime)+',principal,issuer,audience,'+
   q(runtime+':'+workerRole)+",key_revision,max_lifetime_seconds,'synthetic-hypothesis-owner' from mip_identity.mapping_versions where revision="+q(f.mappings['runtime-a'+workerRole])+
   ';insert into mip_identity.mapping_heads values('+[runtime,workerRole,mapping,true].map(q).join(',')+');')
  await f.admin('select comparison_qualification.bind_source_scope('+[runtime,source].map(q).join(',')+');select comparison_qualification.bind_evaluated_implementation('+[runtime,implementation].map(q).join(',')+');')
  for(const op of ['worker_claim','worker_complete','worker_fail'])await f.admin('select comparison_qualification.bind_runtime('+[runtime,workerRole,'hypothesis_'+op].map(q).join(',')+');')
  await f.admin('insert into mip_hypothesis.method_versions values('+[method,implementation,'none','synthetic_mechanism_only','synthetic-fixture-method-only',{}].map(q).join(',')+',clock_timestamp());insert into mip_hypothesis.method_heads values('+[implementation,method,true].map(q).join(',')+');')
  const session=await f.issue(runtime)
  keys.set(runtime,{version:'synthetic-v1',key:randomBytes(32)})

  const user=randomUUID(),iid=randomUUID(),vid=randomUUID(),url='https://example.invalid/synthetic-hypothesis/'+iid
  await f.admin('insert into public.mip_profiles values('+q(user)+')')
  await pub('mip_pipeline_v1','enqueue',{run_id:'synthetic-'+iid,article:{url,title:'Synthetic meeting record',summary:'A 😀 B meeting record.',outlet:'Synthetic',published_at:'2026-08-01'}})
  const job=await pub('mip_pipeline_v1','claim',{})
  const capture=await pub('mip_pipeline_v1','finish',{job_id:job.id,lease_token:job.lease_token})
  const candidate=await pub('mip_pipeline_v1','candidate',{capture_id:capture.capture_id,candidate_key:'synthetic',candidate_kind:'claim',
   statement:'A 😀 B meeting record.',source_field:'summary',span_start:0,span_end:21,excerpt:'A 😀 B meeting record.',extractor_version:'synthetic',remaining_uncertainty:'Synthetic mechanism only.'})
  const context=await pub('mip_assessments_v1','context',{candidate_id:candidate})
  await pub('mip_assessments_v1','append',{candidate_id:candidate,algorithm_key:'synthetic',algorithm_version:'v1',outcome:'insufficient_evidence',
   rationale:'Synthetic.',remaining_uncertainty:'Synthetic.',context_positions:context.context_positions})
  const o=await pub('mip_investigation_briefings_v1','observe',{observation_id:randomUUID(),candidate_ids:[candidate]})
  const state={question:'What explains the fictional contract award?',scope_note:'Synthetic only.',canonical_subject:null,time_range:{from:null,to:null,meaning:'Not established.'},
   unresolved_questions:[],hypotheses:[],commitments:[],coverage:[]}
  await pub('mip_investigation_workspace_v1','put',{investigation_id:iid,version_id:vid,previous_version_id:null,observation_id:o.id,state,change_reason:'Synthetic.'})
  await pub('mip_investigation_workspace_v1','set_access',{investigation_id:iid,user_id:user,access_role:'reviewer',reason:'Synthetic assignment.'})
  const binding=JSON.parse(await f.admin('select mip_hypothesis.observation_binding('+[user,iid,vid].map(q).join(',')+');'))
  const entry=binding.observation.snapshot.inputs.find(x=>x.capture)
  const permissionScope={source_project:source,material_ref:'capture:'+entry.capture.id,material_version:entry.capture.source_version_hash,
   source_version:entry.capture.id,audience:'isolated_internal_review'}
  // Explicit synthetic receipts for every exact retained input; a selected span is not the permission closure.
  const materialScopes=binding.observation.snapshot.inputs.map(input=>{
   const kind=Object.hasOwn(input,'capture')?'capture':'record_version',rec=input[kind]
   return {source_project:source,material_ref:kind+':'+rec.id,material_version:rec.source_version_hash,source_version:rec.id,audience:'isolated_internal_review'}
  })
  for(const materialScope of materialScopes)for(const operation of ['retention','analysis','excerpt_display'])for(const domain of ['rights','privacy']) {
   const scope={...materialScope,operation,domain},revision=randomUUID()
   await f.admin('insert into mip_identity.operation_evidence_versions values('+[
    revision,scope,'synthetic-fixture-v1','synthetic-policy','v1',sha('synthetic policy'),'synthetic-evidence','synthetic-owner','synthetic-approval',
    'recorded','allow','2000-01-01','2999-01-01',[],true].map(q).join(',')+');insert into mip_identity.operation_evidence_heads values('+[scope,revision,true].map(q).join(',')+');')
  }
  const spec={hypotheses:[{id:'a',definition:'Synthetic explanation A.'},{id:'b',definition:'Synthetic explanation B.'}],hypothesis_relationship:'not_established',
   spans:[{id:'s1',input_position:entry.position,source_field:'summary',start:2,end:5}]}
  const captureGeneration=(options={})=>gateway('capture_generation',[user,iid,vid,source,options.request??randomUUID(),options.runtime??runtime,options.method??method,options.spec??spec])
  return {runtime,session,mapping,method,implementation,user,iid,vid,source,url,spec,entry,permissionScope,captureGeneration,
   revokeSql:"update mip_identity.operation_evidence_heads set active=false where scope->>'material_ref'="+q(permissionScope.material_ref)+" and scope->>'domain'='privacy'",
   revokeAccess:()=>pub('mip_investigation_workspace_v1','set_access',{investigation_id:iid,user_id:user,access_role:'revoked',reason:'Synthetic revocation.'})}
 }
 return {...f,journal,source,implementation,method,gateway,rpc,pub,investigation,call,signatures,sha,
  claim:(session=f.session,runtime='runtime-a',request=randomUUID())=>rpc('worker_claim',{p_request:request,p_session:session,p_runtime:runtime})}
}
// Hold an actual disposable database transaction and expose only its PID, not query output.
export async function hold(db,sql,role='postgres') {
 guard()
 const child=spawn('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','5432','-U','postgres','-d',db],
  {env:{PATH:process.env.PATH,PGPASSWORD:'mip-disposable-ci-only',PGOPTIONS:'-c statement_timeout=20000 -c lock_timeout=15000'},stdio:['pipe','pipe','pipe']})
 let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x)
 let exitResolve
 const exited=new Promise(resolve=>exitResolve=resolve);child.on('exit',code=>exitResolve(code))
 child.stdin.write('set session authorization '+role+';begin;'+sql+";select 'READY:'||pg_backend_pid();\n")
 const deadline=Date.now()+10000
 while(!out.includes('READY:')) {
  if(err.includes('ERROR')||Date.now()>deadline){child.kill('SIGKILL');throw Error('mip_hold_failed')}
  await new Promise(r=>setTimeout(r,10))
 }
 return {pid:Number(out.match(/READY:(\d+)/)[1]),finish:async(commit=true)=>{child.stdin.end(commit?'commit;\n':'rollback;\n');if(await exited)throw Error('mip_hold_commit_failed')}}
}
export async function blocked(f,pid) {
 const deadline=Date.now()+5000
 while(Date.now()<deadline) {
  if(await f.admin('select count(*) from pg_stat_activity where '+pid+'=any(pg_blocking_pids(pid))')!=='0')return
  await new Promise(r=>setTimeout(r,20))
 }
 throw Error('mip_expected_serialization_wait')
}
