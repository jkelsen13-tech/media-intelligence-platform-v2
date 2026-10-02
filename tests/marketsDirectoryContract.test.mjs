import test from 'node:test'
import assert from 'node:assert/strict'
import { projectMarketsDirectory,validateMarketsPublicDirectory } from '../supabase/functions/_shared/marketsDirectoryContract.mjs'
import {MARKETS_PROVIDER_POSTURE,qualifyMarketsProviderRequest} from '../supabase/functions/_shared/marketsProviderPolicy.mjs'
import {marketsSourceFixture,marketFixtureId as id} from './fixtures/marketsSourceFixture.mjs'
function fixture() {
  const snapshot=marketsSourceFixture(),versions=new Map(),rights=new Map(),qualifications=new Map(),assessments=new Map()
  const records=[...snapshot.identities.map(row=>({id:row.recordVersionId,record_key:row.id,record_kind:'market_identity',operation:'insert',payload:row})),
    ...snapshot.reporting.map(row=>({id:row.recordVersionId,record_key:row.id,record_kind:'market_evidence_path',operation:'insert',payload:row}))]
  for(const record of records){
    qualifications.set(record.id,{recordVersionId:record.id,reviewKind:record.record_kind==='market_identity'?'identity_mapping':'supported_path',reviewRef:record.payload.reviewRef,methodVersion:record.payload.methodVersion})
    for(const b of record.payload.sourceBindings){
      versions.set(b.publicVersionId,{public_version_id:b.publicVersionId,article_id:b.articleId,capture_id:b.captureId,capture_hash:b.payloadHash,
        admission_kind:'reviewed_proposition',review_ref:b.reviewRef,policy_version:b.policyVersion,reviewed_by:b.reviewedBy,reviewed_at:b.reviewedAt,
        evidence:[{capture_id:b.captureId,capture_hash:b.payloadHash,source_field:b.field,span_start:b.start,span_end:b.end,excerpt:b.excerpt,excerpt_hash:b.excerptHash,event_id:b.eventId}]})
      rights.set(b.publicVersionId,{id:b.rightsVersionId,publicVersionId:b.publicVersionId,captureId:b.captureId,payloadHash:b.payloadHash,
        displayExcerpt:true,attribution:b.attribution,reviewRef:'synthetic-rights',reviewedBy:'fixture_owner',checkedAt:'2026-10-02T06:00:00Z',validUntil:null,termsUrl:'https://example.test/synthetic-terms'})
    }
    for(const a of record.payload.evidence?.assessments??[]) assessments.set(a.id,{id:a.id,candidate_id:a.candidateId,outcome:a.outcome,stale:a.stale,superseded_by:a.supersededBy,
      algorithm_version:a.algorithmVersion,remaining_uncertainty:a.uncertainty,release_state:'private'})
  }
  const owner={readReviewedArticleVersion:id=>versions.get(id),readExcerptRights:id=>rights.get(id),readMarketQualification:id=>qualifications.get(id),readAssessment:id=>assessments.get(id)}
  return {snapshot,records,owner,versions,rights,qualifications,assessments,project:()=>projectMarketsDirectory({at:snapshot.validAt,observedAt:snapshot.observedAt,version:'fixture-owned-v2',records},owner)}
}
test('native identity mapping and exact reviewed source/right decisions produce distinct assets without pair substitution',()=>{
  const f=fixture(),result=f.project()
  assert.equal(result.status,'available');assert.equal(validateMarketsPublicDirectory(result.snapshot).status,'available')
  assert.equal(result.snapshot.assets.length,4)
  assert.deepEqual(result.snapshot.assets[0].identityRefs.map(r=>r.identityType),['listing','issuer','share_class'])
  assert.notEqual(result.snapshot.assets[0].id,result.snapshot.assets[0].issuerId)
  assert.equal(result.snapshot.reporting.length,3)
  assert.equal(result.snapshot.reporting[0].evidence.captures[0].summary,undefined)
  assert.equal(result.snapshot.reporting[0].evidence.captures[0].admittedSpans.length,1)
  assert.equal(f.assessments.values().next().value.release_state,'private')
})
test('source reports, withheld owner decisions and unavailable or expired rights cannot admit an identity',()=>{
  for(const change of [f=>f.versions.get(id(2000)).admission_kind='source_report',f=>f.versions.delete(id(2000)),f=>f.rights.delete(id(2000)),
    f=>f.rights.get(id(2000)).displayExcerpt=false,f=>f.rights.get(id(2000)).validUntil='2026-10-02T07:00:00Z',f=>f.qualifications.clear()]){
    const f=fixture();change(f);assert.equal(f.project().status,'unavailable')
  }
  const f=fixture();assert.equal(projectMarketsDirectory({at:f.snapshot.validAt,records:f.records}).reason,'owner_or_scope_unavailable')
})
test('capture hash, source span, event and native assessment correction failures remove only the affected path',()=>{
  for(const change of [f=>f.versions.get(id(2100)).capture_hash='d'.repeat(64),f=>f.versions.get(id(2100)).evidence[0].span_end++,
    f=>f.versions.get(id(2100)).evidence[0].event_id=id(9999),f=>f.assessments.get(id(700)).stale=true,
    f=>f.assessments.get(id(700)).outcome='contested',f=>f.assessments.get(id(700)).superseded_by=[id(9999)],
    f=>f.qualifications.delete(id(2300))]){
    const f=fixture();change(f);const result=f.project();assert.equal(result.status,'available');assert.equal(result.snapshot.reporting.length,2)
  }
})
test('directory identity/version collisions, issuer/share-class merges and pair misclassification fail closed',()=>{
  for(const change of [f=>f.records.push(structuredClone(f.records[0])),f=>f.records[0].payload.recordVersionId=id(9999),
    f=>f.records.find(r=>r.record_key===id(1)).payload.shareClassId=id(90),f=>f.records.find(r=>r.record_key===id(3)).payload.networkId=id(3)]){
    const f=fixture();change(f);assert.equal(f.project().status,'unavailable')
  }
  const f=fixture(),snapshot=f.project().snapshot;snapshot.contract='mip-markets-authorized-directory-v1'
  assert.equal(validateMarketsPublicDirectory(snapshot).status,'unavailable')
})
test('public projection strips private fields and needs exact source rights, identity versions and path event binding',()=>{
  const f=fixture();f.records[0].payload.privateNote='DO-NOT-EXPOSE';f.records.at(-1).payload.evidence.captures[0].body='DO-NOT-EXPOSE'
  const projected=f.project().snapshot;assert.doesNotMatch(JSON.stringify(projected),/DO-NOT-EXPOSE/)
  const mismatched=JSON.parse(JSON.stringify(projected));mismatched.assets[0].aliases[0].symbol='GUESS'
  assert.equal(validateMarketsPublicDirectory(mismatched).status,'unavailable')
  const path=structuredClone(projected);path.reporting[0].sourceBindings[0].rightsVersionId=id(9999)
  assert.equal(validateMarketsPublicDirectory(path).snapshot.reporting.length,2)
})
test('accepted provider directions stay disabled under zero subscription/overage cost and unresolved actual terms',()=>{
  assert.equal(MARKETS_PROVIDER_POSTURE.incrementalSubscriptionCeiling,0);assert.equal(MARKETS_PROVIDER_POSTURE.scrapedFallback,false)
  assert.equal(MARKETS_PROVIDER_POSTURE.crypto.state,'conditional_terms_unresolved')
  for(const [input,reason] of [[{},'zero_cost_ceiling'],[{subscriptionCost:1,overageCost:0},'zero_cost_ceiling'],
    [{subscriptionCost:0,overageCost:0,provider:'TradingView'},'actual_account_rights_unqualified'],
    [{subscriptionCost:0,overageCost:0,provider:'CoinMarketCap Basic',accountRights:'owner_qualified_actual_agreement',remainingCredits:0,requestCredits:1},'bounded_credits_unqualified'],
    [{subscriptionCost:0,overageCost:0,provider:'TradingView',accountRights:'owner_qualified_actual_agreement'},'provider_activation_not_authorized']]){
    assert.deepEqual(qualifyMarketsProviderRequest(input),{status:'blocked',reason})
  }
})
