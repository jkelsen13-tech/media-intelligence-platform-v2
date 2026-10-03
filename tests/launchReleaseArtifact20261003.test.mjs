import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { measureLaunchReleaseArtifact } from '../scripts/launchReleaseArtifact20261003.mjs'

async function fixture(fn) {
  const directory = await mkdtemp(join(tmpdir(), 'mip-release-artifact-'))
  const distPath = join(directory, 'dist'), cesiumPath = join(directory, 'package')
  await mkdir(join(distPath, 'cesium', 'Workers'), { recursive: true }); await mkdir(join(cesiumPath, 'Workers'), { recursive: true })
  for (const name of ['ThirdParty', 'Assets', 'Widgets']) await mkdir(join(cesiumPath, name))
  await writeFile(join(distPath, 'index.html'), 'fixture App HTML')
  await writeFile(join(distPath, 'cesium', 'Workers', 'test.js'), 'canonical worker')
  await writeFile(join(cesiumPath, 'Workers', 'test.js'), 'canonical worker')
  const input = { distPath, cesiumPath, source: { head: 'a'.repeat(40), tree: 'b'.repeat(40), working_tree_clean: true } }
  try { await fn(input) } finally { await rm(directory, { recursive: true, force: true }) }
}

test('actual file/byte/hash inventory distinguishes canonical assets and incidental aliases with unknown duration', async () => fixture(async input => {
  await writeFile(join(input.distPath, 'cesium', 'incidental.js'), 'alias')
  await writeFile(join(input.cesiumPath, 'Cesium.js'), 'package bundle is not a copied static root')
  const receipt = await measureLaunchReleaseArtifact(input)
  assert.equal(receipt.output.file_count, 3); assert.equal(receipt.output.total_bytes, 37)
  assert.equal(receipt.cesium.canonical_file_count, 1); assert.equal(receipt.cesium.canonical_total_bytes, 16)
  assert.equal(receipt.cesium.all_canonical_bytes_equal, true); assert.equal(receipt.cesium.noncanonical_output_count, 1)
  assert.equal(receipt.cesium.canonical_paths[0].output_path, 'cesium/Workers/test.js')
  assert.deepEqual(receipt.cesium.canonical_roots, ['Workers', 'ThirdParty', 'Assets', 'Widgets'])
  assert.equal(receipt.build.elapsed_minutes, null); assert.equal(receipt.authority.deployed, false)
  assert.equal(receipt.output.largest_file.path, 'cesium/Workers/test.js')
}))
test('missing or mismatched canonical assets fail instead of reporting deployable parity', async () => fixture(async input => {
  await writeFile(join(input.distPath, 'cesium', 'Workers', 'test.js'), 'changed')
  await assert.rejects(measureLaunchReleaseArtifact(input), /canonical Cesium artifact differs/)
  await rm(join(input.distPath, 'cesium', 'Workers', 'test.js'))
  await assert.rejects(measureLaunchReleaseArtifact(input), /canonical Cesium artifact differs/)
}))
test('symlinked build entries and failed/malformed duration evidence are refused', async () => fixture(async input => {
  await symlink(input.cesiumPath, join(input.distPath, 'escaped'))
  await assert.rejects(measureLaunchReleaseArtifact(input), /symlinks/)
  await rm(join(input.distPath, 'escaped'))
  await assert.rejects(measureLaunchReleaseArtifact({ ...input, buildMeasurement: { elapsed_seconds: 2, exit_code: 1 } }), /successful measured build receipt/)
  const receipt = await measureLaunchReleaseArtifact({ ...input, buildMeasurement: { elapsed_seconds: 90, log_sha256: 'c'.repeat(64), runtime: 'synthetic-test-runtime', exit_code: 0 } })
  assert.equal(receipt.build.elapsed_minutes, 1.5); assert.equal(receipt.build.status, 'measured_success')
}))
