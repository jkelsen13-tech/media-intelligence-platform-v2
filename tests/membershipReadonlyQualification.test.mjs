import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createQualificationHandler, runQualification } from '../supabase/qualification/membership-prepared/qualifier.js'
import { scoreEventMembership } from '../supabase/runtime-snapshots/source-comparison-run-v10/lib.js'
import { membershipInputFingerprint } from '../supabase/qualification/membership-prepared/membershipFingerprint.js'
const hash=s=>createHash('sha256').update(s).digest('hex')
const mode={mode:'membership_score',dry_run:true}
function corpus(n=2) {
  const events=[{id:'synthetic-event',canonical_title:'Council approves water funding',status:'active',comparison_validation_state:'pending_review'}]
  const articles=Array.from({length:n},(_,i)=>({id:'synthetic-'+i,outlet:i%2?'a':'b',title:'Council approves water funding',
    summary:'Synthetic private summary sentinel',body_text:'Synthetic private body sentinel',published_at:'2026-08-01T00:00:00Z',embedding:[1,0]}))
  return {events,articles,event_articles:articles.map(a=>({event_id:events[0].id,article_id:a.id})),
    source_comparison_membership_release_policy:[{fixture_passed:true,auto_approval_enabled:false,auto_approval_threshold:null}]}
}
function mock(data=corpus(),options={}) {
  const calls=[]
  const db={calls,rpc:async(name,args)=>{
    calls.push(['rpc',name]); assert.equal(name,'mip_source_comparison_schedule_authorized')
    return {data:options.scheduler===true && args.p_token==='synthetic-token',error:options.rpcError??null}
  },from(table){
    assert.ok(Object.hasOwn(data,table),'unapproved table '+table)
    calls.push(['from',table])
    let rows=data[table], columns=null
    const q={
      select(cols){columns=cols;return q},
      neq(k,v){rows=rows.filter(row=>row[k]!==v);return q},
      eq(k,v){if(k!=='model_version')rows=rows.filter(row=>row[k]===v);return q},
      in(k,values){rows=rows.filter(row=>values.includes(row[k]));return q},
      order(){return q},
      range(a,b){calls.push(['range',table,a,b]);return Promise.resolve(result(rows.slice(a,b+1)))},
      maybeSingle(){return Promise.resolve({data:rows[0]??null,error:options.failTable===table?{}:null})},
      then(resolve,reject){return Promise.resolve(result(rows)).then(resolve,reject)}
    }
    function result(values) {
      return {data:values.map(row=>Object.fromEntries(columns.split(',').filter(k=>Object.hasOwn(row,k)).map(k=>[k,row[k]]))),
        error:options.failTable===table?{}:null}
    }
    return q // Mutation methods intentionally absent: an attempted write fails.
  }}
  return db
}
function request(body=mode,headers={authorization:'Bearer synthetic-service'}) {
  return new Request('https://synthetic.invalid',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)})
}
test('qualification rejects unauthorized, malformed and write-shaped requests before corpus reads',async()=>{
  for(const body of [null,{},[],{mode:'event_projection',dry_run:true},{mode:'membership_score',dry_run:false},
    {...mode,trigger:'pg_cron'},{...mode,autoApprovalEnabled:true},{...mode,event_ids:['skip']}]) {
    const db=mock(),handler=createQualificationHandler({supabase:db,serviceKey:'synthetic-service'})
    assert.equal((await handler(request(body))).status,400)
    assert.equal(db.calls.length,0)
  }
  const db=mock(),handler=createQualificationHandler({supabase:db,serviceKey:'synthetic-service'})
  assert.equal((await handler(request(mode,{authorization:'Bearer synthetic-user'}))).status,401)
  assert.equal(db.calls.length,0)
  assert.equal((await handler(new Request('https://synthetic.invalid'))).status,405)
  assert.equal((await handler(new Request('https://synthetic.invalid',{method:'POST',headers:{authorization:'Bearer synthetic-service'},body:'{bad'}))).status,400)
})
test('service and Vault-verified scheduler may only obtain aggregate dry-run output',async()=>{
  for(const scheduler of [false,true]) {
    const db=mock(corpus(),{scheduler})
    const handler=createQualificationHandler({supabase:db,serviceKey:'synthetic-service'})
    const result=await handler(request(mode,scheduler?{authorization:'Bearer synthetic-anon','x-source-comparison-scheduler-token':'synthetic-token'}:{}))
    assert.equal(result.status,200)
    assert.equal(result.headers.get('cache-control'),'no-store')
    const text=await result.text(),body=JSON.parse(text)
    assert.equal(body.candidates_scored,1)
    assert.equal(body.memberships,2)
    assert.equal(body.persisted,false)
    assert.equal(body.acknowledged,false)
    assert.equal(body.auto_approval_candidates,0)
    for(const forbidden of ['synthetic-event','private summary sentinel','private body sentinel','synthetic-service','synthetic-token','member_scores','membership_fingerprint']) assert.ok(!text.includes(forbidden),forbidden)
  }
  for(const options of [{scheduler:false},{scheduler:true,rpcError:{message:'private error'}}]) {
    const db=mock(corpus(),options),handler=createQualificationHandler({supabase:db,serviceKey:'synthetic-service'})
    assert.equal((await handler(request(mode,{authorization:'Bearer synthetic-anon','x-source-comparison-scheduler-token':'synthetic-token'}))).status,401)
    assert.equal(db.calls.filter(x=>x[0]==='from').length,0)
  }
})
test('qualification digest equals baseline score plus exact complete-input fingerprint',async()=>{
  const data=corpus(),db=mock(data)
  const result=await runQualification(db)
  const input={event:data.events[0],members:data.articles.map(article=>({article}))}
  const score=scoreEventMembership(input.event,input.members,{fixturePassed:true,autoApprovalEnabled:false,autoApprovalThreshold:null})
  const fingerprint=membershipInputFingerprint(input,score.release_gate)
  assert.equal(result.ordered_score_sha256,hash(JSON.stringify([{...score,membership_fingerprint:fingerprint,membership_fingerprint_hash:hash(fingerprint)}])))
  const before=result.ordered_score_sha256
  data.articles[0].summary+=' corrected'
  assert.notEqual((await runQualification(mock(data))).ordered_score_sha256,before)
})
test('input pagination and chunked article reads retain all 501 observed members',async()=>{
  const db=mock(corpus(501)),result=await runQualification(db)
  assert.equal(result.memberships,501)
  assert.equal(result.directed_pairs,501*500)
  for(const table of ['event_articles','articles']) assert.ok(db.calls.some(c=>c[0]==='range' && c[1]===table && c[2]===500))
})
test('read failures remain failures and never return completion or payload details',async()=>{
  for(const table of Object.keys(corpus())) {
    const db=mock(corpus(),{failTable:table})
    const response=await createQualificationHandler({supabase:db,serviceKey:'synthetic-service'})(request())
    assert.equal(response.status,500)
    assert.deepEqual(await response.json(),{error:'qualification failed; no writes requested'})
  }
})
test('qualification package has no mutation calls and uses a pinned client behind JWT verification',()=>{
  const source=readFileSync(new URL('../supabase/qualification/membership-prepared/qualifier.js',import.meta.url),'utf8')
  assert.doesNotMatch(source,/\.(insert|upsert|update|delete)\s*\(/)
  const entry=readFileSync(new URL('../supabase/qualification/membership-prepared/index.ts',import.meta.url),'utf8')
  assert.ok(entry.includes('@supabase/supabase-js@2.110.0'))
  const config=JSON.parse(readFileSync(new URL('../supabase/qualification/membership-prepared/deployment.json',import.meta.url),'utf8'))
  assert.equal(config.verify_jwt,true)
  assert.equal(config.function_name,'membership-qualification')
  assert.equal(config.scheduled,false)
})
