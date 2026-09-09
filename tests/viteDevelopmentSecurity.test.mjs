import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'vite'

test('Vite serves allowed development pages while blocking untrusted origins, hosts and private files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mip-vite-security-'))
  let server
  try {
    await writeFile(join(root, 'index.html'), '<!doctype html><title>MIP isolated security fixture</title>')
    await writeFile(join(root, '.env'), 'MIP_TEST_ONLY=private-fixture-marker')
    server = await createServer({
      configFile: false,
      root,
      logLevel: 'silent',
      server: { host: '127.0.0.1', port: 0 },
    })
    await server.listen()
    const base = 'http://127.0.0.1:' + server.httpServer.address().port
    const allowed = await fetch(base, { headers: { Origin: base } })
    assert.equal(allowed.status, 200)
    assert.equal(allowed.headers.get('access-control-allow-origin'), base)
    assert.match(await allowed.text(), /MIP isolated security fixture/)
    const crossOrigin = await fetch(base, { headers: { Origin: 'https://untrusted.example' } })
    assert.equal(crossOrigin.headers.get('access-control-allow-origin'), null)
    const foreignHost = await fetch(base, { headers: { Host: 'untrusted.example' } })
    assert.equal(foreignHost.status, 403)
    const privateFile = await fetch(base + '/.env')
    assert.equal(privateFile.status, 403)
    assert.doesNotMatch(await privateFile.text(), /private-fixture-marker/)
  } finally {
    await server?.close()
    await rm(root, { recursive: true, force: true })
  }
})
