import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdirSync} from 'node:fs'
import {createRequire} from 'node:module'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createElement} from 'react'
import TestRenderer,{act} from 'react-test-renderer'
import {syntheticObservation,observationId as id} from './hypothesisObservationFixture.mjs'
import {observedHistoryView,observationListView,validObservationReceipt} from '../src/lib/hypothesisObservations.js'
const sha=s=>createHash('sha256').update(s).digest('hex'),fixture=()=>syntheticObservation(sha),iid=id(1)
const root=fileURLToPath(new URL('../',import.meta.url)),output=root+'tests/.compiled/HypothesisObservations.mjs'
mkdirSync(root+'tests/.compiled',{recursive:true})
const require=createRequire(import.meta.url),esbuild=createRequire(require.resolve('vite/package.json'))('esbuild')
await esbuild.build({absWorkingDir:root,entryPoints:['src/components/HypothesisObservations.jsx'],outfile:output,
 bundle:true,format:'esm',platform:'node',jsx:'automatic',external:['react','react/jsx-runtime']})
const {default:Panel}=await import(pathToFileURL(output))
const props=client=>({client,investigationId:iid,userScopeKey:'synthetic-user'})
const content=t=>JSON.stringify(t.toJSON()),button=(t,label)=>t.root.findAllByType('button').find(b=>b.children.join('')===label)
const open=t=>t.root.findAllByType('button').find(b=>b.props['aria-label']==='Open saved view 1')
const clientFor=f=>({captureObservation:async i=>({data:{...f.receipt,observation_id:i.request_id}}),
 listObservations:async()=>({data:f.list}),readObservation:async(_,observation_id)=>({data:{...f.view,receipt:{...f.receipt,observation_id}}})})
