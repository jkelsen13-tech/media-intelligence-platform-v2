import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer, request } from 'node:http'
import { once } from 'node:events'
import { QUALIFICATION, sha256, verifyRelease, parseRequestTarget, browserRequestTarget, createStaticModel,
  entityTag, mimeType, cacheControl, measureMapping, qualifyRollbackSelection } from '../scripts/static-release-preflight/model.mjs'
import { runPreflight } from '../scripts/static-release-preflight/run.mjs'

const base = '/media-intelligence-platform-v2/'
const source = { head: '0'.repeat(40), tree: '1'.repeat(40), working_tree_clean: true }
async function fixture(t, { suffix = 'current', sourceIdentity = source } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'mip-static-preflight-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const bodies = {
    'index.html': Buffer.from('<!doctype html><script type="module" src="' + base + 'assets/shell-Abcd1234.js"></script><link href="' + base + 'assets/shell-Abcd1234.css">'),
    'assets/shell-Abcd1234.js': Buffer.from('export const release = "' + suffix + '";'),
    'assets/shell-Abcd1234.css': Buffer.from('body { color: black; }'),
    'assets/unhashed.png': Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    'cesium/Workers/worker.js': Buffer.from('self.onmessage = () => {};'),
    'cesium/ThirdParty/decoder.wasm': Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]),
    'cesium/Assets/data.json': Buffer.from('{"fixture":true}'),
    'fonts/font.woff2': Buffer.from('wOF2fixture'),
    'licenses/@scope/package/LICENSE': Buffer.from('Fixture notice'),
    'world-view-bundle-graph.json': Buffer.from(JSON.stringify({ version: 1, base,
      chunks: [{ fileName: 'assets/shell-Abcd1234.js', imports: [], dynamicImports: [] }] })),
  }
  const dist = join(directory, 'dist')
  for (const [path, bytes] of Object.entries(bodies)) {
    await mkdir(join(dist, path, '..'), { recursive: true })
    await writeFile(join(dist, path), bytes)
  }
  const files = Object.entries(bodies).map(([path, bytes]) => ({ path, bytes: bytes.length, sha256: sha256(bytes) }))
    .sort((a, b) => a.path.localeCompare(b.path))
  const inventory = { contract: 'mip-launch-release-artifact-inventory-v1', source: sourceIdentity,
    output: { file_count: files.length, total_bytes: files.reduce((n, row) => n + row.bytes, 0), files } }
  const inventoryPath = join(directory, 'inventory.json'), inventoryBytes = Buffer.from(JSON.stringify(inventory))
  await writeFile(inventoryPath, inventoryBytes)
  const params = { distDirectory: dist, inventoryPath, inventorySHA256: sha256(inventoryBytes), expectedSource: sourceIdentity }
  return { directory, dist, bodies, inventory, params, release: await verifyRelease(params) }
}

test('actual inventory bodies map at the compiled prefix with MIME, HEAD, strong ETags and cache policy', async t => {
  const f = await fixture(t), model = createStaticModel(f.release), mapping = measureMapping(f.release, model)
  assert.equal(mapping.qualification, QUALIFICATION)
  assert.equal(mapping.verdict, 'PASS_MODEL_MAPPING')
  assert.equal(mapping.mapped_bodies, Object.keys(f.bodies).length)
  for (const [path, bytes] of Object.entries(f.bodies)) {
    const response = model.respond({ target: base + path })
    assert.deepEqual(response.body, bytes)
    assert.equal(response.headers.etag, entityTag(sha256(bytes)))
    assert.equal(response.headers['content-type'], mimeType(path))
  }
  assert.equal(mimeType('decoder.wasm'), 'application/wasm')
  assert.equal(mimeType('font.woff2'), 'font/woff2')
  assert.equal(mimeType('font.woff'), 'font/woff')
  assert.equal(mimeType('font.ttf'), 'font/ttf')
  assert.equal(mimeType('data.json'), 'application/json')
  assert.equal(mimeType('image.png'), 'image/png')
  assert.equal(mimeType('module.js'), 'text/javascript; charset=utf-8')
  assert.equal(mimeType('unknown.bin'), 'application/octet-stream')
  assert.match(cacheControl('assets/shell-Abcd1234.js'), /immutable/)
  for (const path of ['index.html', 'assets/unhashed.png', 'cesium/Workers/worker.js', 'cesium/Assets/data.json', 'world-view-bundle-graph.json'])
    assert.equal(cacheControl(path), 'public, max-age=0, must-revalidate')
  responseMutationCannotChangeRelease(model, f.bodies)
})
function responseMutationCannotChangeRelease(model, bodies) {
  const a = model.respond({ target: base + 'assets/shell-Abcd1234.js' })
  a.body.fill(0)
  assert.deepEqual(model.respond({ target: base + 'assets/shell-Abcd1234.js' }).body, bodies['assets/shell-Abcd1234.js'])
}

