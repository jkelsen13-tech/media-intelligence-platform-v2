import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {extractEntityCandidates,normalizeEntityName} from '../supabase/functions/collector-algorithm-shadow-candidate/predecessorV8.js'
import {EXTRACTOR_VERSION,PREDECESSOR_BLOB,LIMITS,extractEntityOccurrences,buildNativeEntityOccurrencePlan} from '../supabase/qualification/entity-resolution/native-occurrences/entityOccurrences.mjs'
const id=n=>'c6100000-0000-4000-8000-'+String(n).padStart(12,'0')
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
function fixture(text,changes={}){
 const bytes=Buffer.from(text,'utf8'),fh=hash(bytes),capture=id(3),ch='a'.repeat(64)
 const field={scope:id(1),id:id(2),source_version:'native-capture:'+capture+':'+ch,
  field_version:'native-field:utf8:v1:body_text:'+fh,field_hash:fh,raw:null,
  native_capture_id:capture,native_job_id:id(4),native_article_id:id(5),native_content_hash:ch,
  native_source_field:'body_text',native_byte_length:bytes.length,...changes}
 return {field,fieldBytes:bytes,outletNames:new Set(),configurationVersion:'synthetic-outlets-v1'}
}
function aggregate(occurrences){
 const groups=new Map()
 for(const o of occurrences){
  const key=normalizeEntityName(o.literal),old=groups.get(key)
  if(old){
   old.mentions++
   if(!old.role&&o.role_prefix)old.role=o.role_prefix
   if(o.literal.length>old.surface.length)old.surface=o.literal
  }else groups.set(key,{surface:o.literal,role:o.role_prefix,mentions:1})
 }
 return [...groups.values()]
}
const denied=fn=>assert.throws(fn,/native_entity_occurrence_denied/)
test('predecessor source is the unchanged pinned aggregation oracle',async()=>{
 const bytes=await readFile(new URL('../supabase/functions/collector-algorithm-shadow-candidate/predecessorV8.js',import.meta.url))
 const gitBlob=createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex')
 assert.equal(gitBlob,PREDECESSOR_BLOB)
})
test('physical occurrences aggregate to the exact predecessor on adversarial synthetic inputs',()=>{
 const cases=[
  ['e\u0301 😀 President Sam Jones thanked Sam  Jones. Sam Jones spoke.',[]],
  ['Sam-Jones met Sam Jones. Sam-Jones met Sam Jones.',[]],
  ['President Prime Minister Dr Sam Jones met Sam Jones.',[]],
  ['President President President President Sam Jones met Sam Jones.',[]],
  ['U.S. officials met FBI. FBI officials met NATO.',[]],
  ['The London Times reported. Sam Jones spoke. London Times reported.', ['the london times','london times']],
  ['The Government reported in May. Police spoke on Monday.',[]],
  ["Dr Anne O’Neill met Anne O'Neill. Dr Anne O’Neill replied.",[]],
  ['Sam\nJones spoke. Sam\tJones replied.',[]],
  ['Ada Lovelace and Alan Turing spoke. Ada Lovelace replied.',[]],
  ['\uFEFFSam Jones spoke beside Jose\u0301 Perez. Sam Jones replied.',[]],
  ['A B C D E F G spoke. lone lowercase words.',[]],
  ['Alice spoke. Alice replied. Bob watched.',[]],
 ]
 for(const [text,names] of cases){
  const outlets=new Set(names),occurrences=extractEntityOccurrences(text,outlets)
  assert.deepEqual(aggregate(occurrences),extractEntityCandidates(text,outlets),text)
  for(const o of occurrences)assert.equal(Array.from(text).slice(o.start,o.end).join(''),o.literal)
 }
})
test('prefix stripping, repeated/different surfaces and codepoint positions remain physical',()=>{
 const text='e\u0301 😀 President Sam Jones thanked Sam  Jones. Sam Jones spoke.'
 const occurrences=extractEntityOccurrences(text,new Set())
 assert.deepEqual(occurrences.map(o=>o.literal),['Sam Jones','Sam  Jones','Sam Jones'])
 assert.deepEqual(occurrences.map(o=>o.role_prefix),['President',null,null])
 const points=Array.from(text)
 assert.equal(occurrences[0].start,points.join('').indexOf('Sam Jones')-1,'astral codepoint removes one UTF16 unit')
 assert.notEqual(occurrences[0].start,occurrences[2].start)
 assert.deepEqual(aggregate(occurrences),[{surface:'Sam  Jones',role:'President',mentions:3}])
 const prefixes=extractEntityOccurrences('President Prime Minister Dr Sam Jones spoke.',new Set())
 assert.equal(prefixes[0].literal,'Sam Jones')
 assert.equal(prefixes[0].role_prefix,'President Prime Minister Dr')
})
test('exact native plans have deterministic per-occurrence IDs and unresolved participant locators',()=>{
 const input=fixture('e\u0301 😀 President Sam Jones thanked Sam  Jones. Sam Jones spoke. private_sentinel_8fc79')
 const plan=buildNativeEntityOccurrencePlan(input)
 assert.deepEqual(buildNativeEntityOccurrencePlan(input),plan)
 assert.equal(plan.extractor_version,EXTRACTOR_VERSION)
 assert.equal(new Set(plan.occurrences.map(o=>o.mention.id)).size,3)
 for(const o of plan.occurrences){
  assert.match(o.mention.id,/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(o.mention.speaker,null);assert.equal(o.mention.addressee,null)
  assert.equal(o.mention.field_id,input.field.id)
  assert.deepEqual(Object.keys(o.mention).sort(),'scope|id|field_id|source_version|field_version|field_hash|offset_unit|start|end|literal|speaker|addressee'.split('|').sort())
 }
 for(const key of ['production_qualified','source_authority_qualified','transport_qualified','publication_allowed'])assert.equal(plan[key],false)
 assert.doesNotMatch(JSON.stringify(plan),/private_sentinel_8fc79|fieldBytes|base64|actor_id|identity_accepted|confidence/)
 const changed={...input,field:{...input.field,native_job_id:id(9)}}
 assert.notEqual(buildNativeEntityOccurrencePlan(changed).occurrences[0].mention.id,plan.occurrences[0].mention.id)
 // This locally consistent changed envelope is NOT proof of source authority:
 // actual put_mention validates the original owner-admitted binding separately.
 const otherScope={...input,field:{...input.field,scope:id(99)}}
 assert.notEqual(buildNativeEntityOccurrencePlan(otherScope).occurrences[0].mention.id,plan.occurrences[0].mention.id)
 assert.ok(Object.isFrozen(plan)&&Object.isFrozen(plan.occurrences)&&Object.isFrozen(plan.occurrences[0].mention))
})
test('missing/stale/hash/field/shape discrepancies fail without source-text diagnostics',()=>{
 const input=fixture('Sam Jones spoke. Sam Jones replied.')
 for(const changes of [
  {scope:'not-a-uuid'},{id:null},{native_capture_id:id(77)},{native_content_hash:'b'.repeat(64)},
  {source_version:'latest'},{field_version:'latest'},{field_hash:'0'.repeat(64)},
  {native_source_field:'summary'},{native_source_field:'combined'},{native_byte_length:1},
  {raw:'durable-copy'},{extra:'unexpected'},
 ])denied(()=>buildNativeEntityOccurrencePlan({...input,field:{...input.field,...changes}}))
 const missing={...input.field};delete missing.native_job_id
 denied(()=>buildNativeEntityOccurrencePlan({...input,field:missing}))
 denied(()=>buildNativeEntityOccurrencePlan({...input,fieldBytes:Buffer.from('tampered_field_sentinel')}))
 denied(()=>buildNativeEntityOccurrencePlan({...input,fieldBytes:input.fieldBytes.toString('base64')}))
 denied(()=>buildNativeEntityOccurrencePlan({...input,outletNames:[]}))
 denied(()=>buildNativeEntityOccurrencePlan({...input,outletNames:new Set(['Unnormalized Outlet'])}))
 try{buildNativeEntityOccurrencePlan({...input,fieldBytes:Buffer.from('tampered_field_sentinel')})}catch(e){
  assert.equal(e.message,'native_entity_occurrence_denied')
  assert.doesNotMatch(JSON.stringify(e),/tampered_field_sentinel/)
 }
})
test('UTF8 scalar validation preserves BOM and combining bytes rather than normalizing',()=>{
 const input=fixture('\uFEFFe\u0301 😀 Sam Jones spoke. Sam Jones replied.')
 const plan=buildNativeEntityOccurrencePlan(input)
 assert.equal(plan.occurrences[0].mention.start,6)
 denied(()=>buildNativeEntityOccurrencePlan({...input,fieldBytes:Buffer.from(input.fieldBytes.toString().normalize('NFC'))}))
 for(const bytes of [Buffer.from([0xc3,0x28]),Buffer.from([0xed,0xa0,0x80]),Buffer.from([0])]){
  const f=fixture('x')
  f.fieldBytes=bytes;f.field.field_hash=hash(bytes);f.field.native_byte_length=bytes.length
  f.field.field_version='native-field:utf8:v1:body_text:'+f.field.field_hash
  denied(()=>buildNativeEntityOccurrencePlan(f))
 }
 denied(()=>extractEntityOccurrences('\uD800',new Set()))
})
test('all budgets refuse the complete plan; no silent truncation or partial result',()=>{
 assert.equal(buildNativeEntityOccurrencePlan(fixture('x'.repeat(LIMITS.fieldBytes))).occurrences.length,0)
 denied(()=>buildNativeEntityOccurrencePlan(fixture('x'.repeat(LIMITS.fieldBytes+1))))
 assert.equal(extractEntityOccurrences('Sam Jones said. '.repeat(LIMITS.occurrences),new Set()).length,LIMITS.occurrences)
 denied(()=>extractEntityOccurrences('Sam Jones said. '.repeat(LIMITS.occurrences+1),new Set()))
 assert.equal(extractEntityOccurrences('The. '.repeat(LIMITS.regexMatches),new Set()).length,0)
 denied(()=>extractEntityOccurrences('The. '.repeat(LIMITS.regexMatches+1),new Set()))
 denied(()=>extractEntityOccurrences('Sam Jones',new Set(Array.from({length:LIMITS.outletNames+1},(_,i)=>'outlet '+i))))
 denied(()=>extractEntityOccurrences('Sam Jones',new Set(['x'.repeat(LIMITS.outletNameBytes+1)])))
})

test('configuration and complete plan identity bind exact replay without changing shared physical IDs',()=>{
 const input=fixture('Sam Jones thanked Ada Lovelace. Sam Jones spoke. private_sentinel_8fc79')
 const first=buildNativeEntityOccurrencePlan({...input,outletNames:new Set(['unused outlet','another outlet'])})
 const reordered=buildNativeEntityOccurrencePlan({...input,outletNames:new Set(['another outlet','unused outlet']),expectedPlanDigest:first.plan_digest})
 assert.deepEqual(reordered,first)
 assert.deepEqual(buildNativeEntityOccurrencePlan({...input,outletNames:new Set(['unused outlet','another outlet']),expectedPlanDigest:first.plan_digest}),first)
 const changed=buildNativeEntityOccurrencePlan({...input,outletNames:new Set(['ada lovelace'])})
 assert.notEqual(changed.configuration_digest,first.configuration_digest)
 assert.notEqual(changed.input_digest,first.input_digest)
 assert.notEqual(changed.result_digest,first.result_digest)
 assert.notEqual(changed.plan_digest,first.plan_digest)
 const sam=plan=>plan.occurrences.filter(o=>o.mention.literal==='Sam Jones').map(o=>o.mention.id)
 assert.deepEqual(sam(changed),sam(first),'filter configuration is plan identity, not physical occurrence identity')
 denied(()=>buildNativeEntityOccurrencePlan({...input,outletNames:new Set(['ada lovelace']),expectedPlanDigest:first.plan_digest}))
 denied(()=>buildNativeEntityOccurrencePlan({...input,configurationVersion:'synthetic-outlets-v2',expectedPlanDigest:first.plan_digest}))
 denied(()=>buildNativeEntityOccurrencePlan({...input,configurationVersion:undefined}))
 denied(()=>buildNativeEntityOccurrencePlan({...input,expectedPlanDigest:'invalid'}))
 const equivalentResult=buildNativeEntityOccurrencePlan({...input,outletNames:new Set(['other unused'])})
 assert.equal(equivalentResult.result_digest,first.result_digest)
 assert.notEqual(equivalentResult.configuration_digest,first.configuration_digest)
 assert.notEqual(equivalentResult.plan_digest,first.plan_digest)
 assert.doesNotMatch(JSON.stringify(first),/unused outlet|another outlet|private_sentinel_8fc79/)
})
