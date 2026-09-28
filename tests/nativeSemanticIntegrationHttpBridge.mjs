// Synthetic subprocess entrypoint: actual patched HTTP handler + store + PG reader.
// No listener, external Auth request, production target, injected SQL or mock reader.
import assert from 'node:assert/strict'
import {createHypothesisHandler} from '../supabase/qualification/hypothesis-assessments/handler.mjs'
import {createHypothesisStore} from '../supabase/qualification/hypothesis-assessments/store.mjs'
import {createNativeSemanticChangeReader} from '../supabase/qualification/native-semantic-integration/reader.mjs'
import {connectAuthenticatedPg} from '../supabase/qualification/collector-native-capture/authenticatedPgDriver.mjs'
let client=null,stage='input',failure=null
try{
 if(process.env.GITHUB_ACTIONS!=='true'||process.env.MIP_DISPOSABLE_POSTGRES!=='comparison-qualification')
  throw Error('synthetic_route_required')
 let input='',bytes=0
 for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>8192)throw Error('input_bound');input+=chunk}
 const p=JSON.parse(input)
 const keys=['database','login','userId','outsiderId','investigationId','revisionId','causeId','sourceProject','mode','expectedDigest']
 assert.deepEqual(Object.keys(p).sort(),keys.sort())
 assert.match(p.database,/^mip_hypothesis_[a-f0-9]{32}$/)
 assert.match(p.login,/^semantic_gateway_[a-f0-9]{32}$/)
 for(const k of ['userId','outsiderId','investigationId','revisionId','causeId'])assert.match(p[k],/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/)
 assert.equal(p.sourceProject,'synthetic-hypothesis-native')
 assert.ok(['available','denied','unrepresented','conflict'].includes(p.mode))
 assert.ok(p.expectedDigest===null||/^[a-f0-9]{64}$/.test(p.expectedDigest))
 const uri=new URL('postgresql://127.0.0.1:5432/'+p.database)
 uri.username=p.login;uri.password='semantic-gateway-synthetic-only'
 const configuration={connectionString:uri.href,expectedLogin:p.login,disposable:true,sessionPoolerHost:null}
 stage='composition'
 client=await connectAuthenticatedPg(configuration)
 const read=createNativeSemanticChangeReader(configuration)
 const store=createHypothesisStore((sql,values)=>client.query(sql,values),{semanticChangeReader:read})
 assert.equal(typeof store.semanticChange,'function')
 let authentications=0
 const handler=createHypothesisHandler({
  authenticate:async header=>{authentications++;return header==='Bearer synthetic-member'?{id:p.userId}:
    header==='Bearer synthetic-outsider'?{id:p.outsiderId}:null},
  store,sourceProject:p.sourceProject,allowedOrigins:['https://synthetic.invalid']
 })
 const selection={investigation_id:p.investigationId,revision_id:p.revisionId,
  cause_id:p.causeId,expected_envelope_digest:p.expectedDigest}
 const request=async(input,token='synthetic-member')=>handler(new Request('https://synthetic.invalid/hypothesis',{
  method:'POST',headers:{origin:'https://synthetic.invalid','content-type':'application/json',authorization:'Bearer '+token},
  body:JSON.stringify({action:'semantic_change',input})
 }))
 stage='identity_injection'
 assert.equal((await request({...selection,verifiedUserId:p.outsiderId})).status,400)
 assert.equal(authentications,0)
 assert.equal((await request(selection,'invalid')).status,401)
 stage='read'
 const response=await request(selection),value=await response.json()
 assert.equal(response.headers.get('cache-control'),'private, no-store')
 assert.ok(!/Synthetic method revision|meeting record|Synthetic concern/.test(JSON.stringify(value)))
 let digest=null
 if(p.mode==='available'){
  assert.equal(response.status,200)
  assert.equal(value.data.identity.id,p.causeId)
  assert.equal(value.data.metadata.revision_id,p.revisionId)
  assert.equal(value.data.metadata.canonical_cause,'visibility_changed')
  assert.equal(value.data.currentness.state,'unknown')
  assert.equal(value.data.authority.publication_allowed,false)
  assert.equal(value.data.authority.authorization_conferred,false)
  digest=value.data.envelope_digest.sha256
  const retry=await request({...selection,expected_envelope_digest:digest})
  assert.equal(retry.status,200);assert.deepEqual((await retry.json()).data,value.data)
  assert.equal((await request(selection,'synthetic-outsider')).status,403)
 }else{
  assert.equal(response.status,p.mode==='denied'?403:409)
  assert.equal(Object.hasOwn(value,'data'),false)
 }
 stage='close'
 await client.end();client=null
 process.stdout.write(JSON.stringify({contract:'native_semantic_http_fixture_v1',mode:p.mode,digest,
  publication_allowed:false,cleanup_observed_by_parent_required:true}))
}catch(error){
 const state=/^[A-Z0-9]{5}$/.test(error?.code??'')?error.code:'NONE'
 const frames=String(error?.stack??'').split('\n').slice(1).flatMap(x=>x.match(/nativeSemanticIntegrationHttpBridge\.mjs:\d{1,6}:\d{1,6}/g)??[]).slice(0,3).join(' ')
 failure='semantic_http_'+stage+'_sqlstate_'+state+' '+frames
}finally{
 if(client)try{await client.end()}catch{failure=(failure?failure+';':'')+'semantic_http_close_unverified'}
}
if(failure){process.stderr.write(failure);process.exitCode=1}
