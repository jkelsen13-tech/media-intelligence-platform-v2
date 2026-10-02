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
  return { contract: 'mip-markets-authorized-directory-v1', status: 'available', version: 'synthetic-directory-v1', validAt,
    observedAt: '2026-10-02T07:00:00.654321Z', assets, reporting }
}
