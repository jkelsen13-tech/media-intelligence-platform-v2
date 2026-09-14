import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {execFileSync,execFile,spawn} from 'node:child_process'
import {promisify} from 'node:util'
import {createHash} from 'node:crypto'
if(process.env.MIP_MENTION_QUALIFICATION!=='disposable-only')throw new Error('Disposable PostgreSQL opt-in required')
const runAsync=promisify(execFile),args=['-X','-v','ON_ERROR_STOP=1','-At','postgresql://postgres@127.0.0.1:5432/postgres']
const options={encoding:'utf8',env:{...process.env,PGPASSWORD:'mip-disposable-ci-only'}}
const sql=s=>execFileSync('psql',args,{...options,input:s}).trim().split('\n').at(-1)
const q=s=>s===null?'null':"'"+String(s).replaceAll("'","''")+"'"
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const digest=b=>createHash('sha256').update(b).digest('hex')
const s=id(1),other=id(100),fid=id(2),f2=id(8),f3=id(70),m=id(3),m2=id(4),m3=id(5),ms=id(71),a=id(6),b=id(7)
const text='A😀 Sam spoke to Sam.',raw=Buffer.from(text),hash=digest(raw),raw2=Buffer.from('Other Sam.'),hash2=digest(raw2),raw3=Buffer.from('Support Sam.'),hash3=digest(raw3)
const as=(principal,statement)=>principal?'set session authorization '+principal+'; '+statement:statement
const user=statement=>sql(as('mention_alice',statement))
function denied(statement,pattern=/denied|unavailable|conflict|immutable|required|invalid|permission|duplicate key/){
 let error;try{user(statement)}catch(e){error=e}
 assert.ok(error,'statement must fail');assert.match(String(error.stderr),pattern);return error
}
const put=(mid=m,start=3,end=6,literal='Sam',p={})=>'select mip_mentions.put_mention('+[
 q(p.scope??s),q(mid),q(p.field??fid),q(p.source??'source-v1'),q(p.fieldVersion??'field-v1'),q(p.hash??hash),
 q(p.unit??'unicode_code_point'),start,end,q(literal),q(JSON.stringify(p.speaker??{kind:'unresolved',id:null}))+'::jsonb',
 p.addressee===undefined?'null':q(JSON.stringify(p.addressee))+'::jsonb'].join(',')+');'
const candidate=(cid,actor,version=1,prev=null,support=[ms],conflict=[m3],rank=1,mention=m)=>
 'select mip_mentions.put_candidate('+[q(s),q(cid),q(mention),q(actor),version,q(prev),rank,q('{'+support.join(',')+'}')+'::uuid[]',q('{'+conflict.join(',')+'}')+'::uuid[]',q('synthetic-v1')].join(',')+');'
const decision=(did,v,prev,status,cid=null)=>'select mip_mentions.decide('+[q(s),q(did),q(m),v,q(prev),q(status),q(cid),q('Synthetic explicit review')].join(',')+');'
const read=()=> 'select mip_mentions.read_mention('+q(s)+','+q(m)+');'
const actor=did=>'select mip_mentions.resolved_actor('+q(s)+','+q(m)+','+q(did)+');'
const page=()=> 'select mip_mentions.candidate_page('+q(s)+','+q(m)+',20);'
const annotate=(aid,v,prev,p={})=>'select mip_mentions.annotate_participants('+[
 q(s),q(aid),q(id(23)),v,q(prev),q(JSON.stringify(p.speaker??{kind:'unresolved',id:null}))+'::jsonb',
 p.addressee===undefined?'null':q(JSON.stringify(p.addressee))+'::jsonb',q('Correct locator interpretation')].join(',')+');'