test('observation validates exact committed reference bytes and assessment identity without changing evidence',async()=>{
 const f=fixture(),before=structuredClone(f)
 assert.ok(validObservationReceipt(f.receipt,iid))
 assert.ok(await observedHistoryView(f.view,iid,f.receipt.observation_id,f.receipt))
 assert.deepEqual(observationListView(f.list,iid),[f.receipt]);assert.deepEqual(f,before)
})
test('observation rejects tampering, uncommitted flags, extra authority, scope and broken reference sequence',async()=>{
 for(const mutate of [v=>v.reference_text+=' ',v=>v.committed_readback=false,v=>v.arbitrary_time_qualified=true,
  v=>v.publication_allowed=true,v=>v.receipt.epoch='bad',v=>v.receipt.revision_count=2,
  v=>v.receipt.source_text='untrusted',v=>v.receipt.investigation_id=id(90),
  v=>v.entries[0].assessment.id=id(99),v=>v.entries[0].assessment.predecessor_id=id(99),
  v=>v.entries[0].reassessment_pending=true,v=>v.entries[0].observed_status='withheld',
  v=>{const r=JSON.parse(v.reference_text);r[0].revision=2;v.reference_text=JSON.stringify(r);v.receipt.reference_hash=sha(v.reference_text)}]){
  const f=fixture();mutate(f.view);assert.equal(await observedHistoryView(f.view,iid,f.receipt.observation_id),null)
 }
 const f=fixture()
 assert.equal(await observedHistoryView(f.view,iid,id(99)),null)
 assert.equal(await observedHistoryView(f.view,iid,f.receipt.observation_id,{...f.receipt,epoch:id(98)}),null)
 assert.equal(await observedHistoryView(f.view,iid,f.receipt.observation_id,null,()=>{throw Error('unavailable')}),null)
})
test('personal list rejects duplicate, cross-epoch, foreign, unsupported and malformed receipts',()=>{
 for(const mutate of [v=>v.receipts.push(v.receipts[0]),v=>v.epoch=id(99),v=>v.current_user_only=false,
  v=>v.receipts[0].investigation_id=id(98),v=>v.receipts[0].observation_finished_at='2020-01-01T00:00:00Z',
  v=>v.publication_allowed=true,v=>v.receipts[0].reference_hash='bad']){
  const f=fixture();mutate(f.list);assert.equal(observationListView(f.list,iid),null)
 }
})
test('withheld references cannot disclose assessment or become available retrospectively',async()=>{
 const f=fixture(),e=f.view.entries[0]
 e.status='withheld';e.reason='current_permission_or_binding_denied'
 assert.equal(await observedHistoryView(f.view,iid,f.receipt.observation_id),null)
 delete e.assessment
 assert.ok(await observedHistoryView(f.view,iid,f.receipt.observation_id))
 e.reason='unknown';assert.equal(await observedHistoryView(f.view,iid,f.receipt.observation_id),null)
})
test('observation UI never captures or lists on mount and unsupported contexts render nothing',async()=>{
 let calls=0,tree;const client={captureObservation:async()=>{calls++},readObservation:async()=>{calls++},listObservations:async()=>{calls++}}
 await act(async()=>{tree=TestRenderer.create(createElement(Panel,props(client)))})
 assert.equal(calls,0);assert.match(content(tree),/Record current revision view/)
 await act(async()=>tree.update(createElement(Panel,{...props(client),userScopeKey:null})))
 assert.equal(tree.toJSON(),null);act(()=>tree.unmount())
})
test('lost capture acknowledgement retries identical request and only fresh committed readback confirms',async()=>{
 let tree;const calls=[],f=fixture();let reads=0
 const client={...clientFor(f),captureObservation:async i=>{
  calls.push(structuredClone(i));return calls.length===1?{error:{code:'request_failed'}}:{data:{...f.receipt,observation_id:i.request_id}}},
 readObservation:async(_,observation_id)=>{reads++;return{data:{...f.view,receipt:{...f.receipt,observation_id}}}}}
 await act(async()=>{tree=TestRenderer.create(createElement(Panel,props(client)))})
 await act(async()=>button(tree,'Record current revision view').props.onClick())
 assert.equal(reads,0);assert.match(content(tree),/still needs verified readback/);assert.doesNotMatch(content(tree),/Verified saved view/)
 await act(async()=>button(tree,'Retry the same saved view').props.onClick())
 assert.deepEqual(calls[0],calls[1]);assert.equal(reads,1);assert.match(content(tree),/Verified saved view/)
 act(()=>tree.unmount())
})
test('committed list recovers observation after component restart and fresh read is still mandatory',async()=>{
 let tree,reads=0;const f=fixture(),client={...clientFor(f),readObservation:async()=>{reads++;return{data:f.view}}}
 await act(async()=>{tree=TestRenderer.create(createElement(Panel,props(client)))})
 act(()=>tree.unmount())
 await act(async()=>{tree=TestRenderer.create(createElement(Panel,props({...client})))})
 await act(async()=>button(tree,'Inspect saved views').props.onClick())
 assert.equal(reads,0);assert.doesNotMatch(content(tree),/fictional contract/)
 await act(async()=>open(tree).props.onClick())
 assert.equal(reads,1);assert.match(content(tree),/fictional contract award/)
 act(()=>tree.unmount())
})
test('invalid readback remains uncertain and double-click cannot duplicate in-flight capture',async()=>{
 let tree,release,writes=0;const f=fixture(),client={...clientFor(f),
 captureObservation:i=>{writes++;return new Promise(resolve=>release=()=>resolve({data:{...f.receipt,observation_id:i.request_id}}))},
 readObservation:async()=>({data:{...f.view,committed_readback:false}})}
 await act(async()=>{tree=TestRenderer.create(createElement(Panel,props(client)))})
 let pending;act(()=>{const action=button(tree,'Record current revision view').props.onClick;pending=action();action()})
 assert.equal(writes,1)
 await act(async()=>{release();await pending})
 assert.match(content(tree),/still needs verified readback/);assert.doesNotMatch(content(tree),/Verified saved view/)
 act(()=>tree.unmount())
})
test('account transition suppresses late receipt and previously displayed private content',async()=>{
 let tree,release;const f=fixture(),client={...clientFor(f),listObservations:()=>new Promise(r=>release=r)}
 await act(async()=>{tree=TestRenderer.create(createElement(Panel,props(client)))})
 let pending;act(()=>{pending=button(tree,'Inspect saved views').props.onClick()})
 await act(async()=>tree.update(createElement(Panel,{...props(client),userScopeKey:'other-user'})))
 await act(async()=>{release({data:f.list});await pending})
 assert.equal(open(tree),undefined);assert.doesNotMatch(content(tree),/Verified saved view/)
 act(()=>tree.unmount())
})
test('current denial removes content and propagates access failure; originally withheld remains metadata only',async()=>{
 let tree;const failures=[],f=fixture(),client=clientFor(f)
 await act(async()=>{tree=TestRenderer.create(createElement(Panel,{...props(client),onAccessFailure:c=>failures.push(c)}))})
 await act(async()=>button(tree,'Inspect saved views').props.onClick())
 const e=f.view.entries[0];e.status='withheld';e.reason='current_permission_or_binding_denied';delete e.assessment
 await act(async()=>open(tree).props.onClick())
 assert.deepEqual(failures,['access_denied']);assert.doesNotMatch(content(tree),/fictional contract/)
 act(()=>tree.unmount())
 const g=fixture();g.view.entries[0]={revision_id:id(2),revision:1,status:'withheld',observed_status:'withheld',reason:'withheld_at_observation'}
 g.view.reference_text=JSON.stringify([{revision_id:id(2),revision:1,observed_status:'withheld'}])
 g.receipt.reference_hash=sha(g.view.reference_text)
 await act(async()=>{tree=TestRenderer.create(createElement(Panel,props(clientFor(g))))})
 await act(async()=>button(tree,'Inspect saved views').props.onClick())
 await act(async()=>open(tree).props.onClick())
 assert.match(content(tree),/This revision was unavailable/);assert.doesNotMatch(content(tree),/fictional contract/)
 act(()=>tree.unmount())
})
