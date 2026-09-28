// Source-authored synthetic qualification; run only in a pristine dedicated PG17.6 DB.
// Parent owns the runner, database creation/destruction and qualification evidence.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import pg from 'pg'
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8')
const database='mip_canonical_admission_test',password='mip-efta-disposable-ci-only'
const aliceName='canonical_admission_alice',adminName='canonical_admission_admin'
const bobName='canonical_admission_bob',guestName='canonical_admission_guest',reviewerName='canonical_admission_reviewer'
const names=['mip_arc_qik_source_owner','mip_canonical_writer','anon','authenticated','service_role','mip_mentions_owner','mip_mentions_gateway',
 'mip_mentions_admin','mip_mentions_native_validator',aliceName,adminName,bobName,guestName,reviewerName]
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

const diagnosticStages=new Set(['CONNECT','GUARD','INSTALL_FIXTURE','INSTALL_NATIVE','INSTALL_MENTIONS',
 'INSTALL_NATIVE_FIELDS','INSTALL_REVIEW','INSTALL_QIK','INSTALL_CANONICAL','INSTALL_WRITER',
 'PRESERVATION','SETUP_IDENTITIES','SETUP_EVIDENCE','CHECK_1','CHECK_2','CHECK_3','CHECK_4',
 'CHECK_5','CHECK_6','CHECK_7','CHECK_8','CLEANUP','UNKNOWN'])
// Copy no error message, detail, parameters, causes or assertion values. Only
// validated SQLSTATE and this synthetic source's numeric locations survive.
function diagnostic(error,stage){
 const safeStage=diagnosticStages.has(stage)?stage:'UNKNOWN'
 const code=typeof error?.code==='string'&&/^[A-Z0-9]{5}$/.test(error.code)?error.code:'NONE'
 const frames=typeof error?.stack==='string'?error.stack.split('\n').slice(1).flatMap(line=>{
  const match=line.match(/(?:^|[/\\])tests[/\\]nativeCanonicalAdmissionPostgres17\.test\.mjs:(\d+):(\d+)\)?$/)
  return match?['    at tests/nativeCanonicalAdmissionPostgres17.test.mjs:'+match[1]+':'+match[2]]:[]
 }).slice(0,12):[]
 const numericPosition=value=>typeof value==='string'&&/^[0-9]{1,10}$/.test(value)?value:'NONE'
 const installerLabels=new Set(['canonical_entity_shape','canonical_owner_boundary','canonical_table_boundary',
  'canonical_function_boundary','canonical_capture_size_boundary','canonical_entity_privilege_boundary'])
 const label=safeStage==='INSTALL_CANONICAL'&&installerLabels.has(error?.message)?error.message:'NONE'
 const result=Error('native_canonical_admission_failed stage='+safeStage+' sqlstate='+code+' boundary='+label+
  ' position='+numericPosition(error?.position)+' internal_position='+numericPosition(error?.internalPosition))
 result.stack=result.name+': '+result.message+(frames.length?'\n'+frames.join('\n'):'')
 return result
}

