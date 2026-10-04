// Provider-independent, read-only qualification model. This is not deployable
// middleware and never reads environment variables, proxies APIs or fetches URLs.
import { createHash } from 'node:crypto'
import { lstat, readdir, readFile, realpath } from 'node:fs/promises'
import { resolve, join, extname } from 'node:path'

export const QUALIFICATION = 'SYNTHETIC_STATIC_ROUTING_MODEL'
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const HEX64 = /^[a-f0-9]{64}$/
const HEX40 = /^[a-f0-9]{40}$/
const states = new WeakMap()
const segmentOK = value => /^[A-Za-z0-9@][A-Za-z0-9@._-]*$/.test(value) && value !== '.' && value !== '..'
const filePathOK = path => typeof path === 'string' && path.length <= 4096 && path.split('/').every(segmentOK)
const plainSource = source => ({ head: source.head, tree: source.tree, working_tree_clean: source.working_tree_clean })
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

function requireSource(source) {
  if (!source || !HEX40.test(source.head) || !HEX40.test(source.tree) || source.working_tree_clean !== true)
    throw Error('exact clean source head/tree required')
}
function rowsChecked(rows) {
  if (!Array.isArray(rows) || !rows.length) throw Error('nonempty file inventory required')
  const paths = new Set()
  return rows.map(row => {
    if (!row || !filePathOK(row.path) || paths.has(row.path) || !Number.isSafeInteger(row.bytes) || row.bytes < 0 || !HEX64.test(row.sha256))
      throw Error('unsafe, duplicate or malformed inventory row')
    paths.add(row.path)
    return { path: row.path, bytes: row.bytes, sha256: row.sha256 }
  }).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
}

async function pinnedJSON(path, expectedSHA256) {
  if (!HEX64.test(expectedSHA256 ?? '')) throw Error('independent expected SHA256 required')
  const bytes = await readFile(path)
  if (sha256(bytes) !== expectedSHA256) throw Error('pinned evidence bytes differ: ' + path)
  return { value: JSON.parse(bytes), bytes }
}

