import test from 'node:test'
import assert from 'node:assert/strict'
import { backendRequestTarget, verifyBackendTargets, AUTHORITATIVE_PROJECT } from '../verifier/backendBoundary.mjs'

test('backend observation retains project and service without query or credentials', () => {
  const target=backendRequestTarget('https://'+AUTHORITATIVE_PROJECT+'.supabase.co/rest/v1/private_name?token=do-not-retain')
  assert.deepEqual(target,{project:AUTHORITATIVE_PROJECT,service:'rest'})
  assert.doesNotMatch(JSON.stringify(target),/private_name|token|do-not-retain/)
  assert.equal(backendRequestTarget('https://'+AUTHORITATIVE_PROJECT+'.supabase.co.evil.example/rest/v1'),null)
  assert.equal(backendRequestTarget('not a URL'),null)
})
test('backend observation covers managed service hosts without claiming custom-domain coverage', () => {
  assert.deepEqual(backendRequestTarget('https://'+AUTHORITATIVE_PROJECT+'.functions.supabase.co/worker'),{project:AUTHORITATIVE_PROJECT,service:'functions'})
  for(const service of ['rest','auth','storage','functions','realtime']) {
    assert.equal(backendRequestTarget('https://'+AUTHORITATIVE_PROJECT+'.supabase.co/'+service+'/v1').service,service)
  }
  assert.equal(backendRequestTarget('https://custom.example/api'),null)
})
test('backend verification rejects legacy requests and vacuous success', () => {
  const good={project:AUTHORITATIVE_PROJECT,service:'rest'}
  const legacy={project:'yhbwnrtlqbjtcrrlpbge',service:'functions'}
  assert.throws(()=>verifyBackendTargets([]),/unverified/)
  assert.throws(()=>verifyBackendTargets([good,legacy]),/non-authoritative/)
  assert.deepEqual(verifyBackendTargets([good,good]),{project:AUTHORITATIVE_PROJECT,requestCount:2,services:['rest']})
})