async function connect(user='postgres',pass=password){
 const c=new pg.Client({host:'127.0.0.1',port:5432,database,user,password:pass,
  connectionTimeoutMillis:5000,statement_timeout:15000,query_timeout:20000})
 try{await c.connect();return c}catch(error){
  try{await c.end()}catch{throw Error('canonical_admission_connection_cleanup_failed')}
  throw error
 }
}
test('governed canonical admission and actual qik projection writer', {
 skip:process.env.MIP_NATIVE_CANONICAL_ADMISSION_DISPOSABLE!=='synthetic-pg17-only',timeout:180000
},async t=>{
 let db,monitor,alice,admin,bob,guest,reviewer,wrong,armed=false,primaryFailure=null,stage='CONNECT',checkIndex=0
 const check=(name,body)=>{
  const checkStage='CHECK_'+(++checkIndex)
  return t.test(name,async()=>{
   try{await body()}catch(error){throw diagnostic(error,checkStage)}
  })
 }
 try{
  db=await connect();monitor=await connect()
  stage='GUARD'
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
  for(const [installStage,path] of [
   ['INSTALL_FIXTURE','tests/changeQueueFixture.sql'],
   ['INSTALL_NATIVE','supabase/migrations/20260905082406_evidence_pipeline_reliability.sql'],
   ['INSTALL_MENTIONS','supabase/qualification/entity-resolution/001_mentions.sql'],
   ['INSTALL_NATIVE_FIELDS','supabase/qualification/entity-resolution/native-capture-fields/003_native_fields.sql']]){
   stage=installStage;await db.query(await read(path))
  }
  stage='PRESERVATION'
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
  stage='INSTALL_REVIEW'
  await db.query(await read('supabase/qualification/entity-resolution/candidate-review/004_candidate_review.sql'))
  stage='PRESERVATION'
  assert.deepEqual(await catalog(),prior,'existing role, membership, ACL, RLS, policy and function boundaries preserved')
  stage='INSTALL_FIXTURE'
  await db.query(`create table public.entities(id uuid primary key,canonical_name text,normalized_name text,type text,aliases text[],mention_count integer default 0,last_seen timestamptz);
   create table public.story_arcs(id uuid primary key,started_at date not null);
   create table public.arc_membership_candidates(id uuid primary key,article_id uuid,arc_id uuid,state text,updated_at timestamptz);
   alter table public.articles enable row level security;alter table public.entities enable row level security;
   alter table public.story_arcs enable row level security;alter table public.pipeline_config enable row level security;
   alter table public.arc_membership_candidates enable row level security;`)
  const priorNativeRights=(await db.query("select c.oid,c.relacl::text,has_table_privilege('service_role',c.oid,'SELECT') service_select,has_table_privilege('service_role',c.oid,'INSERT') service_insert,has_table_privilege('service_role',c.oid,'UPDATE') service_update from pg_class c where c.relnamespace='evidence_pipeline'::regnamespace and c.relkind='r' order by c.oid")).rows
  const priorFunctions=(await db.query("select oid,proowner,proacl::text,proconfig,md5(prosrc) source from pg_proc where pronamespace='mip_mentions'::regnamespace order by oid")).rows
  for(const [installStage,path] of [
   ['INSTALL_QIK','supabase/qualification/arc-membership-qik-source/001_storage.sql'],
   ['INSTALL_CANONICAL','supabase/qualification/entity-resolution/canonical-admission/005_canonical_admission.sql'],
   ['INSTALL_WRITER','supabase/qualification/arc-membership-qik-source/002_governed_writer.sql']]){
   stage=installStage;await db.query(await read(path))
  }
  stage='PRESERVATION'

  assert.deepEqual((await db.query("select c.oid,c.relacl::text,has_table_privilege('service_role',c.oid,'SELECT') service_select,has_table_privilege('service_role',c.oid,'INSERT') service_insert,has_table_privilege('service_role',c.oid,'UPDATE') service_update from pg_class c where c.relnamespace='evidence_pipeline'::regnamespace and c.relkind='r' order by c.oid")).rows,priorNativeRights)
  assert.deepEqual((await db.query("select oid,proowner,proacl::text,proconfig,md5(prosrc) source from pg_proc where oid=any($1::oid[]) order by oid",[priorFunctions.map(x=>x.oid)])).rows,priorFunctions)
  // Fixture-only invoker wrapper demonstrates that wrapping cannot replace the
  // underlying gateway privilege or real session_user membership requirement.
  stage='SETUP_IDENTITIES'
  await db.query("create schema canonical_admission_fixture;create function canonical_admission_fixture.proposal(uuid,uuid,integer) returns jsonb language sql security invoker set search_path='' as 'select mip_mentions.read_candidate_proposal($1,$2,$3)';revoke all on function canonical_admission_fixture.proposal(uuid,uuid,integer) from public")
  for(const name of [aliceName,adminName,bobName,guestName,reviewerName])
   await db.query('create role "'+name+'" login password \''+password+'\'')
  for(const name of [aliceName,bobName,reviewerName])await db.query('grant mip_mentions_gateway to "'+name+'"')
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
  stage='SETUP_EVIDENCE'
  await db.query('insert into mip_mentions.members values($1,session_user,true),($1,$2,false),($1,$3,true)',[s,aliceName,reviewerName])
  await reviewer.query('select mip_mentions.admit_actor_locator($1,$2)',[s,actor])
  await db.query('insert into mip_mentions.actors values($1,$2,$3)',[s,actor2,'Historical synthetic label'])
  async function capture(text,url){
   const payload={url,title,outlet:'Synthetic',summary,body_text:text}
   const job=(await db.query("select evidence_pipeline.enqueue('synthetic-candidate-review',$1::jsonb) id",[JSON.stringify(payload)])).rows[0].id
   const claimed=(await db.query('select evidence_pipeline.claim_job() result')).rows[0].result
   assert.equal(claimed.id,job)
   const result=(await db.query('select evidence_pipeline.finish_job($1,$2) result',[job,claimed.lease_token])).rows[0].result
   return (await db.query('select id,job_id,article_id,content_hash from evidence_pipeline.article_captures where id=$1',[result.capture_id])).rows[0]
  }
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
  const current=(client=alice,pid=projection)=>call(client,'select mip_arc_qik_source.read_governed_relation($1,$2,$3,$4) result',[s,cap.article_id,entity,pid])
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
  const identityDigest=async e=>(await db.query("select encode(sha256(convert_to(jsonb_build_object('id',id,'canonical_name',canonical_name,'normalized_name',normalized_name,'type',type,'aliases',aliases)::text,'UTF8')),'hex') digest from public.entities where id=$1",[e])).rows[0].digest
  const digest=await identityDigest(entity)
  await db.query("create function canonical_admission_fixture.project(uuid,uuid,uuid,uuid) returns jsonb language sql security invoker set search_path='' as 'select mip_arc_qik_source.read_governed_relation($1,$2,$3,$4)';revoke all on function canonical_admission_fixture.project(uuid,uuid,uuid,uuid) from public")
  for(const name of [aliceName,reviewerName,bobName,guestName,adminName])
   await db.query('grant execute on function canonical_admission_fixture.project(uuid,uuid,uuid,uuid) to "'+name+'"')
  await check('reviewer actor locator admits UUID only and preserves historical labels',async()=>{
   await deny(alice.query('select mip_mentions.admit_actor_locator($1,$2)',[s,id(95)]))
   const first=await call(reviewer,'select mip_mentions.admit_actor_locator($1,$2) result',[s,actor])
   assert.deepEqual(await call(reviewer,'select mip_mentions.admit_actor_locator($1,$2) result',[s,actor]),first)
   clean(first);assert.equal(first.identity_accepted,false);assert.equal(first.locator_only,true)
   assert.equal((await db.query('select label from mip_mentions.actors where scope=$1 and id=$2',[s,actor])).rows[0].label,actor)
   await reviewer.query('select mip_mentions.admit_actor_locator($1,$2)',[s,actor2])
   assert.equal((await db.query('select label from mip_mentions.actors where scope=$1 and id=$2',[s,actor2])).rows[0].label,'Historical synthetic label')
  })
  await check('explicit mapping/policy/current decision precede finite supplied evidence weight',async()=>{
   const args=[s,mapping,actor,entity,1,null,'active',digest,'identity_reviewed']
   await deny(alice.query(mappingSQL,args))
   await deny(reviewer.query(mappingSQL,[...args.slice(0,7),'0'.repeat(64),'identity_reviewed']),/mismatch/)
   await deny(reviewer.query(mappingSQL,[...args.slice(0,8),sentinel]),/invalid/)
   const mapped=await call(reviewer,mappingSQL,args);clean(mapped)
   assert.deepEqual(await call(reviewer,mappingSQL,args),mapped)
   await deny(reviewer.query(mappingSQL,[s,mapping,actor,entity2,1,null,'active',digest,'identity_reviewed']),/conflict/)
   const pargs=[s,policy,policyKey,1,null,'active','weight_policy_reviewed']
   await deny(alice.query(policySQL,pargs))
   const pr=await call(reviewer,policySQL,pargs);clean(pr)
   assert.deepEqual(await call(reviewer,policySQL,pargs),pr)
   await reviewer.query("select mip_mentions.decide($1,$2,$3,1,null,'accepted',$4,'synthetic reviewed context')",[s,decision,mentions[0],candidate])
   const second=[...proposalArgs];second[1]=id(104);second[2]=mentions[1];second[7]=[mentions[1]];second[8]=[]
   await alice.query(putSQL,second)
   await reviewer.query("select mip_mentions.decide($1,$2,$3,1,null,'accepted',$4,'synthetic reviewed context')",[s,id(105),mentions[1],id(104)])
   const args1=admissionArgs(admission1,mentions[0],decision,0.4)
   await deny(alice.query(admissionSQL,args1))
   for(const weight of [null,'NaN','Infinity','-Infinity',-0.1,1.01])
    await deny(reviewer.query(admissionSQL,admissionArgs(id(119),mentions[0],decision,weight)),/invalid/)
   await deny(reviewer.query(admissionSQL,admissionArgs(id(119),mentions[0],id(999),0.4)))
   const receipt=await call(reviewer,admissionSQL,args1);clean(receipt)
   assert.deepEqual(await call(reviewer,admissionSQL,args1),receipt)
   await reviewer.query(admissionSQL,admissionArgs(admission2,mentions[1],id(105),0.7))
   assert.equal((await db.query('select count(*)::int n from mip_mentions.canonical_admissions')).rows[0].n,2)
   assert.equal((await db.query('select count(*)::int n from public.article_entities')).rows[0].n,0)
  })
  await check('complete sorted max reduction writes owned relation and exact retry; unowned collisions refuse',async()=>{
   const receipt=await prep();assert.deepEqual(Object.keys(receipt).sort(),prepareKeys);clean(receipt)
   assert.equal(receipt.projection_status,'admitted_not_projected');assert.equal(receipt.expected_predecessor,null)
   assert.deepEqual(receipt.admission_ids,[admission1,admission2]);assert.equal(receipt.evidence_weight,0.7)
   const ar=await articlePrep();assert.deepEqual(Object.keys(ar).sort(),articleKeys);clean(ar)
   assert.equal(ar.groups.length,1);assert.equal(ar.groups[0].projection_status,'admitted_not_projected')
   assert.deepEqual(Object.keys(ar.groups[0]).sort(),[...groupKeys,'projection_status','expected_predecessor','current_projection_id'].sort())
   await deny(articlePrep(alice,conflictCap.id),/capture_mismatch/)
   await deny(project({...receipt,admission_ids:[admission1]},projection),/set_mismatch/)
   // Synthetic pre-existing unowned relation, visible only to this privileged
   // transaction. ALWAYS fence is temporarily disabled then restored before
   // the real gateway write; rollback removes all injected fixture state.
   await db.query('begin')
   try{
    await db.query('alter table public.article_entities disable trigger qik_entity_authority')
    await db.query("insert into public.article_entities(article_id,entity_id,confidence,extraction_method) values($1,$2,0.2,'synthetic unowned')",[cap.article_id,entity])
    await db.query('alter table public.article_entities enable always trigger qik_entity_authority')
    await db.query('set session authorization "'+aliceName+'"')
    await deny(project(receipt,projection,db),/collision|duplicate/)
   }finally{await db.query('rollback');await db.query('reset session authorization')}
   assert.equal((await db.query('select count(*)::int n from mip_arc_qik_source.governed_ownership')).rows[0].n,0)
   const result=await project(receipt,projection);checkProjected(result)
   assert.deepEqual(await project(receipt,projection),result)
   assert.deepEqual(await current(),result)
   await deny(project({...receipt,expected_predecessor:projection},id(129)),/unchanged_set/)
   const physical=(await db.query('select confidence::text weight,extraction_method,role from public.article_entities')).rows[0]
   assert.deepEqual(physical,{weight:'0.7',extraction_method:'reviewed_evidence_weight_v1',role:null})
   assert.equal((await articlePrep()).groups[0].current_projection_id,projection)
   assert.deepEqual(await call(alice,'select canonical_admission_fixture.project($1,$2,$3,$4) result',[s,cap.article_id,entity,projection]),result)
  })
  await check('membership, direct/private APIs, native access and identity hashes fail closed',async()=>{
   for(const client of [bob,guest,admin]){
    await deny(current(client))
    await deny(client.query('select canonical_admission_fixture.project($1,$2,$3,$4)',[s,cap.article_id,entity,projection]))
   }
   for(const sql of ['select * from public.article_entities','select * from mip_mentions.canonical_admissions',
    'select * from mip_arc_qik_source.governed_projections','set role mip_canonical_writer',
    'select mip_mentions.canonical_group($1,$2,$3)','select mip_mentions.resolve_native_field($1,$2,262144)'])
    await deny(alice.query(sql,sql.includes('canonical_group')?[s,cap.article_id,entity]:sql.includes('resolve_native_field')?[s,fields[0]]:[]),/permission/)
   await access(fields[3],false)
   try{await deny(current(),/source unavailable/)}finally{await access(fields[3],true)}
   await admin.query('select mip_mentions.set_membership($1,$2,null)',[s,aliceName])
   try{await deny(current(),/scope access denied/)}finally{await admin.query('select mip_mentions.set_membership($1,$2,false)',[s,aliceName])}
   async function identityFault(sql,args,shouldPass=false){
    await db.query('begin')
    try{
     await db.query(sql,args);await db.query('set session authorization "'+aliceName+'"')
     if(shouldPass)checkProjected(await current(db));else await deny(current(db),/mapping_unavailable/)
    }finally{await db.query('rollback');await db.query('reset session authorization')}
   }
   await identityFault('update public.entities set canonical_name=$2 where id=$1',[entity,'Changed identity'])
   await identityFault('update public.entities set aliases=array[aliases[2],aliases[1]] where id=$1',[entity])
   await identityFault('update public.entities set aliases=null where id=$1',[entity])
   await identityFault('update public.entities set mention_count=mention_count+1,last_seen=clock_timestamp() where id=$1',[entity],true)
   for(const mutation of [
    ()=>reviewer.query(mappingSQL,[s,id(130),actor,entity,2,mapping,'revoked',digest,'identity_revoked']),
    ()=>reviewer.query(policySQL,[s,id(131),policyKey,2,policy,'revoked','weight_policy_revoked']),
   ]){
    await reviewer.query('begin')
    try{await mutation();await deny(current(reviewer),/unavailable/)}
    finally{await reviewer.query('rollback')}
   }
   checkProjected(await current())
   await reviewer.query('begin')
   try{
    await reviewer.query(policySQL,[s,id(151),id(150),1,null,'active','weight_policy_reviewed'])
    const mixed=admissionArgs(id(152),mentions[0],decision,0.4,2,admission1)
    mixed[8]=id(151)
    await reviewer.query(admissionSQL,mixed)
    await deny(current(reviewer),/mixed_policy_or_mapping/)
   }finally{await reviewer.query('rollback')}
   for(const [sql,args] of [
    ["update evidence_pipeline.article_captures set payload=jsonb_set(payload,'{body_text}',to_jsonb('tampered'::text)) where id=$1",[cap.id]],
    ['delete from evidence_pipeline.article_captures where id=$1',[cap.id]],
    ['update evidence_pipeline.import_jobs set article_id=$2 where id=$1',[cap.job_id,conflictCap.article_id]],
   ]){
    await db.query('begin')
    try{
     await db.query('set local session_replication_role=replica')
     await db.query(sql,args);await db.query('set session authorization "'+aliceName+'"')
     await deny(current(db),/unavailable/)
    }finally{await db.query('rollback');await db.query('reset session authorization')}
   }
   await db.query("insert into mip_mentions.fields(scope,id,source_version,field_version,field_hash,raw) values($1,$2,'historical','historical',$3,convert_to('Old Sam','UTF8'))",[s,id(171),sha('Old Sam')])
   await access(id(171),true)
   await alice.query("select mip_mentions.put_mention($1,$2,$3,'historical','historical',$4,'unicode_code_point',4,7,'Sam',null,null)",[s,id(170),id(171),sha('Old Sam')])
   await alice.query(putSQL,[s,id(172),id(170),actor,1,null,1,[id(170)],[],'synthetic historical'])
   await reviewer.query("select mip_mentions.decide($1,$2,$3,1,null,'accepted',$4,'synthetic historical review')",[s,id(173),id(170),id(172)])
   await deny(reviewer.query(admissionSQL,admissionArgs(id(174),id(170),id(173),0.5)),/native_evidence_required/)
  })
  await check('new head invalidates old reduction; stale decision needs explicit admission revocation',async()=>{
   const before=await articlePrep()
   const third=[...proposalArgs];third[1]=id(106);third[2]=mentions[2];third[7]=[mentions[2]];third[8]=[]
   await alice.query(putSQL,third)
   await reviewer.query("select mip_mentions.decide($1,$2,$3,1,null,'accepted',$4,'synthetic review')",[s,id(107),mentions[2],id(106)])
   await reviewer.query(admissionSQL,admissionArgs(admission3,mentions[2],id(107),0.1))
   await deny(current(),/stale/)
   const expanded=await articlePrep()
   assert.notEqual(expanded.article_set_digest,before.article_set_digest)
   assert.equal(expanded.groups[0].projection_status,'admitted_not_projected')
   const oldProjection=projection,receipt=await prep()
   projection=id(121);projectionVersion=2;checkProjected(await project(receipt,projection))
   await deny(current(alice,oldProjection),/stale/)
   await reviewer.query("select mip_mentions.decide($1,$2,$3,2,$4,'rejected',null,'synthetic reconsideration')",[s,id(108),mentions[2],id(107)])
   await deny(current(),/unavailable/)
   await deny(reviewer.query(admissionSQL,admissionArgs(admission3,mentions[2],id(107),0.1)),/unavailable/)
   await reviewer.query(admissionSQL,admissionArgs(id(113),mentions[2],id(107),0.1,2,admission3,'revoked'))
   const after=await articlePrep()
   assert.ok(after.head_revision_ids.includes(id(113)))
   assert.deepEqual(after.groups[0].admission_ids,[admission1,admission2])
   assert.notEqual(after.article_set_digest,before.article_set_digest,'revoked logical head remains digest-bound')
   const reduced=await prep();projection=id(122);projectionVersion=3
   checkProjected(await project(reduced,projection))
  })
  await check('real policy lock serializes entity mutation and mapping revocation against readers',async()=>{
   async function blocked(client,pending,settled){
    let wait=false
    for(let i=0;i<100;i++){
     wait=(await monitor.query("select wait_event_type='Lock' b from pg_stat_activity where pid=$1",[client.processID])).rows[0]?.b
     if(wait)break
     assert.equal(settled(),false);await new Promise(r=>setTimeout(r,10))
    }
    assert.equal(wait,true);assert.equal(settled(),false)
   }
   await alice.query('begin');await current()
   await db.query('begin')
   let done=false,pending=db.query('update public.entities set canonical_name=canonical_name where id=$1',[entity]).then(r=>{done=true;return r},e=>{done=true;throw e})
   pending.catch(()=>{})
   try{await blocked(db,pending,()=>done);await alice.query('commit');await pending}
   finally{await alice.query('rollback');await pending.catch(()=>{});await db.query('rollback')}
   // Writer first: committed revocation wins before a waiting current read.
   await reviewer.query('begin')
   await reviewer.query(mappingSQL,[s,id(132),actor,entity,2,mapping,'revoked',digest,'identity_revoked'])
   done=false;pending=current().then(r=>{done=true;return {result:r}},e=>{done=true;return {error:e}})
   try{
    await blocked(alice,pending,()=>done);await reviewer.query('commit')
    assert.match((await pending).error?.message??'',/mapping_unavailable/)
   }finally{await reviewer.query('rollback');await pending}
   // Explicit reviewed successors repair eligibility; no old row is rewritten.
   mappingHead=id(133)
   await reviewer.query(mappingSQL,[s,mappingHead,actor,entity,3,id(132),'active',digest,'identity_replaced'])
   await deny(current(),/mapping_unavailable/)
   await reviewer.query(admissionSQL,admissionArgs(id(114),mentions[0],decision,0.4,2,admission1))
   await reviewer.query(admissionSQL,admissionArgs(id(115),mentions[1],id(105),0.7,2,admission2))
   const receipt=await prep();projection=id(123);projectionVersion=4
   checkProjected(await project(receipt,projection))
  })
  await check('complete cohort prelock enforces combined bounds and empty is not extraction-complete',async()=>{
   // Owner-context invocation exercises the actual private helper without
   // granting its execution to a browser or caller role.
   await db.query('set role mip_mentions_owner')
   let budget
   try{budget=await call(db,'select mip_mentions.canonical_prelock_articles($1,$2::uuid[],$3::uuid[]) result',[s,[cap.article_id],[cap.id]])}
   finally{await db.query('reset role')}
   assert.deepEqual(Object.keys(budget).sort(),['context_count','field_count','selected_field_bytes','span_bytes','native_capture_bytes_unique','native_capture_hash_bytes','source_and_span_bytes','largest_field_bytes','policy_version','max_context','max_fields','max_field_bytes','max_total_bytes'].sort())
   assert.ok(budget.source_and_span_bytes>0);assert.ok(budget.field_count>=3)
   assert.equal(budget.source_and_span_bytes,budget.selected_field_bytes+budget.span_bytes)
   assert.ok(budget.native_capture_hash_bytes>=budget.native_capture_bytes_unique)
   assert.ok(budget.native_capture_bytes_unique>0)
   await deny(alice.query('select mip_mentions.canonical_prelock_articles($1,$2,$3)',[s,[cap.article_id],[cap.id]]),/permission/)
   const empty=await call(alice,'select mip_arc_qik_source.prepare_governed_article($1,$2,$3) result',[s,conflictCap.article_id,conflictCap.id])
   assert.equal(empty.input_status,'no_admissions_not_extraction_complete');assert.deepEqual(empty.groups,[])
   clean(empty)
   await db.query('begin')
   try{
    await db.query('set local role mip_mentions_owner')
    await deny(db.query('select mip_mentions.canonical_prelock_articles($1,$2,$3)',[s,Array(33).fill(cap.article_id),Array(33).fill(cap.id)]),/invalid/)
   }finally{await db.query('rollback')}
  })
  await check('final role ACL RLS trigger boundary and retained metadata allowlists',async()=>{
   const role=(await db.query("select rolcanlogin,rolinherit,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls from pg_roles where rolname='mip_canonical_writer'")).rows[0]
   for(const value of Object.values(role))assert.equal(value,false)
   assert.equal((await db.query("select count(*)::int n from pg_auth_members where roleid='mip_canonical_writer'::regrole or member='mip_canonical_writer'::regrole or roleid='mip_mentions_owner'::regrole or member='mip_mentions_owner'::regrole")).rows[0].n,0)
   assert.equal((await db.query("select bool_and(relrowsecurity and relforcerowsecurity) ok from pg_class where (relnamespace='mip_mentions'::regnamespace and relname like 'canonical_%' and relkind='r') or (relnamespace='mip_arc_qik_source'::regnamespace and relname like 'governed_%' and relkind='r') or oid='public.article_entities'::regclass")).rows[0].ok,true)
   for(const name of ['anon','authenticated','service_role',aliceName,bobName,guestName,adminName]){
    assert.equal((await db.query("select has_table_privilege($1,'public.article_entities','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') ok",[name])).rows[0].ok,false)
    assert.equal((await db.query("select has_function_privilege($1,'mip_mentions.canonical_group(uuid,uuid,uuid)','EXECUTE') ok",[name])).rows[0].ok,false)
   }
   const triggers=(await db.query("select tgname,tgtype,tgenabled,tgfoid::regprocedure::text function from pg_trigger where tgrelid='public.entities'::regclass and tgname like 'canonical_entity_%' order by tgname")).rows
   assert.equal(triggers.length,2)
   assert.ok(triggers.every(x=>x.tgenabled==='A'&&(x.tgtype&1)===0&&x.function==='mip_mentions.canonical_entity_mutation()'))
   assert.equal((await db.query("select tgfoid::regprocedure::text f from pg_trigger where tgrelid='public.arc_membership_release_policy'::regclass and tgname='qik_arc_release_authority'")).rows[0].f,'mip_arc_qik_source.reject_unqualified_write()')
   await deny(db.query("insert into public.arc_membership_release_policy(model_version) values('synthetic-denied')"),/unqualified/)
   const retained=(await db.query("select jsonb_agg(to_jsonb(a)) rows from mip_mentions.canonical_admissions a")).rows[0].rows
   assert.doesNotMatch(JSON.stringify(retained),new RegExp(sentinel+'|Sam spoke|Ann objected|Historical synthetic label'))
   const allowed=['scope','id','mention_id','version','predecessor_id','state','decision_id','mapping_revision','policy_revision','evidence_weight',
    'article_id','entity_id','field_id','capture_id','job_id','content_hash','field_hash','source_version','field_version','start_pos','end_pos','span_hash','reason','principal'].sort()
   for(const row of retained){assert.deepEqual(Object.keys(row).sort(),allowed);for(const v of Object.values(row))assert.ok(v===null||typeof v!=='object')}
   const bound=retained.find(x=>x.id===admission1)
   assert.deepEqual([bound.article_id,bound.capture_id,bound.job_id,bound.content_hash,bound.field_id,bound.field_hash,bound.start_pos,bound.end_pos,bound.span_hash],
    [cap.article_id,cap.id,cap.job_id,cap.content_hash,fields[0],sha(body),3,6,sha('Sam')])
   assert.equal((await db.query("select has_any_column_privilege('mip_canonical_writer','public.entities','SELECT,INSERT,UPDATE') ok")).rows[0].ok,false)
   const result=await current();checkProjected(result);assert.equal(result.version,projectionVersion)
   const ar=await articlePrep();clean(ar);assert.deepEqual(Object.keys(ar).sort(),articleKeys)
   for(const g of ar.groups)assert.deepEqual(Object.keys(g).sort(),[...groupKeys,'projection_status','expected_predecessor','current_projection_id'].sort())
  })
 }catch(error){
  primaryFailure=diagnostic(error,stage)
 }finally{
  // One cleanup failure must not prevent later owned resources or clients from
  // receiving their cleanup attempt. Diagnostics retain only whitelisted metadata.
  const cleanupFailures=[]
  const attempt=async action=>{try{await action()}catch(error){cleanupFailures.push(diagnostic(error,'CLEANUP'))}}
  for(const client of [wrong,bob,guest,reviewer,monitor])if(client)await attempt(()=>client.end())
  if(alice)await attempt(()=>alice.end())
  if(admin)await attempt(()=>admin.end())
  if(armed&&db){
   await attempt(()=>db.query('rollback'))
   await attempt(()=>db.query('reset session authorization'))
   await attempt(()=>db.query('reset role'))
   for(const schema of ['canonical_admission_fixture','mip_arc_qik_source','mip_mentions','evidence_pipeline','spatial'])
    await attempt(()=>db.query('drop schema if exists "'+schema+'" cascade'))
   await attempt(()=>db.query('drop function if exists public.mip_pipeline_v1(text,jsonb)'))
   for(const table of ['article_entities','arc_membership_release_policy','arc_membership_candidates','story_arcs','entities','articles','nodes','geographic_places','pipeline_config'])
    await attempt(()=>db.query('drop table if exists public."'+table+'" cascade'))
   // Every listed name was absent at the pre-mutation guard, and includes all
   // roles created by the native substrate, 001, 003 and this dedicated fixture.
   for(const role of names){
    let exists=false
    await attempt(async()=>{exists=(await db.query('select exists(select 1 from pg_roles where rolname=$1) ok',[role])).rows[0].ok})
    if(exists){
     await attempt(()=>db.query('drop owned by "'+role+'"'))
     await attempt(()=>db.query('drop role "'+role+'"'))
    }
   }
  }
  if(db)await attempt(()=>db.end())
  if(primaryFailure||cleanupFailures.length){
   const failures=[...(primaryFailure?[primaryFailure]:[]),...cleanupFailures]
   // Node TAP may omit AggregateError.errors. Render only diagnostics already
   // constructed above; bounded entries/frames preserve no underlying payload.
   const rendered=failures.slice(0,12).map(failure=>
    failure.stack.split('\n').slice(0,5).join('\n').slice(0,1024)).join('\n')
   throw new AggregateError(failures,
    ('native_canonical_admission_fixture_failed\n'+rendered).slice(0,12288))
  }
 }
})
