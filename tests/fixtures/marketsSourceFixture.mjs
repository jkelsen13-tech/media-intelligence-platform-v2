// SYNTHETIC browser/unit fixtures. No asset, relationship or source admission.
export const marketFixtureId = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0')
export function marketsSourceFixture() {
  const id = marketFixtureId, validAt = '2024-04-08T18:00:00.000001Z'
  const asset = (n, kind, name, namespace, identifier) => ({ id: id(n), recordVersionId: id(n + 100), name, kind,
    ...(kind === 'equity' ? { issuerId: id(90) } : { networkId: namespace, assetIdentifier: identifier }),
    releaseState: 'public', publiclyEligible: true, validFrom: '2020-01-01T00:00:00Z', validTo: null,
    aliases: [{ symbol: 'SAME', namespace, recordVersionId: id(n + 200), validFrom: '2020-01-01T00:00:00Z', validTo: null }] })
  const assets = [asset(1, 'equity', 'Synthetic Northstar — Class A', 'TEST-NYSE'),
    asset(2, 'equity', 'Synthetic Northstar — Class B', 'TEST-LSE'),
    asset(3, 'cryptoasset', 'Synthetic major coin', 'test-network-a', 'native:synthetic'),
    asset(4, 'cryptoasset', 'Synthetic same-symbol token', 'test-network-b', 'contract:synthetic')]
  const reporting = ['direct_reporting', 'supply', 'regulation'].map((relationship, index) => {
    const excerpt = `Synthetic retained ${relationship.replaceAll('_', ' ')} reporting.`
    const capture = { id: id(300 + index), articleId: id(400 + index), rootId: id(500), payloadHash: 'a'.repeat(64),
      publiclyEligible: true, summary: excerpt, publishedAt: '2024-04-08', recordedAt: '2026-10-02T07:00:00.123456Z',
      sourceUrl: `https://example.test/synthetic-market-source-${index}`, rights: { displayExcerpt: true, recordVersionId: id(600 + index), attribution: 'Synthetic fixture source, not admitted evidence.' } }
    const assessment = { id: id(700 + index), candidateId: id(800 + index), from: assets[0].id, to: id(900 + index), relationship,
      outcome: 'supported', stale: false, supersededBy: [], algorithmVersion: 'synthetic-v1', uncertainty: 'Synthetic fixture; no production finding.',
      releaseState: 'public', publiclyEligible: true, validFrom: '2020-01-01T00:00:00Z', validTo: null,
      supports: [{ captureId: capture.id, field: 'summary', start: 0, end: Array.from(excerpt).length, excerpt }] }
    return { ...(relationship === 'regulation' ? { relevance: 'broader_context' } : {}), evidence: { at: validAt, asset: assets[0], eventId: assessment.to,
      assessments: [assessment], captures: [capture], hops: [{ from: assessment.from, to: assessment.to, relationship, assessmentId: assessment.id }] } }
  })
  const binding = { publicVersionId:id(2000),captureId:id(2001),payloadHash:'b'.repeat(64),articleId:id(2002),
    admissionKind:'reviewed_proposition',reviewRef:'synthetic-review-only',policyVersion:'synthetic-policy-v1',reviewedBy:'synthetic_owner',
    reviewedAt:'2026-10-02T07:00:00Z',field:'summary',start:0,end:19,excerpt:'Synthetic identity.',excerptHash:'c'.repeat(64),
    eventId:id(900),rightsVersionId:id(2010),attribution:'Synthetic fixture source, not admitted evidence.' }
  const identity = (n, type, name, extras={}) => ({ id:id(n),recordVersionId:id(n+100),identityType:type,name,...extras,
    methodVersion:'synthetic-identity-v1',reviewRef:'synthetic-identity-review',sourceBindings:[structuredClone(binding)],
    validFrom:'2020-01-01T00:00:00Z',validTo:null })
  const issuer = identity(90,'issuer','Synthetic issuer')
  const shareA = identity(91,'share_class','Synthetic class A',{issuerId:issuer.id})
  const shareB = identity(92,'share_class','Synthetic class B',{issuerId:issuer.id})
  const networkA = identity(93,'network','Synthetic network A'), networkB = identity(94,'network','Synthetic network B')
  const identities = [issuer,shareA,shareB,networkA,networkB]
  for (const asset of assets) {
    const row = identity(Number(asset.id.slice(-12)),asset.kind === 'equity' ? 'listing' : 'cryptoasset',asset.name,
      asset.kind === 'equity' ? {issuerId:issuer.id,shareClassId:asset.id === id(1) ? shareA.id : shareB.id,exchangeMic:asset.id === id(1) ? 'TST1' : 'TST2'}
        : {networkId:asset.id === id(3) ? networkA.id : networkB.id,assetIdentifier:asset.assetIdentifier,assetIdentifierKind:asset.id === id(3) ? 'native' : 'contract'})
    row.aliases = asset.aliases.map(alias => ({...alias,recordVersionId:row.recordVersionId,publicVersionId:binding.publicVersionId}))
    Object.assign(asset,row)
    const refs = asset.kind === 'equity' ? [row,issuer,asset.id === id(1) ? shareA : shareB] : [row,asset.id === id(3) ? networkA : networkB]
    asset.identityRefs = refs.map(ref => ({id:ref.id,recordVersionId:ref.recordVersionId,identityType:ref.identityType,name:ref.name,
      methodVersion:ref.methodVersion,reviewRef:ref.reviewRef,sourceBindings:ref.sourceBindings}))
    identities.push(row)
  }
  reporting.forEach((path,index) => {
    const capture = path.evidence.captures[0], support = path.evidence.assessments[0].supports[0]
    capture.publicVersionId = id(2100+index)
    Object.assign(path,{id:id(2200+index),recordVersionId:id(2300+index),methodVersion:'synthetic-path-v1',reviewRef:'synthetic-path-review',
      sourceBindings:[{...binding,publicVersionId:capture.publicVersionId,captureId:capture.id,payloadHash:capture.payloadHash,
        articleId:capture.articleId,field:support.field,start:support.start,end:support.end,excerpt:support.excerpt,
        eventId:path.evidence.eventId,rightsVersionId:capture.rights.recordVersionId,attribution:capture.rights.attribution}]})
  })
  return { contract: 'mip-markets-admitted-directory-v2', status: 'available', version: 'synthetic-directory-v2', validAt,
    observedAt: '2026-10-02T07:00:00.654321Z', identities, assets, reporting }
}
