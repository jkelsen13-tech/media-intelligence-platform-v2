import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import {stripTypeScriptTypes} from 'node:module'
import {comparisonProjectionConfig} from '../supabase/runtime-snapshots/source-comparison-run-v16/projectionConfig.js'
import {groupClaims} from '../supabase/runtime-snapshots/source-comparison-run-v16/lib.js'

const read=v=>readFileSync(new URL('../supabase/runtime-snapshots/source-comparison-run-'+v+'/index.ts',import.meta.url),'utf8')
const row=value=>[{key:'claim_group_confidence_floor',value}]
function handler(version,rows) {
  const state={projections:[],acks:0}
  const db={from(table){assert.equal(table,'pipeline_config');return {select(){return this},async in(){return {data:rows,error:null}}}}}
  let callback
  const source=read(version)
  runInNewContext(stripTypeScriptTypes(source.slice(source.indexOf('Deno.serve('))),{
    Deno:{env:{get:()=> 'configured'},serve:fn=>{callback=fn}},
    createClient:()=>db,authorizeWriter:async()=>true,json:(status,body)=>({status,body}),
    pendingProjectionQueueCount:async()=>({count:1,error:null}),comparisonProjectionConfig,
    rebuildProjection:async(_db,cfg,dryRun)=>{state.projections.push({cfg,dryRun});return {data:{ok:true}}},
    acknowledgeProjectionQueue:async()=>{state.acks++;return null},
  })
  return {state,run:()=>callback({method:'POST',json:async()=>({trigger:'pg_cron'})})}
}

test('blank configuration reproduces zero-floor merging in the previous worker; current handler refuses projection and acknowledgement',async()=>{
  const old=handler('v15',row(''))
  assert.equal((await old.run()).status,200)
  assert.equal(old.state.projections[0].cfg.groupFloor,0)
  const claims=[{articleId:'a',text:'Volcano erupts island ash'},{articleId:'b',text:'Council approves water funding'}]
  assert.equal(groupClaims(claims,old.state.projections[0].cfg.groupFloor).length,1)
  assert.equal(groupClaims(claims,0.6).length,2)
  const next=handler('v16',row(''))
  assert.equal((await next.run()).status,500)
  assert.equal(next.state.projections.length,0)
  assert.equal(next.state.acks,0)
})

test('malformed or ambiguous configuration cannot reach destructive projection or scheduled acknowledgement',async()=>{
  for(const value of [null,undefined,'',' ',false,true,[],[0],{},NaN,Infinity,-Infinity,-0.1,1.1,'NaN','Infinity','0x1','private-invalid-marker']){
    const h=handler('v16',row(value))
    const result=await h.run()
    assert.equal(result.status,500,String(value))
    assert.equal(h.state.projections.length,0)
    assert.equal(h.state.acks,0)
    assert.doesNotMatch(JSON.stringify(result.body),/private-invalid-marker/)
  }
  for(const rows of [null,{},[null],[...row(0.6),...row(0.6)],[{key:'wrong',value:0.6}]]){
    const h=handler('v16',rows)
    assert.equal((await h.run()).status,500)
    assert.equal(h.state.projections.length,0)
    assert.equal(h.state.acks,0)
  }
})

test('explicit valid floors and the absent-setting default preserve previous behavior and input values',async()=>{
  for(const raw of [0,0.6,1,'0','0.6','1',' .6 ','6e-1']){
    const rows=row(raw),before=JSON.stringify(rows),h=handler('v16',rows)
    assert.equal((await h.run()).status,200)
    assert.equal(h.state.projections[0].cfg.groupFloor,Number(raw))
    assert.equal(h.state.acks,1)
    assert.equal(JSON.stringify(rows),before)
  }
  assert.deepEqual(comparisonProjectionConfig([]),{groupFloor:0.6})
  const h=handler('v16',[])
  assert.equal((await h.run()).status,200)
  assert.equal(h.state.projections[0].cfg.groupFloor,0.6)
})

test('runtime change is confined to projection configuration validation',()=>{
  let next=read('v16').replace("import { comparisonProjectionConfig } from './projectionConfig.js'\n",'')
  next=next.replace("  let cfg\n  try { cfg = comparisonProjectionConfig(cfgRows) }\n  catch { return json(500, { error: 'invalid comparison projection configuration' }) }","  const cfg = { groupFloor: Number(cfgRows?.find((row: any) => row.key === 'claim_group_confidence_floor')?.value ?? 0.6) }")
  assert.equal(next,read('v15'))
  for(const file of ['lib.js','loadedLanguageLexicon.json','membershipFingerprint.js','membershipScoreReadback.js','articleInputReadback.js']){
    const root='../supabase/runtime-snapshots/source-comparison-run-'
    assert.equal(readFileSync(new URL(root+'v16/'+file,import.meta.url),'utf8'),readFileSync(new URL(root+'v15/'+file,import.meta.url),'utf8'))
  }
})
