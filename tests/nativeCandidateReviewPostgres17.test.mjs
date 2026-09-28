// Source-authored synthetic qualification; run only in a pristine dedicated PG17.6 DB.
// Parent owns the runner, database creation/destruction and qualification evidence.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import pg from 'pg'
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8')
const database='mip_candidate_review_test',password='mip-efta-disposable-ci-only'
const aliceName='candidate_review_alice',adminName='candidate_review_admin'
const bobName='candidate_review_bob',guestName='candidate_review_guest',reviewerName='candidate_review_reviewer'
const names=['anon','authenticated','service_role','mip_mentions_owner','mip_mentions_gateway',
 'mip_mentions_admin','mip_mentions_native_validator',aliceName,adminName,bobName,guestName,reviewerName]
const id=n=>'c6400000-0000-4000-8000-'+String(n).padStart(12,'0')
const s=id(1),otherScope=id(2),actor=id(3),actor2=id(4),candidate=id(5),decision=id(6)
const fields=[id(10),id(11),id(12),id(13)],mentions=[id(20),id(21),id(22),id(23)]
const sentinel='PRIVATE_CANDIDATE_REVIEW_SENTINEL_c644'
const body='A😀 Sam spoke. '+sentinel,summary='Li replied.',title='Jo spoke.'
const sha=x=>createHash('sha256').update(x).digest('hex')
const readSQL='select mip_mentions.read_candidate_proposal($1,$2,$3) result'
const wrapperSQL='select candidate_review_fixture.proposal($1,$2,$3) result'
const putSQL='select mip_mentions.put_candidate($1,$2,$3,$4,$5,$6,$7,$8::uuid[],$9::uuid[],$10) result'
const proposalArgs=[s,candidate,mentions[0],actor,1,null,2,[mentions[2],mentions[1]],[mentions[3]],'synthetic exact proposal']
const deny=async(promise,pattern=/unavailable|denied|permission|conflict|budget/)=>assert.rejects(promise,e=>pattern.test(e.message))
async function connect(user='postgres',pass=password){
 const c=new pg.Client({host:'127.0.0.1',port:5432,database,user,password:pass,
  connectionTimeoutMillis:5000,statement_timeout:15000,query_timeout:20000})
 try{await c.connect();return c}catch(error){
  try{await c.end()}catch{throw Error('candidate_review_connection_cleanup_failed')}
  throw error
 }
}
const envelopeKeys=['scope','candidate_id','mention_id','actor_id','version','predecessor_id','rank','method',
 'supporting_mentions','conflicting_mentions','policy_version','proposal_only','identity_accepted',
 'production_qualified','source_authority_qualified','transport_qualified','publication_allowed'].sort()