test('root-only unchanged dist holds; explicit root redirect requires complete prefix mount', async t => {
  const f = await fixture(t), root = createStaticModel(f.release, { mount: '/' })
  assert.equal(root.respond({ target: '/' }).status, 200)
  assert.equal(root.respond({ target: f.release.entryURLs[0] }).status, 404)
  assert.equal(measureMapping(f.release, root).verdict, 'HOLD_COMPILED_PREFIX_UNSERVED')
  const prefixed = createStaticModel(f.release, { rootEntry: 'redirect-to-prefix' })
  assert.equal(prefixed.respond({ target: '/?display=fixture' }).status, 308)
  assert.equal(prefixed.respond({ target: '/?display=fixture' }).headers.location, base + '?display=fixture')
  assert.equal(prefixed.respond({ target: base.slice(0, -1) }).headers.location, base)
  assert.equal(prefixed.respond({ target: '/unknown' }).status, 404)
  assert.throws(() => createStaticModel(f.release, { mount: '/', rootEntry: 'redirect-to-prefix' }))
  assert.throws(() => createStaticModel(f.release, { mount: '/../' }))
  assert.throws(() => createStaticModel({ ...f.release }))
})

test('hash refresh sends the actual server path; unknown server-side routes never acquire invented SPA fallback', async t => {
  const f = await fixture(t), model = createStaticModel(f.release)
  for (const location of [base + '#/event/canonical/world?place=known', base + 'index.html#/story/00000000-0000-4000-8000-000000000001']) {
    const target = browserRequestTarget(location), response = model.respond({ target })
    assert.equal(target.includes('#'), false)
    assert.deepEqual(response.body, f.bodies['index.html'])
  }
  for (const path of ['event/canonical/world', 'story/00000000-0000-4000-8000-000000000001', 'index.html/'])
    assert.equal(model.respond({ target: base + path }).status, 404)
  assert.equal(model.respond({ target: base + '#/event/canonical/world' }).status, 400)
})

test('raw traversal, controls, separator/repeated encodings and ambiguous paths fail before URL normalization', async t => {
  const f = await fixture(t), model = createStaticModel(f.release)
  const invalid = [base + '../index.html', base + './index.html', base + '%2e%2e/index.html', base + '%252e%252e/index.html',
    base + 'assets%2fshell-Abcd1234.js', base + 'assets%5cshell-Abcd1234.js', base + 'assets\\shell-Abcd1234.js',
    base + 'assets/%00x', base + 'assets/%0ax', base + 'assets/%7fx', base + 'assets/%3fx', base + 'assets/%23x',
    base + 'assets/%ZZx', base + 'assets//x', base + '.env', base + '.git/config', '//host/index.html',
    'https://host/index.html', '*', base + '\n', base + 'x'.repeat(8193)]
  for (const target of invalid) {
    assert.throws(() => parseRequestTarget(target), target)
    assert.equal(model.respond({ target }).status, 400, target)
  }
  assert.equal(model.respond({ target: base + '%61ssets/shell-Abcd1234.js' }).status, 200)
  assert.equal(model.respond({ target: base + 'licenses/%40scope/package/LICENSE' }).status, 200)
})

test('query text is not a filepath or a cache body selector', async t => {
  const f = await fixture(t), model = createStaticModel(f.release), target = base + 'assets/shell-Abcd1234.js'
  for (const query of ['?v=old', '?file=../../private&path=%252f&x=%0a', '?asset=missing.js', '?a=b?c=d']) {
    assert.deepEqual(model.respond({ target: target + query }).body, f.bodies['assets/shell-Abcd1234.js'])
    assert.equal(model.respond({ target: target + query }).headers.etag, model.respond({ target }).headers.etag)
  }
})

