// Source-authored synthetic qualification; run only in a pristine dedicated PG17.6 DB.
// Parent owns the runner, database creation/destruction and qualification evidence.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import pg from 'pg'
import {assertNativeArcAttachments} from './nativeArcAttachmentAssertions.mjs'
import {assertNativeArcPrivateProjection} from './nativeArcPublicProjectionAssertions.mjs'
import {runNativeComparisonBindingFixture,nativeComparisonFixtureDiagnostic} from './nativeComparisonBindingFixture.mjs'
import {prepareAtomicInstall,installComparisonAtomic,qualifyComparisonAudit,DBLINK_PREFLIGHT_SQL} from '../supabase/qualification/qik-comparison-adapter/atomicInstall.mjs'
import {REQUIRED_RELATIONS,RESERVED_ROLES} from '../supabase/qualification/qik-comparison-adapter/catalogPreflight.mjs'
import {LOAD_ORDER} from '../supabase/qualification/qik-ingest/installQikIngest.mjs'
import {scoreGovernedNativeInput,runGovernedNativeArc} from '../supabase/qualification/arc-membership-native/runGovernedNativeArc.mjs'
const frames=error=>String(error?.stack??'').split('\n').slice(1).flatMap(line=>{
 const match=line.match(/(?:nativeArcCohortPostgres17\.test\.mjs|nativeArcAttachmentAssertions\.mjs|nativeArcPublicProjectionAssertions\.mjs|nativeComparisonBindingFixture\.mjs|nativeComparisonBindingAssertions\.mjs|atomicInstall\.mjs):(\d{1,6}):(\d{1,6})/);
 return match?[match[0]]:[];
}).slice(0,4);
// Only exact static refusal names from the pinned native source may enter diagnostics.
const nativeRefusalNames=new Set(["arc_attachment_arc_head_stale","arc_attachment_current_unavailable","arc_attachment_dependency_stale","arc_attachment_effective_function_boundary","arc_attachment_effective_storage_boundary","arc_attachment_fence_missing","arc_attachment_function_boundary","arc_attachment_function_presence","arc_attachment_immutable","arc_attachment_immutable_boundary","arc_attachment_member_budget","arc_attachment_origin_stale","arc_attachment_predecessor","arc_attachment_prelock_boundary","arc_attachment_prepared_set_stale","arc_attachment_reparent_refused","arc_attachment_request_invalid","arc_attachment_retry_conflict","arc_attachment_role_boundary","arc_attachment_role_presence","arc_attachment_schema_acl","arc_attachment_schema_boundary","arc_attachment_scope_required","arc_attachment_sequence_boundary","arc_attachment_source_boundary","arc_attachment_source_schema_boundary","arc_attachment_storage_boundary","arc_attachment_storage_presence","arc_attachment_validated_set_mismatch","arc_native_admin_required","arc_native_arc_budget","arc_native_arc_missing","arc_native_attachment_dependency","arc_native_attachment_origin","arc_native_attachment_origin_stale","arc_native_attachment_public_assignment","arc_native_attachment_review_stale","arc_native_attachment_score_stale","arc_native_attachment_set_stale","arc_native_audit_shape","arc_native_binding_set","arc_native_byte_budget","arc_native_candidate_stale","arc_native_capture_binding","arc_native_capture_not_current","arc_native_cohort_changed","arc_native_cohort_missing","arc_native_cohort_revoked","arc_native_cohort_shape","arc_native_effective_storage_boundary","arc_native_extraction_binding","arc_native_extraction_stale","arc_native_fence_boundary","arc_native_fence_missing","arc_native_field_binding","arc_native_field_budget","arc_native_function_boundary","arc_native_generation_budget","arc_native_generation_missing","arc_native_generation_stale","arc_native_hash_work_budget","arc_native_immutable","arc_native_isolation","arc_native_native_recorder_boundary","arc_native_native_revision_stale","arc_native_operation_budget","arc_native_output_shape","arc_native_owner_boundary","arc_native_owner_membership","arc_native_policy_shape","arc_native_predecessor","arc_native_prelock_boundary","arc_native_rejected_score","arc_native_relation_stale","arc_native_relation_unprojected","arc_native_retry_conflict","arc_native_review_retry_conflict","arc_native_review_stale","arc_native_revision_budget","arc_native_role_boundary","arc_native_scalar_shape","arc_native_schema_boundary","arc_native_score_decision","arc_native_score_evidence","arc_native_score_missing","arc_native_score_number","arc_native_score_reasons","arc_native_score_retry_conflict","arc_native_score_shape","arc_native_selection_stale","arc_native_source_access","arc_native_source_authority","arc_native_source_columns","arc_native_storage_boundary","arc_native_table_boundary","arc_native_union_binding","arc_native_union_budget"]);
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8')
const database='postgres',password='mip-efta-disposable-ci-only'
const aliceName='native_arc_alice',adminName='native_arc_admin'
const workerName='native_arc_private_worker'
const bobName='native_arc_bob',guestName='native_arc_guest',reviewerName='native_arc_reviewer'
const names=['mip_cutover_schema_owner_v1','mip_collector_owner_v2','mip_arc_native_owner','mip_arc_attachment_owner','mip_arc_native_worker','mip_arc_qik_source_owner','mip_canonical_writer','anon','authenticated','service_role','mip_mentions_owner','mip_mentions_gateway',
 'mip_mentions_admin','mip_mentions_native_validator',aliceName,adminName,bobName,guestName,reviewerName,workerName]
