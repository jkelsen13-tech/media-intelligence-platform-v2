import test from 'node:test'
import assert from 'node:assert/strict'
import {connectAfterPoolerCacheRefresh,observedSessionPooler} from '../supabase/qualification/collector-native-capture/authenticatedPgDriver.mjs'

const failure=code=>Object.assign(Error('simulated_auth_failure'),{code})
function connections(outcomes) {
  const clients=[]
  const makeClient=()=>{
    const client={closed:false,async connect(){
      const outcome=outcomes[clients.length-1]
      if(outcome)throw failure(outcome)
    },async end(){this.closed=true}}
    clients.push(client)
    return client
  }
  return {makeClient,clients}
}

test('one pre-query session-pooler cache refresh reconnect only for initial 28P01',async()=>{
  const pooler='aws-0-us-west-1.pooler.supabase.com'
  assert.equal(observedSessionPooler(new URL('postgresql://example@'+pooler+':5432/postgres'),pooler,false),true)
  assert.equal(observedSessionPooler(new URL('postgresql://example@'+pooler+':5432/postgres'),pooler,true),false)
  assert.equal(observedSessionPooler(new URL('postgresql://example@db.qikvmopbtijoebdqosyq.supabase.co:5432/postgres'),'db.qikvmopbtijoebdqosyq.supabase.co',false),false)
  const stale=connections(['28P01',null])
  const connected=await connectAfterPoolerCacheRefresh(stale.makeClient,true)
  assert.equal(stale.clients.length,2)
  assert.equal(stale.clients[0].closed,true)
  assert.equal(connected,stale.clients[1])
  assert.equal(connected.closed,false)

  for(const [outcomes,pooler,expected] of [
    [['28P01',null],false,1],
    [['08006',null],true,1],
    [['28P01','28P01',null],true,2],
  ]) {
    const attempt=connections(outcomes)
    await assert.rejects(connectAfterPoolerCacheRefresh(attempt.makeClient,pooler))
    assert.equal(attempt.clients.length,expected)
    assert.ok(attempt.clients.every(client=>client.closed))
  }
})
