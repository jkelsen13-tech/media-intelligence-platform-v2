import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {validateExactMention,validateCandidate,validateDecision,QUALIFICATION} from '../../supabase/qualification/entity-resolution/mentionContract.mjs'
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const digest=b=>createHash('sha256').update(b).digest('hex')
const text='A😀 Sam spoke to Sam.'
const bytes=Buffer.from(text)
const field={scope:id(1),id:id(2),source_version:'source-v1',field_version:'field-v1',field_hash:digest(bytes),base64:bytes.toString('base64'),...QUALIFICATION}
const mention=()=>({scope:id(1),id:id(3),field_id:id(2),source_version:'source-v1',field_version:'field-v1',field_hash:field.field_hash,offset_unit:'unicode_code_point',start:3,end:6,literal:'Sam',speaker:{kind:'unresolved',id:null},addressee:null})
test('each literal occurrence has a separate immutable identity and Unicode code-point location',()=>{
 const a=mention(),b={...mention(),id:id(4),start:16,end:19}
 assert.equal(Array.from(text).slice(b.start,b.end).join(''),'Sam')
 assert.notEqual(validateExactMention(a,field).mention_id,validateExactMention(b,field).mention_id)
 assert.equal(validateExactMention(a,field).production_qualified,false)
})
test('scope, source version, field version, hash, bounds and unsupported offset units fail closed',()=>{
 for(const patch of [{scope:null},{scope:id(9)},{source_version:'latest'},{field_version:'similar'},
 {field_hash:'0'.repeat(64)},{start:4,end:7},{offset_unit:'utf16'},{end:999},{start:-1},{start:3.1},{literal:'sam'}])
  assert.throws(()=>validateExactMention({...mention(),...patch},field))
})
test('invalid UTF8/base64, normalization substitution and unpaired surrogates are refused',()=>{
 assert.throws(()=>validateExactMention(mention(),{...field,base64:field.base64+'\n'}))
 const invalid=Buffer.from([255]);assert.throws(()=>validateExactMention({...mention(),field_hash:digest(invalid)},
 {...field,field_hash:digest(invalid),base64:invalid.toString('base64')}))
 const raw=Buffer.from('e\u0301');const f={...field,field_hash:digest(raw),base64:raw.toString('base64')}
 assert.throws(()=>validateExactMention({...mention(),field_hash:f.field_hash,start:0,end:2,literal:'é'},f))
 assert.throws(()=>validateExactMention({...mention(),literal:'\ud800'},field))
})
test('unknown envelope keys, false authority claims and resource bounds are denied',()=>{
 assert.throws(()=>validateExactMention(mention(),{...field,summary:'similar passage'}))
 for(const key of Object.keys(QUALIFICATION))assert.throws(()=>validateExactMention(mention(),{...field,[key]:true}))
 assert.throws(()=>validateExactMention(mention(),field,{maxFieldBytes:2}))
 for(const maxFieldBytes of [0,1.5,2097153,Number.MAX_SAFE_INTEGER,Infinity])
  assert.throws(()=>validateExactMention(mention(),field,{maxFieldBytes}))
})
test('speaker/addressee may remain unresolved, but malformed forced references are denied',()=>{
 assert.ok(validateExactMention(mention(),field))
 for(const ref of [{kind:'actor',id:id(6)},{kind:'actor',id:null},{kind:'name',id:'Sam'},{kind:'unresolved',id:id(4)},{kind:'actor',id:id(5),name:'Sam'}])
  assert.throws(()=>validateExactMention({...mention(),speaker:ref},field))
})
const candidate=()=>({scope:id(1),id:id(5),mention_id:id(3),actor_id:id(6),version:1,predecessor_id:null,rank:1,supporting_mentions:[id(4)],conflicting_mentions:[],method:'synthetic-context-v1'})
test('multiple candidate actors/ranks retain supporting/conflicting references but never accept identity',()=>{
 assert.equal(validateCandidate(candidate()).identity_accepted,false)
 assert.equal(validateCandidate({...candidate(),id:id(7),actor_id:id(8),rank:2,supporting_mentions:[],conflicting_mentions:[id(4)]}).identity_accepted,false)
 for(const patch of [{scope:null},{version:2},{supporting_mentions:[id(4),id(4)]},{conflicting_mentions:[id(4)]},{rank:0}])
  assert.throws(()=>validateCandidate({...candidate(),...patch}))
})
test('decisions distinguish unresolved/rejected/accepted and require explicit version/predecessor',()=>{
 const d={scope:id(1),id:id(9),mention_id:id(3),version:1,predecessor_id:null,status:'unresolved',candidate_id:null,reason:'No distinguishing context'}
 assert.equal(validateDecision(d).publication_allowed,false)
 assert.ok(validateDecision({...d,version:2,predecessor_id:id(9),id:id(10),status:'accepted',candidate_id:id(5)}))
 assert.ok(validateDecision({...d,status:'rejected'}))
 for(const patch of [{status:'accepted'},{version:2},{status:'probably'},{candidate_id:id(5)}])
  assert.throws(()=>validateDecision({...d,...patch}))
})
