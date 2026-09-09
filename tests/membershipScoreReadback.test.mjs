import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import {stripTypeScriptTypes} from 'node:module'
import {createHash} from 'node:crypto'
import {verifiedMembershipScoreIds, MEMBERSHIP_SCORE_READBACK_COLUMNS} from '../supabase/runtime-snapshots/source-comparison-run-v14/membershipScoreReadback.js'
import {membershipInputFingerprint} from '../supabase/runtime-snapshots/source-comparison-run-v14/membershipFingerprint.js'
import {pagedSelect, scoreEventMembership, regressionMixedTopicMembershipFixture, MEMBERSHIP_SCORER_RULE_VERSION} from '../supabase/runtime-snapshots/source-comparison-run-v14/lib.js'

const read = version => readFileSync(new URL('../supabase/runtime-snapshots/source-comparison-run-'+version+'/index.ts', import.meta.url),'utf8')
const gate = {fixturePassed:true,autoApprovalEnabled:false,autoApprovalThreshold:null}
const fixture = () => {const {event,members}=regressionMixedTopicMembershipFixture();return {event,members:members.slice(0,2).map(article=>({article}))}}
function runner(source, mutate = rows => rows) {
  const state = {writes:[], orders:[]}
  const input = fixture()
  const start = source.indexOf('async function rebuildMembershipScores(')
  const end = source.indexOf('async function pendingProjectionQueueCount',start)
  const fn = stripTypeScriptTypes(source.slice(start,end))
  const context = {
    runMembershipRegressionSuite:()=>({passed:true,fixtures:[]}),
    buildMembershipInputs:async()=>({inputs:[input]}),
    membershipReleaseGate:async()=>({gate}),
    scoreEventMembership, membershipInputFingerprint, MEMBERSHIP_SCORER_RULE_VERSION,
    MEMBERSHIP_SCORE_READBACK_COLUMNS, verifiedMembershipScoreIds,
    sha256Hex:async value=>createHash('sha256').update(value).digest('hex'),
    // Force the computed score into this isolated audit plan to exercise its persistence boundary.
    buildMembershipAuditSample:scores=>({sample:scores.map(s=>({...s,audit_stratum:'low_confidence'})),population:scores.length,seed:'fixture',low_confidence_cutoff:0.7}),
    upsertInChunks:async(_db,table,rows)=>{
      state.writes.push({table,rows:structuredClone(rows)})
      if(table==='source_comparison_membership_scores')state.retained=rows.map((r,i)=>({...structuredClone(r),id:'retained-'+i}))
      return null
    },
    pagedSelect:async(_db,_table,_cols,orders)=>{
      state.orders.push(orders)
      return {data:mutate(structuredClone(state.retained))}
    },
    PAGE_SIZE:500, CHUNK:100,
  }
  const execute=runInNewContext('('+fn.trim()+')',context)
  return {state,run:()=>execute({from(){throw new Error('approval must stay disabled')}},false,{})}
}

test('actual previous worker silently drops an audit when retained score readback is missing',async()=>{
  const old=runner(read('v13'),()=>[])
  const result=await old.run()
  assert.ok(result.data)
  assert.equal(result.data.scores_persisted,1)
  assert.equal(result.data.audits_queued,0)
  const current=runner(read('v14'),()=>[])
  const blocked=await current.run()
  assert.match(blocked.error,/missing retained membership score/)
  assert.deepEqual(current.state.writes.map(w=>w.table),['source_comparison_membership_scores'])
})

test('worker links complete exact output and refuses altered, duplicate or missing retained output',async()=>{
  const valid=runner(read('v14'),rows=>rows.map(r=>({...r,release_gate:Object.fromEntries(Object.entries(r.release_gate).reverse())})))
  const result=await valid.run()
  assert.equal(result.data.audits_queued,1)
  assert.equal(result.data.events_auto_approved,0)
  assert.equal(valid.state.writes[1].rows[0].score_id,'retained-0')
  assert.deepEqual(Array.from(valid.state.orders[0]),['event_id','id'])
  for(const mutate of [
    rows=>[...rows,rows[0]],
    rows=>rows.map(r=>({...r,id:null})),
    rows=>rows.map(r=>({...r,decision:'changed'})),
    rows=>rows.map(r=>({...r,cluster_confidence:r.cluster_confidence+0.01})),
    rows=>rows.map(r=>({...r,member_scores:[]})),
    rows=>rows.map(r=>({...r,hard_rejections:['changed']})),
    rows=>rows.map(r=>({...r,membership_fingerprint:'changed'})),
    rows=>rows.map(r=>({...r,release_gate:{}})),
    rows=>rows.map(r=>({...r,model_version:'foreign-model'})),
    rows=>rows.map(r=>({...r,membership_fingerprint_hash:'foreign-hash'})),
  ]){
    const attempt=runner(read('v14'),mutate)
    assert.match((await attempt.run()).error,/readback verification failed/)
    assert.deepEqual(attempt.state.writes.map(w=>w.table),['source_comparison_membership_scores'])
  }
})

