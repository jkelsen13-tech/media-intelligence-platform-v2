import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { replayPrivateInput } from '../scripts/nativeOfflineReplay.mjs'
import { loadPrivateReplay,replayGraph } from '../scripts/privateReplayClient.mjs'
import { extractClaims,extractEntityCandidates,normalizeEntityName,guessEntityType } from '../scripts/nativeReplayExtraction.mjs'
import { syntheticReplayInput } from './fixtures/nativeReplaySynthetic.mjs'
import { PROPAGATION_STAGES } from '../scripts/demoPropagation.mjs'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { privateReplayHeaders } from '../scripts/privateReplayAsset.mjs'
const input=syntheticReplayInput()
const result=replayPrivateInput(input)
test('93 exact candidates, native outputs, Unicode spans, truthful dependency and bounded absence',()=>{
  assert.equal(result.candidates.length,93); assert.equal(result.counts.sentences,184);assert.equal(result.counts.framing,92)
  assert.equal(result.counts.claim_groups,1);assert.equal(result.counts.shared,1);assert.equal(result.counts.checks_passed,279)
  assert.equal(result.coverage.examined_pairs,4278);assert.ok(result.counts.cross_investigation_clusters>0)
  for(const c of result.candidates){const r=input.records.find(r=>r.capture_id===c.capture_id);assert.equal(c.exact_excerpt,r.exact_excerpt);assert.equal(c.span_start,2);assert.equal(c.evidence_state,'verified_bounded_span');assert.equal(c.canonical_id,null);assert.equal(c.publication_allowed,false)}
  assert.equal(result.claim_groups[0].independence,'unknown');assert.ok(result.claim_groups.every(g=>!('independent_outlets' in g)))
  assert.ok(result.dependencies.every(d=>d.independence==='unknown'));assert.ok(result.clusters.every(c=>c.accepted_event===false))
  assert.ok(result.claim_groups.every(g=>g.coverage_unknown.includes('Synthetic thin outlet')))
  assert.equal(JSON.stringify(result).includes('PRIVATE OUTSIDE BOUNDED SPAN'),false)
  assert.equal(JSON.stringify(result).includes('captured_field_text'),false)
  assert.deepEqual(Object.keys(result.propagation),PROPAGATION_STAGES)
  for(const c of result.candidates)assert.deepEqual(Object.keys(c.propagation),PROPAGATION_STAGES)
  assert.equal(result.baseline.derived_artifacts,0);assert.equal(result.what_changed.added.sentences,184)
  console.log(JSON.stringify({synthetic_counts:result.counts}))
})
test('unique claims distinguish bounded omission from extraction coverage unknown',()=>{
  const i=syntheticReplayInput(3)
  i.records[1].exact_excerpt='Volcanic minerals accumulated beneath mountainous terrain throughout ancient geological periods.'
  i.records[1].captured_field_text='😀 '+i.records[1].exact_excerpt
  i.records[1].span_end=2+Array.from(i.records[1].exact_excerpt).length
  i.records[1].content_hash=createHash('sha256').update(i.records[1].captured_field_text).digest('hex')
  const r=replayPrivateInput(i,{expectedCount:3})
  assert.equal(r.counts.unique,2)
  assert.ok(r.claim_groups.every(g=>g.omitted_by.length===1&&g.coverage_unknown.includes('Synthetic thin outlet')))
})
test('stdin newline is processed without EOF and errors contain no input',async()=>{
  const child=spawn(process.execPath,['scripts/generatePrivateReplay.mjs'],{stdio:['pipe','pipe','pipe']})
  let log='';child.stdout.on('data',v=>log+=v);child.stderr.on('data',v=>log+=v)
  const done=new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject)})
  child.stdin.write('{"private_secret":"DO NOT ECHO THIS"}\n')
  const timeout=setTimeout(()=>child.kill(),5000)
  const code=await done;clearTimeout(timeout)
  assert.equal(code,1);assert.doesNotMatch(log,/DO NOT ECHO THIS/);assert.match(log,/No input values logged/)
})
test('private artifact response headers and build isolation are explicit',()=>{
  assert.ok(privateReplayHeaders.some(h=>h.key==='Cache-Control'&&h.value.includes('private, no-store')))
  const production=readFileSync(new URL('../vite.config.js',import.meta.url),'utf8')
  assert.doesNotMatch(production,/privateReplayAsset|native-replay/)
  const style=readFileSync(new URL('../src/graph/styles.js',import.meta.url),'utf8')
  assert.match(style,/edge\[type = "analytical_candidate"\]/)
})
test('native extraction mirror stays in semantic parity with ingest-rss',()=>{
  const raw=readFileSync(new URL('../supabase/functions/ingest-rss/index.ts',import.meta.url),'utf8')
  let native=raw.slice(raw.indexOf('const FRAMING_MARKERS'),raw.indexOf('interface ResolvedEntity'))
  native=native.replace(/interface EntityCandidate \{[\s\S]*?\}\r?\n/g,'').replace('function extractClaims(text: string)','function extractClaims(text)').replace("const claims: Array<{ text: string; kind: 'substantive' | 'framing' }>",'const claims').replace('function extractEntityCandidates(text: string, outletNames: Set<string>): EntityCandidate[]','function extractEntityCandidates(text, outletNames)').replace('new Map<string, EntityCandidate>()','new Map()').replace('let role: string | null','let role').replace('function normalizeEntityName(s: string): string','function normalizeEntityName(s)').replace('function guessEntityType(name: string): string','function guessEntityType(name)')
  const api=new Function(`${native};return {extractClaims,extractEntityCandidates,normalizeEntityName,guessEntityType}`)()
  for(const text of [input.records[0].exact_excerpt,'President Ada Lovelace may visit Ministry of Defence. Ada Lovelace reportedly spoke to Daily Mail.','Tiny.','😀 '+input.records[0].exact_excerpt]) {
    assert.deepEqual(extractClaims(text),api.extractClaims(text));assert.deepEqual(extractEntityCandidates(text,new Set(['daily mail'])),api.extractEntityCandidates(text,new Set(['daily mail'])));assert.equal(normalizeEntityName(text),api.normalizeEntityName(text));assert.equal(guessEntityType(text),api.guessEntityType(text))
  }
})
test('failed exact binding quarantines analysis and missing full bytes remain unresolved',()=>{
  const invalid=syntheticReplayInput();invalid.records[0].captured_field_text='mismatch'
  const r=replayPrivateInput(invalid);const c=r.candidates.find(c=>c.capture_id===invalid.records[0].capture_id)
  assert.equal(c.evidence_state,'failed_quarantined');assert.equal(c.exact_excerpt,'');assert.equal(c.sentences.length,0)
  delete invalid.records[0].captured_field_text
  const missing=replayPrivateInput(invalid).candidates.find(c=>c.capture_id===invalid.records[0].capture_id)
  assert.equal(missing.evidence_state,'binding_incomplete');assert.equal(missing.checks.find(c=>c.check==='capture_payload_hash').state,'retained_unverified')
})
test('rights, publication and review gates reject input',()=>{
  for(const [key,value] of [['rights_mode','full_text'],['publication_allowed',true],['public_admission',true],['candidate_state','accepted']]){const i=syntheticReplayInput();i.records[0][key]=value;assert.throws(()=>replayPrivateInput(i),/contract validation/)}
  assert.throws(()=>replayPrivateInput({records:[]}),/contract validation/)
})
test('private client accepts exact universe only; missing artifact falls back; graph has pending edges',async()=>{
  const sources=input.records.map(r=>({...r,preview_id:r.capture_id}))
  const loaded=await loadPrivateReplay(sources,async()=>({ok:true,json:async()=>result}))
  assert.equal(loaded.revision,result.revision);assert.equal(loaded.candidates.length,result.candidates.length)
  assert.equal(await loadPrivateReplay(sources,async()=>({ok:false})),null)
  assert.equal(await loadPrivateReplay(sources.slice(1),async()=>({ok:true,json:async()=>result})),null)
  const graph=replayGraph(result,sources);assert.ok(graph.edges.length>0);assert.ok(graph.edges.every(e=>e.type==='analytical_candidate'&&e.publication_allowed===false));assert.equal(graph.nodes.filter(n=>n.capture_id).length,93)
})
test('optional replay deadline aborts stalled fetch and stalled JSON without blocking fallback',async()=>{
  let signal
  const start=Date.now()
  assert.equal(await loadPrivateReplay([],async(_url,options)=>{signal=options.signal;return new Promise(()=>{})},{timeoutMs:15}),null)
  assert.equal(signal.aborted,true);assert.ok(Date.now()-start<1000)
  assert.equal(await loadPrivateReplay([],async()=>({ok:true,json:()=>new Promise(()=>{})}),{timeoutMs:15}),null)
  const controller=new AbortController()
  const pending=loadPrivateReplay([],()=>new Promise(()=>{}),{signal:controller.signal});controller.abort()
  assert.equal(await pending,null)
})
