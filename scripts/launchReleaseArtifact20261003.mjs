// Read-only build inventory. It never deploys, connects to a provider or admits data.
import { readdir, lstat, readFile, writeFile } from 'node:fs/promises'
import { resolve, relative, join, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const inside = (root, path) => path === root || path.startsWith(root + sep)
async function inventory(directory, topLevelEntries = null) {
  const root = resolve(directory), rows = []
  if (!(await lstat(root)).isDirectory()) throw Error('artifact root must be a real directory')
  async function visit(path) {
    if (!inside(root, path)) throw Error('artifact path escaped its root')
    const stat = await lstat(path)
    if (stat.isSymbolicLink()) throw Error('artifact symlinks are not deployable inventory')
    if (stat.isDirectory()) {
      for (const entry of (await readdir(path)).sort()) await visit(join(path, entry))
    } else if (stat.isFile()) {
      const bytes = await readFile(path)
      if (bytes.length !== stat.size) throw Error('artifact changed during inventory')
      rows.push({ path: relative(root, path).split(sep).join('/'), bytes: bytes.length, sha256: hash(bytes) })
    } else throw Error('artifact contains a non-regular entry')
  }
  if (topLevelEntries === null) await visit(root)
  else for (const name of topLevelEntries) {
    const path = join(root, name)
    if (!(await lstat(path)).isDirectory()) throw Error('canonical Cesium directory missing: ' + name)
    await visit(path)
  }
  if (!rows.length) throw Error('artifact inventory must contain files')
  return rows
}

export async function measureLaunchReleaseArtifact({ distPath, cesiumPath, source, buildMeasurement = null }) {
  if (!source || !/^[a-f0-9]{40}$/.test(source.head) || !/^[a-f0-9]{40}$/.test(source.tree)
    || typeof source.working_tree_clean !== 'boolean') throw Error('exact source identity required')
  if (buildMeasurement !== null && (!Number.isFinite(buildMeasurement.elapsed_seconds) || buildMeasurement.elapsed_seconds < 0
    || !/^[a-f0-9]{64}$/.test(buildMeasurement.log_sha256) || typeof buildMeasurement.runtime !== 'string'
    || !buildMeasurement.runtime || buildMeasurement.exit_code !== 0)) throw Error('successful measured build receipt required')
  // Exactly the four production static-copy roots; Cesium.js at the package
  // root is bundled by Vite rather than deployed as a copied static asset.
  const files = await inventory(distPath), canonical = await inventory(cesiumPath, ['Workers', 'ThirdParty', 'Assets', 'Widgets'])
  const built = new Map(files.map(row => [row.path, row]))
  const cesium = canonical.map(row => {
    const output = built.get('cesium/' + row.path)
    if (!output || output.sha256 !== row.sha256 || output.bytes !== row.bytes)
      throw Error('canonical Cesium artifact differs: ' + row.path)
    return { ...row, output_path: output.path }
  })
  const unexpected = files.filter(row => row.path.startsWith('cesium/') && !canonical.some(entry => 'cesium/' + entry.path === row.path))
  const largest = [...files].sort((a, b) => b.bytes - a.bytes || a.path.localeCompare(b.path)).slice(0, 20)
  return {
    contract: 'mip-launch-release-artifact-inventory-v1', observed_at_utc: new Date().toISOString(), source,
    qualification: 'Measured local build files and canonical package asset bytes only; no hosting entitlement, deployment, source admission, provider spend or device performance.',
    build: buildMeasurement === null ? { status: 'duration_not_supplied', elapsed_seconds: null, elapsed_minutes: null }
      : { status: 'measured_success', ...buildMeasurement, elapsed_minutes: buildMeasurement.elapsed_seconds / 60 },
    output: { file_count: files.length, total_bytes: files.reduce((sum, row) => sum + row.bytes, 0), largest_file: largest[0], largest_files: largest, files },
    cesium: { canonical_roots: ['Workers', 'ThirdParty', 'Assets', 'Widgets'], canonical_file_count: cesium.length, canonical_total_bytes: cesium.reduce((sum, row) => sum + row.bytes, 0), all_canonical_bytes_equal: true, canonical_paths: cesium,
      noncanonical_output_paths: unexpected, noncanonical_output_count: unexpected.length },
    authority: { live_operations: 0, deployed: false, host_accepted: false, provider_activated: false, billing_qualified: false },
  }
}

function sourceIdentity() {
  const git = args => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  return { head: git(['rev-parse', 'HEAD']), tree: git(['rev-parse', 'HEAD^{tree}']), working_tree_clean: git(['status', '--porcelain']).length === 0 }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [distPath, cesiumPath, outputPath, buildPath, ...extra] = process.argv.slice(2)
    if (!distPath || !cesiumPath || !outputPath || extra.length)
      throw Error('usage: node scripts/launchReleaseArtifact20261003.mjs <dist-directory> <canonical-Cesium-directory> <new-receipt.json> [build-measurement.json]')
    const source = sourceIdentity(), buildMeasurement = buildPath ? JSON.parse(await readFile(buildPath, 'utf8')) : null
    const receipt = await measureLaunchReleaseArtifact({ distPath, cesiumPath, source, buildMeasurement })
    if (JSON.stringify(sourceIdentity()) !== JSON.stringify(source)) throw Error('source identity changed during inventory')
    await writeFile(outputPath, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' })
    console.log(JSON.stringify({ receipt: resolve(outputPath), head: source.head, file_count: receipt.output.file_count,
      total_bytes: receipt.output.total_bytes, largest_file: receipt.output.largest_file, build_minutes: receipt.build.elapsed_minutes,
      cesium_files: receipt.cesium.canonical_file_count, cesium_bytes: receipt.cesium.canonical_total_bytes }))
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