// Uses the existing mip-launch-release-artifact-inventory-v1 contract. It
// independently rehashes actual bodies rather than generating a new inventory.
export async function verifyRelease({ distDirectory, inventoryPath, inventorySHA256, expectedSource,
  exportManifestPath = null, exportManifestSHA256 = null, sourceFiles = {} }) {
  requireSource(expectedSource)
  const { value: inventory, bytes: inventoryBytes } = await pinnedJSON(inventoryPath, inventorySHA256)
  if (inventory.contract !== 'mip-launch-release-artifact-inventory-v1' || !same(plainSource(inventory.source ?? {}), plainSource(expectedSource)))
    throw Error('inventory source/contract differs')
  const files = rowsChecked(inventory.output?.files)
  if (files.length !== inventory.output.file_count || files.reduce((n, row) => n + row.bytes, 0) !== inventory.output.total_bytes)
    throw Error('inventory count/total differs')
  const root = resolve(distDirectory), actual = new Map()
  if (await realpath(root) !== root) throw Error('artifact root or ancestor symlink refused')
  async function visit(directory, relative = '') {
    const stat = await lstat(directory)
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('artifact directory must be real, without symlinks')
    for (const name of (await readdir(directory)).sort()) {
      if (!segmentOK(name)) throw Error('unsafe artifact entry')
      const path = relative ? relative + '/' + name : name, full = join(directory, name), entry = await lstat(full)
      if (entry.isSymbolicLink()) throw Error('artifact symlink refused')
      if (entry.isDirectory()) await visit(full, path)
      else if (entry.isFile()) {
        const bytes = await readFile(full)
        if (bytes.length !== entry.size) throw Error('artifact changed during verification')
        actual.set(path, bytes)
      } else throw Error('nonregular artifact entry refused')
    }
  }
  await visit(root)
  if (actual.size !== files.length) throw Error('missing or extra artifact bodies')
  for (const row of files) {
    const bytes = actual.get(row.path)
    if (!bytes || bytes.length !== row.bytes || sha256(bytes) !== row.sha256) throw Error('artifact body differs: ' + row.path)
  }
  let canonicalProof = null
  if (inventory.cesium) {
    const canonical = rowsChecked(inventory.cesium.canonical_paths)
    if (canonical.length !== inventory.cesium.canonical_file_count
      || canonical.reduce((n, row) => n + row.bytes, 0) !== inventory.cesium.canonical_total_bytes
      || inventory.cesium.all_canonical_bytes_equal !== true) throw Error('canonical Cesium inventory summary differs')
    for (const row of canonical) {
      const bytes = actual.get('cesium/' + row.path)
      if (!bytes || bytes.length !== row.bytes || sha256(bytes) !== row.sha256) throw Error('canonical Cesium actual body differs')
    }
    const canonicalOutputs = new Set(canonical.map(row => 'cesium/' + row.path))
    const unexpected = files.filter(row => row.path.startsWith('cesium/') && !canonicalOutputs.has(row.path))
    if (unexpected.length || inventory.cesium.noncanonical_output_count !== 0) throw Error('noncanonical Cesium output refused')
    canonicalProof = { inventory_bound_canonical_bodies_rehashed: canonical.length,
      total_bytes: inventory.cesium.canonical_total_bytes, noncanonical_outputs: 0,
      limitation: 'Retained independently pinned canonical-package inventory comparison; no fresh package rebuild or package acquisition.' }
  }
  let exportProof = null
  if (exportManifestPath !== null) {
    const { value: manifest } = await pinnedJSON(exportManifestPath, exportManifestSHA256)
    if (manifest.contract !== 'mip-qualified-dist-export-v1' || !same(plainSource(manifest.source ?? {}), plainSource(expectedSource)))
      throw Error('export manifest source/contract differs')
    const exported = rowsChecked(manifest.files), exportedDist = exported.filter(row => row.path.startsWith('dist/'))
      .map(row => ({ ...row, path: row.path.slice(5) }))
    if (!same(exportedDist, files)) throw Error('export manifest dist differs')
    const inventoryRow = exported.find(row => row.path === 'release-artifact-inventory.json')
    if (!inventoryRow || inventoryRow.bytes !== inventoryBytes.length || inventoryRow.sha256 !== inventorySHA256)
      throw Error('exported inventory binding differs')
    const sourceRows = exported.filter(row => row.path.startsWith('source/'))
    if (exported.length !== files.length + 1 + sourceRows.length || !same(Object.keys(sourceFiles).sort(), sourceRows.map(row => row.path).sort()))
      throw Error('all and only exported source bodies must be supplied')
    for (const row of sourceRows) {
      const bytes = await readFile(sourceFiles[row.path])
      if (bytes.length !== row.bytes || sha256(bytes) !== row.sha256) throw Error('export source body differs: ' + row.path)
    }
    exportProof = { manifest_sha256: exportManifestSHA256, verified_dist_bodies: files.length,
      verified_inventory_body: true, verified_source_bodies: sourceRows }
  } else if (exportManifestSHA256 !== null || Object.keys(sourceFiles).length) throw Error('export proof supplied without manifest')
  const graphBytes = actual.get('world-view-bundle-graph.json'), htmlBytes = actual.get('index.html')
  if (!graphBytes || !htmlBytes) throw Error('actual graph and entry HTML required')
  const graph = JSON.parse(graphBytes.toString('utf8'))
  const compiledBase = graph.base
  if (graph.version !== 1 || !validMount(compiledBase)) throw Error('actual compiled base missing or unsafe')
  if (!Array.isArray(graph.chunks) || graph.chunks.some(chunk => !filePathOK(chunk.fileName) || !actual.has(chunk.fileName)
    || [...(chunk.imports ?? []), ...(chunk.dynamicImports ?? [])].some(path => !filePathOK(path) || !actual.has(path))))
    throw Error('bundle graph references missing/unsafe bodies')
  const entryURLs = [...htmlBytes.toString('utf8').matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="([^"]+)"/g)].map(match => match[1])
  if (!entryURLs.length || entryURLs.some(url => !url.startsWith(compiledBase) || !actual.has(url.slice(compiledBase.length))))
    throw Error('entry HTML references differ from compiled base/bodies')
  const fingerprint = sha256(Buffer.from(JSON.stringify(files)))
  const identity = Object.freeze({ source_head: expectedSource.head, source_tree: expectedSource.tree,
    inventory_sha256: inventorySHA256, body_set_sha256: fingerprint,
    release_id: 'mip-static:' + expectedSource.head + ':' + fingerprint })
  const release = Object.freeze({ identity, compiledBase, entryURLs: Object.freeze(entryURLs),
    files: Object.freeze(files.map(Object.freeze)), totalBytes: inventory.output.total_bytes, exportProof, canonicalProof })
  states.set(release, actual)
  return release
}

