import test from 'node:test'
import assert from 'node:assert/strict'
import { changedTextInterval, retainedSourceSpans, SPAN_TEXT_LIMIT } from '../supabase/functions/investigation-source-spans/spans.mjs'
import { createSourceSpansHandler } from '../supabase/functions/investigation-source-spans/handler.mjs'
import { sourceSpansMatch, sourceSpanSelection, createInvestigationSourceSpansClient } from '../src/lib/investigationSourceSpansClient.js'
import { FIXTURE_BUNDLES } from '../src/lib/investigationWorkspaceFixtures.js'

export function spanFixture() {
  const bundle = structuredClone(FIXTURE_BUNDLES.comparable)
  bundle.observation.snapshot.inputs.find(i => i.position === '1').capture.payload.summary = '💡 Up to 17%.'
  bundle.observation.snapshot.inputs.find(i => i.position === '2').capture.payload.summary = '💡 17%.'
  return bundle
}
test('qualifiers, Unicode, polarity, numeric scope and whitespace remain literal code-point intervals', () => {
  assert.deepEqual(changedTextInterval('💡 Up to 17%.', '💡 17%.'), { status: 'different', left: { start: 2, end: 8 }, right: { start: 2, end: 2 } })
  for (const [a, b] of [['May 2019: not observed.', 'May 2020: observed.'], ['1,000 kg', '1000 g'], ['e\u0301', 'é'], ['word ', 'word'], ['','x'], ['x','']]) {
    const row = changedTextInterval(a, b), x = Array.from(a), y = Array.from(b)
    assert.equal(row.status, 'different')
    assert.equal(x.slice(0, row.left.start).join('') + y.slice(row.right.start, row.right.end).join('') + x.slice(row.left.end).join(''), b)
  }
})
test('exhaustive short repeated and Unicode strings reconstruct every difference without overlapping prefix and suffix', () => {
  const strings = ['']; let level = ['']
  for (let n = 0; n < 3; n++) { level = level.flatMap(p => ['a', '💡', ' ', '\u0301'].map(c => p + c)); strings.push(...level) }
  for (const a of strings) for (const b of strings) {
    const row = changedTextInterval(a, b)
    if (a === b) { assert.equal(row.status, 'equal'); continue }
    const x = Array.from(a), y = Array.from(b)
    assert.ok(row.left.start <= row.left.end && row.right.start <= row.right.end)
    assert.equal(x.slice(0,row.left.start).join('') + y.slice(row.right.start,row.right.end).join('') + x.slice(row.left.end).join(''), b)
  }
})
test('missing, empty and oversized text remain distinct, with a fixed allocation bound', () => {
  assert.deepEqual(changedTextInterval(undefined, ''), { status: 'text_unavailable' })
  assert.deepEqual(changedTextInterval(null, null), { status: 'text_unavailable' })
  assert.deepEqual(changedTextInterval('', ''), { status: 'equal' })
  assert.equal(changedTextInterval('a'.repeat(SPAN_TEXT_LIMIT), 'b').status, 'different')
  assert.deepEqual(changedTextInterval('a'.repeat(SPAN_TEXT_LIMIT + 1), 'b'), { status: 'limit_exceeded' })
})
test('only exact retained article identities in the saved observation can be compared', () => {
  const bundle = spanFixture(), baseline = structuredClone(bundle)
  const result = retainedSourceSpans(bundle, '1', '2')
  assert.equal(sourceSpansMatch(bundle, '1', '2', result), true)
  assert.deepEqual(bundle, baseline)
  for (const [left,right] of [['1','3'], ['1','missing'], ['1','1'], [1,'2']]) assert.throws(() => retainedSourceSpans(bundle,left,right), /input_unavailable/)
  const older = structuredClone(bundle); older.observation.snapshot.inputs = older.observation.snapshot.inputs.filter(i=>i.position!=='2')
  assert.throws(()=>retainedSourceSpans(older,'1','2'),/input_unavailable/)
})
test('browser rejects fabricated spans, swapped pairs, stale identities, false missing states and semantic labels', () => {
  const bundle = spanFixture(), result = retainedSourceSpans(bundle,'1','2')
  for (const mutate of [r=>{r.version_id='other'}, r=>{r.observation_id='other'}, r=>{r.left_position='2'}, r=>{r.article_id='other'},
    r=>{r.method='semantic_correction'}, r=>{r.assessment_effect='reassessed'}, r=>{r.publicly_eligible=true}, r=>{r.text_limit=Infinity},
    r=>{r.fields[1].left.start=-1}, r=>{r.fields[1].left.end=999}, r=>{r.fields[1].right.end=3}, r=>{r.fields[1].left.start=2.5},
    r=>{r.fields[1].status='equal'}, r=>{r.fields[1].status='text_unavailable'}, r=>{r.fields[1]=null}, r=>r.fields.reverse(), r=>r.fields.push(r.fields[0])]) {
    const changed=structuredClone(result); mutate(changed); assert.equal(sourceSpansMatch(bundle,'1','2',changed),false)
  }
  assert.equal(sourceSpanSelection(bundle,'1','summary',{start:2,end:8}).reference.excerpt,'Up to ')
  assert.equal(sourceSpanSelection(bundle,'2','summary',{start:2,end:2}).reference.excerpt,'')
  assert.equal(sourceSpanSelection(bundle,'1','url',{start:0,end:1}),null)
})
test('source-span adapter shares read-only Auth/version boundary and rejects all browser-supplied configuration', async () => {
  const bundle = spanFixture(), calls=[]
  const handler = createSourceSpansHandler({ authenticate: async()=>({id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}),
    rpc: async (action,input)=>{calls.push({action,input});return {data:bundle}} })
  const make = body=>new Request('https://fixture.test',{method:'POST',headers:{authorization:'Bearer fixture','content-type':'application/json'},body:JSON.stringify(body)})
  const client=createInvestigationSourceSpansClient({functions:{invoke:async(name,options)=>{
    assert.equal(name,'investigation-source-spans'); const response=await handler(make(options.body))
    return response.ok?{data:await response.json()}:{error:{context:response}}
  }}})
  const result=await client.read(bundle.investigation_id,bundle.version.id,'1','2')
  assert.equal(result.error,null);assert.equal(sourceSpansMatch(bundle,'1','2',result.data),true)
  assert.deepEqual(calls[0],{action:'read',input:{investigation_id:bundle.investigation_id,version_id:bundle.version.id,user_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}})
  const input={investigation_id:bundle.investigation_id,version_id:bundle.version.id,left_position:'1',right_position:'2'}
  for(const body of [{action:'read',input:{...input,project:'anything'}},{action:'read',input:{...input,user_id:'spoof'}},{action:'read',input:{...input,right_position:'1'}},{action:'read',input:{...input,right_position:2}},{action:'put',input}]) assert.equal((await handler(make(body))).status,400)
  assert.equal(calls.length,1)
})
