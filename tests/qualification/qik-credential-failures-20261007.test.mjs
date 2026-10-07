import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { runPipeMatrix, DUMMY_PASSWORD, DUMMY_URI } from '../../scripts/qualification/qik-credential-failures-20261007/pipe-qualification.mjs'

const suite = fileURLToPath(new URL('../../scripts/qualification/qik-credential-failures-20261007/qualify.py', import.meta.url))
const cli = fileURLToPath(new URL('../../scripts/qualification/backend-private-client/libpq17.py', import.meta.url))
const safeOutput = result => {
  for (const marker of [DUMMY_URI, DUMMY_PASSWORD]) {
    assert.equal(result.stdout.includes(marker), false, 'credential marker in stdout')
    assert.equal(result.stderr.includes(marker), false, 'credential marker in stderr')
  }
}

test('actual Python transport and closed worker qualify synthetic credential failures without sockets or credential reports', () => {
  const result = spawnSync('python3', ['-I', '-S', suite, '--report-json'], {
    encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024,
    env: { LANG: 'C', LC_ALL: 'C' },
  })
  safeOutput(result)
  assert.equal(result.status, 0, 'synthetic Python qualification failed; receipt uses fixed codes')
  assert.equal(result.stderr, '')
  const receipt = JSON.parse(result.stdout)
  assert.equal(receipt.scope, 'SYNTHETIC FAKE C AND CLOSED WORKER ONLY')
  assert.ok(receipt.tests >= 50)
  assert.equal(receipt.failures, 0)
  assert.equal(receipt.skipped, 0)
  assert.equal(receipt.nativeServerQualified, false)
  assert.equal(receipt.qikExecuted, false)
  assert.equal(receipt.certificateVerificationQualified, false)
  assert.equal(receipt.providerInternalTelemetryObserved, false)
  assert.deepEqual(receipt.unqualifiedPythonFaultModels.map(item => item.function), ['PQstatus', 'PQtransactionStatus'])
  assert.ok(receipt.unqualifiedPythonFaultModels.every(item => item.nativeReachabilityQualified === false
    && item.workerReplyContainsMarker === false && item.directPrivateApiInjectedTracebackContainsMarker === true))
})

test('actual private pipe and closed controller suppress credential-bearing errors in public outcomes', async () => {
  const receipt = await runPipeMatrix()
  assert.equal(receipt.tests, 21)
  assert.equal(receipt.failures, 0)
  assert.equal(receipt.skipped, 0)
  assert.equal(receipt.nativeServerQualified, false)
  assert.equal(receipt.qikExecuted, false)
  for (const marker of [DUMMY_URI, DUMMY_PASSWORD, 'TEST_ONLY_PRIVATE_ROW_MARKER_7d6b', 'TEST_ONLY_PRIVATE_CONFIG_MARKER_4219']) {
    assert.equal(JSON.stringify(receipt).includes(marker), false)
  }
})

test('inspection CLI refuses credential options and reads no private stdin', () => {
  // Credentials arrive only through this closed stdin model. No credential is
  // put in process arguments or inherited environment, even for a refusal test.
  const result = spawnSync('python3', ['-I', '-S', cli, '--connect'], {
    encoding: 'utf8', timeout: 5000, input: DUMMY_URI,
    env: { LANG: 'C', LC_ALL: 'C' },
  })
  safeOutput(result)
  assert.equal(result.status, 2)
  assert.equal(result.stderr, '')
  assert.equal(JSON.parse(result.stdout).code, 'CLI_ARGUMENTS_REFUSED')
})

test('closed child retains dummy stdin while actual process argv/environment remain credential-free', async () => {
  const child = spawn('python3', ['-I', '-S', suite, '--closed-process-custody'], {
    env: { LANG: 'C', LC_ALL: 'C' }, stdio: ['pipe', 'pipe', 'pipe'],
  })
  let stdout = '', stderr = ''
  const timeout = setTimeout(() => child.kill(), 5000)
  const ready = new Promise((resolve, reject) => {
    child.stdout.on('data', bytes => { stdout += bytes; if (stdout.includes('\n')) resolve() })
    child.stderr.on('data', bytes => { stderr += bytes })
    child.on('error', () => reject(new Error('closed child unavailable')))
    child.on('exit', () => { if (!stdout.includes('\n')) reject(new Error('closed child exited before ready')) })
  })
  const exited = new Promise(resolve => child.on('exit', code => resolve(code)))
  try {
    child.stdin.write(`${DUMMY_URI}\n`)
    await ready
    const [argv, environment] = await Promise.all([
      readFile(`/proc/${child.pid}/cmdline`, 'utf8'), readFile(`/proc/${child.pid}/environ`, 'utf8'),
    ])
    for (const marker of [DUMMY_URI, DUMMY_PASSWORD]) {
      assert.equal(argv.includes(marker), false, 'credential marker in closed process argv')
      assert.equal(environment.includes(marker), false, 'credential marker in closed process environment')
    }
    assert.deepEqual(environment.split('\0').filter(Boolean).sort(), ['LANG=C', 'LC_ALL=C'])
    assert.deepEqual(JSON.parse(stdout), { ready: true,
      runtimeGuardCode: 'APPROVED_PRIVATE_HOST_RUNTIME_UNBOUND', guardConsumedPrivateInput: false })
    child.stdin.end('release\n')
    assert.equal(await exited, 0)
    safeOutput({ stdout, stderr })
    assert.equal(stderr, '')
  } finally { clearTimeout(timeout); child.kill() }
})
