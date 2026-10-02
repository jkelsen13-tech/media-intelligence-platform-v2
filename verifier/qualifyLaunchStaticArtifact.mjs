import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import { gzipSync } from 'node:zlib'
import { pathToFileURL } from 'node:url'

// Read-only build qualification. No upload, account, DNS, provider or deployment
// operation. Provider limits are a comparison boundary, never an entitlement.
export async function qualifyLaunchStaticArtifact(directory) {
  const root = resolve(directory), files = []
  async function walk(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const absolute = resolve(path, entry.name)
      assert.ok(!entry.isSymbolicLink(), 'published artifact must not contain symlinks')
      if (entry.isDirectory()) await walk(absolute)
      else {
        assert.ok(entry.isFile(), 'published artifact contains only regular files')
        const bytes = await readFile(absolute), name = relative(root, absolute).replaceAll('\\', '/')
        files.push({ path: name, bytes: (await stat(absolute)).size,
          gzipBytes: gzipSync(bytes).length, sha256: createHash('sha256').update(bytes).digest('hex') })
      }
    }
  }
  await walk(root)
  files.sort((a, b) => a.path.localeCompare(b.path, 'en'))
  assert.ok(files.some(file => file.path === 'index.html'), 'SPA entry missing')
  const forbidden = files.filter(file => /(?:^|\/)(?:verifier|tests|prototypes|node_modules)\/|\.map$|(?:harness|fixture)\.html$/i.test(file.path))
  assert.equal(forbidden.length, 0, `source maps or qualification inputs exposed: ${forbidden.map(file => file.path).join(',')}`)
  const index = await readFile(resolve(root, 'index.html'), 'utf8')
  const graph = JSON.parse(await readFile(resolve(root, 'world-view-bundle-graph.json'), 'utf8'))
  const entries = graph.chunks.filter(chunk => chunk.isEntry)
  const reachable = new Set(), chunks = new Map(graph.chunks.map(chunk => [chunk.fileName, chunk]))
  function visit(name) {
    if (reachable.has(name)) return
    reachable.add(name)
    for (const dependency of chunks.get(name)?.imports ?? []) visit(dependency)
  }
  entries.forEach(entry => visit(entry.fileName))
  assert.ok(![...reachable].some(name => chunks.get(name)?.containsCesiumVendor), 'Cesium is eagerly imported by the shell')
  const localAssets = [...index.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]).filter(url => !/^(?:https?:|data:|#)/i.test(url))
  for (const url of localAssets) {
    assert.ok(url.startsWith(graph.base), 'entry asset has incompatible base path')
    const name = decodeURIComponent(url.slice(graph.base.length)).split('?')[0]
    assert.ok(files.some(file => file.path === name), `entry asset absent: ${name}`)
  }
  const totalBytes = files.reduce((total, file) => total + file.bytes, 0)
  const maxFile = [...files].sort((a, b) => b.bytes - a.bytes)[0]
  const manifestHash = createHash('sha256').update(JSON.stringify(files)).digest('hex')
  return { contract: 'mip-launch-static-artifact-v1', qualification: 'source-build-only', base: graph.base,
    fileCount: files.length, totalBytes, maxFile, manifestHash,
    eagerJavaScriptBytes: [...reachable].reduce((total, name) => total + (files.find(file => file.path === name)?.bytes ?? 0), 0),
    cesiumWorkerCount: files.filter(file => file.path.startsWith('cesium/Workers/')).length,
    wasmFiles: files.filter(file => /\.wasm$/.test(file.path)),
    cloudflareStaticFreeComparison: { fileLimit: 20000, perFileLimitBytes: 25 * 1024 * 1024,
      fileCountFits: files.length <= 20000, perFileFits: maxFile.bytes <= 25 * 1024 * 1024 },
    absentProof: ['hosting entitlement', 'host headers and cache', 'Range/206', 'deployed routing', 'physical-device performance', 'licensed tile distribution'], files }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const receipt = await qualifyLaunchStaticArtifact(process.argv[2] ?? 'dist')
  if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(receipt, null, 2) + '\n')
  const { files, ...summary } = receipt
  console.log(JSON.stringify(summary, null, 2))
}