const id=n=>'c6500000-0000-4000-8000-'+String(n).padStart(12,'0')
const s=id(1),otherScope=id(2),actor=id(3),actor2=id(4),candidate=id(5),decision=id(6)
const fields=[id(10),id(11),id(12),id(13)],mentions=[id(20),id(21),id(22),id(23)]
const sentinel='PRIVATE_CANDIDATE_REVIEW_SENTINEL_c644'
const body='A😀 Sam spoke. '+sentinel,summary='Li replied.',title='Jo spoke.'
const sha=x=>createHash('sha256').update(x).digest('hex')
const readSQL='select mip_mentions.read_candidate_proposal($1,$2,$3) result'
const wrapperSQL='select canonical_admission_fixture.proposal($1,$2,$3) result'
const putSQL='select mip_mentions.put_candidate($1,$2,$3,$4,$5,$6,$7,$8::uuid[],$9::uuid[],$10) result'
const proposalArgs=[s,candidate,mentions[0],actor,1,null,2,[mentions[2],mentions[1]],[mentions[3]],'synthetic exact proposal']
const deny=async(promise,pattern=/unavailable|denied|permission|conflict|budget/)=>assert.rejects(promise,e=>pattern.test(e.message))
async function connect(user='postgres',pass=password){
 const c=new pg.Client({host:'127.0.0.1',port:5432,database,user,password:pass,
  connectionTimeoutMillis:5000,statement_timeout:15000,query_timeout:20000})
 try{await c.connect();return c}catch(error){
  try{await c.end()}catch{throw Error('canonical_admission_connection_cleanup_failed')}
  throw error
 }
}
test('native C9 complete cohort, unchanged private scoring and current exact review', {
 skip:process.env.MIP_NATIVE_ARC_COHORT_DISPOSABLE!=='synthetic-pg17-only',timeout:300000
},async t=>{
 let db,monitor,alice,admin,bob,guest,reviewer,wrong,sameReviewer,privateWorker,armed=false,primaryFailed=false,stage='fixture',primaryState='none',primaryFrames=[],primaryPosition='none',primaryStage='fixture',checkIndex=0,baseline=[]
 try{
  stage='atomic_environment';
  if(process.env.MIP_QIK_COMPARISON_DISPOSABLE!=='synthetic-pg17-only'
   ||process.env.MIP_DISPOSABLE_POSTGRES!=='qik-persistent-install')
   throw Error('native_arc_atomic_environment_required');
  stage='fixture';
  db=await connect();monitor=await connect();await assertPristineFixture(db);
  baseline=(await db.query('select rolname from pg_roles order by rolname')).rows.map(r=>r.rolname)
  const identity=(await db.query("select current_database() db,session_user::text principal,current_user::text effective,current_setting('server_version_num') version")).rows[0]
  assert.deepEqual(identity,{db:database,principal:'postgres',effective:'postgres',version:'170006'})
  assert.equal((await db.query("select count(*)::int n from pg_namespace where nspname not like 'pg_%' and nspname not in ('public','information_schema')")).rows[0].n,0,'unrelated schema')
  assert.equal((await db.query("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'")).rows[0].n,0,'unrelated relation')
  assert.equal((await db.query("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'")).rows[0].n,0,'unrelated function')
  assert.equal((await db.query("select count(*)::int n from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public'")).rows[0].n,0,'unrelated type')
  assert.equal((await db.query(
   "select ((select count(*) from pg_operator where oprnamespace='public'::regnamespace)"+
   "+(select count(*) from pg_collation where collnamespace='public'::regnamespace)"+
   "+(select count(*) from pg_conversion where connamespace='public'::regnamespace)"+
   "+(select count(*) from pg_ts_config where cfgnamespace='public'::regnamespace)"+
   "+(select count(*) from pg_ts_dict where dictnamespace='public'::regnamespace)"+
   "+(select count(*) from pg_ts_parser where prsnamespace='public'::regnamespace)"+
   "+(select count(*) from pg_ts_template where tmplnamespace='public'::regnamespace)"+
   "+(select count(*) from pg_opclass where opcnamespace='public'::regnamespace)"+
   "+(select count(*) from pg_opfamily where opfnamespace='public'::regnamespace)"+
   "+(select count(*) from pg_statistic_ext where stxnamespace='public'::regnamespace))::integer n"
  )).rows[0].n,0,'unrelated public catalog')
  assert.equal((await db.query("select count(*)::int n from pg_extension where extname<>'plpgsql'")).rows[0].n,0,'unrelated extension')
  assert.equal((await db.query('select count(*)::int n from pg_roles where rolname=any($1)',[names])).rows[0].n,0,'reserved fixture role')
  assert.equal((await db.query("select (select count(*) from pg_foreign_server)+(select count(*) from pg_event_trigger)+(select count(*) from pg_default_acl)+(select count(*) from pg_publication)+(select count(*) from pg_subscription)+(select count(*) from pg_largeobject_metadata) n")).rows[0].n,'0','unrelated catalog')
  assert.equal((await db.query("select bool_and(error is null and (type='local' or(type='host' and auth_method='scram-sha-256'))) ok from pg_hba_file_rules")).rows[0].ok,true)
  armed=true
  stage='full_backend_install';await installFullBackend(db);
  for(const path of [
   'supabase/qualification/entity-resolution/001_mentions.sql',
   'supabase/qualification/entity-resolution/native-capture-fields/003_native_fields.sql'])
   await db.query(await read(path))
  const catalog=async()=>({
   roles:(await db.query('select rolname,rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls from pg_roles where rolname=any($1) order by rolname',[names])).rows,
   memberships:(await db.query('select roleid,member,grantor,admin_option,inherit_option,set_option from pg_auth_members order by roleid,member,grantor')).rows,
   schemas:(await db.query("select nspname,nspowner,nspacl::text from pg_namespace where nspname in ('mip_mentions','evidence_pipeline') order by nspname")).rows,
   columns:(await db.query("select c.relname,a.attname,a.attacl::text from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('mip_mentions','evidence_pipeline') and a.attnum>0 and not a.attisdropped order by n.nspname,c.relname,a.attnum")).rows,
   relations:(await db.query("select n.nspname,c.relname,c.relowner,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('mip_mentions','evidence_pipeline') order by n.nspname,c.relname")).rows,
   policies:(await db.query("select * from pg_policies where schemaname in ('mip_mentions','evidence_pipeline') order by schemaname,tablename,policyname")).rows,
   functions:(await db.query("select p.oid,p.proowner,p.proacl::text,p.prosecdef,p.provolatile,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('mip_mentions','evidence_pipeline') and p.proname<>'read_candidate_proposal' order by p.oid")).rows,
  })
  const prior=await catalog()
  await db.query(await read('supabase/qualification/entity-resolution/candidate-review/004_candidate_review.sql'))
  assert.deepEqual(await catalog(),prior,'existing role, membership, ACL, RLS, policy and function boundaries preserved')
  await db.query(`create table public.entities(id uuid primary key,canonical_name text,normalized_name text,type text,aliases text[],mention_count integer default 0,last_seen timestamptz);
   alter table public.story_arcs add column started_at date not null,add column title text,add column summary text,add column last_update_at timestamptz,add column category text not null default 'accountability',add column root_node_id uuid;
   -- Exact selected context columns only; the separate historical fixture owns
   -- full legacy projector schema/default/index dependency qualification.
   alter table public.nodes add column if not exists type text;
   alter table public.arc_milestones add column if not exists arc_id uuid,add column if not exists milestone_key text,add column if not exists status text not null default 'pending';
   alter table public.articles add column if not exists reader_state text not null default 'pending_review',add column if not exists source_status text not null default 'active';
   alter table public.nodes enable row level security;alter table public.arc_milestones enable row level security;
   alter table public.arc_membership_candidates add column article_id uuid,add column arc_id uuid,add column state text,add column updated_at timestamptz;
   alter table public.articles enable row level security;alter table public.entities enable row level security;
   alter table public.story_arcs enable row level security;alter table public.pipeline_config enable row level security;
   alter table public.arc_membership_candidates enable row level security;`)
  for(const path of ['supabase/qualification/arc-membership-qik-source/001_storage.sql',
   'supabase/qualification/entity-resolution/canonical-admission/005_canonical_admission.sql',
   'supabase/qualification/arc-membership-qik-source/002_governed_writer.sql'])
   await db.query(await read(path))

  // Fixture-only invoker wrapper demonstrates that wrapping cannot replace the
  // underlying gateway privilege or real session_user membership requirement.
  await db.query("create schema canonical_admission_fixture;create function canonical_admission_fixture.proposal(uuid,uuid,integer) returns jsonb language sql security invoker set search_path='' as 'select mip_mentions.read_candidate_proposal($1,$2,$3)';revoke all on function canonical_admission_fixture.proposal(uuid,uuid,integer) from public")
  for(const name of [aliceName,adminName,bobName,guestName,reviewerName])
   await db.query('create role "'+name+'" login password \''+password+'\'')
  for(const name of [aliceName,bobName,reviewerName])await db.query('grant mip_mentions_gateway to "'+name+'"')
  await db.query('create role "'+workerName+'" login password \''+password+'\'');
  await db.query('grant mip_mentions_admin to "'+adminName+'"')
  for(const name of [aliceName,adminName,bobName,guestName,reviewerName]){
   await db.query('grant usage on schema canonical_admission_fixture to "'+name+'"')
   await db.query('grant execute on function canonical_admission_fixture.proposal(uuid,uuid,integer) to "'+name+'"')
  }
  assert.equal((await db.query("select bool_and(rolpassword like 'SCRAM-SHA-256$%') ok from pg_authid where rolname=any($1)",[[aliceName,adminName,bobName,guestName,reviewerName]])).rows[0].ok,true)
  alice=await connect(aliceName);admin=await connect(adminName);bob=await connect(bobName)
  guest=await connect(guestName);reviewer=await connect(reviewerName)
  for(const [client,name] of [[alice,aliceName],[admin,adminName],[bob,bobName],[guest,guestName],[reviewer,reviewerName]])
   assert.deepEqual((await client.query('select session_user::text principal,current_user::text effective')).rows[0],{principal:name,effective:name})
  await assert.rejects(async()=>{wrong=await connect(aliceName,'deliberately-wrong-synthetic-password')},e=>e.code==='28P01')
  await db.query('insert into mip_mentions.members values($1,session_user,true),($1,$2,false),($1,$3,true)',[s,aliceName,reviewerName])
  await reviewer.query('select mip_mentions.admit_actor_locator($1,$2)',[s,actor])
  await db.query('insert into mip_mentions.actors values($1,$2,$3)',[s,actor2,'Historical synthetic label'])
  async function capture(text,url){
   const payload={url,title,outlet:'Synthetic',summary,body_text:text,published_at:'2026-01-02T00:00:00Z'}
   const job=(await db.query("select evidence_pipeline.enqueue('synthetic-candidate-review',$1::jsonb) id",[JSON.stringify(payload)])).rows[0].id
   const claimed=(await db.query('select evidence_pipeline.claim_job() result')).rows[0].result
   assert.equal(claimed.id,job)
   const result=(await db.query('select evidence_pipeline.finish_job($1,$2) result',[job,claimed.lease_token])).rows[0].result
   return (await db.query('select id,job_id,article_id,content_hash from evidence_pipeline.article_captures where id=$1',[result.capture_id])).rows[0]
  }
  stage='native_install';
  const recorderBaseline=(await db.query("select p.oid,pg_get_functiondef(p.oid) definition from pg_proc p where p.oid in('mip_identity.collector_change()'::regprocedure,'mip_identity.collector_native_change()'::regprocedure,'mip_identity.collector_lock()'::regprocedure) order by p.oid")).rows;
  for(const path of ['supabase/qualification/arc-membership-native/001_governed_cohort.sql',
   'supabase/qualification/arc-membership-native/002_private_score_review.sql',
   'supabase/qualification/arc-membership-native/003_governed_attachment.sql',
   'supabase/qualification/arc-public-projection/001_native_private_projection.sql',
   'supabase/qualification/native-comparison-binding/001_private_binding.sql',
   'supabase/qualification/native-comparison-display/001_private_display.sql',
   'supabase/qualification/native-comparison-caller/001_admission.sql'])await db.query(await read(path));
  assert.deepEqual((await db.query("select p.oid,pg_get_functiondef(p.oid) definition from pg_proc p where p.oid in('mip_identity.collector_change()'::regprocedure,'mip_identity.collector_native_change()'::regprocedure,'mip_identity.collector_lock()'::regprocedure) order by p.oid")).rows,recorderBaseline);
  await db.query('grant mip_arc_native_worker to "'+aliceName+'", "'+workerName+'"');
  privateWorker=await connect(workerName);sameReviewer=await connect(reviewerName);
  await db.query("set timezone='UTC'");
  const checkNative=async(name,body)=>{
   const index=++checkIndex;
   return t.test(name,async()=>{
    stage='check_'+index;
    try{await body()}catch(e){
     const state=/^[0-9A-Z]{5}$/.test(e?.code??'')?e.code:'none';
     const position=/^[0-9]{1,8}$/.test(String(e?.internalPosition??e?.position??''))?String(e.internalPosition??e.position):'none';
     const locations=frames(e);
     if(!primaryFailed){primaryState=state;primaryFrames=locations;primaryPosition=position;primaryStage=stage}
     primaryFailed=true;
     const refusal=nativeRefusalNames.has(e.message)?e.message:'none';
     // Nested fixture failures expose only a closed synthetic check/code/line descriptor.
     const privateDiagnostic=/^arc_private_projection_check_[1-5]_sqlstate_(?:[A-Z0-9]{5}|none)_position_(?:[0-9]{1,8}|none)_frames_(?:nativeArcPublicProjectionAssertions\.mjs:[0-9]{1,6}:[0-9]{1,6}(?:,nativeArcPublicProjectionAssertions\.mjs:[0-9]{1,6}:[0-9]{1,6}){0,2})?$/.test(e.message??'')?e.message:'none';
     throw Error('native_arc_'+stage+'_sqlstate_'+state+'_refusal_'+refusal+'_position_'+position+'_private_'+privateDiagnostic+'_comparison_'+JSON.stringify(nativeComparisonFixtureDiagnostic(e))+'_frames_'+locations.join(','));
    }
   });
  };
  // Run the complete accepted-reader fixture while public source custody is
  // has only the exact initially eligible synthetic sentinel. Unchanged007 refuses ANY
  // pending-review article, including unrelated synthetic predecessor cases.
  // Do not relabel or delete those cases; seed them only after this check.
  // Separate scope preserves their exact generation-count and head contracts.
  assert.deepEqual((await db.query("select feed,outlet,title,url,reader_state,source_status from public.articles order by id")).rows,
   [{feed:'preexisting',outlet:'fixture',title:'Preexisting qik row',url:'https://news.example/preexisting',reader_state:'eligible',source_status:'active'}]);
  const bindingScope=id(7200);
  await db.query('insert into mip_mentions.members values($1,session_user,true),($1,$2,false),($1,$3,true),($1,$4,false)',
   [bindingScope,reviewerName,aliceName,adminName]);
  await checkNative('real_native_to_accepted_comparison_binding_both_current_readers',async()=>{
   const bound=await runNativeComparisonBindingFixture({syntheticFixture:true,db,reviewer,sameReviewer,
    gateway:alice,outsider:guest,worker:privateWorker,admin,scope:bindingScope,id,sentinel,connect});
   assert.deepEqual(bound,{checks:6,display_checks:5,caller_checks:8,original_captures:4,accepted_events:2,publication_allowed:false,attachment_allowed:false});
  });

  const cap=await capture(body,'https://synthetic.invalid/review'),conflictCap=await capture('Ann objected. '+sentinel,'https://synthetic.invalid/conflict')
  const access=(f,allow)=>admin.query('select mip_mentions.set_field_access($1,$2,$3)',[s,f,allow])
  async function admitMention(f,mid,c,sourceField,text,start,end,literal){
   const hash=sha(text),sv='native-capture:'+c.id+':'+c.content_hash,fv='native-field:utf8:v1:'+sourceField+':'+hash
   await db.query('set role mip_mentions_owner')
   try{await db.query('select mip_mentions.admit_native_field($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [s,f,c.id,c.job_id,c.article_id,c.content_hash,sourceField,hash,Buffer.byteLength(text)])}
   finally{await db.query('reset role')}
   await access(f,true)
   await alice.query('select mip_mentions.put_mention($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,null,null)',
    [s,mid,f,sv,fv,hash,'unicode_code_point',start,end,literal])
  }
  await admitMention(fields[0],mentions[0],cap,'body_text',body,3,6,'Sam')
  await admitMention(fields[1],mentions[1],cap,'title',title,0,2,'Jo')
  await admitMention(fields[2],mentions[2],cap,'summary',summary,0,2,'Li')
  await admitMention(fields[3],mentions[3],conflictCap,'body_text','Ann objected. '+sentinel,0,3,'Ann')
  await alice.query(putSQL,proposalArgs)
  const readProposal=(client=alice,args=[s,candidate,1],sql=readSQL)=>client.query(sql,args).then(r=>r.rows[0].result)

  const entity=id(90),entity2=id(91),mapping=id(100),policy=id(101),policyKey=id(102)
  const admission1=id(110),admission2=id(111),admission3=id(112)
  let projection=id(120),mappingHead=mapping,projectionVersion=1
  const falseFlags=['production_qualified','source_authority_qualified','transport_qualified','publication_allowed']
  const groupKeys=['semantic_kind','scope','article_id','entity_id','mapping_revision','weight_policy_revision','admission_ids','evidence_weight','set_digest']
  const projectedKeys=[...groupKeys,'projection_id','version','predecessor_id','projection_status',...falseFlags].sort()
  const prepareKeys=[...groupKeys,'projection_status','expected_predecessor','current_projection_id',...falseFlags].sort()
  const articleKeys=['semantic_kind','scope','article_id','capture_id','head_revision_ids','groups','input_status','article_set_digest',...falseFlags].sort()
  const call=async(client,sql,args)=>(await client.query(sql,args)).rows[0].result
  const mappingSQL='select mip_mentions.review_canonical_mapping($1,$2,$3,$4,$5,$6,$7,$8,$9) result'
  const policySQL='select mip_mentions.review_weight_policy($1,$2,$3,$4,$5,$6,$7) result'
  const admissionSQL='select mip_mentions.review_canonical_admission($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) result'
  const prep=(client=alice)=>call(client,'select mip_arc_qik_source.prepare_governed_relation($1,$2,$3) result',[s,cap.article_id,entity])
  const articlePrep=(client=alice,captureId=cap.id)=>call(client,'select mip_arc_qik_source.prepare_governed_article($1,$2,$3) result',[s,cap.article_id,captureId])
  const project=(receipt,pid,client=alice)=>call(client,'select mip_arc_qik_source.write_governed_relation($1,$2,$3,$4,$5,$6::uuid[],$7) result',
   [s,pid,cap.article_id,entity,receipt.expected_predecessor,receipt.admission_ids,receipt.set_digest])
  const admissionArgs=(aid,mid,did,w,v=1,prev=null,st='active',map=mappingHead)=>
   [s,aid,mid,v,prev,st,did,map,policy,w,st==='revoked'?'evidence_revoked':v===1?'evidence_reviewed':'evidence_replaced']
  const clean=value=>{
   assert.doesNotMatch(JSON.stringify(value),new RegExp(sentinel+'|Historical synthetic label|Sam spoke|Ann objected|normalized_name|aliases|canonical_name'))
   for(const k of falseFlags)assert.equal(value[k],false)
  }
  const checkProjected=value=>{
   assert.deepEqual(Object.keys(value).sort(),projectedKeys);clean(value)
   assert.equal(value.semantic_kind,'reviewed_evidence_weight_v1')
   assert.equal(value.projection_status,'projected_current')
   for(const [k,v] of Object.entries(value))if(v!==null&&typeof v==='object'){
    assert.equal(k,'admission_ids');assert.ok(Array.isArray(v));for(const x of v)assert.match(x,/^[0-9a-f-]{36}$/)
   }
  }
  await db.query('insert into public.entities values($1,$3,$4,$5,$6,0,null),($2,$3,$4,$5,$6,0,null)',
   [entity,entity2,'Same synthetic name','same synthetic name','person',['Ordered alias one','Ordered alias two']])

  stage='canonical_seed';
  const identityDigest=(await db.query("select encode(sha256(convert_to(jsonb_build_object('id',id,'canonical_name',canonical_name,'normalized_name',normalized_name,'type',type,'aliases',aliases)::text,'UTF8')),'hex') digest from public.entities where id=$1",[entity])).rows[0].digest;
  await reviewer.query(mappingSQL,[s,mapping,actor,entity,1,null,'active',identityDigest,'identity_reviewed']);
  await reviewer.query(policySQL,[s,policy,policyKey,1,null,'active','weight_policy_reviewed']);
  await reviewer.query("select mip_mentions.decide($1,$2,$3,1,null,'accepted',$4,'synthetic reviewed context')",[s,decision,mentions[0],candidate]);
  await reviewer.query(admissionSQL,admissionArgs(admission1,mentions[0],decision,0.8));
  await project(await prep(),projection);
  await db.query('insert into mip_mentions.members values($1,$2,false)',[s,adminName]);
  const arc=id(400),arcCandidate=id(401),selection=id(402),cohort=id(403),generation=id(404),reviewId=id(405);
  await db.query('insert into public.story_arcs(id,started_at,title,summary,last_update_at) values($1,$2,$3,$4,$5)',[arc,'2026-01-01',title,summary,'2026-01-02T00:00:00Z']);
  await db.query('update public.articles set arc_id=$1 where id=$2',[arc,conflictCap.article_id]);
  await db.query("insert into public.arc_membership_candidates(id,article_id,arc_id,state,updated_at) values($1,$2,$3,'pending','2026-01-02 00:00:00.123456+00')",[arcCandidate,cap.article_id,arc]);
  const revision=(await db.query('select updated_at::text revision from public.arc_membership_candidates where id=$1',[arcCandidate])).rows[0].revision;
  assert.match(revision,/123456/);
  const baseEvidenceCandidate=(await db.query('select evidence_pipeline.append_candidate($1::jsonb) id',[JSON.stringify({
   capture_id:cap.id,candidate_key:'native-arc-new-evidence',candidate_kind:'claim',statement:'synthetic original native claim',
   source_field:'title',span_start:0,span_end:2,excerpt:'Jo',extractor_version:'synthetic-native-arc-v1',remaining_uncertainty:'synthetic pending review'
  })])).rows[0].id;
  const bindings=[],extractions=[];
  for(const [i,capture] of [cap,conflictCap].entries()){
   for(const [j,field] of ['title','summary','outlet','published_at'].entries()){
    const binding=id(500+i*10+j);
    const meta=(await db.query("select case when not(payload?$2) then 'missing' when payload->$2='null'::jsonb then 'null' else jsonb_typeof(payload->$2) end kind,encode(sha256(convert_to(jsonb_build_object('present',payload?$2,'value',payload->$2)::text,'UTF8')),'hex') hash from evidence_pipeline.article_captures where id=$1",[capture.id,field])).rows[0];
    await reviewer.query('select mip_arc_native.review_scalar($1,$2,$3,$4,$5,$6,$7,$8,$9)',
     [s,binding,capture.article_id,capture.id,capture.job_id,capture.content_hash,field,meta.kind,meta.hash]);
    await admin.query('select mip_arc_native.set_scalar_access($1,$2,true)',[s,binding]);
    bindings.push(binding);
   }
   const receipt=await call(alice,'select mip_arc_qik_source.prepare_governed_article($1,$2,$3) result',[s,capture.article_id,capture.id]);
   const extraction=id(550+i);
   await reviewer.query("select mip_arc_native.review_extraction($1,$2,$3,$4,$5,1,null,'completed','reviewed_complete',$6)",
    [s,extraction,capture.article_id,capture.id,capture.content_hash,receipt.article_set_digest]);
   extractions.push(extraction);
  }
  await reviewer.query('select mip_arc_native.review_selection_policy($1,$2,1,null,0.7,true,31,128,8388608,134217728)',[s,selection]);
  const cohortArgs=[s,cohort,arcCandidate,revision,cap.article_id,arc,[conflictCap.article_id],bindings,extractions,selection];
  await reviewer.query('select mip_arc_native.review_cohort($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',cohortArgs);
  const snap=()=>call(alice,'select mip_arc_native.snapshot($1,$2,$3) result',[s,cohort,generation]);
  let receipt=await snap(),output,scored;
  const wire=()=>call(alice,'select mip_arc_native.read_scoring_input($1,$2,$3) result',[s,generation,receipt.input_hash]);
  const current=(rid=null)=>call(alice,'select mip_arc_native.read_current_score($1,$2,$3,$4,$5) result',[s,generation,receipt.input_hash,scored.output_hash,rid]);
  await checkNative('exact_snapshot_scoring_retry_and_private_review',async()=>{
   assert.deepEqual(await snap(),receipt);
   const input=await wire();output=scoreGovernedNativeInput(input);
   assert.equal(output.score.decision,'candidate');
   scored=await call(alice,'select mip_arc_native.complete_score($1,$2,$3,$4::jsonb) result',[s,generation,receipt.input_hash,JSON.stringify(output)]);
   assert.deepEqual(await call(alice,'select mip_arc_native.complete_score($1,$2,$3,$4::jsonb) result',[s,generation,receipt.input_hash,JSON.stringify(output)]),scored);
   const reviewArgs=[s,reviewId,generation,receipt.input_hash,scored.output_hash,1,null,'accepted_private','reviewed_continuity'];
   await reviewer.query('select mip_arc_native.review_score($1,$2,$3,$4,$5,$6,$7,$8,$9)',reviewArgs);
   const value=await current(reviewId);
   assert.deepEqual(value.output,output);assert.equal(value.review.state,'accepted_private');
   for(const k of ['approval_allowed','publication_allowed','attached'])assert.equal(value[k],false);
   assert.doesNotMatch(JSON.stringify(value),new RegExp(sentinel+'|Jo spoke|Li replied|Sam spoke'));
   await assert.rejects(current(null),e=>e.message==='arc_native_review_stale');
   const changed=structuredClone(output);changed.score.signals.entity=0.123;
   await assert.rejects(alice.query('select mip_arc_native.complete_score($1,$2,$3,$4)',[s,generation,receipt.input_hash,changed]),e=>e.message==='arc_native_score_retry_conflict');
   changed.score.evidence.diagnostic=sentinel;
   await assert.rejects(alice.query('select mip_arc_native.complete_score($1,$2,$3,$4)',[s,generation,receipt.input_hash,changed]),e=>e.message==='arc_native_score_shape');
  });
  await checkNative('missing_and_revoked_access_refuse_whole_current_reader',async()=>{
   await admin.query('select mip_arc_native.set_scalar_access($1,$2,false)',[s,bindings[4]]);
   await assert.rejects(current(reviewId),e=>e.message==='arc_native_source_access');
   await admin.query('select mip_arc_native.set_scalar_access($1,$2,null)',[s,bindings[4]]);
   await assert.rejects(current(reviewId),e=>e.message==='arc_native_source_access');
   await admin.query('select mip_arc_native.set_scalar_access($1,$2,true)',[s,bindings[4]]);
   assert.deepEqual((await current(reviewId)).output,output);
  });
  await checkNative('same_weight_new_admission_head_invalidates_exact_extraction_set',async()=>{
   await reviewer.query('begin');
   try{
    await reviewer.query(admissionSQL,admissionArgs(id(119),mentions[0],decision,0.8,2,admission1));
    await assert.rejects(reviewer.query('select mip_arc_native.read_current_score($1,$2,$3,$4,$5)',
     [s,generation,receipt.input_hash,scored.output_hash,reviewId]),e=>e.message==='arc_native_extraction_stale');
   }finally{await reviewer.query('rollback')}
   assert.deepEqual((await current(reviewId)).output,output);
  });
  await checkNative('actual_original_json_null_and_missing_scalar_bindings_admit_distinctly',async()=>{
   const job=(await db.query("select evidence_pipeline.enqueue('synthetic-native-null',$1::jsonb) id",
    [JSON.stringify({url:'https://synthetic.invalid/native-null',title:'Synthetic null scalar',outlet:'Synthetic',summary:null,body_text:null})])).rows[0].id;
   // enqueue intentionally materializes every canonical key; absence becomes
   // explicit JSON null. Preserve and assert that standard producer contract.
   assert.deepEqual((await db.query("select payload?'published_at' present,payload->'published_at' value from evidence_pipeline.import_jobs where id=$1",[job])).rows[0],
    {present:true,value:null});
   const finish=async expectedJob=>{
    const claim=(await db.query('select evidence_pipeline.claim_job() result')).rows[0].result;
    assert.equal(claim.id,expectedJob);
    const finished=(await db.query('select evidence_pipeline.finish_job($1,$2) result',[expectedJob,claim.lease_token])).rows[0].result;
    assert.deepEqual((await db.query('select state from evidence_pipeline.job_events where job_id=$1 order by id',[expectedJob])).rows.map(r=>r.state),['processing','completed']);
    return (await db.query('select id,article_id,job_id,content_hash from evidence_pipeline.article_captures where id=$1',[finished.capture_id])).rows[0];
   };
   const admit=async(original,field,kind,binding)=>{
    const hash=(await db.query("select encode(sha256(convert_to(jsonb_build_object('present',payload?$2,'value',payload->$2)::text,'UTF8')),'hex') hash from evidence_pipeline.article_captures where id=$1",[original.id,field])).rows[0].hash;
    await reviewer.query('select mip_arc_native.review_scalar($1,$2,$3,$4,$5,$6,$7,$8,$9)',
     [s,binding,original.article_id,original.id,original.job_id,original.content_hash,field,kind,hash]);
    return hash;
   };
   const original=await finish(job);
   await admit(original,'summary','null',id(720));
   const nullHash=await admit(original,'published_at','null',id(721));
   // A missing canonical key cannot be produced by enqueue. This separately
   // labelled privileged synthetic substrate fixture seeds a NEW pending job
   // with exact original JSON/hash; actual claim/finish creates identity,
   // immutable capture and processing/completed history. No capture is edited.
   const missingPayload={url:'https://synthetic.invalid/native-missing',title:'Synthetic missing scalar',outlet:'Synthetic',summary:null,body_text:null};
   const missingJob=(await db.query("insert into evidence_pipeline.import_jobs(canonical_url,input_hash,payload,first_run_id) select evidence_pipeline.canonical_url($1::jsonb->>'url'),encode(sha256(convert_to(($1::jsonb)::text,'UTF8')),'hex'),$1::jsonb,'synthetic-privileged-missing-key' returning id",
    [JSON.stringify(missingPayload)])).rows[0].id;
   await db.query("insert into evidence_pipeline.import_receipts(run_id,job_id,original_url) values('synthetic-privileged-missing-key',$1,$2)",[missingJob,missingPayload.url]);
   const missing=await finish(missingJob);
   assert.deepEqual((await db.query("select payload?'published_at' present,payload->'published_at' value,content_hash=encode(sha256(convert_to(payload::text,'UTF8')),'hex') valid from evidence_pipeline.article_captures where id=$1",[missing.id])).rows[0],
    {present:false,value:null,valid:true});
   const missingHash=await admit(missing,'published_at','missing',id(722));
   assert.notEqual(nullHash,missingHash);
   assert.deepEqual((await db.query('select value_kind from mip_arc_native.scalar_bindings where scope=$1 and id=any($2::uuid[]) order by id',[s,[id(720),id(721),id(722)]])).rows.map(r=>r.value_kind),['null','null','missing']);
   assert.deepEqual((await db.query("select payload?'published_at' present,payload->'published_at' value,content_hash=$2 unchanged from evidence_pipeline.article_captures where id=$1",[original.id,original.content_hash])).rows[0],
    {present:true,value:null,unchanged:true});
   assert.deepEqual((await current(reviewId)).output,output);
  });
  await checkNative('field_null_missing_kind_and_exact_original_hash_are_not_interchangeable',async()=>{
   const meta=(await db.query("select field_hash from mip_arc_native.scalar_bindings where scope=$1 and id=$2",[s,bindings[0]])).rows[0];
   for(const kind of ['null','missing']){
    await assert.rejects(reviewer.query('select mip_arc_native.review_scalar($1,$2,$3,$4,$5,$6,$7,$8,$9)',
     [s,id(599),cap.article_id,cap.id,cap.job_id,cap.content_hash,'title',kind,meta.field_hash]),e=>e.message==='arc_native_field_binding');
   }
   await assert.rejects(reviewer.query('select mip_arc_native.review_scalar($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [s,id(599),cap.article_id,cap.id,cap.job_id,'0'.repeat(64),'title','string',meta.field_hash]),e=>e.message==='arc_native_capture_binding');
  });
  await checkNative('reviewed_whole_operation_limits_refuse_without_partial_generation',async()=>{
   const cases=[
    [0,128,8388608,134217728,'arc_native_cohort_changed'],
    [31,4,8388608,134217728,'arc_native_field_budget'],
    [31,128,1,134217728,'arc_native_byte_budget'],
    [31,128,8388608,1,'arc_native_hash_work_budget'],
   ];
   for(const [members,fields,bytes,hashBytes,code] of cases){
    await reviewer.query('begin');
    try{
     await reviewer.query('select mip_arc_native.review_selection_policy($1,$2,2,$3,0.7,true,$4,$5,$6,$7)',
      [s,id(600),selection,members,fields,bytes,hashBytes]);
     const args=[...cohortArgs];args[1]=id(601);args[9]=id(600);
     await assert.rejects(reviewer.query('select mip_arc_native.review_cohort($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',args),e=>e.message===code);
    }finally{await reviewer.query('rollback')}
   }
   assert.equal((await db.query('select count(*)::int n from mip_arc_native.generations where scope=$1',[s])).rows[0].n,1);
   assert.deepEqual((await current(reviewId)).output,output);
  });
  await checkNative('new_relevant_native_candidate_invalidates_without_copying_or_substitution',async()=>{
   await db.query('begin');
   try{
    await db.query('select mip_arc_native.context($1,false)',[s]);
    const cid=(await db.query('select evidence_pipeline.append_candidate($1::jsonb) id',[JSON.stringify({
     capture_id:cap.id,candidate_key:'native-arc-new-evidence',candidate_kind:'claim',
     statement:'UNSELECTED_NATIVE_SOURCE_SENTINEL',source_field:'title',span_start:0,span_end:2,excerpt:'Jo',
     extractor_version:'synthetic-native-arc-v2',predecessor_candidate_id:baseEvidenceCandidate,remaining_uncertainty:'synthetic not reviewed'
    })])).rows[0].id;
    const delta=(await db.query("select before_row,after_row,native_retention_version,operation,before_hash,after_hash from mip_identity.source_changes where row_key=$1 and relation_name='evidence_pipeline.evidence_candidates'",[cid])).rows[0];
    assert.equal(delta.before_row,null);assert.equal(delta.after_row,null);assert.equal(delta.native_retention_version,1);
    assert.equal(delta.operation,'INSERT');assert.equal(delta.before_hash,null);assert.match(delta.after_hash,/^[0-9a-f]{64}$/);
    await db.query('set session authorization "'+reviewerName+'"');
    await assert.rejects(db.query('select mip_arc_native.read_current_score($1,$2,$3,$4,$5)',
     [s,generation,receipt.input_hash,scored.output_hash,reviewId]),e=>e.message==='arc_native_native_revision_stale');
   }finally{await db.query('rollback');await db.query('reset session authorization')}
   assert.deepEqual((await current(reviewId)).output,output);
  });
  await checkNative('current_capture_order_refuses_old_review_and_never_substitutes_new_bytes',async()=>{
   for(const sameTime of [false,true]){
    await db.query('begin');
    try{
     await db.query('select mip_arc_native.context($1,false)',[s]);
     const job=(await db.query("select evidence_pipeline.enqueue('synthetic-current-order',$1::jsonb) id",
      [JSON.stringify({url:'https://synthetic.invalid/newest-'+sameTime,title:'new capture',outlet:'Synthetic',summary:null,body_text:null})])).rows[0].id;
     // Synthetic metadata-shape injection exercises the actual native immutable
     // INSERT and collector recorder. A pending/inaccessible newest capture is
     // intentionally not acceptable evidence and still must not be skipped.
     await db.query("insert into evidence_pipeline.article_captures(id,article_id,job_id,content_hash,payload,captured_at) select 'ffffffff-ffff-ffff-ffff-ffffffffffff',$1,$2,content_hash,payload,captured_at+case when $3 then interval '0 seconds' else interval '1 day' end from evidence_pipeline.article_captures where id=$4",
      [cap.article_id,job,sameTime,cap.id]);
     await db.query('set session authorization "'+reviewerName+'"');
     await db.query('savepoint current_capture_probe');
     await assert.rejects(db.query('select mip_arc_native.read_current_score($1,$2,$3,$4,$5)',
      [s,generation,receipt.input_hash,scored.output_hash,reviewId]),e=>e.message==='arc_native_capture_not_current');
     await db.query('rollback to savepoint current_capture_probe');
     await assert.rejects(db.query("select mip_arc_native.review_extraction($1,$2,$3,$4,$5,2,$6,'completed','reviewed_complete',$7)",
      [s,id(700),cap.article_id,cap.id,cap.content_hash,extractions[0],'0'.repeat(64)]),e=>e.message==='arc_native_capture_not_current');
    }finally{await db.query('rollback');await db.query('reset session authorization')}
    assert.deepEqual((await current(reviewId)).output,output);
   }
  });
  await checkNative('complete_membership_and_current_source_drift_refuse',async()=>{
   await db.query('update public.articles set arc_id=null where id=$1',[conflictCap.article_id]);
   await assert.rejects(current(reviewId),e=>e.message==='arc_native_cohort_changed');
   await db.query('update public.articles set arc_id=$1 where id=$2',[arc,conflictCap.article_id]);
   assert.deepEqual((await current(reviewId)).output,output);
   await db.query('begin');
   try{
    await db.query("alter table public.articles disable row level security");
    await assert.rejects(current(reviewId),e=>['55P03','57014'].includes(e.code));
   }finally{await db.query('rollback')}
   assert.deepEqual((await current(reviewId)).output,output);
  });
  await checkNative('direct_and_wrapped_access_has_no_table_or_owner_escape',async()=>{
   for(const client of [alice,reviewer,bob,guest,admin]){
    await assert.rejects(client.query('select output from mip_arc_native.private_scores'),e=>e.code==='42501');
    await assert.rejects(client.query('set role mip_arc_native_owner'),e=>e.code==='42501');
   }
   await assert.rejects(bob.query('select mip_arc_native.review_cohort($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',cohortArgs));
   await db.query("create function canonical_admission_fixture.arc(uuid,uuid,text,text,uuid) returns jsonb language sql security invoker set search_path='' as 'select mip_arc_native.read_current_score($1,$2,$3,$4,$5)';revoke all on function canonical_admission_fixture.arc(uuid,uuid,text,text,uuid) from public");
   for(const name of [aliceName,bobName,guestName])await db.query('grant execute on function canonical_admission_fixture.arc(uuid,uuid,text,text,uuid) to "'+name+'"');
   assert.deepEqual((await call(alice,'select canonical_admission_fixture.arc($1,$2,$3,$4,$5) result',[s,generation,receipt.input_hash,scored.output_hash,reviewId])).output,output);
   await assert.rejects(call(guest,'select canonical_admission_fixture.arc($1,$2,$3,$4,$5) result',[s,generation,receipt.input_hash,scored.output_hash,reviewId]));
   for(const role of ['anon','authenticated','service_role']){
    await db.query('set session authorization '+role);
    try{await assert.rejects(db.query('select output from mip_arc_native.private_scores'),e=>e.code==='42501')}
    finally{await db.query('reset session authorization')}
   }
  });
  await checkNative('successor_manifest_matches_installed_schema_and_retention_allowlists',async()=>{
   const manifest=JSON.parse(await read('verifier/qik-governed-c6-c9-successor.json'));
   for(const entry of [...manifest.c6.durable_tables,...manifest.c9.durable_tables]){
    const [schema,table]=entry.table.split('.');
    assert.deepEqual((await db.query('select column_name from information_schema.columns where table_schema=$1 and table_name=$2 order by ordinal_position',[schema,table])).rows.map(r=>r.column_name),entry.fields);
   }
   const payload=(await db.query("select payload->>'body_text' value from evidence_pipeline.article_captures where id=$1",[cap.id])).rows[0].value;
   assert.equal(payload,body);assert.ok(payload.includes(sentinel));
   for(const entry of manifest.c9.durable_tables){
    const [schema,table]=entry.table.split('.');
    assert.match(schema,/^[a-z_]+$/);assert.match(table,/^[a-z_]+$/);
    const serialized=(await db.query('select coalesce(jsonb_agg(to_jsonb(r)),\'[]\'::jsonb)::text value from '+ident(schema)+'.'+ident(table)+' r')).rows[0].value;
    assert.doesNotMatch(serialized,new RegExp(sentinel+'|UNSELECTED_NATIVE_SOURCE_SENTINEL'));
   }
   // Arc text is an intentional retained canonical context, not a native payload
   // copy. The native lexical/body sentinel must still never enter a manifest.
   assert.equal((await db.query("select manifest->'arc'->>'title' title from mip_arc_native.generations where scope=$1 and id=$2",[s,generation])).rows[0].title,title);
   const bound=(await db.query("select manifest->>'version' version,manifest->'membership_binding' binding from mip_arc_native.generations where scope=$1 and id=$2",[s,generation])).rows[0];
   assert.equal(bound.version,'arc-native-manifest-v2');
   assert.deepEqual(Object.keys(bound.binding).sort(),['public_member_ids','private_head_ids','private_arc_revision','private_set_digest'].sort());
   assert.deepEqual(bound.binding.public_member_ids,[conflictCap.article_id]);
   assert.deepEqual(bound.binding.private_head_ids,[]);
   assert.equal(bound.binding.private_arc_revision,0);
   assert.match(bound.binding.private_set_digest,/^[0-9a-f]{64}$/);

  });
  await checkNative('actual_worker_adapter_returns_only_private_receipt',async()=>{
   const r=await runGovernedNativeArc({connection:{connectionString:'postgresql://'+aliceName+':'+password+'@127.0.0.1:5432/'+database,ssl:false},
    scope:s,generation,expectedInputHash:receipt.input_hash});
   assert.deepEqual(r,scored);
  });
  await checkNative('source_change_wait_rechecks_and_preserves_immutable_history',async()=>{
   await db.query('begin');
   await db.query("update public.arc_membership_candidates set updated_at=updated_at+interval '1 microsecond' where id=$1",[arcCandidate]);
   const pid=(await alice.query('select pg_backend_pid() pid')).rows[0].pid;
   const pending=current(reviewId).then(()=>({ok:true}),e=>({ok:false,code:e?.message==='arc_native_candidate_stale'?'arc_native_candidate_stale':'operation_failed'}));
   let waiting=false;
   for(let i=0;i<40;i++){
    await monitor.query('select pg_stat_clear_snapshot()');
    const state=(await monitor.query('select wait_event_type from pg_stat_activity where pid=$1',[pid])).rows[0];
    if(state?.wait_event_type==='Lock'){waiting=true;break}
    await new Promise(resolve=>setTimeout(resolve,25));
   }
   assert.equal(waiting,true);await db.query('commit');
   assert.deepEqual(await pending,{ok:false,code:'arc_native_candidate_stale'});
   const history=(await db.query('select output from mip_arc_native.private_scores where scope=$1 and generation=$2',[s,generation])).rows[0].output;
   assert.deepEqual(history,output);
   const journal=(await db.query('select row_to_json(r) value from mip_arc_native.source_revisions r')).rows.map(r=>r.value);
   assert.ok(journal.length>0);assert.doesNotMatch(JSON.stringify(journal),new RegExp(sentinel+'|Jo spoke|Li replied'));
  });

  await checkNative('private_attachment_complete_union_two_successors_and_current_dependency_revalidation',async()=>{
   const contextNodeId=id(2020),contextMilestoneId=id(2021),privateFixtureSelection=id(2022);
   await db.query('insert into public.nodes(id,type) values($1,$2)',[contextNodeId,'institution']);
   await db.query('update public.story_arcs set root_node_id=$2 where id=$1',[arc,contextNodeId]);
   await db.query('insert into public.arc_milestones(id,arc_id,milestone_key,status) values($1,$2,$3,$4)',
    [contextMilestoneId,arc,'ia_concludes','pending']);
   // Supplemental projection work reserves space under the original whole
   // operation limits. This later SYNTHETIC profile does not reduce production
   // ceilings or change earlier 8MiB/128MiB whole-core qualification.
   await reviewer.query('select mip_arc_native.review_selection_policy($1,$2,2,$3,0.7,true,31,128,4194304,125829120)',
    [s,privateFixtureSelection,selection]);
   const buildReviewed=async({capture:original,candidateId,cohortId,generationId,reviewKey,memberIds,bindingIds,extractionIds})=>{
    const candidateRevision=(await db.query('select updated_at::text revision from public.arc_membership_candidates where id=$1',[candidateId])).rows[0].revision;
    await reviewer.query('select mip_arc_native.review_cohort($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
     [s,cohortId,candidateId,candidateRevision,original.article_id,arc,memberIds.sort(),bindingIds,extractionIds,privateFixtureSelection]);
    const snap=await call(alice,'select mip_arc_native.snapshot($1,$2,$3) result',[s,cohortId,generationId]);
    const wire=await call(alice,'select mip_arc_native.read_scoring_input($1,$2,$3) result',[s,generationId,snap.input_hash]);
    const scoredOutput=scoreGovernedNativeInput(wire);
    assert.equal(scoredOutput.score.decision,'candidate');
    const completed=await call(alice,'select mip_arc_native.complete_score($1,$2,$3,$4::jsonb) result',
     [s,generationId,snap.input_hash,JSON.stringify(scoredOutput)]);
    await reviewer.query("select mip_arc_native.review_score($1,$2,$3,$4,$5,1,null,'accepted_private','reviewed_continuity')",
     [s,reviewKey,generationId,snap.input_hash,completed.output_hash]);
    return {generation_id:generationId,input_hash:snap.input_hash,output_hash:completed.output_hash,review_id:reviewKey};
   };
   const first=await buildReviewed({capture:cap,candidateId:arcCandidate,cohortId:id(1000),generationId:id(1001),reviewKey:id(1002),
    memberIds:[conflictCap.article_id],bindingIds:bindings,extractionIds:extractions});
   const privateProjection=await assertNativeArcPrivateProjection({syntheticFixture:true,db,reviewer,
    gateway:alice,outsider:guest,worker:privateWorker,scope:s,first,sentinel,id,contextNodeId,contextMilestoneId});
   assert.equal(privateProjection.checks,5);
   assert.equal(privateProjection.publication_allowed,false);
   assert.equal(privateProjection.attachment_performed,false);
   await assertNativeArcAttachments({
    syntheticFixture:true,db,reviewer,sameReviewer,gateway:alice,outsider:guest,worker:privateWorker,
    scope:s,sentinel,ids:[id(1010),id(1011),id(1012),id(1013)],first,
    async makeNextReviewedInput({privateHeadIds}){
     assert.deepEqual(privateHeadIds,[id(1010)]);
     const nextText='Synthetic new private member '+sentinel;
     const next=await capture(nextText,'https://synthetic.invalid/private-next');
     // Reviewed zero entities still require an admitted, allowed native C6 field.
     // Scalar access does not confer that original-field authority.
     const nextField=id(1020);
     await db.query('set role mip_mentions_owner');
     try{
      await db.query('select mip_mentions.admit_native_field($1,$2,$3,$4,$5,$6,$7,$8,$9)',
       [s,nextField,next.id,next.job_id,next.article_id,next.content_hash,'body_text',sha(nextText),Buffer.byteLength(nextText)]);
     }finally{await db.query('reset role')}
     await access(nextField,true);
     const nextBindings=[];
     for(const [j,field]of ['title','summary','outlet','published_at'].entries()){
      const bid=id(1030+j);
      const meta=(await db.query("select case when not(payload?$2) then 'missing' when payload->$2='null'::jsonb then 'null' else jsonb_typeof(payload->$2) end kind,encode(sha256(convert_to(jsonb_build_object('present',payload?$2,'value',payload->$2)::text,'UTF8')),'hex') hash from evidence_pipeline.article_captures where id=$1",[next.id,field])).rows[0];
      await reviewer.query('select mip_arc_native.review_scalar($1,$2,$3,$4,$5,$6,$7,$8,$9)',
       [s,bid,next.article_id,next.id,next.job_id,next.content_hash,field,meta.kind,meta.hash]);
      await admin.query('select mip_arc_native.set_scalar_access($1,$2,true)',[s,bid]);nextBindings.push(bid);
     }
     const prepared=await call(alice,'select mip_arc_qik_source.prepare_governed_article($1,$2,$3) result',[s,next.article_id,next.id]);
     assert.equal(prepared.input_status,'no_admissions_not_extraction_complete');
     await reviewer.query("select mip_arc_native.review_extraction($1,$2,$3,$4,$5,1,null,'completed','reviewed_complete',$6)",
      [s,id(1040),next.article_id,next.id,next.content_hash,prepared.article_set_digest]);
     await db.query("insert into public.arc_membership_candidates(id,article_id,arc_id,state,updated_at) values($1,$2,$3,'pending','2026-01-02 00:00:00.123456+00')",[id(1041),next.article_id,arc]);
     return buildReviewed({capture:next,candidateId:id(1041),cohortId:id(1042),generationId:id(1043),reviewKey:id(1044),
      memberIds:[cap.article_id,conflictCap.article_id],bindingIds:[...bindings,...nextBindings],extractionIds:[...extractions,id(1040)]});
    },
    async withRevokedScalarAccess(body){
     await admin.query('select mip_arc_native.set_scalar_access($1,$2,false)',[s,bindings[0]]);
     try{await body()}finally{await admin.query('select mip_arc_native.set_scalar_access($1,$2,true)',[s,bindings[0]])}
    },
    async withIdentityMutation(body){
     const original=(await db.query('select canonical_name from public.entities where id=$1',[entity])).rows[0].canonical_name;
     await db.query('update public.entities set canonical_name=$2 where id=$1',[entity,'Changed synthetic canonical identity']);
     try{await body()}finally{await db.query('update public.entities set canonical_name=$2 where id=$1',[entity,original])}
    },
   });
  });



 }catch(error){
  if(!primaryFailed){
   primaryState=/^[0-9A-Z]{5}$/.test(error?.code??'')?error.code:'none';primaryFrames=frames(error);
   primaryPosition=/^[0-9]{1,8}$/.test(String(error?.internalPosition??error?.position??''))?String(error.internalPosition??error.position):'none';
   primaryStage=stage;
  }
  primaryFailed=true;
 }finally{
  const failures=[];
  const attempt=async(label,action)=>{try{await action()}catch{failures.push(label)}};
  for(const [name,c]of Object.entries({wrong,bob,guest,reviewer,sameReviewer,privateWorker,monitor,alice,admin}))if(c)await attempt('close_'+name,()=>c.end());
  if(db)await attempt('close_fixture',()=>db.end());
  if(armed){
   // Only a fully pristine cluster/database baseline arms destruction. Close
   // every owned connection first; refuse any unexpected role before cleanup.
   let clean;
   try{
    clean=new pg.Client({host:'127.0.0.1',port:5432,database:'template1',user:'postgres',password,
     connectionTimeoutMillis:5000,query_timeout:20000,statement_timeout:15000});
    await clean.connect();
    const created=(await clean.query('select rolname from pg_roles')).rows.map(r=>r.rolname).filter(n=>!baseline.includes(n));
    const allowed=new Set([...names,...RESERVED_ROLES,backendInstaller,backendAudit,'qik_ingest_fn_owner','qik_ingest_runtime','mip_tmp_'+'2'.repeat(32)]);
    if(!created.every(n=>allowed.has(n)))throw Error('native_arc_cleanup_role_boundary');
    await clean.query("select pg_terminate_backend(pid) from pg_stat_activity where datname='postgres' and pid<>pg_backend_pid()");
    await clean.query('drop database postgres');
    await clean.query('create database postgres owner postgres');
    for(const name of created)await clean.query('drop role '+ident(name));
    assert.deepEqual((await clean.query('select rolname from pg_roles order by rolname')).rows.map(r=>r.rolname),baseline);
   }catch{failures.push('owned_cluster_cleanup')}
   finally{if(clean)await attempt('close_cleanup',()=>clean.end())}
  }
  if(primaryFailed||failures.length){
   const diagnostics=[
    ...(primaryFailed?['native_arc_stage_'+primaryStage+'_sqlstate_'+primaryState+'_position_'+primaryPosition+'_frames_'+primaryFrames.join(',')]:[]),
    ...failures.map(code=>'native_arc_'+code),
   ];
   throw new AggregateError(diagnostics.map(code=>Error(code)),'native_arc_synthetic_qualification_failed:'+diagnostics.join('|'));
  }
 }
});

async function assertPristineFixture(db){
 const r=(await db.query(
  "select current_database() db,current_setting('server_version_num') v,session_user::text login,current_user::text effective,"+
  "(select jsonb_agg(jsonb_build_object('name',rolname,'super',rolsuper,'inherit',rolinherit,'createrole',rolcreaterole,'createdb',rolcreatedb,'login',rolcanlogin,'replication',rolreplication,'bypass',rolbypassrls,'limit',rolconnlimit,'until',rolvaliduntil,'config',rolconfig) order by rolname) from pg_roles) roles,"+
  "(select jsonb_agg(datname order by datname) from pg_database) databases,"+
  "(select jsonb_agg(nspname order by nspname) from pg_namespace) schemas,"+
  "(select jsonb_agg(jsonb_build_object('name',e.extname,'version',e.extversion,'schema',n.nspname,'owner',pg_get_userbyid(e.extowner)) order by e.extname) from pg_extension e join pg_namespace n on n.oid=e.extnamespace) extensions,"+
  "(select count(*)::integer from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public') public_relations,"+
  "(select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') public_functions,"+
  "(select count(*)::integer from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public') public_types,"+
  "(select count(*)::integer from pg_largeobject_metadata) large_objects,"+
  "(select count(*)::integer from pg_foreign_server)+(select count(*)::integer from pg_event_trigger)+(select count(*)::integer from pg_default_acl)+(select count(*)::integer from pg_publication)+(select count(*)::integer from pg_subscription) extras"
 )).rows[0]
 const names=['postgres','pg_database_owner','pg_read_all_data','pg_write_all_data','pg_monitor',
  'pg_read_all_settings','pg_read_all_stats','pg_stat_scan_tables','pg_read_server_files',
  'pg_write_server_files','pg_execute_server_program','pg_signal_backend','pg_checkpoint',
  'pg_use_reserved_connections','pg_create_subscription','pg_maintain'].sort()
 const goodRole=role=>{
  const admin=role.name==='postgres'
  return role.super===admin&&role.inherit===true&&role.createrole===admin
   &&role.createdb===admin&&role.login===admin&&role.replication===admin
   &&role.bypass===admin&&role.limit===-1&&role.until===null&&role.config===null
 }
 if(!r||r.db!=='postgres'||r.v!=='170006'||r.login!=='postgres'||r.effective!=='postgres'
  ||JSON.stringify(r.databases)!==JSON.stringify(['postgres','template0','template1'])
  ||JSON.stringify(r.schemas)!==JSON.stringify(['information_schema','pg_catalog','pg_toast','public'])
  ||r.extensions?.length!==1||r.extensions[0].name!=='plpgsql'||r.extensions[0].version!=='1.0'||r.extensions[0].schema!=='pg_catalog'||r.extensions[0].owner!=='postgres'
  ||r.public_relations!==0||r.public_functions!==0||r.public_types!==0||r.large_objects!==0||r.extras!==0
  ||JSON.stringify(r.roles?.map(x=>x.name))!==JSON.stringify(names)||!r.roles.every(goodRole))
  throw Error('atomic_fixture_not_pristine')
 const edges=(await db.query("select p.rolname parent,m.rolname member,a.admin_option admin,a.inherit_option inherit,a.set_option set from pg_auth_members a join pg_roles p on p.oid=a.roleid join pg_roles m on m.oid=a.member order by p.rolname,m.rolname")).rows
 assert.deepEqual(edges,['pg_read_all_settings','pg_read_all_stats','pg_stat_scan_tables'].map(parent=>({parent,member:'pg_monitor',admin:false,inherit:true,set:true})))
}

const ident=s=>'"'+s.replaceAll('"','""')+'"';
const backendInstaller='native_arc_backend_installer',backendAudit='native_arc_backend_audit';
async function installFullBackend(root){
 let owner;
 try{
  await root.query("create role "+backendInstaller+" login superuser password '"+password+"'");
  await root.query('alter database postgres owner to '+ident(backendInstaller));
  owner=await connect(backendInstaller);
  await owner.query('create schema extensions;create extension pgcrypto with schema extensions;create extension vector with schema public;create extension dblink with schema extensions');
  assert.equal((await owner.query("select extversion from pg_extension where extname='vector'")).rows[0].extversion,'0.8.2');
  // Dataset-only profile for the full accepted-reader case. Keep every original
  // substrate schema/role/ACL/constraint and the same sole custody sentinel.
  // Author its INITIAL synthetic eligibility before history/install; later
  // native pending-review cases keep their exact original state. Other fixtures
  // still use the unchanged original substrate with its pending sentinel.
  const substrate=await read('supabase/qualification/qik-ingest/fixture_substrate.sql');
  const originalSeed="insert into public.articles (feed, outlet, title, url, reader_state)\nvalues (\n  'preexisting',\n  'fixture',\n  'Preexisting qik row',\n  'https://news.example/preexisting',\n  'pending_review'\n);";
  const eligibleSeed="insert into public.articles (feed, outlet, title, url, reader_state)\nvalues (\n  'preexisting',\n  'fixture',\n  'Preexisting qik row',\n  'https://news.example/preexisting',\n  'eligible'\n);";
  assert.equal(substrate.split(originalSeed).length,2,'exact original synthetic sentinel seed');
  await owner.query(substrate.replace(originalSeed,()=>eligibleSeed));
  await owner.query('create schema auth');
  for(const relation of REQUIRED_RELATIONS.filter(r=>['public','auth'].includes(r.schema_name))){
   const exists=(await owner.query('select to_regclass($1) name',[relation.qualified])).rows[0].name;
   if(!exists){
    const columns=Object.entries(relation.requiredColumns);
    await owner.query('create table '+relation.qualified+' ('+(columns.length
     ?columns.map(([n,t])=>ident(n)+' '+t+(n==='id'?' primary key':'')).join(',')
     :'id uuid primary key,payload jsonb')+')');
   }else{
    const cols=new Set((await owner.query("select attname from pg_attribute where attrelid=$1::regclass and attnum>0 and not attisdropped",[relation.qualified])).rows.map(x=>x.attname));
    for(const[n,t]of Object.entries(relation.requiredColumns))if(!cols.has(n))await owner.query('alter table '+relation.qualified+' add column '+ident(n)+' '+t);
   }
  }
  // Synthetic full Auth substrate for the new caller expiry check; actual hosted Auth stays unchanged.
  await owner.query('alter table auth.sessions add column if not exists not_after timestamptz');
  await owner.query(await read('supabase/migrations/20260905082406_evidence_pipeline_reliability.sql'));
  for(const file of LOAD_ORDER){
   await owner.query(await read('supabase/qualification/qik-ingest/'+file));
   if(file!=='05_operation_ledger.sql')await owner.query('select qik_ingest_operation.capture_step($1)',[file]);
  }
  await owner.query('create table qik_ingest_operation.persistent_install_receipt(id boolean primary key,operation_id text,installer name,sql_manifest_sha256 text,runtime_login name,runtime_token_hash text,runtime_creator_grantor name,installed_at timestamptz default now())');
  await owner.query('insert into qik_ingest_operation.persistent_install_receipt(id,operation_id,installer,sql_manifest_sha256) values(true,$1,$2,$3)',['3'.repeat(32),backendInstaller,'1'.repeat(64)]);
  await owner.query("create role "+backendAudit+" login nosuperuser nocreatedb nocreaterole noinherit nobypassrls noreplication password '"+password+"'");
  await owner.query('grant qik_ingest_fn_owner to '+ident(backendInstaller)+' with admin false,inherit true,set true');
  await root.query('alter function public.mip_pipeline_v1(text,jsonb) owner to postgres');
  await root.query('alter role '+ident(backendInstaller)+' nosuperuser createrole createdb bypassrls');
  await root.query("alter database postgres set session_preload_libraries='auto_explain'");
  await root.query("alter database postgres set auto_explain.log_min_duration='10000'");
  await root.query("alter database postgres set auto_explain.log_nested_statements='off'");
  await owner.end();owner=null;
  const plan=await prepareAtomicInstall(read);
  const pre=await connect(backendInstaller);
  let metadata;
  try{metadata=(await pre.query(DBLINK_PREFLIGHT_SQL)).rows[0];assert.equal(metadata.expected,true);assert.equal(metadata.unused,true);assert.equal(metadata.no_servers,true)}
  finally{await pre.end()}
  const url=name=>'postgresql://'+name+':'+password+'@127.0.0.1:5432/postgres';
  const cfg={authorization:'owner-authorized-disabled-comparison-install',operationId:'2'.repeat(32),
   expectedLogin:backendInstaller,connectionString:url(backendInstaller),c3OperationId:'3'.repeat(32),c3ManifestSha256:'1'.repeat(64),
   expectedManifestSha256:plan.manifest_sha256,dblinkMetadataSha256:metadata.metadata_sha256,collectorSource:'qik-fixture-v1',
   auditLogin:backendAudit,auditConnectionString:url(backendAudit),disposable:true};
  const installed=await installComparisonAtomic(cfg,read);
  assert.equal(installed.state,'installed_disabled_audit_pending');
  const audited=await qualifyComparisonAudit(cfg);
  assert.equal(audited.state,'installed_disabled_audit_qualified');
  assert.equal(audited.activation_allowed,false);
  assert.equal((await root.query('select count(*)::int n from mip_identity.efta_scope')).rows[0].n,0);
  assert.equal((await root.query('select count(*)::int n from mip_identity.doj_policy_versions')).rows[0].n,0);
 }finally{if(owner)await owner.end()}
}
