import test from 'node:test'
import assert from 'node:assert/strict'
import { resolvePrivateServiceConfig } from '../src/lib/privateServiceConfig.js'
import { PRIVATE_SERVICE_ENDPOINT_POLICY } from '../src/lib/privateServiceEndpointPolicy.js'

const origin = 'https://qikvmopbtijoebdqosyq.supabase.co'
// Synthetic names only; these are not deployed endpoints or production approvals.
const hypothesis = origin + '/functions/v1/synthetic-hypothesis'
const markets = origin + '/functions/v1/synthetic-markets'
const policy = { hypothesisEndpoint: [hypothesis], privateMarketsEndpoint: [markets] }
const closed = { hypothesisEndpoint: null, privateMarketsEndpoint: null }
test('production policy is frozen and empty; absent or unapproved settings stay closed', () => {
  assert.ok(Object.isFrozen(PRIVATE_SERVICE_ENDPOINT_POLICY))
  for (const list of Object.values(PRIVATE_SERVICE_ENDPOINT_POLICY)) {
    assert.ok(Object.isFrozen(list)); assert.deepEqual(list, [])
  }
  for (const env of [undefined, null, {}, {VITE_HYPOTHESIS_ENDPOINT:hypothesis, VITE_PRIVATE_MARKETS_ENDPOINT:markets}])
    assert.deepEqual(resolvePrivateServiceConfig(env), closed)
})
test('only exact independently approved service destinations are returned', () => {
  const env = {VITE_HYPOTHESIS_ENDPOINT:hypothesis, VITE_PRIVATE_MARKETS_ENDPOINT:markets,
    VITE_SERVICE_ROLE_KEY:'synthetic-secret-must-not-pass-through', arbitrary:'ignored'}
  const result = resolvePrivateServiceConfig(env, policy)
  assert.deepEqual(result, {hypothesisEndpoint:hypothesis, privateMarketsEndpoint:markets})
  assert.ok(Object.isFrozen(result))
  assert.deepEqual(resolvePrivateServiceConfig({VITE_HYPOTHESIS_ENDPOINT:markets,VITE_PRIVATE_MARKETS_ENDPOINT:hypothesis},policy),closed)
})
test('malformed or unsafe URLs fail even if accidentally present in policy', () => {
  const invalid = [null,42,{},'', ' '+hypothesis, hypothesis+' ', hypothesis+'/', hypothesis+'?token=x',
    hypothesis+'#x', hypothesis.replace('https:','http:'), hypothesis.replace('https:','javascript:'),
    hypothesis.replace('https://','https://user:password@'), hypothesis.replace('.co/','.co:444/'),
    hypothesis.replace('qikvmopbtijoebdqosyq','other-project'), hypothesis.replace('/functions/v1/','/rest/v1/'),
    origin+'/functions/v1/../synthetic-hypothesis', origin+'/functions/v1/%73ynthetic-hypothesis',
    origin+'/functions/v1/synthetic-hypothesis/redirect', hypothesis.replace('https://','https://evil.example/')]
  for (const value of invalid) assert.deepEqual(resolvePrivateServiceConfig(
    {VITE_HYPOTHESIS_ENDPOINT:value,VITE_PRIVATE_MARKETS_ENDPOINT:value},
    {hypothesisEndpoint:[value],privateMarketsEndpoint:[value]}),closed,String(value))
})