function validMount(value) {
  return typeof value === 'string' && value.startsWith('/') && value.endsWith('/')
    && (value === '/' || value.slice(1, -1).split('/').every(segmentOK))
}

// Parse raw origin-form request targets before any WHATWG URL normalization.
// Decode path segments exactly once. Query is opaque and cannot select a file.
export function parseRequestTarget(target) {
  if (typeof target !== 'string' || target.length > 8192 || !target.startsWith('/') || target.startsWith('//')
    || /[\x00-\x20\x7f\\#]/.test(target)) throw Error('invalid request target')
  const index = target.indexOf('?'), raw = index < 0 ? target : target.slice(0, index), query = index < 0 ? '' : target.slice(index)
  const parts = raw.slice(1).split('/'), trailing = parts.at(-1) === ''
  if (trailing) parts.pop()
  const decoded = parts.map(part => {
    const value = decodeURIComponent(part)
    if (!segmentOK(value)) throw Error('ambiguous, encoded separator, repeated encoding or traversal path')
    return value
  })
  return { path: '/' + decoded.join('/') + (trailing && decoded.length ? '/' : ''), query }
}

// Browser fragments are client navigation state and never reach an HTTP server.
// This helper models only the request target; it does not qualify route data.
export function browserRequestTarget(location) {
  if (typeof location !== 'string') throw Error('browser location must be a string')
  const target = location.split('#', 1)[0]
  parseRequestTarget(target)
  return target
}

const MIME = Object.freeze({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.gif': 'image/gif', '.xml': 'application/xml', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8', '': 'text/plain; charset=utf-8' })
export const mimeType = path => MIME[extname(path).toLowerCase()] ?? 'application/octet-stream'
export function cacheControl(path) {
  // Unhashed Cesium workers/assets share URLs across releases. Their extension
  // does not justify immutable caching; atomic body-set release remains required.
  return /^assets\/.+-[A-Za-z0-9_-]{8,}\.(?:js|mjs|css|png|jpg|svg|woff2?)$/.test(path)
    ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate'
}
export const entityTag = digest => {
  if (!HEX64.test(digest ?? '')) throw Error('ETag requires a body SHA256')
  return '"sha256-' + digest + '"'
}
function validatorMatches(value, tag) {
  if (typeof value !== 'string') return false
  if (value.trim() === '*') return true // Only called after exact existing-body lookup.
  const tokens = value.split(',').map(value => value.trim())
  if (!tokens.length || tokens.some(token => !/^(?:W\/)?"[^"\x00-\x20\x7f]+"$/.test(token))) return false
  // GET/HEAD If-None-Match uses weak comparison; responses still emit a strong tag.
  return tokens.some(token => token.replace(/^W\//, '') === tag)
}

const denied = /^(?:api|functions|rest|auth|supabase|private|src|source|node_modules)(?:\/|$)/i
const controlledHeaders = new Set(['content-type', 'content-length', 'cache-control', 'etag', 'location', 'allow',
  'transfer-encoding', 'connection', 'set-cookie'])
function governedHeaders(policy) {
  if (policy === null) return {}
  if (!policy || !filePathOK(policy.source?.path) || !HEX64.test(policy.source?.sha256 ?? '') || !policy.headers || Array.isArray(policy.headers))
    throw Error('governed header source binding required')
  const headers = {}
  for (const [name, value] of Object.entries(policy.headers)) {
    const lower = name.toLowerCase()
    if (!/^[a-z][a-z0-9-]*$/.test(lower) || Object.hasOwn(headers, lower) || controlledHeaders.has(lower)
      || typeof value !== 'string' || /[\x00-\x1f\x7f]/.test(value)) throw Error('unsafe or conflicting governed header')
    headers[lower] = value
  }
  return headers
}

export function createStaticModel(release, { mount = release.compiledBase, rootEntry = 'none', securityHeaderPolicy = null } = {}) {
  const bodies = states.get(release)
  if (!bodies || !validMount(mount) || !['none', 'redirect-to-prefix'].includes(rootEntry)
    || (rootEntry === 'redirect-to-prefix' && (mount !== release.compiledBase || mount === '/')))
    throw Error('verified release and explicit valid mounting policy required')
  const security = governedHeaders(securityHeaderPolicy)
  const rows = new Map(release.files.map(row => [row.path, row]))
  function respond({ target, method = 'GET', ifNoneMatch = null }) {
    const finish = (status, headers, body, path = null) => ({ status, headers: { ...security, ...headers },
      body: method === 'HEAD' || status === 304 ? Buffer.alloc(0) : Buffer.from(body), artifactPath: path })
    const error = status => {
      const body = Buffer.from(status === 404 ? 'Not Found\n' : status === 400 ? 'Bad Request\n' : 'Method Not Allowed\n')
      return finish(status, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store',
        'content-length': String(body.length), ...(status === 405 ? { allow: 'GET, HEAD' } : {}) }, body)
    }
    if (method !== 'GET' && method !== 'HEAD') return error(405)
    let parsed
    try { parsed = parseRequestTarget(target) } catch { return error(400) }
    if ((rootEntry === 'redirect-to-prefix' && parsed.path === '/') || (mount !== '/' && parsed.path === mount.slice(0, -1)))
      return finish(308, { location: mount + parsed.query, 'cache-control': 'no-store', 'content-length': '0' }, Buffer.alloc(0))
    if (!parsed.path.startsWith(mount)) return error(404)
    let path = parsed.path.slice(mount.length)
    if (path === '') path = 'index.html'
    if (denied.test(path) || !rows.has(path)) return error(404)
    const row = rows.get(path), tag = entityTag(row.sha256)
    const headers = { 'content-type': mimeType(path), 'cache-control': cacheControl(path), etag: tag }
    if (validatorMatches(ifNoneMatch, tag)) return finish(304, headers, Buffer.alloc(0), path)
    return finish(200, { ...headers, 'content-length': String(row.bytes) }, bodies.get(path), path)
  }
  return Object.freeze({ qualification: QUALIFICATION, mount, rootEntry, respond,
    governedHeaderSource: securityHeaderPolicy ? Object.freeze({ ...securityHeaderPolicy.source }) : null })
}

export function measureMapping(release, model) {
  const rows = release.files.map(row => {
    const target = release.compiledBase + row.path, response = model.respond({ target }), head = model.respond({ target, method: 'HEAD' })
    const tag = entityTag(row.sha256), conditional = model.respond({ target, ifNoneMatch: tag })
    const pass = response.status === 200 && response.artifactPath === row.path && sha256(response.body) === row.sha256
      && response.headers['content-length'] === String(row.bytes) && response.headers['content-type'] === mimeType(row.path)
      && response.headers.etag === tag && response.headers['cache-control'] === cacheControl(row.path)
      && head.status === 200 && head.body.length === 0 && same(head.headers, response.headers)
      && conditional.status === 304 && conditional.body.length === 0 && !Object.hasOwn(conditional.headers, 'content-length')
    return { target, artifact_path: row.path, bytes: row.bytes, sha256: row.sha256,
      status: response.status, content_type: response.headers['content-type'], cache_control: response.headers['cache-control'],
      etag: response.headers.etag ?? null, head_status: head.status, matching_validator_status: conditional.status, pass }
  })
  return { qualification: QUALIFICATION, mount: model.mount, root_entry: model.rootEntry,
    verdict: rows.every(row => row.pass) ? 'PASS_MODEL_MAPPING' : 'HOLD_COMPILED_PREFIX_UNSERVED',
    mapped_bodies: rows.filter(row => row.pass).length, total_bodies: rows.length, rows }
}

// Select an independently body-verified prior release. No copy, restore,
// deployment, cache purge or filesystem mutation occurs.
export function qualifyRollbackSelection({ current, previous, expectedPreviousIdentity }) {
  if (!states.has(current) || !states.has(previous)) throw Error('both exact artifact body sets must be independently verified')
  if (!same(previous.identity, expectedPreviousIdentity)) throw Error('selected rollback artifact identity differs')
  if (current.identity.release_id === previous.identity.release_id) throw Error('a distinct previous release is required')
  return { qualification: QUALIFICATION, from: current.identity, to: previous.identity,
    verdict: 'PASS_MODEL_ARTIFACT_SELECTION', action_performed: false,
    limitation: 'Artifact identity only; no deployed pointer, atomic cutover, cache coordination or application/backend compatibility proof.' }
}