const access=(field,allowed)=>'select mip_mentions.set_field_access('+q(s)+','+q(field)+','+(allowed===null?'null':String(allowed))+');'
const membership=(principal,review)=>'select mip_mentions.set_membership('+q(s)+','+q(principal)+','+(review===null?'null':String(review))+');'
const activate=v=>'select mip_mentions.activate_policy('+v+');'
let counter=0
// A real psql session remains inside BEGIN after returning the operation result.
// B must be observed waiting on a PostgreSQL Lock before A is allowed to COMMIT.
async function held(statement,principal='mention_alice'){
 const child=spawn('psql',args,{env:options.env,stdio:['pipe','pipe','pipe']})
 let out='',err='',readyResolve,readyReject
 const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject})
 const done=new Promise(resolve=>child.on('exit',(code)=>{if(!out.includes('MENTION_HOLD'))readyReject(new Error(err||'holder exited'));resolve({code,err})}))
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8')
 child.stdout.on('data',chunk=>{out+=chunk;if(out.includes('MENTION_HOLD'))readyResolve()})
 child.stderr.on('data',chunk=>{err+=chunk})
 child.on('error',readyReject)
 child.stdin.write(as(principal,'begin; '+statement)+'\n\\echo MENTION_HOLD\n')
 const timer=setTimeout(()=>{child.kill();readyReject(new Error('holder barrier timeout'))},10000)
 try{await ready}finally{clearTimeout(timer)}
 return {async release(commit=true){child.stdin.end((commit?'commit;':'rollback;')+'\n\\q\n');const result=await done;assert.equal(result.code,0,result.err)}}
}
async function blocked(holderStatement,waiterStatement,{holderPrincipal='mention_alice',waiterPrincipal='mention_alice',error=null}={}){
 const hold=await held(holderStatement,holderPrincipal),name='mention_wait_'+ ++counter
 let settled=false
 const completion=runAsync('psql',[...args,'-c',as(waiterPrincipal,waiterStatement)],{...options,env:{...options.env,PGAPPNAME:name}})
  .then(value=>{settled=true;return {ok:true,value}},failure=>{settled=true;return {ok:false,failure}})
 let released=false
 try{
  const deadline=Date.now()+10000;let sawLock=false
  while(Date.now()<deadline&&!settled){
   sawLock=sql("select coalesce(bool_or(wait_event_type='Lock'),false) from pg_stat_activity where application_name="+q(name))==='t'
   if(sawLock)break
   await new Promise(resolve=>setTimeout(resolve,20))
  }
  assert.equal(sawLock,true,'waiter must actually block on a database lock')
  assert.equal(settled,false,'waiter cannot finish before holder commit')
  await hold.release();released=true
  const result=await completion
  if(error){assert.equal(result.ok,false);assert.match(String(result.failure.stderr),error)}
  else assert.equal(result.ok,true,result.failure?.stderr)
  return result.value
 }finally{if(!released)await hold.release(false);await completion}
}
test('native immutable mention and scoped resolution replacement',async t=>{
 sql(readFileSync(new URL('../../supabase/qualification/entity-resolution/001_mentions.sql',import.meta.url),'utf8'))
 const fieldRow=(scope,field,bytes)=>'('+[q(scope),q(field),q('source-v1'),q('field-v1'),q(digest(bytes)),"decode("+q(bytes.toString('hex'))+",'hex')"].join(',')+')'
 sql("create role mention_alice login;create role mention_bob login;create role mention_carol login;create role mention_admin login;grant mip_mentions_admin to mention_admin;grant mip_mentions_gateway to mention_alice,mention_bob,mention_carol;"+
 "insert into mip_mentions.members values("+q(s)+",'mention_alice',true),("+q(other)+",'mention_bob',true),("+q(s)+",'mention_carol',true);"+
 "insert into mip_mentions.fields values"+[fieldRow(s,fid,raw),fieldRow(s,f2,raw2),fieldRow(s,f3,raw3),fieldRow(other,fid,raw)].join(',')+";"+
 "insert into mip_mentions.field_access values("+q(s)+","+q(fid)+",true),("+q(s)+","+q(f2)+",true),("+q(s)+","+q(f3)+",true),("+q(other)+","+q(fid)+",true);"+
 "insert into mip_mentions.actors values("+q(s)+","+q(a)+",'Sam'),("+q(s)+","+q(b)+",'Sam'),("+q(other)+","+q(a)+",'Other Sam');"+
 "insert into mip_mentions.policy values(2,2,20,64,32,2097152),(3,1048576,10,64,32,2097152),(4,1048576,20,2,32,2097152),(5,1048576,20,64,1,2097152),(6,1048576,20,64,32,24),(7,1048576,20,64,32,29),(8,1048576,20,64,32,28),(9,1048576,20,64,32,26);")
 user(put());user(put(m2,16,19));user(put(m3,6,9,'Sam',{field:f2,hash:hash2}));user(put(ms,8,11,'Sam',{field:f3,hash:hash3}))
 sql(as('mention_bob',put(id(101),3,6,'Sam',{scope:other})))
 await t.test('physical occurrence is unique; literal/source/version/Unicode stay exact',()=>{
  user(put())
  denied(put(id(20)),/mention_physical_occurrence/)
  denied(put(m,16,19),/retry conflict/)
  for(const statement of [put(id(20),4,7),put(id(20),3,6,'sam'),put(id(20),3,6,'Sam',{source:'latest'}),
   put(id(20),3,6,'Sam',{fieldVersion:'latest'}),put(id(20),3,6,'Sam',{hash:'0'.repeat(64)}),put(id(20),3,6,'Sam',{unit:'utf16'})])
   denied(statement,/exact mention denied/)
  assert.equal(sql('select count(*) from mip_mentions.mentions where scope='+q(s)),'4')
 })
 await t.test('held transaction proves same-span different-ID clone prevention',async()=>{
  await blocked(put(id(21),0,1,'A'),put(id(22),0,1,'A'),{error:/mention_physical_occurrence/})
  assert.equal(sql('select count(*) from mip_mentions.mentions where scope='+q(s)+' and start_pos=0'),'1')
 })
 await t.test('speaker/addressee are valid same-scope locators, never actor attachments',()=>{
  for(const key of ['speaker','addressee']){
   denied(put(id(23),7,12,'spoke',{[key]:{kind:'actor',id:a}}),/direct actor attribution denied/)
   denied(put(id(23),7,12,'spoke',{[key]:{kind:'mention',id:id(101)}}),/participant locator unavailable/)
  }
  user(put(id(23),7,12,'spoke',{speaker:{kind:'mention',id:m},addressee:{kind:'mention',id:m2}}))
  const result=JSON.parse(user('select mip_mentions.read_mention('+q(s)+','+q(id(23))+');'))
  assert.deepEqual(result.mention.speaker,{kind:'mention',id:m});assert.equal(result.mention.actor_id,undefined)
  user("set app.principal='spoof';set app.created_at='1900-01-01';"+annotate(id(24),1,null))
  const corrected=JSON.parse(user('select mip_mentions.read_mention('+q(s)+','+q(id(23))+');'))
  assert.equal(corrected.mention.literal,'spoke');assert.equal(corrected.participant_annotation.speaker.kind,'unresolved')
  assert.equal(corrected.participant_annotation.principal,'mention_alice')
  assert.ok(Number.isFinite(Date.parse(corrected.participant_annotation.created_at)))
  assert.ok(Date.parse(corrected.participant_annotation.created_at)>Date.parse('2020-01-01'))
  const replay=JSON.parse(user(annotate(id(24),1,null)))
  assert.equal(replay.created_at,corrected.participant_annotation.created_at)
  assert.throws(()=>sql(as('mention_carol',annotate(id(24),1,null))),/annotation retry conflict/)
  denied('insert into mip_mentions.participant_annotations(scope,mention_id,id,version,speaker,reason,principal,created_at) values('+
   [q(s),q(id(23)),q(id(26)),2,"'null'::jsonb",q('spoof'),q('mention_bob'),q('1900-01-01')].join(',')+')',/permission denied/)
  assert.doesNotMatch(sql("select proargnames::text from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='mip_mentions' and p.proname='annotate_participants'"),/principal|created_at/)
  for(const key of ['speaker','addressee']){
   denied(annotate(id(26),2,id(24),{[key]:{kind:'actor',id:a}}),/direct actor attribution denied/)
   denied(annotate(id(26),2,id(24),{[key]:{kind:'mention',id:id(101)}}),/participant locator unavailable/)
  }
  assert.throws(()=>sql("update mip_mentions.participant_annotations set reason='changed'"),/immutable/)
 })
 await t.test('held annotation writer blocks current read until successor is committed',async()=>{
  const outcome=await blocked(annotate(id(25),2,id(24),{speaker:{kind:'mention',id:m2},addressee:{kind:'mention',id:m}}),
   'select mip_mentions.read_mention('+q(s)+','+q(id(23))+');')
  const result=JSON.parse(outcome.stdout.trim().split('\n').at(-1))
  assert.equal(result.participant_annotation.id,id(25));assert.equal(result.participant_annotation.version,2)
  assert.equal(result.participant_annotation.principal,'mention_alice')
  assert.deepEqual(result.participant_annotation.addressee,{kind:'mention',id:m})
  assert.equal(result.mention.literal,'spoke')
 })
 await t.test('held annotation successors serialize with exact predecessor',async()=>{
  await blocked(annotate(id(27),3,id(25)),annotate(id(28),3,id(25)),{error:/annotation predecessor conflict/})
 })
 await t.test('held current read blocks later annotation writer without stale substitution',async()=>{
  const statement='select mip_mentions.read_mention('+q(s)+','+q(id(23))+');'
  const before=JSON.parse(user(statement));assert.equal(before.participant_annotation.id,id(27))
  const result=await blocked(statement,annotate(id(29),4,id(27),{addressee:{kind:'mention',id:m2}}))
  assert.equal(JSON.parse(result.stdout.trim().split('\n').at(-1)).annotation_id,id(29))
  const after=JSON.parse(user(statement));assert.equal(after.participant_annotation.version,4)
  assert.equal(after.mention.literal,'spoke')
 })
 await t.test('cross-operation creation/read share advisory then mention/field lock order',async()=>{
  const create=put(id(81),0,7,'Support',{field:f3,hash:hash3,speaker:{kind:'mention',id:m3},addressee:{kind:'mention',id:m}})
  const result=await blocked(create,'select mip_mentions.read_mention('+q(s)+','+q(id(81))+');')
  assert.equal(JSON.parse(result.stdout.trim().split('\n').at(-1)).mention.literal,'Support')
  const order=JSON.parse(sql("select json_build_object('mentions_first',position('order by id for share' in prosrc)<position('order by field_id for share' in prosrc),'one_source_lock',position('mip_mentions.lock_fields' in prosrc)=0) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mip_mentions' and p.proname='check_mentions'"))
  assert.deepEqual(order,{mentions_first:true,one_source_lock:true})
  assert.equal(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mip_mentions' and p.proname in('put_mention','put_candidate','decide','resolved_actor','candidate_page','annotate_participants','read_mention') and position('lock_policy()' in prosrc)<position('mip_mentions.authorize' in prosrc) and position('mip_mentions.authorize' in prosrc)<position('pg_advisory_xact_lock' in prosrc) and position('pg_advisory_xact_lock' in prosrc)<position('mip_mentions.check_mentions' in prosrc) and position('mip_mentions.lock_fields' in prosrc)=0"),'7')
 })
 await t.test('scope authorization and private helpers cannot be bypassed',()=>{
  assert.throws(()=>sql(as('mention_bob',read())),/scope access denied/)
  denied('select mip_mentions.read_mention(null,'+q(m)+')',/missing scope/)
  denied("set app.user_id='mention_bob';"+put(id(20),3,6,'Sam',{scope:other}),/scope access denied/)
  denied('select * from mip_mentions.mentions',/permission denied/)
  denied('select mip_mentions.authorize('+q(s)+')',/permission denied/)
 })
 await t.test('candidate pages use authorized keysets without totals or ordinals',()=>{
  assert.equal(JSON.parse(user(candidate(id(10),a))).position,undefined)
  assert.equal(JSON.parse(user(candidate(id(11),b,1,null,[],[m3],2))).position,undefined)
  user(candidate(id(90),a,1,null,[m],[],1,m2))
  const first=JSON.parse(user('select mip_mentions.candidate_page('+q(s)+','+q(m)+',1);'))
  assert.equal(first.locator_only,true);assert.equal(first.identity_accepted,false)
  assert.deepEqual(Object.keys(first.cursor).sort(),['after_candidate','mention_id','policy_version','scope'])
  assert.equal(first.cursor.after_candidate,id(10))
  assert.equal(first.items[0].position,undefined)
  user(candidate(id(12),a,2,id(10)))
  const next=JSON.parse(user('select mip_mentions.candidate_page('+q(s)+','+q(m)+',10,'+q(JSON.stringify(first.cursor))+'::jsonb);'))
  assert.deepEqual(next.items.map(r=>r.candidate_id),[id(11),id(12)])
  assert.equal(next.cursor,null,'continuation is live keyset, not a frozen all-row ceiling')
  denied('select mip_mentions.candidate_page('+q(s)+','+q(m)+',1,'+q(JSON.stringify({...first.cursor,scope:other}))+'::jsonb);',/cursor binding denied/)
  sql(activate(3));denied('select mip_mentions.candidate_page('+q(s)+','+q(m)+',1,'+q(JSON.stringify(first.cursor))+'::jsonb);',/cursor binding denied/);sql(activate(1))
 })
 await t.test('off-page revoked row cannot affect page metadata; lookahead must authorize',()=>{
  const target=id(21)
  user(candidate(id(91),a,1,null,[m2],[],1,target))
  user(candidate(id(92),b,1,null,[m2],[],2,target))
  user(candidate(id(93),a,2,id(91),[ms],[],1,target))
  const firstSQL='select mip_mentions.candidate_page('+q(s)+','+q(target)+',1);'
  const before=JSON.parse(user(firstSQL))
  sql(access(f3,false))
  assert.deepEqual(JSON.parse(user(firstSQL)),before,'off-page inaccessible row emits no count/high-water')
  denied('select mip_mentions.candidate_page('+q(s)+','+q(target)+',1,'+q(JSON.stringify(before.cursor))+'::jsonb);',/source unavailable/)
  sql(access(f3,true))
 })
 await t.test('independent whole-operation context, field and byte budgets fail closed',()=>{
  for(const [version,pattern] of [[4,/operation context budget exceeded/],[5,/operation field budget exceeded/],[6,/operation byte budget exceeded/]]){
   sql(activate(version));denied(page(),pattern);sql(activate(1))
  }
  const shared='select mip_mentions.candidate_page('+q(s)+','+q(m2)+',1);'
  sql(activate(7));assert.equal(JSON.parse(user(shared)).items.length,1,'one 23-byte field plus two 3-byte spans totals 29')
  sql(activate(8));assert.equal(JSON.parse(user(read())).mention.literal,'Sam')
  denied(shared,/operation byte budget exceeded/);sql(activate(1))
  const checks=JSON.parse(sql("select json_build_object('grouped',position('with checked as materialized' in prosrc)>0,'budget_first',position('operation byte budget exceeded' in prosrc)<position('encode(sha256(raw)' in prosrc),'no_loop',position(' loop' in prosrc)=0) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mip_mentions' and p.proname='check_mentions'"))
  assert.deepEqual(checks,{grouped:true,budget_first:true,no_loop:true})
 })
 await t.test('new literal consumes pre-decode byte budget at exact boundary',()=>{
  sql(activate(9))
  // 23 source bytes + 3 proposed literal bytes = 26. No prior span at 13..16.
  user(put(id(82),13,16,'to '))
  denied(put(id(83),13,17,'to S'),/operation byte budget exceeded/)
  assert.equal(sql('select count(*) from mip_mentions.mentions where scope='+q(s)+' and id='+q(id(83))),'0')
  const body=JSON.parse(sql("select json_build_object('uses_validated',position('validated:=mip_mentions.check_mentions' in prosrc)>0,'no_source_decode',position('convert_from' in prosrc)=0,'no_source_query',position('from mip_mentions.fields' in prosrc)=0) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mip_mentions' and p.proname='put_mention'"))
  assert.deepEqual(body,{uses_validated:true,no_source_decode:true,no_source_query:true})
  sql(activate(1))
 })
 await t.test('cursor malformed keys, identities and anchor-only revocation cannot bypass access',()=>{
  const target=id(82) // Source fid; anchor alone cites f3, later rows cite fid only.
  user(candidate(id(94),a,1,null,[ms],[],1,target))
  user(candidate(id(95),b,1,null,[m2],[],2,target))
  user(candidate(id(96),a,2,id(94),[m2],[],1,target))
  const query=cursor=>'select mip_mentions.candidate_page('+q(s)+','+q(target)+',1'+
   (cursor===undefined?'':','+q(JSON.stringify(cursor))+'::jsonb')+');'
  const first=JSON.parse(user(query()))
  assert.equal(first.cursor.after_candidate,id(94))
  for(const cursor of [{...first.cursor,extra:true},{...first.cursor,after_candidate:id(999)},{...first.cursor,after_candidate:'bad'},[]])
   denied(query(cursor),/cursor binding denied|invalid input syntax/)
  const second=JSON.parse(user(query(first.cursor)))
  assert.equal(second.items[0].candidate_id,id(95))
  assert.equal(second.cursor.after_candidate,id(95))
  sql(access(f3,false))
  assert.equal(JSON.parse(user('select mip_mentions.read_mention('+q(s)+','+q(target)+')')).mention.literal,'to ')
  assert.equal(JSON.parse(user('select mip_mentions.read_mention('+q(s)+','+q(m2)+')')).mention.literal,'Sam')
  const tail=JSON.parse(user(query(second.cursor)))
  assert.equal(tail.items[0].candidate_id,id(96));assert.equal(tail.cursor,null)
  // Target, next candidate 95 and lookahead 96 use only readable fid.
  // Only anchor 94 uses revoked f3: removing anchor validation would pass.
  denied(query(first.cursor),/source unavailable/)
  sql(access(f3,true))
  assert.deepEqual(JSON.parse(user(query(first.cursor))),second)
 })
 await t.test('absent access row cannot be admitted by an unlocked concurrent grant',async()=>{
  sql(access(f3,null));denied('select mip_mentions.read_mention('+q(s)+','+q(ms)+')',/source unavailable/)
  // A held admin grant serializes at policy head; B observes only committed grant.
  await blocked(access(f3,true),'select mip_mentions.read_mention('+q(s)+','+q(ms)+')',{holderPrincipal:'mention_admin'})
  await blocked('select mip_mentions.read_mention('+q(s)+','+q(ms)+')',access(f3,null),{waiterPrincipal:'mention_admin'})
  denied('select mip_mentions.read_mention('+q(s)+','+q(ms)+')',/source unavailable/)
  await blocked(access(f3,true),put(id(84),11,12,'.',{field:f3,hash:hash3}),{holderPrincipal:'mention_admin'})
  await blocked(access(f3,false),put(id(85),7,8,' ',{field:f3,hash:hash3}),{holderPrincipal:'mention_admin',error:/source unavailable/})
  assert.equal(sql('select count(*) from mip_mentions.mentions where scope='+q(s)+' and id='+q(id(85))),'0')
  sql(access(f3,true))
  assert.equal(sql("select position('with locked as materialized' in prosrc)>0 and position('from locked' in prosrc)>0 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mip_mentions' and p.proname='check_mentions'"),'t')
 })
 await t.test('mixed admin/user operations serialize in both orders without field/member inversion',async()=>{
  const adminA=membership('mention_alice',true)+access(fid,true)+activate(1)
  await blocked(adminA,read(),{holderPrincipal:'mention_admin'})
  await blocked(read(),adminA,{waiterPrincipal:'mention_admin'})
  const adminB=access(fid,true)+membership('mention_alice',true)+activate(1)
  await blocked(adminB,read(),{holderPrincipal:'mention_admin'})
  await blocked(read(),adminB,{waiterPrincipal:'mention_admin'})
  denied(access(fid,false),/permission denied/);denied(membership('mention_alice',false),/permission denied/)
  assert.throws(()=>sql(as('mention_admin','update mip_mentions.field_access set allowed=false')),/permission denied/)
 })
 await t.test('held candidate successor serialization refuses stale predecessor',async()=>{
  await blocked(candidate(id(13),a,3,id(12)),candidate(id(14),a,3,id(12)),{error:/candidate predecessor conflict/})
  assert.equal(sql('select count(*) from mip_mentions.candidates where scope='+q(s)+' and mention_id='+q(m)+' and actor_id='+q(a)),'3')
 })
 await t.test('actor attribution requires exact current decision and current candidate set',()=>{
  denied(decision(id(30),1,null,'accepted',id(10)),/stale candidate denied/)
  denied(decision(id(30),1,null,'accepted',id(11)),/exact supporting context required/)
  user(decision(id(30),1,null,'unresolved'));user(decision(id(31),2,id(30),'accepted',id(13)))
  const projected=JSON.parse(user(actor(id(31))));assert.equal(projected.actor_id,a);assert.equal(projected.attribution_kind,'reviewed_interpretation')
  denied(actor(id(30)),/current accepted decision unavailable/)
  user(candidate(id(15),b,2,id(11),[ms],[m3],2));denied(actor(id(31)),/stale attribution unavailable/)
  user(decision(id(32),3,id(31),'accepted',id(13)))
  user(decision(id(33),4,id(32),'rejected'));denied(actor(id(32)),/current accepted decision unavailable/)
  assert.equal(JSON.parse(user(read())).mention.literal,'Sam')
  assert.throws(()=>sql("update mip_mentions.mentions set literal='Someone'"),/immutable/)
  assert.throws(()=>sql('delete from mip_mentions.decisions'),/immutable/)
 })
 await t.test('held decision successor serialization admits exactly one successor',async()=>{
  await blocked(decision(id(34),5,id(33),'unresolved'),decision(id(35),5,id(33),'unresolved'),{error:/decision predecessor conflict/})
  assert.equal(sql('select count(*) from mip_mentions.decisions'),'5')
  user(decision(id(36),6,id(34),'accepted',id(13)))
 })
 await t.test('conflicting evidence revocation denies accepted attribution and retries',()=>{
  sql(access(f2,false))
  assert.equal(JSON.parse(user(read())).mention.literal,'Sam')
  denied(actor(id(36)),/source unavailable/);denied(decision(id(36),6,id(34),'accepted',id(13)),/source unavailable/)
  assert.equal(sql('select count(*) from mip_mentions.decisions'),'6')
  sql(access(f2,true))
 })
 for(const [label,field] of [['support',f3],['conflict',f2]]){
  await t.test('sequential '+label+' revocation withholds entire candidate page',()=>{
   sql(access(field,false))
   assert.equal(JSON.parse(user(read())).mention.literal,'Sam','target alone remains readable')
   const failure=denied(page(),/source unavailable/)
   assert.doesNotMatch(String(failure.stdout),/items|cursor|actor_id|rank/)
   sql(access(field,true))
  })
  await t.test('held candidate page locks '+label+' evidence before emitting',async()=>{
   await blocked(page(),access(field,false),{waiterPrincipal:'mention_admin'})
   denied(page(),/source unavailable/)
   sql(access(field,true))
  })
  await t.test('held '+label+' revocation blocks page then denies without output',async()=>{
   await blocked(access(field,false),
    page(),{holderPrincipal:'mention_admin',error:/source unavailable/})
   denied(page(),/source unavailable/)
   sql(access(field,true))
  })
 }
 await t.test('held source access revocation waits for the authorized operation',async()=>{
  await blocked(read(),access(fid,false),{waiterPrincipal:'mention_admin'})
  denied(read(),/source unavailable/)
  sql(access(fid,true))
 })
 await t.test('held membership revocation waits and later calls fail closed',async()=>{
  await blocked(read(),membership('mention_alice',null),{waiterPrincipal:'mention_admin'})
  denied(read(),/scope access denied/)
  sql(membership('mention_alice',true))
 })
 await t.test('held policy shrink waits; subsequent operation uses new immutable policy',async()=>{
  await blocked(read(),activate(2),{waiterPrincipal:'mention_admin'})
  denied(read(),/source integrity unavailable/);denied(put(),/source integrity unavailable/)
  sql(activate(1));assert.equal(JSON.parse(user(read())).policy_version,1)
  assert.throws(()=>sql('update mip_mentions.policy set max_field_bytes=2 where version=1'),/immutable/)
 })
 await t.test('FORCE RLS, scoped indexes, no global sequence and private policy controls',()=>{
  assert.equal(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='mip_mentions' and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity"),'10')
  assert.equal(sql("select count(*) from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='mip_mentions' and p.polname='owner_scoped' and pg_get_expr(p.polqual,p.polrelid) like '%SESSION_USER%'"),'7')
  assert.equal(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='mip_mentions' and c.relkind='S'"),'0')
  assert.equal(sql("select has_function_privilege('mip_mentions_gateway','mip_mentions.activate_policy(integer)','execute')"),'f')
  assert.equal(sql("select count(*) from pg_indexes where schemaname='mip_mentions' and indexname in('mention_physical_occurrence','mentions_field_page','candidate_actor_head','candidate_page','decision_head','participant_annotation_head')"),'6')
  assert.equal(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mip_mentions' and (p.proconfig is null or not exists(select 1 from unnest(p.proconfig)c where c like 'search_path=%'))"),'0')
 })
})
