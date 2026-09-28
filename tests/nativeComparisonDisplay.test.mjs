import test from 'node:test';
import assert from 'node:assert/strict';
import {DISPLAY_SCHEMA,validateDisplay,buildPrivateWorkspace} from '../supabase/qualification/native-comparison-display/displayContract.mjs';
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const hash='a'.repeat(64),expected={scope:uuid(1),binding_id:uuid(2),manifest_hash:hash};
function make(spec){
 if(Array.isArray(spec))return [];
 if(spec&&typeof spec==='object'){
  if(spec.$nullable)return null;
  return Object.fromEntries(Object.entries(spec).map(([k,s])=>[k,make(s)]));
 }
 if(spec.endsWith('?'))return null;
 return spec==='uuid'?uuid(1):spec==='hash'?hash:spec==='number'?1:spec==='boolean'?false:spec==='url'?'https://synthetic.invalid/source':'synthetic';
}
function fixture(){
 const v=make(DISPLAY_SCHEMA),p=v.private_projection,c=v.comparison;
 Object.assign(v,expected,{contract:'native-comparison-display-private-v1'});
 Object.assign(v.identity,{native_generation_id:uuid(3),projection_id:uuid(4),projection_review_id:uuid(5),comparison_generation_id:uuid(6),
 comparison_event_id:uuid(7),comparison_review_revision:uuid(8),comparison_policy_revision:uuid(9),release_request:uuid(10)});
 Object.assign(p.review,{review_id:uuid(5),disposition:'accepted_private'});
 Object.assign(p.display,{contract:'native-private-arc-display-v1',projection_id:uuid(4),article_id:uuid(11),state:'pending_private'});
 p.display.vector.state='absent';
 Object.assign(c.event,{id:uuid(7),comparison_validation_state:'approved',status:'active'});
 Object.assign(c.occurrence,{kind:'event_occurrence',state:'unverified',start:null,end:null,precision:'unknown'});
 for(let n=11;n<=12;n++){
  const source=make(DISPLAY_SCHEMA.comparison.sources[0]);Object.assign(source,{article_id:uuid(n),capture_id:uuid(n+10)});
  c.sources.push(source);
  const e=make(DISPLAY_SCHEMA.comparison.evidence[0]);
  Object.assign(e,{article_id:uuid(n),capture_id:uuid(n+10),claim_key:'claim-1',candidate_id:uuid(n+20),review_revision:uuid(8),
   source_field:'body_text',span_units:'unicode_code_points',span_start:3,span_end:6,excerpt:'A😀é'});
  c.evidence.push(e);
 }
 const claim=make(DISPLAY_SCHEMA.comparison.claims[0]);Object.assign(claim,{event_id:uuid(7),claim_key:'claim-1',status:'active'});c.claims.push(claim);
 const explanation=make(DISPLAY_SCHEMA.comparison.explanations[0]);explanation.assertion_id='sc:claim_grouping:'+uuid(7)+':0:'+uuid(11);c.explanations.push(explanation);
 return v;
}
test('exact private identity and reviewed physical evidence survive the bounded DTO',()=>{
 const v=fixture(),out=validateDisplay(v,expected);
 assert.equal(out.identity.comparison_event_id,uuid(7));assert.equal(out.private_projection.display.article_id,uuid(11));
 assert.equal(out.comparison.evidence[0].excerpt,'A😀é');assert.ok(Object.isFrozen(out.comparison.evidence[0]));
});
test('private timeline preserves News publication attribution and separate event identity',()=>{
 const v=fixture();v.private_projection.display.source.published_at='2026-01-02';
 const model=buildPrivateWorkspace(v,expected);
 assert.equal(model.timeline.identity_kind,'private_news_record');assert.equal(model.timeline.date_kind,'publisher_publication');
 assert.equal(model.timeline.publication,'2026-01-02');assert.equal(model.timeline.event_occurrence.start,null);
 assert.equal(model.arc.identity_kind,'private_projection');assert.equal(model.comparison.event.id,uuid(7));
 assert.equal(model.publication_allowed,false);
});
test('unknown top-level and nested body/debug objects refuse rather than leak',()=>{
 for(const mutate of [v=>v.body='BODY_SENTINEL',v=>v.comparison.evidence[0].payload={body:'BODY_SENTINEL'},
 v=>v.private_projection.display.source.secret='BODY_SENTINEL',v=>v.comparison.explanations[0].archived_sources=[{payload:'BODY_SENTINEL'}]]){
  const v=fixture();mutate(v);assert.throws(()=>validateDisplay(v,expected),{message:'native_comparison_display_refused'});
 }
});
test('binding/hash/head/field/span mismatches refuse',()=>{
 const mutations=[v=>v.manifest_hash='b'.repeat(64),v=>v.scope=uuid(99),v=>v.private_projection.review.review_id=uuid(99),
 v=>v.comparison.evidence[0].capture_id=uuid(99),v=>v.comparison.evidence[0].review_revision=uuid(99),
 v=>v.comparison.evidence[0].source_field='body',v=>v.comparison.evidence[0].span_end=7];
 for(const mutate of mutations){const v=fixture();mutate(v);assert.throws(()=>validateDisplay(v,expected))}
});
test('publication flags, temporal promotion and duplicate source identities refuse',()=>{
 for(const mutate of [v=>v.publication_allowed=true,v=>v.private_projection.display.attached=true,
 v=>v.comparison.occurrence.state='confirmed',v=>v.comparison.occurrence.start='2026-01-01',
 v=>v.comparison.retained_event_date_proxy.occurrence_verified=true,v=>v.comparison.sources[1]=v.comparison.sources[0]]){
  const v=fixture();mutate(v);assert.throws(()=>validateDisplay(v,expected));
 }
});
test('collection, passage, URL and nonfinite bounds refuse whole output without truncation',()=>{
 for(const mutate of [v=>v.comparison.sources=Array(33).fill(v.comparison.sources[0]),
 v=>v.comparison.evidence[0].excerpt='x'.repeat(65537),v=>v.comparison.sources[0].publisher_url='javascript:alert(1)',
 v=>v.private_projection.display.source.url='https://user:secret@synthetic.invalid',
 v=>v.private_projection.review.version=Infinity]){
  const v=fixture();mutate(v);assert.throws(()=>validateDisplay(v,expected));
 }
});
test('corrected claims retain exact selected evidence links and correction records',()=>{
 const v=fixture(),link=make(DISPLAY_SCHEMA.comparison.evidence_links[0]),correction=make(DISPLAY_SCHEMA.comparison.corrections[0]);
 Object.assign(link,{claim_key:'claim-1',linked_from_article_id:uuid(11)});
 Object.assign(correction,{claim_key:'claim-1',correcting_article_id:uuid(12),correction_text:'Synthetic correction'});
 v.comparison.evidence_links.push(link);v.comparison.corrections.push(correction);
 const out=validateDisplay(v,expected);assert.equal(out.comparison.corrections[0].correction_text,'Synthetic correction');
 v.comparison.corrections[0].claim_key='different';assert.throws(()=>validateDisplay(v,expected));
});
