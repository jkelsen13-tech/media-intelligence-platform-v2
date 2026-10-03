import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import chokidar from 'chokidar'
import { build, createServer } from 'vite'

const configFile = fileURLToPath(new URL('../../vite.config.js', import.meta.url))
const groups = ['Workers', 'ThirdParty', 'Assets', 'Widgets']
const base = '/media-intelligence-platform-v2/'

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'mip-cesium-copy-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await writeFile(join(root, 'index.html'), '<script type="module" src="/entry.js"></script>')
  await writeFile(join(root, 'entry.js'), 'console.log("asset fixture")')
  const assets = new Map()
  for (const group of groups) {
    // Repeated basenames in separate nested directories detect flattening.
    for (const relative of ['root.bin', 'nested/a/shared.bin', 'nested/b/shared.bin', '.notice']) {
      const name = `${group}/${relative}`
      const bytes = Buffer.from(`fixture:${name}\0\xff`, 'latin1')
      const source = join(root, 'node_modules/cesium/Build/Cesium', name)
      await mkdir(join(source, '..'), { recursive: true })
      await writeFile(source, bytes)
      assets.set(name, bytes)
    }
  }
  return { root, assets }
}

test('Cesium directory targets preserve nested paths and bytes in the build', async t => {
  const { root, assets } = await fixture(t)
  await build({ configFile, root, logLevel: 'silent' })
  for (const [name, bytes] of assets) {
    assert.deepEqual(await readFile(join(root, 'dist/cesium', name)), bytes, name)
  }
  // Nested leaves must stay nested instead of also being copied to the root.
  await assert.rejects(readFile(join(root, 'dist/cesium/Assets/shared.bin')), { code: 'ENOENT' })
})

test('Cesium development assets remain served and watched with Chokidar 4', async t => {
  const { root, assets } = await fixture(t)
  const originalWatch = chokidar.watch
  const observed = []
  // Capture the real static-copy watcher at creation, before its ready event.
  chokidar.watch = (...args) => {
    const watcher = originalWatch(...args)
    observed.push({ watcher, ready: once(watcher, 'ready'), paths: args[0] })
    return watcher
  }
  let server
  try {
    server = await createServer({
      configFile,
      root,
      logLevel: 'silent',
      appType: 'mpa',
      server: { host: '127.0.0.1', port: 0 },
    })
  } finally {
    chokidar.watch = originalWatch
  }
  t.after(() => server.close())
  await server.listen()
  const copyWatcher = observed.find(({ paths }) => Array.isArray(paths)
    && groups.every(group => paths.includes(`node_modules/cesium/Build/Cesium/${group}`)))
  assert.ok(copyWatcher, 'the actual static-copy plugin watches all four literal directories')
  await copyWatcher.ready
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`
  async function request(name) {
    const response = await fetch(`${origin}${base}cesium/${name}`)
    return { status: response.status, bytes: Buffer.from(await response.arrayBuffer()) }
  }
  for (const [name, bytes] of assets) {
    const response = await request(name)
    assert.equal(response.status, 200, name)
    assert.deepEqual(response.bytes, bytes, name)
  }

  function event(kind, relative) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        copyWatcher.watcher.off(kind, handler)
        reject(new Error(`Static-copy watcher missed ${kind}: ${relative}`))
      }, 5000)
      function handler(path) {
        if (path !== relative) return
        clearTimeout(timeout)
        copyWatcher.watcher.off(kind, handler)
        resolve()
      }
      copyWatcher.watcher.on(kind, handler)
    })
  }
  const name = 'Assets/nested/a/new.bin'
  const relative = `node_modules/cesium/Build/Cesium/${name}`
  const source = join(root, relative)
  let pending = event('add', relative)
  await writeFile(source, 'added')
  await pending
  assert.deepEqual(await request(name), { status: 200, bytes: Buffer.from('added') })
  pending = event('change', relative)
  await writeFile(source, 'changed')
  await pending
  assert.deepEqual(await request(name), { status: 200, bytes: Buffer.from('changed') })
  pending = event('unlink', relative)
  await rm(source)
  await pending
  assert.equal((await request(name)).status, 404)
  // Closing the server also closes the plugin's separate watcher.
  await server.close()
  assert.equal(copyWatcher.watcher.closed, true)
})
