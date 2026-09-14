import test from 'node:test'
import assert from 'node:assert/strict'
import {createHypothesisHandler} from '../supabase/qualification/hypothesis-assessments/handler.mjs'
import {createHypothesisStore} from '../supabase/qualification/hypothesis-assessments/store.mjs'
import {createHypothesisAssessmentClient} from '../src/lib/hypothesisAssessmentClient.js'
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),user=id(1),iid=id(2),epoch=id(3),request=id(4)
function setup(observationEpoch){
 const calls=[],store=createHypothesisStore(async(sql,args)=>{calls.push({sql,args});return{rows:[{value:{synthetic:true}}]}})
 const options={authenticate:async()=>({id:user,is_anonymous:false}),store,sourceProject:'synthetic',
  allowedOrigins:['https://synthetic.invalid'],observationEpoch}
 const handler=createHypothesisHandler(options)
 const send=async(action,input)=>(await handler(new Request('https://synthetic.invalid/hypothesis',{
  method:'POST',headers:{authorization:'Bearer synthetic-only','content-type':'application/json'},
  body:JSON.stringify({action,input})}))).json()
 return{calls,options,send,client:createHypothesisAssessmentClient(send)}
}
test('observation delivery defaults closed independently of ordinary history',async()=>{
 const f=setup()
 assert.equal((await f.client.captureObservation({investigation_id:iid,request_id:request})).error.code,'observations_not_configured')
 assert.equal((await f.client.readObservation(iid,request)).error.code,'observations_not_configured')
 assert.equal((await f.client.listObservations(iid)).error.code,'observations_not_configured')
 assert.equal(f.calls.length,0)
 assert.deepEqual((await f.client.history(iid)).data,{synthetic:true});assert.equal(f.calls.length,1)
})
test('all observation queries bind server epoch as a separate parameter',async()=>{
 const f=setup(epoch);f.options.observationEpoch=id(9)
 await f.client.captureObservation({investigation_id:iid,request_id:request})
 await f.client.readObservation(iid,request);await f.client.listObservations(iid)
 assert.deepEqual(f.calls.map(c=>c.args),[[user,iid,request,epoch],[user,iid,request,epoch],[user,iid,epoch]])
 assert.match(f.calls[0].sql,/capture_history_observation\(\$1::uuid,\$2::uuid,\$3::uuid,\$4::uuid\)/)
})
test('caller cannot substitute epoch, identity or restored authority',async()=>{
 const f=setup(epoch)
 for(const extra of [{expected_epoch:epoch},{observationEpoch:epoch},{verifiedUserId:user},{restored:true}]){
  assert.equal((await f.send('capture_observation',{investigation_id:iid,request_id:request,...extra})).error.code,'invalid_request')
 }
 assert.equal(f.calls.length,0)
})
