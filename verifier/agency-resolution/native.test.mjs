import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {execFileSync,execFile,spawn} from 'node:child_process'
import {promisify} from 'node:util'
if(process.env.MIP_MENTION_QUALIFICATION!=='disposable-only')throw new Error('Disposable PostgreSQL opt-in required')
const args=['-X','-v','ON_ERROR_STOP=1','-At','postgresql://postgres@127.0.0.1:5432/agency_qualification']
const options={encoding:'utf8',env:{...process.env,PGPASSWORD:'mip-disposable-ci-only'}}
const sql=s=>execFileSync('psql',args,{...options,input:s}).trim().split('\n').at(-1)
const q=s=>s===null?'null':"'"+String(s).replaceAll("'","''")+"'"
const id=n=>'20000000-0000-4000-8000-'+String(n).padStart(12,'0')
const s=id(1),f=id(2),m=id(3),action=id(4),a=id(5),b=id(6),c=id(7)
const as=(who,x)=>'set session authorization '+who+'; '+x
const user=x=>sql(as('agency_alice',x))
const denied=x=>assert.throws(()=>user(x),/denied|unavailable|conflict|invalid|permission|constraint|required/)
const arr=x=>q('{'+x.join(',')+'}')+'::uuid[]'
const actor=(i,aid=a,v=1,prev=null,ev=[m])=>'select mip_mentions.put_actor_revision('+[q(s),q(i),q(aid),v,q(prev),q('Sam'),q('person'),arr(ev),q('Synthetic actor review')].join(',')+');'
const cand=(i,aid=a,v=1,prev=null)=>'select mip_mentions.put_candidate('+[q(s),q(i),q(m),q(aid),v,q(prev),1,arr([m]),arr([]),q('synthetic')].join(',')+');'
const dec=(i,v=1,prev=null,cid=id(20))=>'select mip_mentions.decide('+[q(s),q(i),q(m),v,q(prev),q('accepted'),q(cid),q('Synthetic identity review')].join(',')+');'
const choice=(cid=id(20),rid=id(10),did=null)=>({candidate_id:cid,actor_revision_id:rid,decision_id:did,identity_confidence:.8})
const agency=(i,v=1,prev=null,st='unresolved',ch=[],role='agent')=>'select mip_mentions.put_agency('+[
 q(s),q(i),q(action),q(m),q(role),v,q(prev),q('attributed_action'),q(st),q(JSON.stringify(ch))+'::jsonb',arr([action]),.4,.7,.6,.3,q('Synthetic role review')].join(',')+');'
