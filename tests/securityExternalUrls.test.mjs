import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { safeExternalHttpUrl } from '../src/lib/externalUrls.js'
import { safeWorkspaceHttpUrl } from '../src/lib/investigationWorkspaceSession.js'
import { isSafeSupabaseBrowserKey } from '../src/lib/supabaseOrigin.js'

const jwt = (role) => [Buffer.from('{}').toString('base64url'), Buffer.from(JSON.stringify({ role })).toString('base64url'), 'signature'].join('.')
test('source links reject executable schemes, ambiguous URLs, credentials and control bytes', () => {
  const unsafe = [undefined, null, 123, '', '/relative', '//host.invalid', 'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>', 'blob:https://host.invalid/id', 'https://user:pass@host.invalid',
    'https://host.invalid\\@attacker.invalid/', 'https://host.invalid/white space', 'https://host.invalid/\u0000',
    'https://host.invalid/\u001b', 'https://host.invalid/\u007f', `https://host.invalid/${'x'.repeat(2048)}`]
  for (const value of unsafe) {
    assert.equal(safeExternalHttpUrl(value), null, String(value))
    assert.equal(safeWorkspaceHttpUrl(value), null, String(value))
  }
  for (const value of ['https://Example.invalid/a?q=1#cite', 'http://example.invalid/', 'https://example.invalid/a%20b']) {
    assert.equal(safeExternalHttpUrl(value), new URL(value).href)
  }
})
test('browser Supabase configuration accepts only public publishable or legacy anon keys', () => {
  assert.equal(isSafeSupabaseBrowserKey('sb_publishable_public_test_key'), true)
  assert.equal(isSafeSupabaseBrowserKey(jwt('anon')), true)
  for (const value of ['', undefined, 'sb_secret_private_test', jwt('service_role'), jwt('authenticated'),
    'malformed', 'a.!.b', 'sb_publishable_key\n']) assert.equal(isSafeSupabaseBrowserKey(value), false)
})
test('the compatible sanitizer override and lock both carry the patched advisory version', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)))
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url)))
  assert.equal(pkg.overrides.dompurify, '3.4.16')
  assert.equal(lock.packages['node_modules/dompurify'].version, '3.4.16')
  assert.equal(lock.packages['node_modules/@cesium/engine'].dependencies.dompurify, '^3.4.14')
})