function assertEnvelope(value,args,manifestFields){
 assert.deepEqual(Object.keys(value).sort(),[...manifestFields].sort())
 assert.deepEqual(Object.keys(value).sort(),envelopeKeys)
 assert.deepEqual([value.scope,value.candidate_id,value.mention_id,value.actor_id,value.version,
  value.predecessor_id,value.rank,value.supporting_mentions,value.conflicting_mentions,value.method],args)
 assert.equal(value.policy_version,1);assert.equal(value.proposal_only,true)
 for(const key of ['identity_accepted','production_qualified','source_authority_qualified','transport_qualified','publication_allowed'])assert.equal(value[key],false)
 // Only the two ordered UUID arrays may be nested; no arbitrary JSON payload,
 // source bytes, literal, actor label, private ordinal or decision may escape.
 for(const [key,item] of Object.entries(value)){
  if(['supporting_mentions','conflicting_mentions'].includes(key)){
   assert.ok(Array.isArray(item));for(const ref of item)assert.match(ref,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  }else assert.ok(item===null||['string','number','boolean'].includes(typeof item))
 }
 assert.doesNotMatch(JSON.stringify(value),new RegExp(sentinel+'|body_text|native_capture|span_hash|field_hash'))
}
test('exact candidate review metadata through actual native evidence and gateway', {
 skip:process.env.MIP_NATIVE_CANDIDATE_REVIEW_DISPOSABLE!=='synthetic-pg17-only',timeout:120000
},async t=>{
 let db,alice,admin,bob,guest,reviewer,wrong,manifestStage,armed=false,primaryFailed=false
 const checkEnvelope=(value,args)=>assertEnvelope(value,args,manifestStage.retained_fields)
 const check=(name,body)=>t.test(name,async()=>{
  try{await body()}catch{throw Error('native_candidate_review_check_failed')}
 })
 try{
  const manifest=JSON.parse(await read('verifier/qik-c6-c9-caller-source-successor.json'))
  manifestStage=manifest.stages[0]
  assert.equal(manifestStage.stage,'candidate_proposal_review')
  db=await connect()
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
  for(const path of ['tests/changeQueueFixture.sql',
   'supabase/migrations/20260905082406_evidence_pipeline_reliability.sql',
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
  // Fixture-only invoker wrapper demonstrates that wrapping cannot replace the
  // underlying gateway privilege or real session_user membership requirement.
  await db.query("create schema candidate_review_fixture;create function candidate_review_fixture.proposal(uuid,uuid,integer) returns jsonb language sql security invoker set search_path='' as 'select mip_mentions.read_candidate_proposal($1,$2,$3)';revoke all on function candidate_review_fixture.proposal(uuid,uuid,integer) from public")
  for(const name of [aliceName,adminName,bobName,guestName,reviewerName])
   await db.query('create role "'+name+'" login password \''+password+'\'')
  for(const name of [aliceName,bobName,reviewerName])await db.query('grant mip_mentions_gateway to "'+name+'"')
  await db.query('grant mip_mentions_admin to "'+adminName+'"')
  for(const name of [aliceName,adminName,bobName,guestName,reviewerName]){
   await db.query('grant usage on schema candidate_review_fixture to "'+name+'"')
   await db.query('grant execute on function candidate_review_fixture.proposal(uuid,uuid,integer) to "'+name+'"')
  }
  assert.equal((await db.query("select bool_and(rolpassword like 'SCRAM-SHA-256$%') ok from pg_authid where rolname=any($1)",[[aliceName,adminName,bobName,guestName,reviewerName]])).rows[0].ok,true)
  alice=await connect(aliceName);admin=await connect(adminName);bob=await connect(bobName)
  guest=await connect(guestName);reviewer=await connect(reviewerName)
  for(const [client,name] of [[alice,aliceName],[admin,adminName],[bob,bobName],[guest,guestName],[reviewer,reviewerName]])
   assert.deepEqual((await client.query('select session_user::text principal,current_user::text effective')).rows[0],{principal:name,effective:name})
  await assert.rejects(async()=>{wrong=await connect(aliceName,'deliberately-wrong-synthetic-password')},e=>e.code==='28P01')
  await db.query('insert into mip_mentions.members values($1,session_user,true),($1,$2,false),($1,$3,true)',[s,aliceName,reviewerName])
  await db.query('insert into mip_mentions.actors values($1,$2,$4),($1,$3,$4)',[s,actor,actor2,'Nonunique synthetic label'])
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
  await check('exact complete proposal is metadata-only and reconstructs unchanged candidate retry',async()=>{
   const result=await readProposal();checkEnvelope(result,proposalArgs)
   checkEnvelope(await readProposal(alice,[s,candidate,1],wrapperSQL),proposalArgs)
   const retry=[result.scope,result.candidate_id,result.mention_id,result.actor_id,result.version,result.predecessor_id,
    result.rank,result.supporting_mentions,result.conflicting_mentions,result.method]
   await alice.query(putSQL,retry)
   assert.deepEqual(await readProposal(),result)
   const wrongOrder=[...retry];wrongOrder[7]=[...wrongOrder[7]].reverse()
   await deny(alice.query(putSQL,wrongOrder),/retry conflict/)
   assert.equal((await db.query('select count(*)::int n from mip_mentions.candidates')).rows[0].n,1)
   assert.equal((await db.query('select count(*)::int n from mip_mentions.decisions')).rows[0].n,0)
   assert.ok((await db.query('select raw is null ok from mip_mentions.fields')).rows.every(x=>x.ok))
   for(const args of [[s,candidate,2],[s,id(999),1],[otherScope,candidate,1],[s,null,1],[s,candidate,null],[s,candidate,0]])
    await deny(readProposal(alice,args))
  })
  await check('gateway and invoker wrapper require actual membership and cannot expose internals',async()=>{
   for(const client of [bob,guest,admin])for(const sql of [readSQL,wrapperSQL])await deny(readProposal(client,[s,candidate,1],sql))
   for(const sql of ['select * from mip_mentions.candidates','select * from mip_mentions.fields',
    'select * from evidence_pipeline.article_captures','select mip_mentions.resolve_native_field($1,$2,262144)',
    'set role mip_mentions_owner']){
    await deny(alice.query(sql,sql.includes('$1')?[s,fields[0]]:[]),/permission denied/)
   }
   await deny(alice.query('select mip_mentions.decide($1,$2,$3,1,null,\'accepted\',$4,\'synthetic review\')',[s,decision,mentions[0],candidate]),/scope access denied/)
   await admin.query('select mip_mentions.set_membership($1,$2,null)',[s,aliceName])
   for(const sql of [readSQL,wrapperSQL])await deny(readProposal(alice,[s,candidate,1],sql),/scope access denied/)
   await admin.query('select mip_mentions.set_membership($1,$2,false)',[s,aliceName])
   checkEnvelope(await readProposal(),proposalArgs)
  })
  await check('each originally bound target/support/conflict field remains necessary',async()=>{
   for(const field of fields){
    await access(field,false)
    try{for(const sql of [readSQL,wrapperSQL])await deny(readProposal(alice,[s,candidate,1],sql),/source unavailable/)}
    finally{await access(field,true)}
   }
   const newer=await capture(body+' Changed later.','https://synthetic.invalid/review')
   assert.equal(newer.article_id,cap.article_id);assert.notEqual(newer.id,cap.id)
   checkEnvelope(await readProposal(),proposalArgs)
   // Privileged corruption injection is isolated to one transaction and rolled
   // back. Calls inside it still use the real alice session_user and forced RLS.
   // These are adversarial fixtures, NOT authorized operational admin mutations.
   async function fault(sql,args,pattern=/unavailable/){
    await db.query('begin')
    try{
     await db.query('set local session_replication_role=replica')
     await db.query(sql,args)
     await db.query('set session authorization "'+aliceName+'"')
     await deny(db.query(readSQL,[s,candidate,1]),pattern)
    }finally{await db.query('rollback');await db.query('reset session authorization')}
    checkEnvelope(await readProposal(),proposalArgs)
   }
   await fault('update evidence_pipeline.article_captures set payload=jsonb_set(payload,\'{body_text}\',to_jsonb(\'tampered\'::text)) where id=$1',[cap.id])
   await fault("update evidence_pipeline.import_jobs set input_hash=$2 where id=$1",[cap.job_id,'0'.repeat(64)])
   await fault("update evidence_pipeline.import_jobs set state='pending' where id=$1",[cap.job_id])
   await fault('delete from evidence_pipeline.article_captures where id=$1',[cap.id])
   await fault('update evidence_pipeline.import_jobs set article_id=$2 where id=$1',[cap.job_id,id(998)])
   await fault('delete from mip_mentions.mentions where scope=$1 and id=$2',[s,mentions[3]])
   await fault("update mip_mentions.mentions set field_hash=$2 where scope=$1 and id=$3",[s,'0'.repeat(64),mentions[1]])
   await fault("update mip_mentions.mentions set source_version='stale' where scope=$1 and id=$2",[s,mentions[2]])
   await fault('delete from mip_mentions.actors where scope=$1 and id=$2',[s,actor])
  })
  await check('proposal reading never substitutes for exact current accepted reader',async()=>{
   await reviewer.query('select mip_mentions.decide($1,$2,$3,1,null,\'accepted\',$4,\'synthetic reviewer judgment\')',[s,decision,mentions[0],candidate])
   const resolved=()=>alice.query('select mip_mentions.resolved_actor($1,$2,$3) result',[s,mentions[0],decision])
   assert.equal((await resolved()).rows[0].result.actor_id,actor)
   checkEnvelope(await readProposal(),proposalArgs)
   const alternative=[...proposalArgs];alternative[1]=id(40);alternative[3]=actor2
   await alice.query(putSQL,alternative)
   // Another actor hypothesis changes the decision ceiling, but does not
   // supersede this actor's candidate. Reading it still makes no acceptance claim.
   checkEnvelope(await readProposal(),proposalArgs)
   await deny(resolved(),/stale attribution unavailable/)
  })
  await check('current proposal serializes with successor and refuses superseded versions',async()=>{
   const next=[...proposalArgs];next[1]=id(41);next[4]=2;next[5]=candidate
   await alice.query('begin')
   let pending
   try{
    checkEnvelope(await readProposal(),proposalArgs)
    let settled=false
    pending=reviewer.query(putSQL,next).then(r=>{settled=true;return r},e=>{settled=true;throw e})
    // Attach rejection handling immediately while retaining the failure result.
    pending.catch(()=>{})
    let blocked=false
    for(let i=0;i<100;i++){
     blocked=(await db.query("select wait_event_type='Lock' blocked from pg_stat_activity where pid=$1",[reviewer.processID])).rows[0]?.blocked
     if(blocked)break
     assert.equal(settled,false);await new Promise(r=>setTimeout(r,10))
    }
    assert.equal(blocked,true,'actual PostgreSQL Lock wait required')
    assert.equal(settled,false);await alice.query('commit');await pending
   }finally{await alice.query('rollback');await pending?.catch(()=>{})}
   for(const sql of [readSQL,wrapperSQL])await deny(readProposal(alice,[s,candidate,1],sql),/current candidate proposal unavailable/)
   checkEnvelope(await readProposal(alice,[s,id(41),2]),next)
   // The existing candidate write can acknowledge an old exact retry; the new
   // reader still refuses to present that superseded proposal as current.
   await alice.query(putSQL,proposalArgs)
   await deny(readProposal(),/current candidate proposal unavailable/)
   // Reverse order: the reader waits for an uncommitted successor and must
   // observe that committed successor after acquiring the mention lock.
   const third=[...next];third[1]=id(42);third[4]=3;third[5]=id(41)
   await reviewer.query('begin');await reviewer.query(putSQL,third)
   let waiting
   try{
    let settled=false
    waiting=readProposal(alice,[s,id(41),2]).then(r=>{settled=true;return {result:r}},e=>{settled=true;return {error:e}})
    let blocked=false
    for(let i=0;i<100;i++){
     blocked=(await db.query("select wait_event_type='Lock' blocked from pg_stat_activity where pid=$1",[alice.processID])).rows[0]?.blocked
     if(blocked)break
     assert.equal(settled,false);await new Promise(r=>setTimeout(r,10))
    }
    assert.equal(blocked,true);assert.equal(settled,false)
    await reviewer.query('commit')
    assert.match((await waiting).error?.message??'',/current candidate proposal unavailable/)
   }finally{await reviewer.query('rollback');await waiting}
   checkEnvelope(await readProposal(alice,[s,id(42),3]),third)
   const padded=[...third];padded[1]=id(43);padded[4]=4;padded[5]=id(42);padded[9]=' '.repeat(257)+'x'
   await alice.query(putSQL,padded)
   await deny(readProposal(alice,[s,id(43),4]),/metadata budget exceeded/)
  })
  await check('assertion-only drift checks refuse altered boundaries and roll back each change',async()=>{
   const source=await read('supabase/qualification/entity-resolution/candidate-review/004_candidate_review.sql')
   const start=source.indexOf('do $boundary$'),end=source.indexOf('end $boundary$;',start)
   assert.ok(start>=0&&end>start)
   const boundary=source.slice(start,end+'end $boundary$;'.length)
   const before=await catalog()
   const newACL=async()=>(await db.query("select proacl::text acl from pg_proc where oid='mip_mentions.read_candidate_proposal(uuid,uuid,integer)'::regprocedure")).rows
   const beforeACL=await newACL()
   const drifts=[
    'alter role mip_mentions_owner noinherit',
    'alter role mip_mentions_gateway noinherit',
    'alter role mip_mentions_admin noinherit',
    'alter role mip_mentions_native_validator inherit',
    'grant create on schema mip_mentions to mip_mentions_gateway',
    'grant create on schema mip_mentions to mip_mentions_admin',
    'revoke usage on schema mip_mentions from mip_mentions_gateway',
    'alter schema mip_mentions owner to postgres',
    'grant anon to mip_mentions_owner',
    'grant anon to mip_mentions_gateway',
    'grant anon to mip_mentions_admin',
    'grant anon to mip_mentions_native_validator',
    'grant mip_mentions_owner to '+guestName,
    'grant execute on function mip_mentions.read_candidate_proposal(uuid,uuid,integer) to service_role',
    'grant mip_mentions_gateway to authenticated',
    'grant execute on function mip_mentions.resolve_native_field(uuid,uuid,integer) to mip_mentions_gateway',
    'grant execute on function mip_mentions.native_binding_bytes(uuid,uuid,uuid,uuid,text,text,text,integer,integer) to mip_mentions_admin',
    'alter table mip_mentions.candidates no force row level security',
   ]
   for(const drift of drifts){
    await db.query('begin')
    try{
     await db.query(drift)
     // Execute assertions ONLY: reinstalling grants would conceal drift.
     await assert.rejects(db.query(boundary),e=>/candidate review .* boundary failed/.test(e.message))
    }finally{await db.query('rollback')}
    assert.deepEqual(await catalog(),before)
    assert.deepEqual(await newACL(),beforeACL)
    await db.query(boundary)
   }
  })
  await check('final ordered owner, role, membership, ACL and forced-RLS boundary',async()=>{
   const signature='mip_mentions.read_candidate_proposal(uuid,uuid,integer)'
   const fn=(await db.query("select pg_get_userbyid(proowner) owner,prosecdef,provolatile,proconfig from pg_proc where oid=$1::regprocedure",[signature])).rows[0]
   assert.deepEqual(fn,{owner:'mip_mentions_owner',prosecdef:true,provolatile:'v',proconfig:['search_path=""']})
   const roleRows=(await db.query("select rolname,rolinherit,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls from pg_roles where rolname in ('mip_mentions_owner','mip_mentions_gateway','mip_mentions_admin','mip_mentions_native_validator') order by rolname")).rows
   assert.equal(roleRows.length,4)
   for(const r of roleRows){
    assert.equal(r.rolinherit,r.rolname!=='mip_mentions_native_validator')
    for(const k of Object.keys(r).filter(k=>!['rolname','rolinherit'].includes(k)))assert.equal(r[k],false)
   }
   for(const name of [aliceName,bobName,reviewerName,adminName,guestName]){
    assert.equal((await db.query("select pg_has_role($1,'mip_mentions_owner','MEMBER') owner,pg_has_role($1,'mip_mentions_native_validator','MEMBER') validator",[name])).rows[0].owner,false)
    assert.equal((await db.query("select pg_has_role($1,'mip_mentions_native_validator','MEMBER') validator",[name])).rows[0].validator,false)
   }
   const edges=(await db.query("select r.rolname role,u.rolname member,m.admin_option,m.inherit_option,m.set_option from pg_auth_members m join pg_roles r on r.oid=m.roleid join pg_roles u on u.oid=m.member where u.rolname=any($1) order by u.rolname,r.rolname",[[aliceName,adminName,bobName,guestName,reviewerName]])).rows
   const expectedEdges=[[adminName,'mip_mentions_admin'],[aliceName,'mip_mentions_gateway'],[bobName,'mip_mentions_gateway'],[reviewerName,'mip_mentions_gateway']]
    .map(([member,role])=>({role,member,admin_option:false,inherit_option:true,set_option:true}))
   assert.deepEqual(edges,expectedEdges)
   const acl=(await db.query("select case when a.grantee=0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end grantee,a.privilege_type,a.is_grantable from pg_proc p cross join lateral aclexplode(p.proacl) a where p.oid=$1::regprocedure order by grantee",[signature])).rows
   assert.deepEqual(acl,[{grantee:'mip_mentions_gateway',privilege_type:'EXECUTE',is_grantable:false},{grantee:'mip_mentions_owner',privilege_type:'EXECUTE',is_grantable:false}])
   for(const [name,allowed] of [[aliceName,true],[bobName,true],[reviewerName,true],[adminName,false],[guestName,false],['anon',false],['authenticated',false],['service_role',false]]){
    assert.equal((await db.query('select has_function_privilege($1,$2,\'EXECUTE\') ok',[name,signature])).rows[0].ok,allowed)
    assert.equal((await db.query("select has_function_privilege($1,'mip_mentions.resolve_native_field(uuid,uuid,integer)','EXECUTE') ok",[name])).rows[0].ok,false)
   }
   const tables=(await db.query("select relname,pg_get_userbyid(relowner) owner,relrowsecurity,relforcerowsecurity,has_table_privilege('mip_mentions_gateway',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') gateway from pg_class where relnamespace='mip_mentions'::regnamespace and relkind='r' order by relname")).rows
   assert.equal(tables.length,10)
   for(const row of tables){assert.equal(row.owner,'mip_mentions_owner');assert.equal(row.relrowsecurity,true);assert.equal(row.relforcerowsecurity,true);assert.equal(row.gateway,false)}
   assert.equal((await db.query("select count(*)::int n from pg_auth_members where roleid='mip_mentions_native_validator'::regrole or member='mip_mentions_native_validator'::regrole")).rows[0].n,0)
  })
 }catch{
  primaryFailed=true
 }finally{
  // One cleanup failure must not prevent later owned resources or clients from
  // receiving their cleanup attempt. Report only a static final diagnostic.
  let cleanupFailed=false
  const attempt=async action=>{try{await action()}catch{cleanupFailed=true}}
  for(const client of [wrong,bob,guest,reviewer])if(client)await attempt(()=>client.end())
  if(alice)await attempt(()=>alice.end())
  if(admin)await attempt(()=>admin.end())
  if(armed&&db){
   await attempt(()=>db.query('rollback'))
   await attempt(()=>db.query('reset session authorization'))
   await attempt(()=>db.query('reset role'))
   for(const schema of ['candidate_review_fixture','mip_mentions','evidence_pipeline','spatial'])
    await attempt(()=>db.query('drop schema if exists "'+schema+'" cascade'))
   await attempt(()=>db.query('drop function if exists public.mip_pipeline_v1(text,jsonb)'))
   for(const table of ['articles','nodes','geographic_places','pipeline_config'])
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
  if(primaryFailed||cleanupFailed)throw new AggregateError([
   ...(primaryFailed?[Error('native_candidate_review_primary_failed')]:[]),
   ...(cleanupFailed?[Error('native_candidate_review_cleanup_failed')]:[]),
  ],'native_candidate_review_fixture_failed')
 }
})
