// Actual PostgreSQL 17.6 only; no live SQL. Parent owns the disposable runner.
// This test installs the actual native reliability SQL, unchanged 001/002,
// then the metadata-only successor. No PGlite substitution for transaction races.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import pg from 'pg'
const root=new URL('../',import.meta.url)
const read=p=>readFile(new URL(p,root),'utf8')
const id=n=>'c6000000-0000-4000-8000-'+String(n).padStart(12,'0')
const hash=s=>createHash('sha256').update(s).digest('hex')
const s=id(1),f=id(2),m=id(3),actor=id(4),cand=id(5),decision=id(6),legacy=id(7),other=id(8)
const body='A😀 Sam spoke. NATIVE_PRIVATE_SENTINEL_e827 👩‍🔬 e\u0301.'
const fh=hash(body),byteLength=Buffer.byteLength(body)
const password='mip-efta-disposable-ci-only'
const names=['anon','authenticated','service_role','mip_mentions_owner','mip_mentions_gateway','mip_mentions_admin',
 'mip_mentions_native_validator','native_field_alice','native_field_admin']
async function connect(){
 const db=new pg.Client({host:'127.0.0.1',port:5432,user:'postgres',database:'postgres',password,
  connectionTimeoutMillis:5000,statement_timeout:15000,query_timeout:20000})
 await db.connect();return db
}
const admitSQL='select mip_mentions.admit_native_field($1,$2,$3,$4,$5,$6,$7,$8,$9) result'
const putSQL='select mip_mentions.put_mention($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,null,null) result'
const readSQL='select mip_mentions.read_mention($1,$2) result'
const pageSQL='select mip_mentions.candidate_page($1,$2,20) result'
const actorSQL='select mip_mentions.resolved_actor($1,$2,$3) result'
const deny=async(db,sql,args,pattern=/unavailable|denied|conflict|permission|immutable|duplicate|integrity|budget/)=>{
 await assert.rejects(db.query(sql,args),error=>pattern.test(error.message))
}
test('native field metadata admission, actual consumers and PG17 revocation races',{
 skip:process.env.MIP_NATIVE_MENTION_DISPOSABLE!=='synthetic-pg17-only',timeout:120000
},async t=>{
 const db=await connect();let alice,admin,armed=false
 try {
  assert.equal((await db.query("select current_setting('server_version_num') v")).rows[0].v,'170006')
  assert.equal((await db.query("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'")).rows[0].n,0,'dedicated empty fixture required')
  assert.equal((await db.query("select count(*)::int n from pg_namespace where nspname not like 'pg_%' and nspname not in ('public','information_schema')")).rows[0].n,0)
  assert.equal((await db.query("select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'")).rows[0].n,0)
  assert.equal((await db.query('select count(*)::int n from pg_roles where rolname=any($1)',[names])).rows[0].n,0)
  assert.equal((await db.query("select bool_and(error is null and (type='local' or (type='host' and auth_method='scram-sha-256'))) ok from pg_hba_file_rules")).rows[0].ok,true)
  armed=true
  await db.query(await read('tests/changeQueueFixture.sql'))
  await db.query(await read('supabase/migrations/20260905082406_evidence_pipeline_reliability.sql'))
  await db.query(await read('supabase/qualification/entity-resolution/001_mentions.sql'))
  await db.query(await read('supabase/qualification/entity-resolution/002_agency.sql'))
  await db.query("create role native_field_alice login;create role native_field_admin login;grant mip_mentions_gateway to native_field_alice;grant mip_mentions_admin to native_field_admin")
  await db.query("insert into mip_mentions.members values($1,session_user,true),($1,'native_field_alice',true)",[s])
  await db.query("insert into mip_mentions.fields values($1,$2,'historical-sv','historical-fv',$3,convert_to('legacy Sam','UTF8'))",[s,legacy,hash('legacy Sam')])
  const historical=(await db.query('select to_jsonb(f) row from mip_mentions.fields f where id=$1',[legacy])).rows[0].row
  const nativeRights=async()=> (await db.query("select c.relname,has_table_privilege('service_role',c.oid,'SELECT') s,has_table_privilege('service_role',c.oid,'INSERT') i,has_table_privilege('service_role',c.oid,'UPDATE') u from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='evidence_pipeline' and c.relkind='r' order by c.relname")).rows
  const beforeRights=await nativeRights()
  await db.query(await read('supabase/qualification/entity-resolution/native-capture-fields/003_native_fields.sql'))
  assert.deepEqual(await nativeRights(),beforeRights)
  const afterHistorical=(await db.query("select to_jsonb(f)-array['native_capture_id','native_job_id','native_article_id','native_content_hash','native_source_field','native_byte_length'] row from mip_mentions.fields f where id=$1",[legacy])).rows[0].row
  assert.deepEqual(afterHistorical,historical)
  alice=await connect();await alice.query('set session authorization native_field_alice')
  admin=await connect();await admin.query('set session authorization native_field_admin')
  async function nativeCapture(text=body){
   const payload={url:'https://synthetic.invalid/native-mentions',title:'Synthetic native mention',outlet:'Synthetic',summary:'Fixture only',body_text:text}
   const job=(await db.query("select evidence_pipeline.enqueue('synthetic-native-field',$1::jsonb) id",[JSON.stringify(payload)])).rows[0].id
   const claim=(await db.query('select evidence_pipeline.claim_job() result')).rows[0].result
   assert.equal(claim.id,job)
   const result=(await db.query('select evidence_pipeline.finish_job($1,$2) result',[job,claim.lease_token])).rows[0].result
   return (await db.query('select id,job_id,article_id,content_hash from evidence_pipeline.article_captures where id=$1',[result.capture_id])).rows[0]
  }
  const cap=await nativeCapture()
  const sv='native-capture:'+cap.id+':'+cap.content_hash,fv='native-field:utf8:v1:body_text:'+fh
  const admission=[s,f,cap.id,cap.job_id,cap.article_id,cap.content_hash,'body_text',fh,byteLength]
  const mention=[s,m,f,sv,fv,fh,'unicode_code_point',3,6,'Sam']
  const access=(allow,field=f)=>admin.query('select mip_mentions.set_field_access($1,$2,$3)',[s,field,allow])
  const ownerAdmit=async args=>{
   await db.query('set role mip_mentions_owner')
   try{return (await db.query(admitSQL,args)).rows[0].result}finally{await db.query('reset role')}
  }
  await t.test('owner admission validates identities and hashes before durable success',async()=>{
   await deny(alice,admitSQL,admission,/permission denied/)
   await deny(admin,admitSQL,admission,/permission denied/)
   for(const [index,value] of [[0,other],[2,id(900)],[3,id(901)],[4,id(902)],[5,'0'.repeat(64)],[6,'summary'],[7,'0'.repeat(64)],[8,byteLength-1]]){
    const args=[...admission];args[index]=value
    await assert.rejects(ownerAdmit(args),/unavailable|denied|integrity/)
    assert.equal((await db.query('select count(*)::int n from mip_mentions.fields where id=$1',[f])).rows[0].n,0)
   }
   // Fresh-row admission runs as one SQL statement; it must not depend on
   // a STABLE resolver observing its caller's newly inserted metadata row.
   const first=await ownerAdmit(admission)
   // Real commit has completed. Discard its acknowledgement; retry the same identity.
   assert.deepEqual(await ownerAdmit(admission),first)
   assert.equal((await db.query('select count(*)::int n from mip_mentions.fields where id=$1',[f])).rows[0].n,1)
   const conflict=[...admission];conflict[6]='title'
   await assert.rejects(ownerAdmit(conflict),/retry conflict/)
   assert.equal((await db.query('select count(*)::int n from mip_mentions.field_access where field_id=$1',[f])).rows[0].n,0)
   await deny(alice,putSQL,mention,/source unavailable/)
   await access(true)
   const result=(await alice.query(putSQL,mention)).rows[0].result
   assert.deepEqual((await alice.query(putSQL,mention)).rows[0].result,result)
   for(const key of ['production_qualified','source_authority_qualified','transport_qualified','publication_allowed'])assert.equal(result[key],false)
  })
  await t.test('Unicode codepoint span, immutable versions and metadata minimization',async()=>{
   for(const [index,value] of [[3,'latest'],[4,'latest'],[5,'0'.repeat(64)],[6,'utf16'],[7,4],[9,'sam']]){
    const args=[...mention];args[1]=id(20+index);args[index]=value
    await deny(alice,putSQL,args,/exact mention denied/)
   }
   await deny(alice,putSQL,[s,id(90),...mention.slice(2)],/duplicate/)
   const metadata=(await db.query('select to_jsonb(f) result from mip_mentions.fields f where id=$1',[f])).rows[0].result
   assert.equal(metadata.raw,null);assert.equal(metadata.native_capture_id,cap.id)
   const outputs=[metadata,(await alice.query(readSQL,[s,m])).rows[0].result,(await alice.query(pageSQL,[s,m])).rows[0].result]
   assert.doesNotMatch(JSON.stringify(outputs),/NATIVE_PRIVATE_SENTINEL_e827|A😀 Sam spoke/)
   assert.equal(outputs[1].mention.literal,'Sam')
   const points=Array.from(body),combining=points.indexOf('e',points.indexOf('👩'))
   for(const [mid,start,end,literal] of [[id(91),1,2,'😀'],[id(92),combining,combining+2,'e\u0301']])
    await alice.query(putSQL,[s,mid,f,sv,fv,fh,'unicode_code_point',start,end,literal])
   await deny(alice,putSQL,[s,id(93),f,sv,fv,fh,'unicode_code_point',combining,combining+2,'é'],/exact mention denied/)
   await deny(db,"update mip_mentions.fields set native_source_field='title' where id=$1",[f],/immutable/)
   for(const role of ['native_field_alice','native_field_admin','anon','authenticated','service_role']){
    const c=await connect()
    try{
     await c.query('set session authorization '+role)
     await deny(c,'select mip_mentions.resolve_native_field($1,$2,1048576)',[s,f],/permission denied/)
     await deny(c,'select mip_mentions.native_binding_bytes($1,$2,$3,$4,$5,$6,$7,$8,1048576)',[s,cap.id,cap.job_id,cap.article_id,cap.content_hash,'body_text',fh,byteLength],/permission denied/)
     await deny(c,'select raw from mip_mentions.fields',[],/permission denied/)
    }finally{await c.end()}
   }
   assert.equal((await db.query("select count(*)::int n from pg_auth_members where roleid='mip_mentions_native_validator'::regrole or member='mip_mentions_native_validator'::regrole")).rows[0].n,0)
  })
  await t.test('native byte metadata preserves active field and whole-operation limits',async()=>{
   await db.query('insert into mip_mentions.policy values(2,$1,20,64,32,2097152),(3,1048576,20,64,32,$2),(4,1048576,20,64,32,$3)',[byteLength-1,byteLength+3,byteLength+2])
   try{
    await admin.query('select mip_mentions.activate_policy(2)')
    await deny(alice,readSQL,[s,m],/source integrity unavailable/)
    await admin.query('select mip_mentions.activate_policy(3)')
    assert.equal((await alice.query(readSQL,[s,m])).rows[0].result.mention.literal,'Sam')
    await alice.query(putSQL,mention)
    await deny(alice,putSQL,[s,id(99),f,sv,fv,fh,'unicode_code_point',3,7,'Sam '],/operation byte budget exceeded/)
    await admin.query('select mip_mentions.activate_policy(4)')
    await deny(alice,readSQL,[s,m],/operation byte budget exceeded/)
   }finally{await admin.query('select mip_mentions.activate_policy(1)')}
  })
  await t.test('candidates, decisions and optional agency consumers revalidate original binding',async()=>{
   await db.query('insert into mip_mentions.actors values($1,$2,$3)',[s,actor,'Synthetic Sam'])
   await alice.query('select mip_mentions.put_candidate($1,$2,$3,$4,1,null,1,$5::uuid[],$6::uuid[],$7)',[s,cand,m,actor,[m],[],'synthetic'])
   await alice.query('select mip_mentions.decide($1,$2,$3,1,null,$4,$5,$6)',[s,decision,m,'accepted',cand,'Synthetic review'])
   await alice.query('select mip_mentions.put_actor_revision($1,$2,$3,1,null,$4,$5,$6::uuid[],$7)',[s,id(40),actor,'Sam','person',[m],'Synthetic'])
   await alice.query(actorSQL,[s,m,decision])
   const successor=await nativeCapture('A😀 Sam changed. NEW_PRIVATE_SENTINEL')
   assert.equal(successor.article_id,cap.article_id)
   assert.notEqual(successor.id,cap.id)
   assert.equal((await alice.query(readSQL,[s,m])).rows[0].result.mention.field_hash,fh)
   await access(false)
   for(const [sql,args] of [[readSQL,[s,m]],[pageSQL,[s,m]],[actorSQL,[s,m,decision]],
    ['select mip_mentions.actor_history($1,$2,1)',[s,actor]],
    ['select mip_mentions.put_actor_revision($1,$2,$3,2,$4,$5,$6,$7::uuid[],$8)',[s,id(41),actor,id(40),'Sam','person',[m],'Synthetic']]])
    await deny(alice,sql,args,/source unavailable/)
   await access(true)
   await alice.query(actorSQL,[s,m,decision])
  })
  await t.test('missing, inaccessible, stale and tampered original capture fail closed',async()=>{
   // Fault injection is superuser-only, inside a rolled-back synthetic transaction.
   // Immutable source triggers are separately proven to reject ordinary mutations.
   await deny(db,"update evidence_pipeline.article_captures set content_hash=$1 where id=$2",['0'.repeat(64),cap.id],/append-only/)
   const faults=[
    ["alter table evidence_pipeline.article_captures disable trigger immutable_history;delete from evidence_pipeline.article_captures where id=$1",[cap.id]],
    ["alter table evidence_pipeline.article_captures disable trigger immutable_history;update evidence_pipeline.article_captures set content_hash=$1 where id=$2",['0'.repeat(64),cap.id]],
    ["alter table evidence_pipeline.article_captures disable trigger immutable_history;update evidence_pipeline.article_captures set payload=jsonb_set(payload,'{body_text}',to_jsonb('tampered'::text)) where id=$1",[cap.id]],
    ["update evidence_pipeline.import_jobs set state='dead_letter' where id=$1",[cap.job_id]],
    ["create policy native_test_hide on evidence_pipeline.article_captures as restrictive for select to mip_mentions_native_validator using(false)",[]],
   ]
   for(const [statement,args] of faults){
    await db.query('begin')
    try{
     // pg extended protocol accepts one statement: separate fixed DDL from params.
     const parts=statement.split(';')
     for(let i=0;i<parts.length-1;i++)await db.query(parts[i])
     await db.query(parts.at(-1),args)
     await db.query('set session authorization native_field_alice')
     await deny(db,readSQL,[s,m],/native source.*unavailable/)
    }finally{await db.query('rollback');await db.query('reset session authorization')}
   }
   await alice.query(readSQL,[s,m])
   await admin.query('select mip_mentions.set_membership($1,$2,null)',[s,'native_field_alice'])
   await deny(alice,readSQL,[s,m],/scope access denied/)
   await admin.query('select mip_mentions.set_membership($1,$2,true)',[s,'native_field_alice'])
  })
  await t.test('real concurrent source and membership revocation obey policy-first lock order',async()=>{
   async function race(holder,waiter,after){
    await alice.query('begin');await holder()
    const pid=(await admin.query('select pg_backend_pid() pid')).rows[0].pid
    let settled=false
    const pending=waiter().then(v=>{settled=true;return v},e=>{settled=true;throw e})
    try{
     let blocked=false
     for(let i=0;i<100;i++){
      blocked=(await db.query("select wait_event_type='Lock' blocked from pg_stat_activity where pid=$1",[pid])).rows[0]?.blocked
      if(blocked)break
      assert.equal(settled,false)
      await new Promise(r=>setTimeout(r,10))
     }
     assert.equal(blocked,true,'actual PostgreSQL Lock wait required')
     assert.equal(settled,false)
     await alice.query('commit');await pending;await after()
    }finally{await alice.query('rollback');await pending.catch(()=>{})}
   }
   await race(()=>alice.query(readSQL,[s,m]),()=>access(false),()=>deny(alice,readSQL,[s,m],/source unavailable/))
   await access(true)
   await race(()=>alice.query(pageSQL,[s,m]),()=>admin.query('select mip_mentions.set_membership($1,$2,null)',[s,'native_field_alice']),()=>deny(alice,readSQL,[s,m],/scope access denied/))
   await admin.query('select mip_mentions.set_membership($1,$2,true)',[s,'native_field_alice'])
   // Reverse ordering: a committed revocation wins before waiting operation.
   await admin.query('begin');await access(false)
   let settled=false
   const pending=alice.query(readSQL,[s,m]).then(()=>{settled=true;return null},e=>{settled=true;return e})
   // Poll by the known backend PID rather than rely on query text formatting.
   try{
    const alicePid=alice.processID
    let blocked=false
    for(let i=0;i<100;i++){
     blocked=(await db.query("select wait_event_type='Lock' blocked from pg_stat_activity where pid=$1",[alicePid])).rows[0]?.blocked
     if(blocked)break
     assert.equal(settled,false);await new Promise(r=>setTimeout(r,10))
    }
    assert.equal(blocked,true);await admin.query('commit')
    assert.match((await pending).message,/source unavailable/)
   }finally{await admin.query('rollback');await pending}
   await access(true)
  })
 } finally {
  await alice?.end();await admin?.end()
  if(armed){
   await db.query('reset session authorization;reset role;rollback')
   await db.query('drop schema if exists mip_mentions cascade;drop schema if exists evidence_pipeline cascade;drop schema if exists spatial cascade')
   await db.query('drop function if exists public.mip_pipeline_v1(text,jsonb)')
   await db.query('drop table if exists public.articles,public.nodes,public.geographic_places,public.pipeline_config cascade')
   for(const role of names){
    if((await db.query('select exists(select 1 from pg_roles where rolname=$1) ok',[role])).rows[0].ok)
     await db.query('drop owned by "'+role+'";drop role "'+role+'"')
   }
  }
  await db.end()
 }
})