test('missing JS, tile, worker, WASM, API and private targets are non-HTML errors even with validators', async t => {
  const f = await fixture(t), model = createStaticModel(f.release, { rootEntry: 'redirect-to-prefix' })
  for (const mount of ['/', base]) for (const path of ['assets/missing.js', 'tiles/0/0/0.png', 'cesium/Workers/missing.js',
    'cesium/ThirdParty/missing.wasm', 'api/stories', 'functions/v1/investigation-api', 'rest/v1/articles', 'auth/v1/user',
    'private/receipt.json', 'src/App.jsx', 'source/package.json', 'node_modules/pkg/index.js']) {
    const response = model.respond({ target: mount + path, ifNoneMatch: '*' })
    assert.equal(response.status, 404, mount + path)
    assert.equal(response.artifactPath, null)
    assert.equal(response.headers['cache-control'], 'no-store')
    assert.equal(response.headers['content-type'], 'text/plain; charset=utf-8')
    assert.equal(response.headers.etag, undefined)
  }
})

test('only GET/HEAD are admitted; matching typed validators refer to existent actual bytes', async t => {
  const f = await fixture(t), model = createStaticModel(f.release), target = base + 'assets/shell-Abcd1234.js'
  const response = model.respond({ target }), tag = response.headers.etag
  assert.match(tag, /^"sha256-[a-f0-9]{64}"$/)
  for (const validator of [tag, 'W/' + tag, '"other", ' + tag, '*']) {
    for (const method of ['GET', 'HEAD']) {
      const result = model.respond({ target, method, ifNoneMatch: validator })
      assert.equal(result.status, 304)
      assert.equal(result.body.length, 0)
      assert.equal(result.headers['content-length'], undefined)
      assert.equal(result.headers.etag, tag)
    }
  }
  for (const validator of ['"sha256-' + 'f'.repeat(64) + '"', tag.slice(1, -1), { toString: () => tag }, [tag], tag + ', bad', '"unterminated'])
    assert.equal(model.respond({ target, ifNoneMatch: validator }).status, 200)
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'TRACE', 'get']) {
    const result = model.respond({ target, method, ifNoneMatch: tag })
    assert.equal(result.status, 405)
    assert.equal(result.headers.allow, 'GET, HEAD')
  }
  const headError = model.respond({ target: base + 'missing', method: 'HEAD' })
  assert.equal(headError.status, 404)
  assert.equal(headError.body.length, 0)
})

test('governed security header values are preserved with provenance; model invents no broad policy', async t => {
  const f = await fixture(t), ordinary = createStaticModel(f.release).respond({ target: base })
  assert.equal(ordinary.headers['content-security-policy'], undefined)
  assert.equal(ordinary.headers['strict-transport-security'], undefined)
  const policy = { source: { path: 'docs/reviewed-host-headers.json', sha256: 'a'.repeat(64) },
    headers: { 'Content-Security-Policy': "default-src 'self'", 'X-Content-Type-Options': 'nosniff' } }
  const model = createStaticModel(f.release, { securityHeaderPolicy: policy })
  for (const target of [base, base + 'missing.js', base + '../bad']) {
    const result = model.respond({ target })
    assert.equal(result.headers['content-security-policy'], policy.headers['Content-Security-Policy'])
    assert.equal(result.headers['x-content-type-options'], 'nosniff')
  }
  assert.deepEqual(model.governedHeaderSource, policy.source)
  for (const headers of [{ 'Content-Type': 'text/html' }, { 'Set-Cookie': 'private=1' }, { 'X-Test': 'a\nb' }, { 'X-Test': 'a', 'x-test': 'b' }])
    assert.throws(() => createStaticModel(f.release, { securityHeaderPolicy: { ...policy, headers } }))
})

test('changed, missing and extra actual bodies, symlinks and incorrect source/pin fail verification', async t => {
  const f = await fixture(t), path = join(f.dist, 'assets/shell-Abcd1234.js')
  await writeFile(path, 'wrong release bytes')
  await assert.rejects(verifyRelease(f.params), /artifact body differs/)
  await writeFile(path, f.bodies['assets/shell-Abcd1234.js'])
  await rm(path)
  await assert.rejects(verifyRelease(f.params), /missing or extra/)
  await writeFile(path, f.bodies['assets/shell-Abcd1234.js'])
  await writeFile(join(f.dist, 'extra.js'), 'extra')
  await assert.rejects(verifyRelease(f.params), /missing or extra/)
  await rm(join(f.dist, 'extra.js'))
  await symlink(path, join(f.dist, 'linked.js'))
  await assert.rejects(verifyRelease(f.params), /symlink/)
  await rm(join(f.dist, 'linked.js'))
  const rootLink = join(f.directory, 'dist-link')
  await symlink(f.dist, rootLink)
  await assert.rejects(verifyRelease({ ...f.params, distDirectory: rootLink }), /symlink/)
  await assert.rejects(verifyRelease({ ...f.params, inventorySHA256: 'f'.repeat(64) }), /pinned evidence/)
  await assert.rejects(verifyRelease({ ...f.params, expectedSource: { ...source, head: '2'.repeat(40) } }), /source\/contract/)
  await assert.rejects(verifyRelease({ ...f.params, expectedSource: { ...source, working_tree_clean: false } }), /exact clean source/)
  const duplicate = { ...f.inventory, output: { ...f.inventory.output, files: [...f.inventory.output.files, f.inventory.output.files[0]] } }
  const duplicateBytes = Buffer.from(JSON.stringify(duplicate))
  await writeFile(f.params.inventoryPath, duplicateBytes)
  await assert.rejects(verifyRelease({ ...f.params, inventorySHA256: sha256(duplicateBytes) }), /duplicate/)
})

