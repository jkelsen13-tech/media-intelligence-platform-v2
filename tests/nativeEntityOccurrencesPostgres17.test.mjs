// Actual native capture -> owner-admitted metadata -> occurrence plan -> put_mention.
// Synthetic dedicated PostgreSQL 17.6 only. Parent creates/drops the empty DB.
import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import pg from 'pg'
import {buildNativeEntityOccurrencePlan} from '../supabase/qualification/entity-resolution/native-occurrences/entityOccurrences.mjs'
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8')
const database='mip_native_occurrences_test',password='mip-efta-disposable-ci-only'
const aliceName='native_occurrence_alice',adminName='native_occurrence_admin'
const names=['anon','authenticated','service_role','mip_mentions_owner','mip_mentions_gateway',
 'mip_mentions_admin','mip_mentions_native_validator',aliceName,adminName]
const id=n=>'c6200000-0000-4000-8000-'+String(n).padStart(12,'0')
const s=id(1),fieldId=id(2),summaryId=id(3)
const body='e\u0301 😀 President Sam Jones thanked Sam  Jones. Sam Jones spoke. private_sentinel_a129f'
const summary='Ada Lovelace spoke with Alan Turing. Ada Lovelace replied.'
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const configurationVersion='synthetic-outlets-v1',outletNames=new Set(['synthetic outlet'])
async function connect(user='postgres',pass=password){
 const c=new pg.Client({host:'127.0.0.1',port:5432,database,user,password:pass,
  connectionTimeoutMillis:5000,statement_timeout:15000,query_timeout:20000})
 try{await c.connect();return c}
 catch(error){
  try{await c.end()}catch{throw Error('native_occurrence_connection_cleanup_failed')}
  throw error
 }
}
const putSQL='select mip_mentions.put_mention($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb) result'
const params=m=>[m.scope,m.id,m.field_id,m.source_version,m.field_version,m.field_hash,m.offset_unit,m.start,m.end,m.literal,m.speaker,m.addressee]
const deny=async promise=>assert.rejects(promise,error=>/denied|unavailable|conflict|permission|duplicate|integrity|budget/.test(error.message))
test('native occurrence plans use actual put_mention with original retained fields',{
 skip:process.env.MIP_NATIVE_ENTITY_OCCURRENCES_DISPOSABLE!=='synthetic-pg17-only',timeout:120000
},async t=>{
 let db,alice,admin,wrong,armed=false
 try{
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
  await db.query(await read('tests/changeQueueFixture.sql'))
  await db.query(await read('supabase/migrations/20260905082406_evidence_pipeline_reliability.sql'))
  await db.query(await read('supabase/qualification/entity-resolution/001_mentions.sql'))
  await db.query(await read('supabase/qualification/entity-resolution/native-capture-fields/003_native_fields.sql'))
  await db.query("create role "+aliceName+" login password '"+password+"';create role "+adminName+" login password '"+password+"';grant mip_mentions_gateway to "+aliceName+";grant mip_mentions_admin to "+adminName)
  assert.equal((await db.query("select bool_and(rolpassword like 'SCRAM-SHA-256$%') ok from pg_authid where rolname=any($1)",[[aliceName,adminName]])).rows[0].ok,true)
  alice=await connect(aliceName);admin=await connect(adminName)
  assert.equal((await alice.query('select session_user::text principal')).rows[0].principal,aliceName)
  await assert.rejects(async()=>{wrong=await connect(aliceName,'synthetic-deliberately-wrong')},e=>e.code==='28P01')
  await db.query('insert into mip_mentions.members values($1,session_user,true),($1,$2,true)',[s,aliceName])
  async function capture(text=body){
   const payload={url:'https://synthetic.invalid/occurrences',title:'Synthetic title',outlet:'Synthetic outlet',summary,body_text:text}
   const job=(await db.query("select evidence_pipeline.enqueue('synthetic-entity-occurrences',$1::jsonb) id",[JSON.stringify(payload)])).rows[0].id
   const claimed=(await db.query('select evidence_pipeline.claim_job() result')).rows[0].result
   assert.equal(claimed.id,job)
   const result=(await db.query('select evidence_pipeline.finish_job($1,$2) result',[job,claimed.lease_token])).rows[0].result
   return (await db.query('select id,job_id,article_id,content_hash from evidence_pipeline.article_captures where id=$1',[result.capture_id])).rows[0]
  }
  async function admit(cap,f,sourceField,text){
   const bytes=Buffer.from(text,'utf8')
   await db.query('set role mip_mentions_owner')
   try{await db.query('select mip_mentions.admit_native_field($1,$2,$3,$4,$5,$6,$7,$8,$9)',[s,f,cap.id,cap.job_id,cap.article_id,cap.content_hash,sourceField,sha(bytes),bytes.length])}
   finally{await db.query('reset role')}
   // Fixture-only trusted metadata read; the worker is not granted table/source access.
   const metadata=(await db.query('select to_jsonb(f) field from mip_mentions.fields f where scope=$1 and id=$2',[s,f])).rows[0].field
   assert.equal(metadata.raw,null)
   return {field:metadata,fieldBytes:bytes,outletNames,configurationVersion}
  }
  const cap=await capture(),input=await admit(cap,fieldId,'body_text',body)
  const plan=buildNativeEntityOccurrencePlan(input)
  const access=(allow,f=fieldId)=>admin.query('select mip_mentions.set_field_access($1,$2,$3)',[s,f,allow])
  const readMention=m=>alice.query('select mip_mentions.read_mention($1,$2) result',[s,m.id])
  await t.test('owner admission and explicit source access precede actual mention writes',async()=>{
   assert.equal(plan.occurrences.length,3)
   assert.deepEqual(plan.occurrences.map(x=>x.mention.literal),['Sam Jones','Sam  Jones','Sam Jones'])
   assert.deepEqual(plan.occurrences.map(x=>x.role_prefix),['President',null,null])
   await deny(alice.query(putSQL,params(plan.occurrences[0].mention)))
   await deny(alice.query('select * from evidence_pipeline.article_captures'))
   await deny(alice.query('select mip_mentions.resolve_native_field($1,$2,262144)',[s,fieldId]))
   await access(true)
   for(const o of plan.occurrences){
    const r=(await alice.query(putSQL,params(o.mention))).rows[0].result
    assert.equal(r.mention_id,o.mention.id)
    assert.equal(r.span_hash,sha(o.mention.literal))
    for(const key of ['production_qualified','source_authority_qualified','transport_qualified','publication_allowed'])assert.equal(r[key],false)
   }
   assert.equal((await db.query('select count(*)::int n from mip_mentions.mentions')).rows[0].n,3)
   assert.equal((await db.query('select count(*)::int n from mip_mentions.actors')).rows[0].n,0)
   assert.equal((await db.query('select count(*)::int n from mip_mentions.candidates')).rows[0].n,0)
   assert.equal((await db.query('select count(*)::int n from mip_mentions.decisions')).rows[0].n,0)
  })
  await t.test('deterministic exact retry after real commit/lost result preserves occurrence identities',async()=>{
   // Each original write committed via autocommit. Discard their results, rebuild
   // against the originally supplied configuration and require the original digest.
   const retry=buildNativeEntityOccurrencePlan({...input,expectedPlanDigest:plan.plan_digest})
   assert.deepEqual(retry,plan)
   for(const o of retry.occurrences){
    const first=(await readMention(o.mention)).rows[0].result
    await alice.query(putSQL,params(o.mention))
    assert.deepEqual((await readMention(o.mention)).rows[0].result,first)
   }
   assert.equal((await db.query('select count(*)::int n from mip_mentions.mentions')).rows[0].n,3)
   const original=plan.occurrences[0].mention
   await deny(alice.query(putSQL,params({...original,id:id(98)})))
   await deny(alice.query(putSQL,params({...original,literal:'SAM JONES'})))
   assert.throws(()=>buildNativeEntityOccurrencePlan({...input,outletNames:new Set(['sam jones']),expectedPlanDigest:plan.plan_digest}),/native_entity_occurrence_denied/)
   assert.equal((await db.query('select count(*)::int n from mip_mentions.mentions')).rows[0].n,3,'changed plan writes nothing')
  })
  await t.test('UTF16 offsets, wrong fields, versions, hashes and scopes cannot cross put_mention',async()=>{
   const m=plan.occurrences[0].mention
   const secondary=await admit(cap,summaryId,'summary',summary)
   const otherPlan=buildNativeEntityOccurrencePlan(secondary)
   await access(true,summaryId)
   for(const o of otherPlan.occurrences)await alice.query(putSQL,params(o.mention))
   assert.throws(()=>buildNativeEntityOccurrencePlan({...input,fieldBytes:secondary.fieldBytes}),/native_entity_occurrence_denied/)
   for(const change of [
    {id:id(30),start:m.start+1,end:m.end+1},{id:id(31),end:m.end+10000},
    {id:id(32),field_id:summaryId},{id:id(33),field_id:id(999)},{id:id(34),scope:id(900)},
    {id:id(35),source_version:'latest'},{id:id(36),field_version:'latest'},
    {id:id(37),field_hash:'0'.repeat(64)},{id:id(38),offset_unit:'utf16'},
   ])await deny(alice.query(putSQL,params({...m,...change})))
   // read_mention returns the stored SQL row (start_pos/end_pos), while the
   // producer's put_mention input uses start/end. Verify the complete retained
   // span and source binding after every attempted invalid write above.
   const stored=(await readMention(m)).rows[0].result.mention
   assert.deepEqual(
    [stored.start_pos,stored.end_pos,stored.offset_unit,stored.literal,stored.field_id,
     stored.source_version,stored.field_version,stored.field_hash,stored.span_hash],
    [m.start,m.end,m.offset_unit,m.literal,m.field_id,m.source_version,m.field_version,m.field_hash,sha(m.literal)],
   )
  })
  await t.test('native metadata and nested outputs retain selected literals only',async()=>{
   const metadata=(await db.query('select jsonb_agg(to_jsonb(f)) rows from mip_mentions.fields f')).rows[0].rows
   const reads=[]
   for(const o of plan.occurrences)reads.push((await readMention(o.mention)).rows[0].result)
   const output=JSON.stringify({plan,metadata,reads})
   assert.doesNotMatch(output,/private_sentinel_a129f|base64|fieldBytes|é 😀 President/)
   assert.ok(metadata.every(f=>f.raw===null))
   assert.ok(reads.every(r=>r.mention.speaker===null&&r.mention.addressee===null))
  })
  await t.test('a newer capture never replaces the original exact field or its authorization',async()=>{
   const revisedBody=body+' Ada Lovelace joined.'
   const revised=await capture(revisedBody),revisedInput=await admit(revised,id(80),'body_text',revisedBody)
   const revisedPlan=buildNativeEntityOccurrencePlan(revisedInput)
   assert.equal(revised.article_id,cap.article_id);assert.notEqual(revised.id,cap.id)
   assert.notEqual(revisedPlan.plan_digest,plan.plan_digest)
   assert.notEqual(revisedPlan.occurrences[0].mention.id,plan.occurrences[0].mention.id)
   assert.throws(()=>buildNativeEntityOccurrencePlan({...input,fieldBytes:revisedInput.fieldBytes}),/native_entity_occurrence_denied/)
   await deny(alice.query(putSQL,params({...revisedPlan.occurrences[0].mention,field_id:fieldId})))
   await access(true,id(80))
   for(const o of revisedPlan.occurrences)await alice.query(putSQL,params(o.mention))
   for(const o of plan.occurrences)assert.equal((await readMention(o.mention)).rows[0].result.mention.field_hash,input.field.field_hash)
   await access(false)
   await deny(alice.query(putSQL,params(plan.occurrences[0].mention)))
   await deny(readMention(plan.occurrences[0].mention))
   await alice.query(putSQL,params(revisedPlan.occurrences[0].mention))
   await access(true)
   await admin.query('select mip_mentions.set_membership($1,$2,null)',[s,aliceName])
   await deny(alice.query(putSQL,params(plan.occurrences[0].mention)))
   await admin.query('select mip_mentions.set_membership($1,$2,true)',[s,aliceName])
   await alice.query(putSQL,params(plan.occurrences[0].mention))
  })
 }finally{
  // One cleanup failure must not prevent later owned resources or clients from
  // receiving their cleanup attempt. Report only a static final diagnostic.
  let cleanupFailed=false
  const attempt=async action=>{try{await action()}catch{cleanupFailed=true}}
  if(wrong)await attempt(()=>wrong.end())
  if(alice)await attempt(()=>alice.end())
  if(admin)await attempt(()=>admin.end())
  if(armed&&db){
   await attempt(()=>db.query('reset role'))
   await attempt(()=>db.query('rollback'))
   for(const schema of ['mip_mentions','evidence_pipeline','spatial'])
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
  if(cleanupFailed)throw Error('native_occurrence_fixture_cleanup_failed')
 }
})
