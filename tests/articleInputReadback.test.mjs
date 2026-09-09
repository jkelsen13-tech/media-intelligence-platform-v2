import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'
import {stripTypeScriptTypes} from 'node:module'
import {verifyRequestedArticleRows} from '../supabase/runtime-snapshots/source-comparison-run-v15/articleInputReadback.js'

const read=v=>readFileSync(new URL('../supabase/runtime-snapshots/source-comparison-run-'+v+'/index.ts',import.meta.url),'utf8')
function harness(version, mutate=rows=>rows, n=2) {
  const articles=Array.from({length:n},(_,i)=>({id:'article-'+i,outlet:'outlet-'+i,title:'Private fixture '+i,published_at:'2026-01-01 00:00:00.123456+00'}))
  const state={reads:0,writes:0}
  const source=read(version)
  const context={
    CHUNK:100,PAGE_SIZE:500,verifyRequestedArticleRows,
    pagedSelect:async(_db,table)=>({data:table==='events'?[{id:'event',status:'active',comparison_validation_state:'approved'}]:table==='event_articles'?articles.map(a=>({event_id:'event',article_id:a.id})):articles.map(a=>({id:a.id,outlet:a.outlet}))}),
    runMembershipRegressionSuite:()=>({passed:true,fixtures:[]}),
  }
  const fn=stripTypeScriptTypes(source.slice(source.indexOf('async function selectInChunks('),source.indexOf('Deno.serve(')))
  const worker=runInNewContext(fn+';({buildEventInputs,buildMembershipInputs,rebuildProjection,rebuildMembershipScores})',context)
  const db={from(table){
    if(table!=='articles'){state.writes++;throw Error('downstream operation reached')}
    return {select(){return this},async in(_column,ids){state.reads++;return {data:mutate(articles.filter(a=>ids.includes(a.id)),state.reads),error:null}}}
  }}
  return {worker,db,state,articles}
}

test('previous projection and membership inputs silently omit a requested article; new worker blocks both before downstream work',async()=>{
  for(const method of ['buildEventInputs','buildMembershipInputs']){
    const old=harness('v14',rows=>rows.slice(1))
    const result=await old.worker[method](old.db)
    assert.equal(result.error,null)
    assert.equal(result.inputs[0].members.length,1,'reproduce an incomplete two-outlet input')
    const current=harness('v15',rows=>rows.slice(1))
    assert.match((await current.worker[method](current.db)).error.message,/missing requested/)
  }
  for(const method of ['rebuildProjection','rebuildMembershipScores']){
    const current=harness('v15',rows=>rows.slice(1))
    const result=method==='rebuildProjection'?await current.worker[method](current.db,{},false):await current.worker[method](current.db,false,{})
    assert.match(result.error,/input read failed/)
    assert.equal(current.state.writes,0,'no cleanup, score, policy, audit or approval operation')
  }
})

test('missing, duplicate, foreign and malformed rows fail closed without returning a partial batch',async()=>{
  for(const mutate of [()=>null,()=>[],rows=>[...rows,rows[0]],rows=>[{...rows[0],id:'foreign'},...rows.slice(1)],rows=>[null,...rows.slice(1)],rows=>[{...rows[0],id:''},...rows.slice(1)]]){
    const h=harness('v15',mutate)
    const result=await h.worker.rebuildProjection(h.db,{},false)
    assert.match(result.error,/input read failed/)
    assert.equal(h.state.writes,0)
    assert.doesNotMatch(result.error,/Private fixture/)
  }
  const late=harness('v15',(rows,call)=>call===2?rows.slice(1):rows,201)
  assert.match((await late.worker.buildMembershipInputs(late.db)).error.message,/missing requested/)
  assert.equal(late.state.reads,2,'failure stops before the third chunk')
})

test('complete chunked reads preserve caller member order and exact source values without mutation',async()=>{
  for(const method of ['buildEventInputs','buildMembershipInputs']){
    const h=harness('v15',rows=>rows.slice().reverse(),201)
    const before=JSON.stringify(h.articles)
    const result=await h.worker[method](h.db)
    assert.equal(result.error,null)
    assert.equal(result.inputs[0].members.length,201)
    assert.equal(result.inputs[0].members[0].article,h.articles[0])
    assert.equal(result.inputs[0].members[200].article,h.articles[200])
    assert.equal(JSON.stringify(h.articles),before)
    assert.equal(h.state.reads,3)
    assert.equal(h.state.writes,0)
  }
  verifyRequestedArticleRows([],[])
  assert.throws(()=>verifyRequestedArticleRows(['a','a'],[{id:'a'}]),/ambiguous/)
  assert.throws(()=>verifyRequestedArticleRows([undefined],[]),/ambiguous/)
})

test('runtime delta changes only article input completeness, preserving authorization, scoring, publication and legacy queue logic',()=>{
  let current=read('v15')
  current=current.replace("import { verifyRequestedArticleRows } from './articleInputReadback.js'\n",'')
  current=current.replace(`    try {
      verifyRequestedArticleRows(ids.slice(offset, offset + CHUNK), data)
    } catch (error) {
      return { data: null, error: { message: (error as Error).message } }
    }
    out.push(...data)`,`    out.push(...(data ?? []))`)
  assert.equal(current,read('v14'))
  for(const file of ['lib.js','membershipFingerprint.js','membershipScoreReadback.js','loadedLanguageLexicon.json']){
    const root='../supabase/runtime-snapshots/source-comparison-run-'
    assert.equal(readFileSync(new URL(root+'v15/'+file,import.meta.url),'utf8'),readFileSync(new URL(root+'v14/'+file,import.meta.url),'utf8'))
  }
})
