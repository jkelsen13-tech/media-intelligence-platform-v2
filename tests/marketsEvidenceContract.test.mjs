import test from 'node:test'
import assert from 'node:assert/strict'
import { marketInstant, validateMarketAsset, validateMarketEvidencePath } from '../supabase/functions/_shared/marketsEvidenceContract.mjs'
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12,'0')
const at = '2024-04-08T18:00:00.000001Z'
function fixture(kind='equity', indirect=false) {
  const source = { id:id(10),articleId:id(11),rootId:id(12),payloadHash:'a'.repeat(64),
    publiclyEligible:true,summary:'Exact retained relationship support.',publishedAt:'2024-04-08',
    recordedAt:'2024-04-09T00:00:00.123456Z',sourceUrl:'https://example.org/retained',
    rights:{displayExcerpt:true,recordVersionId:id(13),attribution:'Synthetic test fixture.'}}
  const asset = {id:id(1),recordVersionId:id(2),name:'Synthetic asset',kind,
    issuerId:id(3),networkId:'test-network',assetIdentifier:'native:synthetic',
    releaseState:'public',publiclyEligible:true,
    validFrom:'2020-01-01T00:00:00Z',validTo:null,
    aliases:[{symbol:'SAME',namespace:kind==='equity'?'test-exchange':'test-network',
      recordVersionId:id(4),validFrom:'2020-01-01T00:00:00Z',validTo:null}]}
  const assessment = (n,from,to,relationship) => ({id:id(n),candidateId:id(n+100),
    from,to,relationship,outcome:'supported',stale:false,supersededBy:[],
    algorithmVersion:'synthetic-v1',uncertainty:'Fixture, not a production finding.',
    releaseState:'public',publiclyEligible:true,validFrom:'2020-01-01T00:00:00Z',validTo:null,
    supports:[{captureId:source.id,field:'summary',start:0,end:36,excerpt:source.summary}]})
  const assessments = indirect ? [assessment(20,asset.id,id(3),'ownership'),assessment(21,id(3),id(9),'operation')]
    : [assessment(20,asset.id,id(9),'direct_reporting')]
  return {at,asset,eventId:id(9),captures:[source],assessments,
    hops:assessments.map(a=>({from:a.from,to:a.to,relationship:a.relationship,assessmentId:a.id}))}
}
test('market instants preserve sub-ms distinctions, offsets and valid calendar bounds',()=>{
  assert.equal(marketInstant('2024-04-08 23:30:00.000001+0530'),marketInstant(at))
  assert.equal(marketInstant('2024-04-08T18:00:00.000002Z')-marketInstant(at),1000n)
  for(const bad of ['2024-04-08','2023-02-29T00:00:00Z','2024-04-31T00:00:00Z',
    '2024-04-08T24:00:00Z','2024-04-08T18:00:00','2024-04-08T18:00:00+24:00'])
    assert.equal(marketInstant(bad),null)
  assert.notEqual(marketInstant('0001-01-01T00:00:00Z'),null)
})
test('stock and crypto paths retain exact evidence and distinguish direct from connected',()=>{
  for(const kind of ['equity','cryptoasset']) for(const indirect of [false,true]) {
    const input=fixture(kind,indirect), before=structuredClone(input)
    const result=validateMarketEvidencePath(input)
    assert.equal(result.status,'ok')
    assert.equal(result.relation,indirect?'connected_development':'direct_reporting')
    assert.equal(result.path[0].supports[0].publishedAt,'2024-04-08')
    assert.equal(result.path[0].supports[0].recordedAt,'2024-04-09T00:00:00.123456Z')
    assert.equal(result.path[0].supports[0].payloadHash,'a'.repeat(64))
    assert.equal(result.path[0].supports[0].rightsRecordVersionId,id(13))
    assert.deepEqual(result.rootIds,[id(12)],'shared underlying origin stays one root')
    assert.equal('confidence' in result,false)
    assert.equal('causal' in result,false)
    assert.deepEqual(input,before)
    result.asset.name='mutated output'
    assert.equal(input.asset.name,before.asset.name)
  }
})
test('canonical identity is not a ticker; aliases are namespace-qualified and dated',()=>{
  const equity=fixture().asset, crypto=fixture('cryptoasset').asset
  crypto.id=id(50)
  assert.equal(equity.aliases[0].symbol,crypto.aliases[0].symbol)
  assert.notEqual(validateMarketAsset(equity,at).asset.id,validateMarketAsset(crypto,at).asset.id)
  equity.aliases[0].validTo=at
  assert.deepEqual(validateMarketAsset(equity,at).aliases,[],'half-open validity')
  equity.validTo=at
  assert.equal(validateMarketAsset(equity,at).status,'unavailable')
  for(const mutate of [
    a=>{a.id='SAME'},a=>{a.recordVersionId=null},a=>{a.issuerId=null},
    a=>{a.aliases[0].namespace=''},a=>{a.aliases[0].validTo='nonsense'},
    a=>{a.publiclyEligible=false},a=>{a.releaseState='private'},
  ]) {
    const a=fixture().asset;mutate(a)
    assert.equal(validateMarketAsset(a,at).status,'unavailable')
  }
  crypto.assetIdentifier=''
  assert.equal(validateMarketAsset(crypto,at).status,'unavailable')
})
test('every essential hop must be exact, supported, current and independently eligible',()=>{
  for(const mutate of [
    x=>{x.assessments[1].outcome='contested'},
    x=>{x.assessments[1].stale=true},
    x=>{x.assessments[1].supersededBy=[id(99)]},
    x=>{x.assessments[1].publiclyEligible=false},
    x=>{x.assessments[1].releaseState='private'},
    x=>{x.assessments[1].validFrom='2024-04-08T18:00:00.000002Z'},
    x=>{x.assessments[1].validTo=at},
    x=>{x.assessments[1].to=id(88)},
    x=>{x.assessments[1].supports=[]},
    x=>{x.hops[1].relationship='price_moved'},
    x=>{x.hops[1].relationship='co_location'},
    x=>{x.hops[1].from=id(88)},
    x=>{x.hops[1].to=x.asset.id},
    x=>{x.hops[1].assessmentId=x.hops[0].assessmentId},
    x=>{x.eventId=id(88)},
    x=>{x.assessments.push(structuredClone(x.assessments[0]))},
  ]) {
    const input=fixture('equity',true);mutate(input)
    assert.equal(validateMarketEvidencePath(input).status,'unavailable')
  }
})
test('correction, missing bytes, rights loss and forbidden URLs fail without promoting evidence',()=>{
  for(const mutate of [
    x=>{x.captures[0].summary='Corrected retained relationship support.'},
    x=>{x.captures[0].publiclyEligible=false},
    x=>{x.captures[0].rights.displayExcerpt=false},
    x=>{x.captures[0].rights.recordVersionId=null},
    x=>{x.captures[0].rootId=null},
    x=>{x.captures[0].payloadHash='unretained'},
    x=>{x.captures[0].sourceUrl='javascript:alert(1)'},
    x=>{x.assessments[0].supports[0].start=-1},
    x=>{x.assessments[0].supports[0].end=1.5},
    x=>{x.assessments[0].supports[0].field='price'},
    x=>{x.captures=[]},
  ]) {
    const input=fixture();mutate(input)
    assert.equal(validateMarketEvidencePath(input).status,'unavailable')
  }
})

test('qualification returns a narrow projection rather than forwarding hidden caller fields',()=>{
  const input=fixture()
  input.asset.privateNotes='do not forward'
  input.asset.aliases[0].accessToken='do not forward'
  input.hops[0].priceSignal='must not infer causation'
  input.assessments[0].supports[0].internalNotes='do not forward'
  const result=validateMarketEvidencePath(input)
  assert.equal(result.status,'ok')
  const serialized=JSON.stringify(result)
  assert.equal(serialized.includes('do not forward'),false)
  assert.equal(serialized.includes('priceSignal'),false)
  input.captures[0].sourceUrl='https://user:password@example.org/secret'
  assert.equal(validateMarketEvidencePath(input).status,'unavailable')
})

test('source spans use PostgreSQL Unicode code points, not UTF-16 offsets',()=>{
  const input=fixture()
  input.captures[0].summary='🌐 Exact support.'
  input.assessments[0].supports[0]={captureId:id(10),field:'summary',start:2,end:15,excerpt:'Exact support.'}
  input.assessments[0].supports[0].end=16
  assert.equal(validateMarketEvidencePath(input).status,'ok')
  input.assessments[0].supports[0].start=3
  assert.equal(validateMarketEvidencePath(input).status,'unavailable')
})