test('export manifest binds dist, retained inventory and supplied exact source package bodies', async t => {
  const f = await fixture(t), packageBytes = Buffer.from('{"fixture":true}'), packagePath = join(f.directory, 'package.json')
  await writeFile(packagePath, packageBytes)
  const inventoryBytes = await readFile(f.params.inventoryPath)
  const manifest = { contract: 'mip-qualified-dist-export-v1', source,
    files: [...f.inventory.output.files.map(row => ({ ...row, path: 'dist/' + row.path })),
      { path: 'release-artifact-inventory.json', bytes: inventoryBytes.length, sha256: sha256(inventoryBytes) },
      { path: 'source/package.json', bytes: packageBytes.length, sha256: sha256(packageBytes) }] }
  const manifestPath = join(f.directory, 'MANIFEST.json'), manifestBytes = Buffer.from(JSON.stringify(manifest))
  await writeFile(manifestPath, manifestBytes)
  const params = { ...f.params, exportManifestPath: manifestPath, exportManifestSHA256: sha256(manifestBytes),
    sourceFiles: { 'source/package.json': packagePath } }
  assert.equal((await verifyRelease(params)).exportProof.verified_dist_bodies, 10)
  await assert.rejects(verifyRelease({ ...params, sourceFiles: {} }), /all and only/)
  await writeFile(packagePath, 'new package')
  await assert.rejects(verifyRelease(params), /export source body differs/)
})

test('trusted inventory still refuses malformed counts, unsafe file names and entry/graph inconsistencies', async t => {
  const f = await fixture(t)
  async function rebind(inventory) {
    const bytes = Buffer.from(JSON.stringify(inventory))
    await writeFile(f.params.inventoryPath, bytes)
    return { ...f.params, inventorySHA256: sha256(bytes) }
  }
  await assert.rejects(verifyRelease(await rebind({ ...f.inventory, output: { ...f.inventory.output, total_bytes: 0 } })), /count\/total/)
  for (const path of ['../outside.js', 'assets/%252f.js', '.env', 'assets//x.js']) {
    const files = f.inventory.output.files.map((row, i) => i === 0 ? { ...row, path } : row)
    await assert.rejects(verifyRelease(await rebind({ ...f.inventory, output: { ...f.inventory.output, files } })), /unsafe/)
  }
  for (const [path, bytes, message] of [
    ['index.html', Buffer.from('<script src="/assets/shell-Abcd1234.js"></script>'), /entry HTML references/],
    ['world-view-bundle-graph.json', Buffer.from(JSON.stringify({ version: 1, base, chunks: [{ fileName: 'assets/missing.js' }] })), /bundle graph references/],
    ['world-view-bundle-graph.json', Buffer.from(JSON.stringify({ version: 1, base: '/../', chunks: [] })), /compiled base/],
  ]) {
    await writeFile(join(f.dist, path), bytes)
    const files = f.inventory.output.files.map(row => row.path === path ? { path, bytes: bytes.length, sha256: sha256(bytes) } : row)
    const inventory = { ...f.inventory, output: { ...f.inventory.output, files, total_bytes: files.reduce((n, row) => n + row.bytes, 0) } }
    await assert.rejects(verifyRelease(await rebind(inventory)), message)
    await writeFile(join(f.dist, path), f.bodies[path])
  }
})

