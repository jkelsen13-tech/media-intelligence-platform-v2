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
    hypothesis+'#x', hypothesis+'?', hypothesis+'#', hypothesis+'?#', hypothesis.replace('https:','http:'), hypothesis.replace('https:','javascript:'),
    hypothesis.replace('https://','https://user:password@'), hypothesis.replace('.co/','.co:444/'),
    hypothesis.replace('qikvmopbtijoebdqosyq','other-project'), hypothesis.replace('/functions/v1/','/rest/v1/'),
    origin+'/functions/v1/../synthetic-hypothesis', origin+'/functions/v1/%73ynthetic-hypothesis',
    origin+'/functions/v1/synthetic-hypothesis/redirect', hypothesis.replace('https://','https://evil.example/')]
  for (const value of invalid) assert.deepEqual(resolvePrivateServiceConfig(
    {VITE_HYPOTHESIS_ENDPOINT:value,VITE_PRIVATE_MARKETS_ENDPOINT:value},
    {hypothesisEndpoint:[value],privateMarketsEndpoint:[value]}),closed,String(value))
})

test('poisoned inherited includes cannot approve an empty production policy', () => {
  const original = Object.getOwnPropertyDescriptor(Array.prototype, 'includes')
  let calls = 0, result
  try {
    Object.defineProperty(Array.prototype, 'includes', {configurable:true, writable:true,
      value:() => { calls++; return true }})
    result = resolvePrivateServiceConfig({VITE_HYPOTHESIS_ENDPOINT:hypothesis,VITE_PRIVATE_MARKETS_ENDPOINT:markets})
  } finally { Object.defineProperty(Array.prototype, 'includes', original) }
  assert.deepEqual(result, closed)
  assert.equal(calls, 0)
})
test('approval uses own data entries, not inherited policy fields, sparse slots or accessors', () => {
  const env = {VITE_HYPOTHESIS_ENDPOINT:hypothesis}
  assert.deepEqual(resolvePrivateServiceConfig(env,Object.create(policy)),closed)
  const sparse = new Array(1)
  const inherited = Object.create(Array.prototype)
  Object.defineProperty(inherited,'0',{value:hypothesis})
  Object.setPrototypeOf(sparse,inherited)
  assert.deepEqual(resolvePrivateServiceConfig(env,{hypothesisEndpoint:sparse}),closed)
  let calls = 0
  const accessorPolicy = Object.defineProperty({},'hypothesisEndpoint',{get(){calls++;return [hypothesis]}})
  const accessorEntry = Object.defineProperty(new Array(1),'0',{get(){calls++;return hypothesis}})
  assert.deepEqual(resolvePrivateServiceConfig(env,accessorPolicy),closed)
  assert.deepEqual(resolvePrivateServiceConfig(env,{hypothesisEndpoint:accessorEntry}),closed)
  assert.deepEqual(resolvePrivateServiceConfig(Object.create(env),policy),closed)
  assert.equal(calls,0)
  const approved = [hypothesis]
  approved.includes = () => {throw Error('must not call approval methods')}
  assert.deepEqual(resolvePrivateServiceConfig(env,{hypothesisEndpoint:approved}),
    {hypothesisEndpoint:hypothesis,privateMarketsEndpoint:null})
})

test('configuration boot does not require Object.hasOwn on declared older browser targets', () => {
  const original = Object.getOwnPropertyDescriptor(Object, 'hasOwn')
  let result
  try {
    Object.defineProperty(Object, 'hasOwn', {configurable:true,writable:true,value:undefined})
    result = resolvePrivateServiceConfig({VITE_HYPOTHESIS_ENDPOINT:hypothesis,VITE_PRIVATE_MARKETS_ENDPOINT:markets})
  } finally {
    if (original) Object.defineProperty(Object, 'hasOwn', original)
    else delete Object.hasOwn
  }
  assert.deepEqual(result,closed)
})
