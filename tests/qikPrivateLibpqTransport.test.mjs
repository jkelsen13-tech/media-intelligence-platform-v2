import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { buildSubmissionBundle } from '../scripts/qualification/backend-live-rehearsal/package.mjs'

const source = new URL('../scripts/qualification/backend-private-client/', import.meta.url)
const cli = fileURLToPath(new URL('libpq17.py', source))
const pythonTests = fileURLToPath(new URL('./qik_private_libpq_transport_test.py', import.meta.url))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const python = (args, options = {}) => spawnSync('python3', ['-I', '-S', ...args],
  { encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024, ...options })

test('fixed transport SQL inventory is byte-for-byte generated from the frozen submission bundle', async () => {
  const bytes = await readFile(new URL('frozen-inventory.json', source))
  const bundle = await buildSubmissionBundle()
  assert.equal(bytes.toString('utf8'), `${JSON.stringify(bundle, null, 2)}\n`)
  assert.equal(sha(bytes), '09b6e70225313ae00428219ba86cc945c82dccdce29b8b84681caef0aebf959f')
  assert.equal(bundle.sourceLockSha256, 'be46812c3154b58162037d93a755b544e8862d81eb26738369db6887bdf8f18c')
  assert.equal(bundle.executableLivePackage, false)
  assert.equal(bundle.genuineAuthorityBindingsComplete, false)
  for (const phase of bundle.successPath) {
    if (!phase.submission) continue
    assert.equal(sha(phase.submission.text), phase.submission.sha256)
    assert.equal(/\bCOMMIT\s*;/i.test(phase.submission.text), false)
  }
})

test('transport inspection emits only public hashes using a fake library without a network command', async () => {
  const result = python([pythonTests, '--inspect-fake-libpq'], {
    input: 'synthetic-private-stdin-never-output',
    env: { ...process.env, PGHOST: 'unused.invalid', PGPASSWORD: 'synthetic-private-env-never-output' },
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stderr, '')
  const receipt = JSON.parse(result.stdout)
  assert.equal(receipt.networkMode, 'none')
  assert.equal(receipt.libpqVersion, 170011)
  assert.equal(receipt.libraryBytes, Buffer.byteLength('synthetic libpq library bytes for inspection'))
  assert.equal(receipt.librarySha256, sha('synthetic libpq library bytes for inspection'))
  assert.equal(receipt.publicSourceHashes.transport, sha(await readFile(cli)))
  assert.equal(Object.keys(receipt.publicSourceHashes).length, 21)
  assert.equal(receipt.liveReady, false)
  assert.equal(receipt.nativeServerQualified, false)
  assert.equal(receipt.tlsQualified, false)
  assert.equal(receipt.cancelDrainQualified, false)
  for (const symbol of ['PQconnectStartParams', 'PQsendQueryParams', 'PQflush', 'PQsetNoticeReceiver',
    'PQconsumeInput', 'PQisBusy', 'PQgetResult', 'PQclear', 'PQcancelCreate', 'PQcancelStart',
    'PQcancelPoll', 'PQcancelSocket', 'PQcancelFinish']) assert.ok(receipt.requiredSymbols.includes(symbol))
  for (const value of ['synthetic-private-stdin', 'synthetic-private-env', 'unused.invalid']) {
    assert.equal(result.stdout.includes(value), false)
  }
})

test('inspection CLI refuses connect credentials modules arbitrary SQL and operational stdin arguments', () => {
  for (const args of [['--connect'], ['--live'], ['--execute'], ['--stdin'], ['--password', 'synthetic-private'],
    ['--dsn=postgresql://synthetic-private'], ['--driver', 'synthetic-private'], ['--sql', 'synthetic-private'],
    ['--inspect-local-libpq', 'synthetic-private']]) {
    const result = python([cli, ...args], { input: 'synthetic-private-input' })
    assert.equal(result.status, 2)
    assert.equal(result.stderr, '')
    assert.deepEqual(JSON.parse(result.stdout), { mode: 'source-only-offline', liveReady: false,
      outcome: 'REFUSED', code: 'CLI_ARGUMENTS_REFUSED' })
    assert.equal(result.stdout.includes('synthetic-private'), false)
  }
})

test('fake libpq exercises real transport state machine and ctypes declarations without any server or installed library', () => {
  const result = python([pythonTests, '--report-json'])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stderr, /Ran 30 tests/)
  assert.match(result.stderr, /\nOK\n/)
  assert.deepEqual(JSON.parse(result.stdout), {
    scope: 'FAKE LIBPQ ONLY; NO SERVER OR INSTALLED LIBRARY REQUIRED', tests: 30,
    failures: 0, errors: 0, skipped: 0,
  })
  assert.equal(result.stderr.includes('synthetic-private-value-never-output'), false)
  assert.doesNotMatch(result.stderr, /skipped=/)
})

test('transport binds only approved nonblocking APIs and keeps the CLI inspection-only', async () => {
  const text = await readFile(cli, 'utf8')
  assert.doesNotMatch(text, /\bPQ(?:errorMessage|resultErrorMessage|resultErrorField|cancelErrorMessage|getCancel|exec|trace|enterPipelineMode)\b/)
  assert.doesNotMatch(text, /["']PQcancel["']/)
  assert.match(text, /PQsetNoticeReceiver/)
  assert.match(text, /PQsendQueryParams/)
  assert.match(text, /"sslcertmode": "disable"/)
  assert.match(text, /"passfile": "\/dev\/null"/)
  assert.match(text, /"sslmode": "verify-full"/)
  assert.match(text, /"gssencmode": "disable"/)
  assert.doesNotMatch(text.slice(text.indexOf('def main(')), /\.connect\(|\.execute\(|PrivateConnectionFields|PrivateTransport\(/)
})
