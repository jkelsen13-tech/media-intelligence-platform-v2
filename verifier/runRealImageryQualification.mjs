import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describeDetachedRealImageryReceipt } from './realImageryQualification.mjs'

const run = promisify(execFile)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const value = name => {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : null
}
const evidence = resolve(value('--evidence') ?? '/workspace/mip-real-imagery-evidence/qualified-source-run')
const received = resolve(value('--received-directory') ?? '/workspace/mip-ohio-derivative')
const transfer = resolve(value('--transfer-receipt') ?? '/workspace/mip-launch-receipts/ohio-derivative-library-transfer.json')
const expected = resolve(root, 'verifier/realImagery/ohio-BN18756325.expected.json')
const python = process.env.MIP_GEOSPATIAL_PYTHON ?? '/usr/bin/python3'
await mkdir(evidence) // New directory required: preserve earlier evidence.
const command = args => run(python, [resolve(root, 'scripts/realImageryDerivative.py'), ...args],
  { cwd: root, timeout: 60_000, maxBuffer: 2 * 1024 * 1024 })
const policy = 'detached-background-research operation-reported accuracy <=1m; no evidence registration or admission'
const packagePath = resolve(evidence, 'wgs84-research.zip')
const prepare = await command(['prepare-received', '--expected', expected, '--directory', received,
  '--transfer-receipt', transfer, '--output', packagePath, '--receipt', resolve(evidence, 'received-qualification.json'),
  '--transform-tolerance-metres', '1', '--transform-policy-reference', policy])
await writeFile(resolve(evidence, 'prepare.log'), prepare.stdout + prepare.stderr)
const prepared = JSON.parse(prepare.stdout)
assert.equal(prepared.receivedArtifactsVerified.length, 15)
assert.equal(prepared.nativePreviewSamplesCompared, 3145728)
assert.equal(prepared.nativePreviewSampleMismatches, 0)
assert.equal(prepared.originalTiffBytesVerifiedLocally, false)
const consumed = await command(['verify', '--expected', expected, '--package', packagePath,
  '--package-sha256', prepared.packageSha256, '--receipt', resolve(evidence, 'consumer-receipt.json')])
await writeFile(resolve(evidence, 'consume.log'), consumed.stdout + consumed.stderr)
const receipt = JSON.parse(await readFile(resolve(evidence, 'consumer-receipt.json'), 'utf8'))
assert.equal(receipt.declaredExtentTransformationReproducedLocally, true)
assert.equal(receipt.originalTiffBytesVerifiedLocally, false)
assert.equal(receipt.originalArchiveBytesVerifiedLocally, false)
assert.equal(receipt.sourceAuthorityVerifiedLocally, false)
assert.equal(receipt.manifest.source.verifiedByProducer, false)
assert.equal(receipt.manifest.evidencePoint.datum, 'unknown')
assert.equal(receipt.manifest.capture.start, '2023-03-07')
assert.equal(receipt.manifest.capture.precision, 'day')
assert.equal(receipt.manifest.tiles.reduce((n, tile) => n + tile.pixelChecks.checkedOutputCentres, 0), 1048576)
assert.equal(receipt.manifest.tiles.reduce((n, tile) => n + tile.pixelChecks.inverseRgbSamples.length, 0), 36)
const repeated = await command(['prepare-received', '--expected', expected, '--directory', received,
  '--transfer-receipt', transfer, '--output', resolve(evidence, 'repeat-wgs84-research.zip'),
  '--receipt', resolve(evidence, 'repeat-received-qualification.json'), '--transform-tolerance-metres', '1',
  '--transform-policy-reference', policy])
assert.equal(JSON.parse(repeated.stdout).packageSha256, prepared.packageSha256)
const exported = await command(['export-research', '--expected', expected, '--package', packagePath,
  '--package-sha256', prepared.packageSha256, '--output-directory', resolve(evidence, 'planar-inspection')])
await writeFile(resolve(evidence, 'export.log'), exported.stdout + exported.stderr)
const existingGate = describeDetachedRealImageryReceipt(receipt)
assert.equal(existingGate.applicationAdmitted, false)
assert.equal(existingGate.admissionGate, 'source-not-admitted')
assert.notEqual(existingGate.rendererState.status, 'ACTIVE')
await writeFile(resolve(evidence, 'existing-admission-gate.json'), JSON.stringify(existingGate, null, 2) + '\n')
const { stdout: sha } = await run('git', ['rev-parse', 'HEAD'], { cwd: root })
const { stdout: status } = await run('git', ['status', '--porcelain'], { cwd: root })
const sourceSha256 = createHash('sha256').update(await readFile(resolve(root, 'scripts/realImageryDerivative.py'))).digest('hex')
const report = { schema: 'mip.real-imagery-source-qualification.v1',
  status: 'actual-bounded-derivative-preprocessing-qualified; application-admission-pending',
  evidenceLayer: 'actual received bounded RGB/XML bytes and offline GDAL/PROJ; no geographic renderer or device qualification',
  gitHead: sha.trim(), worktreeClean: status.trim() === '', node: process.version, sourceSha256,
  expectedContractSha256: createHash('sha256').update(await readFile(expected)).digest('hex'),
  package: { path: packagePath, sha256: prepared.packageSha256, bytes: prepared.packageBytes,
    decodedRgbaBytes: prepared.generatedDecodedRgbaBytes, totalRuntimeResourceBytes: prepared.packageBytes + prepared.generatedDecodedRgbaBytes,
    ceilingBytes: 16777216, deterministicRepeat: true },
  checks: { receivedArtifactHashes: 15, nativePngChannelSamples: 3145728, channelMismatches: 0,
    inverseOutputCentresInsideReceivedSource: 1048576, inverseRgbSamples: 36,
    operationBallparkAllowed: false, operationReportedAccuracyMetres: 1, networkEnabled: false,
    originalXmlRightsNoticeCaptureBindings: true, existingAdmissionGate: existingGate.admissionGate },
  gates: { originalSourceDecodedLocally: false, originalSourceAuthorityAdmitted: false,
    planningNoncadastralMIPUseCompatibilityResolved: false, rendererCoverageAdmitted: false,
    geographicRendererObserved: false, appSourceActivated: false, physicalDeviceQualified: false,
    evidencePointDatumKnown: false, evidencePrecisionIncreased: false },
}
await writeFile(resolve(evidence, 'qualification.json'), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
