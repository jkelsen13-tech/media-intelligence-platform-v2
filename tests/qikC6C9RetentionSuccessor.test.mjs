import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {buildNativeEntityOccurrencePlan} from '../supabase/qualification/entity-resolution/native-occurrences/entityOccurrences.mjs'
import {prepareArcMembership} from '../supabase/qualification/arc-membership-prepared/prepare.mjs'
import {admitHistoricalArc,readHistoricalArc} from '../supabase/qualification/arc-membership-retained/retained.mjs'
import {fixture,requests,id,fakeClient} from '../supabase/qualification/arc-membership-prepared/syntheticFixture.mjs'
const manifest=JSON.parse(await readFile(new URL('../verifier/qik-c6-c9-retention-successor.json',import.meta.url),'utf8'))
const allow=manifest.output_allowlists
const exact=(object,names)=>assert.deepEqual(Object.keys(object).sort(),[...names].sort())
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
function arcResult(result,retained=false){
 exact(result,[...allow.arc_prepared,...(retained?allow.arc_retained_extra:[])])
 exact(result.counts,allow.counts)
 exact(result.audit,allow.audit)
 result.audit.sample.forEach(row=>exact(row,allow.audit_sample))
 for(const score of result.scores){
  exact(score,allow.score);exact(score.signals,allow.signals)
  exact(score.evidence,allow.evidence);exact(score.release_gate,allow.release_gate)
  Object.values(score.signals).forEach(value=>assert.ok(typeof value==='number'&&Number.isFinite(value)))
 }
 for(const key of ['native_lineage_qualified','approval_allowed','publication_allowed','scores_persisted'])assert.equal(result[key],false)
}
test('successor native plan uses exact nested allowlist with only necessary selected spans',()=>{
 const text='e\u0301 😀 President Sam Jones spoke. Sam Jones replied. payload_sentinel_retention_4af1'
 const bytes=Buffer.from(text),hash=sha(bytes),capture=id(3),contentHash='a'.repeat(64)
 const field={scope:id(1),id:id(2),source_version:'native-capture:'+capture+':'+contentHash,
  field_version:'native-field:utf8:v1:body_text:'+hash,field_hash:hash,raw:null,
  native_capture_id:capture,native_job_id:id(4),native_article_id:id(5),
  native_content_hash:contentHash,native_source_field:'body_text',native_byte_length:bytes.length}
 const result=buildNativeEntityOccurrencePlan({field,fieldBytes:bytes,outletNames:new Set(),configurationVersion:'synthetic-outlet-v1'})
 exact(result,allow.native_plan)
 result.occurrences.forEach(row=>{
  exact(row,allow.native_occurrence);exact(row.mention,allow.native_mention)
  assert.equal(row.mention.speaker,null);assert.equal(row.mention.addressee,null)
  assert.equal(Array.from(text).slice(row.mention.start,row.mention.end).join(''),row.mention.literal)
 })
 assert.doesNotMatch(JSON.stringify(result),/payload_sentinel_retention_4af1|fieldBytes|base64/)
 assert.equal(field.raw,null)
 for(const key of ['production_qualified','source_authority_qualified','transport_qualified','publication_allowed'])assert.equal(result[key],false)
})
test('successor arc outputs and deliberately retained input satisfy full nested allowlists',async()=>{
 const data=fixture(),stored=new Map(),connection={connectionString:'postgres://synthetic:synthetic@localhost/mip_arc_retained_test'}
 for(const row of data.articles){row.body_text='BODY_SENTINEL_RETENTION_91';row.url='URL_SENTINEL_RETENTION_91';row.generation_evidence={payload:'NESTED_SENTINEL_RETENTION_91'}}
 const plain=fakeClient(data)
 const input={connection,sourceKind:'historical_public',requests:requests(data)}
 const prepared=await prepareArcMembership(input,{ClientClass:plain.Client});arcResult(prepared)
 const transport=fakeClient(data,{override:(_name,sql,args)=>{
  if(!sql.includes('arc-retained:'))return
  if(sql.includes(':authority'))return {rows:[]}
  const key=args[0]+'|'+args[1]
  if(sql.includes(':admit')){stored.set(key,{canonical_input:args[3],input_sha256:args[2]});return {rows:[]}}
  return {rows:stored.has(key)?[stored.get(key)]:[]}
 }})
 const retainedInput={...input,scope:id(901),generation:id(902),expectedInputHash:prepared.input_sha256}
 const result=await admitHistoricalArc(retainedInput,{ClientClass:transport.Client});arcResult(result,true)
 const raw=[...stored.values()][0],envelope=JSON.parse(raw.canonical_input),fields=manifest.historical_arc_input
 exact(raw,['canonical_input','input_sha256']);exact(envelope,fields.top)
 for(const name of ['candidates','arcs','articles','members','entities'])envelope[name].forEach(row=>exact(row,fields[name]))
 for(const name of ['floor','release','audit'])exact(envelope[name],fields[name])
 assert.equal(sha(raw.canonical_input),result.input_sha256)
 assert.equal(envelope.articles.find(row=>row.id===data.articles[0].id).title,data.articles[0].title,'retained original title is required replay input')
 assert.doesNotMatch(raw.canonical_input,/BODY_SENTINEL_RETENTION_91|URL_SENTINEL_RETENTION_91|NESTED_SENTINEL_RETENTION_91/)
 assert.ok(!JSON.stringify(result).includes(data.articles[0].title),'metadata/scorer receipt excludes retained source text')
 data.articles[0].title='CHANGED_LATEST_SENTINEL'
 assert.deepEqual(await readHistoricalArc(retainedInput,{ClientClass:transport.Client}),result)
 assert.equal(stored.size,1)
})
test('successor remains separate from unchanged historical acceptance assertions',async()=>{
 assert.match(manifest.status,/UNAPPROVED SUCCESSOR ALLOWLIST/)
 assert.equal(manifest.authorization.individual_owner_field_signature,false)
 assert.equal(manifest.authorization.historical_acceptance,false)
 assert.equal(manifest.authorization.actual_material_transmission_authority_from_this_manifest,false)
 const files=[
  ['verifier/efta-postgres-qualification-manifest.json',manifest.protections.historical_manifest_sha256],
  ['verifier/eftaPostgresQualification.py',manifest.protections.historical_verifier_sha256],
 ]
 for(const [path,digest] of files)assert.equal(sha(await readFile(new URL('../'+path,import.meta.url))),digest)
})
