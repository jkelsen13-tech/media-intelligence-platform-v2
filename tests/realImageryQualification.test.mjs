import test from 'node:test'
import assert from 'node:assert/strict'
import { describeDetachedRealImageryReceipt } from '../verifier/realImageryQualification.mjs'

const receipt = () => ({ schema: 'mip.real-imagery-consumer-receipt.v1',
  status: 'bounded-derivative-bytes-verified', derivativePixelsVerifiedLocally: true,
  metadataXmlVerifiedLocally: true, originalTiffBytesVerifiedLocally: false,
  originalArchiveBytesVerifiedLocally: false, sourceAuthorityVerifiedLocally: false, coverageAdmitted: false,
  packageSha256: 'a'.repeat(64), packageBytes: 1000, decodedRgbaBytes: 400,
  resourceCeilingBytes: 16777216, declaredExtentTransformationReproducedLocally: true,
  manifest: { schema: 'mip.real-imagery-derivative.v1', sourceId: 'SYNTHETIC-TEST-ONLY',
    source: { sha256: 'b'.repeat(64), verifiedByProducer: true }, originalArchive: { sha256: 'c'.repeat(64) },
    outerLibrary: { sha256: 'd'.repeat(64), locallyVerified: false },
    metadata: { sha256: 'e'.repeat(64), xmlBindings: [
      { id: 'attribution', text: 'SYNTHETIC TEST attribution', path: './credit' },
      { id: 'use_constraints', text: 'SYNTHETIC TEST planning only; noncadastral', path: './notice' }],
      rightsInterpretation: { classification: 'SYNTHETIC TEST only' } },
    capture: { start: '2023-03-07', precision: 'day' },
    evidencePoint: { coordinates: [-81.7, 41.4], synthetic: true, datum: 'unknown', registered: false },
    derivation: { targetCrs: 'EPSG:4326', transformation: { rendererBounds: [-81.71, 41.4, -81.7, 41.41],
      reportedOperationAccuracyMetres: 1, measuredRegistrationAccuracyMetres: null } },
  },
})

test('verified consumer pixels reuse existing admission/observation predicates and remain unadmitted', () => {
  const input = receipt(), before = JSON.stringify(input)
  const result = describeDetachedRealImageryReceipt(input)
  assert.equal(result.applicationAdmitted, false)
  assert.equal(result.admissionGate, 'source-not-admitted')
  assert.notEqual(result.rendererState.status, 'ACTIVE')
  assert.equal(result.source.qualification.bytesVerified, true)
  assert.equal(result.source.qualification.assetCrsVerified, false)
  assert.equal(result.source.qualification.coverageVerified, false)
  assert.equal(result.source.accuracy.horizontalMeters, null)
  assert.equal(result.source.resolutionMeters, null)
  assert.deepEqual(result.source.capture, { start: '2023-03-07', precision: 'day', verified: true })
  assert.equal(result.provenance.evidencePoint.datum, 'unknown')
  assert.equal(result.provenance.buildingHeights, false)
  assert.match(result.provenance.notices, /noncadastral/)
  assert.equal(JSON.stringify(input), before)
})

test('metadata-only, oversized, ambiguous original verification and synthetic registration receipts refuse', () => {
  for (const edit of [r => { r.derivativePixelsVerifiedLocally = false },
    r => { r.packageBytes = 16777216 }, r => { r.originalTiffBytesVerifiedLocally = true },
    r => { r.sourceAuthorityVerifiedLocally = true }, r => { r.coverageAdmitted = true },
    r => { r.manifest.evidencePoint.registered = true }, r => { r.manifest.evidencePoint.datum = 'EPSG:4326' }]) {
    const input = receipt(); edit(input)
    assert.equal(describeDetachedRealImageryReceipt(input).status, 'refused')
  }
})

test('supplied admission booleans never grant application admission or rights', () => {
  const input = receipt(); input.admission = { approved: true, reference: 'invented' }
  input.manifest.admission = input.admission
  input.manifest.rights = { publicWeb: true }
  const result = describeDetachedRealImageryReceipt(input)
  assert.equal(result.applicationAdmitted, false)
  assert.equal(result.source.rights.publicWeb, false)
  assert.deepEqual(result.source.admission, { approved: false, reference: null })
})

test('malformed nested metadata, missing derivative and invalid capture day refuse without throwing', () => {
  assert.equal(describeDetachedRealImageryReceipt(null).status, 'refused')
  assert.equal(describeDetachedRealImageryReceipt({}).status, 'refused')
  for (const edit of [r => { r.manifest.metadata = null }, r => { r.manifest.metadata.xmlBindings = {} },
    r => { delete r.manifest.derivation }, r => { r.manifest.capture.start = '2023-02-30' },
    r => { r.manifest.capture.start = '2023-03-07T00:00:00Z' }]) {
    const input = receipt(); edit(input)
    assert.equal(describeDetachedRealImageryReceipt(input).status, 'refused')
  }
})
