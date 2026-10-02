import { WORLD_VIEW_REALISM_RIGHTS, evaluateWorldViewRealismAdmission,
  resolveWorldViewRealismLayer } from '../src/lib/worldViewRealismAdmission.js'

// Inspection consumer only. No source registry, App services, provider creation,
// rights grant, activation or authority write. Even a supplied approved:true is
// ignored: only the existing publication/admission owner can release a source.
export function describeDetachedRealImageryReceipt(receipt) {
  const manifest = receipt?.manifest
  const recordedDay = manifest?.capture?.start
  const day = typeof recordedDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(recordedDay)
    ? new Date(`${recordedDay}T00:00:00Z`) : null
  if (receipt?.schema !== 'mip.real-imagery-consumer-receipt.v1'
    || receipt.status !== 'bounded-derivative-bytes-verified'
    || receipt.derivativePixelsVerifiedLocally !== true || receipt.metadataXmlVerifiedLocally !== true
    || receipt.originalTiffBytesVerifiedLocally !== false || receipt.originalArchiveBytesVerifiedLocally !== false
    || receipt.sourceAuthorityVerifiedLocally !== false || receipt.coverageAdmitted !== false
    || !/^[a-f0-9]{64}$/.test(receipt.packageSha256 ?? '')
    || !Number.isInteger(receipt.packageBytes) || receipt.packageBytes <= 0
    || !Number.isInteger(receipt.decodedRgbaBytes) || receipt.decodedRgbaBytes <= 0
    || receipt.resourceCeilingBytes !== 16777216
    || receipt.packageBytes + receipt.decodedRgbaBytes > receipt.resourceCeilingBytes
    || manifest?.schema !== 'mip.real-imagery-derivative.v1'
    || typeof manifest.sourceId !== 'string' || !manifest.sourceId
    || !/^[a-f0-9]{64}$/.test(manifest.metadata?.sha256 ?? '')
    || !Array.isArray(manifest.metadata?.xmlBindings)
    || !['attribution', 'use_constraints'].every(id => manifest.metadata.xmlBindings.some(field => field?.id === id
      && typeof field.text === 'string' && field.text.trim() && typeof field.path === 'string' && field.path.startsWith('./')))
    || !['EPSG:3753', 'EPSG:4326'].includes(manifest.derivation?.targetCrs)
    || manifest.capture?.precision !== 'day' || !day || !Number.isFinite(day.getTime())
    || day.toISOString().slice(0, 10) !== recordedDay
    || manifest.evidencePoint?.synthetic !== true || manifest.evidencePoint?.datum !== 'unknown'
    || manifest.evidencePoint?.registered !== false) {
    return { status: 'refused', reason: 'invalid-detached-receipt', source: null, applicationAdmitted: false }
  }
  const binding = id => manifest.metadata?.xmlBindings?.find(field => field.id === id)
  const source = {
    id: manifest.sourceId, kind: 'imagery', contentKind: 'photographic', costTier: 'cheap',
    admission: { approved: false, reference: null },
    rights: { reference: `sha256:${manifest.metadata.sha256}`,
      ...Object.fromEntries(WORLD_VIEW_REALISM_RIGHTS.map(right => [right, false])) },
    attribution: binding('attribution') ? [{ text: binding('attribution').text,
      reference: `sha256:${manifest.metadata.sha256}#${binding('attribution').path}` }] : [],
    capture: { ...manifest.capture, verified: true },
    qualification: { reference: `sha256:${receipt.packageSha256}`, sha256: receipt.packageSha256,
      bytesVerified: true, decodedVerified: true, pixelsVerified: true,
      assetCrs: manifest.derivation.targetCrs, assetCrsVerified: false,
      coverageVerified: false, geometryVerified: false },
    coverage: { crs: 'EPSG:4326', bounds: manifest.derivation.transformation?.rendererBounds ?? null },
    accuracy: { horizontalMeters: null, verticalMeters: null, method: null },
    resolutionMeters: null, lod: null,
    displayOnly: true, increasesEvidencePrecision: false,
  }
  return {
    status: 'verified-detached-input-awaiting-source-authority', source,
    applicationAdmitted: evaluateWorldViewRealismAdmission(source).approved,
    admissionGate: evaluateWorldViewRealismAdmission(source).reason,
    rendererState: resolveWorldViewRealismLayer({ kind: 'imagery', sources: [source], observation: null }),
    resource: { packageBytes: receipt.packageBytes, decodedRgbaBytes: receipt.decodedRgbaBytes,
      ceilingBytes: receipt.resourceCeilingBytes, scope: 'local inspection; no provider billing' },
    sourceVerification: { derivativePixelsVerifiedLocally: true, metadataXmlVerifiedLocally: true,
      originalTiffBytesVerifiedLocally: false, originalArchiveBytesVerifiedLocally: false,
      declaredExtentTransformationReproducedLocally: receipt.declaredExtentTransformationReproducedLocally === true,
      sourceAuthorityVerifiedLocally: false },
    provenance: { originalTiff: manifest.source, originalArchive: manifest.originalArchive,
      outerLibrary: manifest.outerLibrary, transformation: manifest.derivation.transformation,
      notices: binding('use_constraints')?.text ?? null,
      rightsInterpretation: manifest.metadata.rightsInterpretation,
      evidencePoint: manifest.evidencePoint, terrain: false, buildingHeights: false, facades: false },
  }
}
