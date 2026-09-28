import {DISPLAY_SCHEMA} from '../supabase/qualification/native-comparison-display/displayContract.mjs';
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
export {uuid,hash,expected,fixture};
