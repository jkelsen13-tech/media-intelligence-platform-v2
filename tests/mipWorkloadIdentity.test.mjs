import test from 'node:test'
import assert from 'node:assert/strict'
import {generateKeyPairSync,sign} from 'node:crypto'
import {verifyWorkloadIdentity} from '../supabase/qualification/mip-cutover-authority/workloadIdentity.js'
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048})
const policy={issuer:'https://isolated.invalid',audience:'isolated-broker',maxLifetimeSeconds:60,
 keys:[{kid:'test',jwk:publicKey.export({format:'jwk'}),validFrom:0,validUntil:1000}],
 mappings:[{subject:'test-worker',runtime:'runtime-a',principal:'mip_comparison_worker_v1',authorizationRevision:'test-rev'}]}
function token(claims={},header={}){
 const enc=o=>Buffer.from(JSON.stringify(o)).toString('base64url')
 const input=enc({alg:'RS256',typ:'JWT',kid:'test',...header})+'.'+enc({iss:policy.issuer,aud:policy.audience,sub:'test-worker',iat:90,exp:140,...claims})
 return input+'.'+sign('RSA-SHA256',Buffer.from(input),privateKey).toString('base64url')
}
test('verified signature maps exact external subject to server-owned runtime and role',()=>{
 const got=verifyWorkloadIdentity({token:token({role:'service_role',runtime:'foreign',user_metadata:{role:'admin'}}),policy,now:100})
 assert.equal(got.runtime,'runtime-a');assert.equal(got.principal,'mip_comparison_worker_v1')
})
for(const [name,claims,header] of [
 ['wrong issuer',{iss:'foreign'},{}],['wrong audience',{aud:'foreign'},{}],
 ['multiple audience',{aud:[policy.audience,'foreign']},{}],['foreign subject',{sub:'foreign'},{}],
 ['expired',{exp:100},{}],['future issued',{iat:101},{}],['future not-before',{nbf:101},{}],
 ['excess lifetime',{exp:200},{}],['algorithm confusion',{}, {alg:'HS256'}],
 ['remote key injection',{}, {jku:'https://attacker.invalid'}],['unknown key',{}, {kid:'foreign'}]
])test('workload rejects '+name,()=>assert.throws(()=>verifyWorkloadIdentity({token:token(claims,header),policy,now:100}),/denied/))
test('revoked mapping, revoked signing key, duplicate mapping and privileged principal fail closed',()=>{
 for(const change of [
  p=>p.mappings[0].revoked=true,p=>p.keys[0].revoked=true,
  p=>p.mappings.push({...p.mappings[0]}),p=>p.mappings[0].principal='service_role'
 ]){
  const p=structuredClone(policy);change(p)
  assert.throws(()=>verifyWorkloadIdentity({token:token(),policy:p,now:100}),/denied/)
 }
})
test('tampered signed claims fail signature verification',()=>{
 const parts=token().split('.')
 parts[1]=Buffer.from(JSON.stringify({iss:policy.issuer,aud:policy.audience,sub:'test-worker',iat:90,exp:150})).toString('base64url')
 assert.throws(()=>verifyWorkloadIdentity({token:parts.join('.'),policy,now:100}),/denied/)
})
