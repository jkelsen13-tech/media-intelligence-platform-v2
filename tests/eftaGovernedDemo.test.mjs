import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateReviewProposal,comparisonDependency,releasePublic,PUBLIC_RELEASE_ENABLED} from '../supabase/qualification/mip-cutover-authority/eftaReviewContract.mjs';
const manifest=JSON.parse(readFileSync(new URL('../verifier/efta-governed-demo/manifest.json',import.meta.url)));
const registry=[{namespace:'test:institution',id:'test-only-doj',kind:'institution',state:'resolved',resolution_revision:'test-only'}];
function fixture(index=0) {
 const r=manifest.sources[index];
 return {proposal:{...r,uncertainty:r.remaining_uncertainty,reviewer:'synthetic reviewer',reason:'test only',
 action:'propose_review',reviewed_at:'2026-09-16T20:00:00Z',publication_allowed:false,
 event_time:{date:r.source_date,precision:'day',reviewed:true,evidence_basis:'synthetic review of document date',uncertainty:'day only'},
 entity:{namespace:registry[0].namespace,id:registry[0].id}},
 retained:{...r,current:true,state:'retained',fields:{body_text:r.excerpt}}};
}
test('only seven proposals; no admission or public release',()=>{
 assert.equal(manifest.sources.length,7);assert.equal(PUBLIC_RELEASE_ENABLED,false);
 for(let i=0;i<7;i++){const f=fixture(i);const p=validateReviewProposal(f.proposal,f.retained,registry);
 assert.equal(p.state,'review_proposal_only');assert.equal(p.world_view.state,'absent');assert.equal(p.publication_allowed,false)}
 assert.throws(releasePublic,/disabled/);
});
for(const key of ['candidate_id','capture_id','article_id','content_hash','url','span_start','span_end','source_field','excerpt','origin_id','dependency_id','semantic_kind']){
 test('reject substituted '+key,()=>{const f=fixture();f.proposal[key]='substituted';assert.throws(()=>validateReviewProposal(f.proposal,f.retained,registry))});
}
for(const change of [
 {current:false},{state:'pending'},{state:'withdrawn'},{replaced_by:'replacement'},
 {candidate_id:'other'},{capture_id:'other'},{article_id:'other'},{content_hash:'other'},{url:'other'},
 {fields:{body_text:'changed bytes'}}
]){
 test('reject stale retained input '+JSON.stringify(change),()=>{const f=fixture();Object.assign(f.retained,change);assert.throws(()=>validateReviewProposal(f.proposal,f.retained,registry))});
}
for(const change of [{reviewer:''},{reason:''},{uncertainty:''},{action:'publish'},{reviewed_at:'invalid'},{publication_allowed:true},{geography:{lat:0,lng:0}}]){
 test('reject missing review / public authority '+JSON.stringify(change),()=>{const f=fixture();Object.assign(f.proposal,change);assert.throws(()=>validateReviewProposal(f.proposal,f.retained,registry))});
}
test('identity must resolve once to an institution revision',()=>{
 const f=fixture();for(const rows of [[],[...registry,...registry],[{...registry[0],kind:'person'}],[{...registry[0],state:'ambiguous'}],[{...registry[0],resolution_revision:null}]]){
 assert.throws(()=>validateReviewProposal(f.proposal,f.retained,rows));}
});
test('source publication timestamp cannot substitute event-time review',()=>{
 const f=fixture();for(const patch of [{reviewed:false},{evidence_basis:'published_at'},{uncertainty:''},{date:null},{precision:'instant'}]){
 assert.throws(()=>validateReviewProposal({...f.proposal,event_time:{...f.proposal.event_time,...patch}},f.retained,registry));}
});
test('Jan30 same-origin pair never counts as corroboration',()=>{
 const pair=comparisonDependency(manifest.sources[3].candidate_id,manifest.sources[4].candidate_id);
 assert.equal(pair.dependent,true);assert.equal(pair.corroboration,false);
});
test('receipt proposals preserve separate milestone dates',()=>{
 assert.equal(manifest.sources[5].source_date,'2026-04-23');
 assert.equal(manifest.sources[6].source_date,'2026-08-27');
 assert.match(manifest.sources[6].remaining_uncertainty,/Signed August 21, filed August 26, published August 27/);
 assert.ok(manifest.sources.every(s=>s.published_at===null));
});
