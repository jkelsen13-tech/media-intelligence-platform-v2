import test from 'node:test'
import assert from 'node:assert/strict'
import {prepareCollection,evaluateCollection,removeDisplaySuffix} from '../scripts/evaluateCaptureCollection.mjs'
const row=(id,title,summary,feed='the-guardian')=>({id:`00000000-0000-0000-0000-${String(id).padStart(12,'0')}`,feed,source_status:'active',fetched_at:'2026-09-06T00:00:00Z',published_at:'2026-08-01T00:00:00Z',url:`https://example.org/${id}`,title,outlet:'Synthetic fixture',summary,body_text:summary})
const x=row(1,'Orchestra rehearsal','Orchestra violin rehearsal performance musicians concert acoustics harmony ensemble. Continue reading...')
const y=row(2,'Wetlands restoration','Wetlands riverbank restoration habitat wildlife ecology environment conservation biodiversity. Continue reading...')
test('source qualification rejects metadata and preserves honest text extent and clocks',()=>{
 const r=prepareCollection([x,y,row(3,'Metadata','GDELT structured event record; not publisher article text.','gdelt-events-export')])
 assert.equal(r.accepted.length,2);assert.equal(r.rejected.length,1)
 assert.equal(r.accepted[0].text_extent,'body_repeats_summary');assert.equal(r.accepted[0].original_fetched_at,x.fetched_at)
 assert.deepEqual(r.accepted[0].article.body_text,x.body_text)
 const metadata={...row(4,'Record','GDELT structured event record. This is not publisher article text.'),feed:'the-guardian'}
 assert.equal(prepareCollection([x,y,metadata]).rejected[0].reason,'metadata_not_publisher_text')
 assert.throws(()=>prepareCollection([x,x]),/duplicate/)
})
test('suffix filtering never rewrites meaningful narrative or original source',()=>{
 assert.equal(removeDisplaySuffix(x).summary,x.summary.replace(' Continue reading...',''))
 const prose={summary:'Teachers continue reading studies to pupils.',body_text:null}
 assert.deepEqual(removeDisplaySuffix(prose),prose);assert.ok(x.summary.endsWith('Continue reading...'))
})
test('actual SQL retriever exposes boilerplate-only match and experiment removes it',async()=>{
 const collection=prepareCollection([x,y]);const r=await evaluateCollection(collection)
 assert.equal(r.expected_pairs,1);assert.equal(r.final_pairs,1);assert.equal(r.counts.retrieval_candidate,1)
 assert.equal(r.display_suffix_experiment.retained_candidates,0);assert.equal(r.semantic_accuracy,null)
 assert.equal(r.cross_wave_candidates,1)
 collection.accepted[0].article.summary='Altered'
 await assert.rejects(evaluateCollection(collection),/fingerprint/)
})