test('rollback selects a distinct exact body-set identity and rejects mixing current bytes into previous manifests', async t => {
  const current = await fixture(t), previous = await fixture(t, { suffix: 'previous', sourceIdentity: { ...source, head: '3'.repeat(40) } })
  const result = qualifyRollbackSelection({ current: current.release, previous: previous.release, expectedPreviousIdentity: previous.release.identity })
  assert.equal(result.action_performed, false)
  assert.equal(result.verdict, 'PASS_MODEL_ARTIFACT_SELECTION')
  assert.throws(() => qualifyRollbackSelection({ current: current.release, previous: previous.release, expectedPreviousIdentity: current.release.identity }))
  assert.throws(() => qualifyRollbackSelection({ current: current.release, previous: current.release, expectedPreviousIdentity: current.release.identity }))
  assert.throws(() => qualifyRollbackSelection({ current: current.release, previous: { ...previous.release }, expectedPreviousIdentity: previous.release.identity }))
  const report = await runPreflight({ release: current.params, previousRelease: previous.params, expectedPreviousIdentity: previous.release.identity })
  assert.equal(report.rollback.verdict, 'PASS_MODEL_ARTIFACT_SELECTION')
  assert.equal(report.rollback.action_performed, false)
  await assert.rejects(runPreflight({ release: current.params, expectedPreviousIdentity: previous.release.identity }), /previous exact body artifact/)
  await assert.rejects(runPreflight({ release: current.params, previousRelease: previous.params, expectedPreviousIdentity: current.release.identity }), /identity differs/)
  await writeFile(join(previous.dist, 'assets/shell-Abcd1234.js'), current.bodies['assets/shell-Abcd1234.js'])
  await assert.rejects(verifyRelease(previous.params), /artifact body differs/)
})

test('report preserves root, security and real-predecessor holds while mapping every actual fixture body', async t => {
  const f = await fixture(t), report = await runPreflight({ release: f.params })
  assert.equal(report.verdict, 'PASS_BOUNDED_MODEL_WITH_HOST_AND_ROLLBACK_GATES_HELD')
  assert.equal(report.direct_prefix_mapping.mapped_bodies, 10)
  assert.equal(report.root_only_mapping.verdict, 'HOLD_COMPILED_PREFIX_UNSERVED')
  assert.equal(report.security_headers.verdict, 'HOLD_GOVERNED_HOST_HEADER_ACCEPTANCE')
  assert.equal(report.rollback.prior_body_identity_verified, false)
  assert.equal(report.fail_closed_requests.every(row => row.pass), true)
})

test('loopback HTTP boundary returns actual bytes, exact headers, HEAD/304 and fail-closed raw paths', async t => {
  const f = await fixture(t), model = createStaticModel(f.release, { rootEntry: 'redirect-to-prefix' })
  const server = createServer((req, res) => {
    const response = model.respond({ target: req.url, method: req.method, ifNoneMatch: req.headers['if-none-match'] })
    res.writeHead(response.status, response.headers)
    res.end(response.body)
  })
  t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())))
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const port = server.address().port
  async function get(path, { method = 'GET', headers = {} } = {}) {
    return new Promise((resolve, reject) => {
      const req = request({ hostname: '127.0.0.1', port, path, method, headers }, res => {
        const chunks = []
        res.on('data', data => chunks.push(data))
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }))
      })
      req.on('error', reject)
      req.end()
    })
  }
  const target = base + 'cesium/ThirdParty/decoder.wasm', body = f.bodies['cesium/ThirdParty/decoder.wasm']
  const actual = await get(target)
  assert.equal(actual.status, 200)
  assert.deepEqual(actual.body, body)
  assert.equal(actual.headers['content-type'], 'application/wasm')
  assert.equal(actual.headers.etag, entityTag(sha256(body)))
  const conditional = await get(target, { headers: { 'If-None-Match': actual.headers.etag } })
  assert.equal(conditional.status, 304)
  assert.equal(conditional.body.length, 0)
  const head = await get(target, { method: 'HEAD' })
  assert.equal(head.body.length, 0)
  assert.equal(head.headers['content-length'], String(body.length))
  assert.equal((await get(base + '../index.html')).status, 400)
  assert.equal((await get(base + 'assets%2fmissing.js')).status, 400)
  assert.equal((await get(base + 'api/stories')).status, 404)
  assert.equal((await get(base + 'assets/missing.js')).headers['content-type'], 'text/plain; charset=utf-8')
  assert.equal((await get('/?q=fixture')).headers.location, base + '?q=fixture')
  assert.equal((await get(target, { method: 'POST' })).status, 405)
})