test('unrelated history remains untouched and exact date strings and array order remain material',()=>{
  const row={event_id:'e',model_version:'v',membership_fingerprint_hash:'h',membership_fingerprint:'exact',cluster_confidence:0.8,decision:'candidate',hard_rejections:[],member_scores:[{at:'2024-04-08 17:59:00.123456+00',id:'a'},{id:'b'}],release_gate:{enabled:false}}
  const retained=[{...structuredClone(row),id:'current'},{...structuredClone(row),id:'historical',membership_fingerprint_hash:'older'}]
  const before=structuredClone(retained)
  assert.equal(verifiedMembershipScoreIds([row],retained).get('e|h'),'current')
  assert.deepEqual(retained,before)
  for(const mutate of [
    r=>{r.member_scores[0].at='2024-04-08 17:59:00.123457+00'},
    r=>r.member_scores.reverse(),
  ]){
    const altered=structuredClone(retained);mutate(altered[0])
    assert.throws(()=>verifiedMembershipScoreIds([row],altered),/differs/)
  }
  assert.throws(()=>verifiedMembershipScoreIds([row,row],retained),/duplicate expected/)
  assert.equal(verifiedMembershipScoreIds([],retained).size,0)
})

test('runtime changes are confined to membership output readback',()=>{
  let current=read('v14'), previous=read('v13')
  current=current.replace("import { MEMBERSHIP_SCORE_READBACK_COLUMNS, verifiedMembershipScoreIds } from './membershipScoreReadback.js'\n",'')
  current=current.replace("MEMBERSHIP_SCORE_READBACK_COLUMNS,\n    ['event_id', 'id'],","'id,event_id,membership_fingerprint_hash,cluster_confidence,hard_rejections',\n    ['event_id'],")
  const from=current.indexOf('  let scoreIdByFingerprint:'),to=current.indexOf('  const auditRows',from)
  const oldFrom=previous.indexOf('  const scoreIdByFingerprint'),oldTo=previous.indexOf('  const auditRows',oldFrom)
  current=current.slice(0,from)+previous.slice(oldFrom,oldTo)+current.slice(to)
  current=current.replace("  }))\n  const auditWriteError","  })).filter((row: any) => row.score_id)\n  const auditWriteError")
  assert.equal(current,previous,'authorization, projection, queue, scoring and release policy behavior otherwise preserved')
  for(const name of ['lib.js','loadedLanguageLexicon.json','membershipFingerprint.js']){
    const base='../supabase/runtime-snapshots/source-comparison-run-'
    assert.equal(readFileSync(new URL(base+'v14/'+name,import.meta.url),'utf8'),readFileSync(new URL(base+'v13/'+name,import.meta.url),'utf8'))
  }
})

test('total pagination order avoids a legal tie-order counterexample across retained generations',async()=>{
  const rows=['a','b','c','d'].map(id=>({id,event_id:'same-event',membership_fingerprint_hash:id,model_version:'v',membership_fingerprint:id,cluster_confidence:0.5,decision:'candidate',hard_rejections:[],member_scores:[],release_gate:{}}))
  const db={from(){const order=[];return {select(){return this},order(c){order.push(c);return this},async range(from,to){
    const ordered=order.includes('id')||from===0?rows:[...rows].reverse()
    return {data:ordered.slice(from,to+1)}
  }}}}
  const old=await pagedSelect(db,'scores','*',['event_id'],2)
  assert.deepEqual(old.data.map(r=>r.id),['a','b','b','a'])
  assert.throws(()=>verifiedMembershipScoreIds(rows,old.data),/ambiguous/)
  const stable=await pagedSelect(db,'scores','*',['event_id','id'],2)
  assert.deepEqual(stable.data.map(r=>r.id),['a','b','c','d'])
  assert.equal(verifiedMembershipScoreIds(rows,stable.data).size,4)
})