const read=(i,role='agent')=>'select mip_mentions.read_agency('+[q(s),q(action),q(role),q(i)].join(',')+');'
const access=allowed=>'select mip_mentions.set_field_access('+q(s)+','+q(f)+','+allowed+');'
const history=cursor=>'select mip_mentions.actor_history('+q(s)+','+q(a)+',1'+(cursor?','+q(JSON.stringify(cursor))+'::jsonb':'')+');'
const lineage=(i,v,prev,kind,fr,to)=>'select mip_mentions.put_actor_lineage('+[q(s),q(i),q(a),v,q(prev),q(kind),arr(fr),arr(to),arr([m]),q('Reviewed lineage interpretation')].join(',')+');'
const run=promisify(execFile)
let counter=0
async function blocked(first,second,{admin=false,error=false}={}){
 const child=spawn('psql',args,{env:options.env,stdio:['pipe','pipe','pipe']})
 let out='',err='',resolveReady,rejectReady
 const ready=new Promise((res,rej)=>{resolveReady=res;rejectReady=rej})
 const done=new Promise(res=>child.on('exit',code=>{if(!out.includes('AGENCY_HOLD'))rejectReady(new Error(err));res(code)}))
 child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8')
 child.stdout.on('data',x=>{out+=x;if(out.includes('AGENCY_HOLD'))resolveReady()})
 child.stderr.on('data',x=>err+=x);child.on('error',rejectReady)
 child.stdin.write(as(admin?'agency_admin':'agency_alice','begin; '+first)+'\n;\n\\echo AGENCY_HOLD\n')
 const timer=setTimeout(()=>{child.kill();rejectReady(new Error('barrier timeout'))},10000)
 try{await ready}finally{clearTimeout(timer)}
 const name='agency_wait_'+ ++counter
 let settled=false
 const pending=run('psql',[...args,'-c',as('agency_alice',second)],{...options,env:{...options.env,PGAPPNAME:name}}).then(x=>{settled=true;return {ok:true,x}},x=>{settled=true;return {ok:false,x}})
 let released=false
 try{
  let locked=false;const end=Date.now()+10000
  while(!settled&&Date.now()<end){
   locked=sql("select coalesce(bool_or(wait_event_type='Lock'),false) from pg_stat_activity where application_name="+q(name))==='t'
   if(locked)break
   await new Promise(r=>setTimeout(r,20))
  }
  assert.equal(locked,true);assert.equal(settled,false)
  child.stdin.end('commit;\n\\q\n');released=true;assert.equal(await done,0,err)
  const result=await pending;assert.equal(result.ok,!error,String(result.x?.stderr));return result
 }finally{if(!released){child.stdin.end('rollback;\n\\q\n');await done}await pending}
}
test('native actor revision and agency qualification',async t=>{
 // Dedicated database; roles are cluster-wide and Slice1 native suite runs in
 // another job. No live DSN or host can be supplied to this harness.
 execFileSync('psql',[...args.slice(0,-1),'postgresql://postgres@127.0.0.1:5432/postgres'],{...options,input:'create database agency_qualification;'})
 sql(readFileSync(new URL('../../supabase/qualification/entity-resolution/001_mentions.sql',import.meta.url),'utf8'))
 sql("set check_function_bodies=on;\n"+readFileSync(new URL('../../supabase/qualification/entity-resolution/002_agency.sql',import.meta.url),'utf8'))
 assert.equal(sql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='mip_mentions' and p.proname in('agency_history','read_lineage')"),'2','PostgreSQL must parse and install both late function bodies')
 sql("create role agency_alice login;create role agency_bob login;create role agency_admin login;grant mip_mentions_gateway to agency_alice,agency_bob;grant mip_mentions_admin to agency_admin;"+
 "insert into mip_mentions.members values("+q(s)+",'agency_alice',true);"+
 "insert into mip_mentions.fields values("+q(s)+","+q(f)+",'sv1','fv1',encode(sha256(convert_to('Sam acted.','UTF8')),'hex'),convert_to('Sam acted.','UTF8'));"+
 "insert into mip_mentions.field_access values("+q(s)+","+q(f)+",true);"+
 "insert into mip_mentions.actors values("+q(s)+","+q(a)+",'Sam'),("+q(s)+","+q(b)+",'Sam'),("+q(s)+","+q(c)+",'Sam');")
 for(const [mid,start,end,literal] of [[m,0,3,'Sam'],[action,4,9,'acted']])user('select mip_mentions.put_mention('+[q(s),q(mid),q(f),q('sv1'),q('fv1'),"encode(sha256(convert_to('Sam acted.','UTF8')),'hex')",q('unicode_code_point'),start,end,q(literal),'null','null'].join(',')+');')
 await t.test('immutable scoped actor revisions; labels do not merge actors',()=>{
  user(actor(id(10)));user(actor(id(11),b));user(actor(id(12),c))
  denied(actor(id(13),a,2,null))
  assert.throws(()=>sql("update mip_mentions.actor_revisions set label='different'"),/immutable/)
  assert.throws(()=>sql('truncate mip_mentions.actor_revisions'),/immutable/)
  denied('select * from mip_mentions.actor_revisions')
  assert.throws(()=>sql(as('agency_bob',history())),/scope access denied/)
 })
 await t.test('raw stored text caps reject oversized padding and admit exact boundaries',()=>{
  const textCases=[
   [256,value=>actor(id(90),a,2,id(10)).replace(q('Sam'),q(value))],
   [4096,value=>actor(id(90),a,2,id(10)).replace(q('Synthetic actor review'),q(value))],
   [4096,value=>lineage(id(91),1,null,'supersession',[id(10)],[id(11)]).replace(q('Reviewed lineage interpretation'),q(value))],
   [4096,value=>agency(id(92)).replace(q('Synthetic role review'),q(value))]
  ]
  for(const [cap,statement] of textCases){
   for(const padded of ['x'+' '.repeat(cap),' '.repeat(cap)+'x'])denied(statement(padded))
   user('begin; '+statement('x'+' '.repeat(cap-1))+' rollback;')
  }
  assert.equal(sql('select count(*) from mip_mentions.actor_revisions where id='+q(id(90))),'0')
  assert.equal(sql('select count(*) from mip_mentions.actor_lineage where id='+q(id(91))),'0')
  assert.equal(sql('select count(*) from mip_mentions.agency_assertions where id='+q(id(92))),'0')
 })
 await t.test('separate unresolved proposed and accepted participant interpretation',()=>{
  user(cand(id(20)));user(cand(id(21),b))
  user(agency(id(30)))
  const unresolved=JSON.parse(user(read(id(30))));assert.equal(unresolved.assertion.status,'unresolved')
  user(agency(id(31),2,id(30),'proposed',[choice(),choice(id(21),id(11))]))
  assert.equal(JSON.parse(user(read(id(31)))).assertion.choices.length,2)
  denied(agency(id(32),3,id(31),'accepted',[choice()]))
  user(dec(id(22)))
  const accepted=JSON.parse(user(agency(id(32),3,id(31),'accepted',[choice(id(20),id(10),id(22))])))
  assert.equal(accepted.documented_fact,false);assert.equal(accepted.publication_allowed,false)
  const data=JSON.parse(user(read(id(32))))
  assert.equal(data.assertion.principal,'agency_alice');assert.equal(data.assertion.role_confidence,.4)
  assert.equal(data.assertion.choices[0].identity_confidence,.8);assert.equal(data.assertion.action_kind,'attributed_action')
  denied(read(id(31)))
  for(const role of ['speaker','addressee','principal','beneficiary','affected_actor'])user(agency(id(40+['speaker','addressee','principal','beneficiary','affected_actor'].indexOf(role)),1,null,'unresolved',[],role))
 })
 await t.test('actor successor makes exact agency projection stale; current history is bounded',async()=>{
  await blocked(actor(id(14),a,2,id(10)),read(id(32)),{error:true})
  denied(read(id(32)))
  user(actor(id(15),a,3,id(14)))
  const first=JSON.parse(user(history()));assert.equal(first.items[0].id,id(10));assert.equal(first.historical_only,true)
  assert.equal(first.total,undefined);assert.equal(first.cursor.after_revision,id(10))
  const second=JSON.parse(user(history(first.cursor)));assert.equal(second.items[0].id,id(14))
  denied(history({...first.cursor,actor_id:b}));denied(history({...first.cursor,extra:true}))
  await blocked(actor(id(16),a,4,id(15)),actor(id(17),a,4,id(15)),{error:true})
 })
 await t.test('explicit lineage retains immutable merge split and supersession interpretations',()=>{
  denied(lineage(id(49),1,null,'withdrawn',[id(16)],[id(11)]))
  assert.equal(sql('select count(*) from mip_mentions.actor_lineage'),'0','version-one withdrawal must not create an event')
  user(lineage(id(50),1,null,'merge',[id(16),id(11)],[id(12)]))
  user(lineage(id(51),2,id(50),'split',[id(16)],[id(11),id(12)]))
  user(lineage(id(52),3,id(51),'supersession',[id(16)],[id(11)]))
  assert.equal(sql('select count(*) from mip_mentions.actor_lineage'),'3')
  const last=JSON.parse(user('select mip_mentions.read_lineage('+q(s)+','+q(a)+','+q(id(52))+')'));assert.equal(last.automatic_identity_rewrite,false)
  denied('select mip_mentions.read_lineage('+q(s)+','+q(a)+','+q(id(50))+')')
  denied(lineage(id(53),4,id(51),'supersession',[id(16)],[id(11)]))
  denied(lineage(id(53),4,id(52),'merge',[id(16),id(15)],[id(11)]))
  assert.throws(()=>sql("delete from mip_mentions.actor_lineage"),/immutable/)
  denied(lineage(id(54),4,null,'withdrawn',[id(16)],[id(11)]))
  denied(lineage(id(54),4,id(52),'withdrawn',[id(16)],[id(12)]))
  assert.equal(sql('select count(*) from mip_mentions.actor_lineage'),'3','unrelated withdrawal sides must not persist')
  user(lineage(id(54),4,id(52),'withdrawn',[id(16)],[id(11)]))
  const withdrawal=JSON.parse(user('select mip_mentions.read_lineage('+q(s)+','+q(a)+','+q(id(54))+')'))
  assert.equal(withdrawal.lineage.kind,'withdrawn');assert.equal(withdrawal.lineage.predecessor_id,id(52))
  assert.deepEqual(withdrawal.lineage.from_revisions,[id(16)]);assert.deepEqual(withdrawal.lineage.to_revisions,[id(11)])
  assert.equal(withdrawal.documented_fact,false)
  denied(lineage(id(55),5,id(54),'withdrawn',[id(16)],[id(11)]))
  assert.equal(sql('select count(*) from mip_mentions.actor_lineage'),'4')
 })
 await t.test('identity decision and candidate-set changes invalidate role projection',()=>{
  user(agency(id(33),4,id(32),'accepted',[choice(id(20),id(16),id(22))]))
  user(cand(id(23),c))
  denied(read(id(33)))
  user(dec(id(24),2,id(22)))
  user(agency(id(34),5,id(33),'accepted',[choice(id(20),id(16),id(24))]))
  assert.equal(JSON.parse(user(read(id(34)))).documented_fact,false)
  user(cand(id(25),a,2,id(20)));denied(read(id(34)))
  const past=JSON.parse(user('select mip_mentions.agency_history('+q(s)+','+q(action)+",'agent')"))
  assert.equal(past.historical_only,true);assert.equal(past.items[0].id,id(30))
  const next=JSON.parse(user('select mip_mentions.agency_history('+q(s)+','+q(action)+",'agent',"+q(JSON.stringify(past.cursor))+"::jsonb)"))
  assert.equal(next.items[0].id,id(31));assert.equal(next.documented_fact,false)
 })
 await t.test('source access and membership revocation close historical and current reads',async()=>{
  await blocked(access('false'),history(),{admin:true,error:true})
  denied(agency(id(35),6,id(34)))
  sql(as('agency_admin',access('true')))
  user(agency(id(35),6,id(34)))
  await blocked(read(id(35)),agency(id(36),7,id(35)))
  denied(read(id(35)));assert.equal(JSON.parse(user(read(id(36)))).assertion.id,id(36))
  sql(as('agency_admin',"select mip_mentions.set_membership("+q(s)+",'agency_alice',null)"))
  denied(read(id(36)));denied(history())
 })
 await t.test('RLS immutable private helpers and scope-leading head indexes',()=>{
  assert.equal(sql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='mip_mentions' and c.relname in('actor_revisions','actor_lineage','agency_assertions') and relrowsecurity and relforcerowsecurity"),'3')
  assert.equal(sql("select count(*) from pg_indexes where schemaname='mip_mentions' and indexname in('actor_revision_head','actor_lineage_head','agency_assertion_head')"),'3')
  denied('select mip_mentions.revision_context('+q(s)+','+arr([id(10)])+',false)')
 })
})
