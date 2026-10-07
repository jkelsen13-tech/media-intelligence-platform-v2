// Offline receipt runner. Its Python child receives only fixed public arguments
// and a minimal environment; all marked values are constructed inside tests.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { runPipeMatrix, DUMMY_PASSWORD, DUMMY_URI } from './pipe-qualification.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const environment = { LANG: 'C', LC_ALL: 'C' }
const fixedCommand = (command, args) => spawnSync(command, args, {
  cwd: root, env: environment, encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024,
})
const gitValue = args => {
  const result = fixedCommand('git', args)
  if (result.status !== 0) throw new Error('PUBLIC_SOURCE_METADATA_UNAVAILABLE')
  return result.stdout.trim()
}

async function main() {
  if (process.argv.slice(2).join(' ') !== '--report-json') throw new Error('QUALIFICATION_ARGUMENTS_REFUSED')
  const result = fixedCommand('python3', ['-I', '-S', fileURLToPath(new URL('./qualify.py', import.meta.url)), '--report-json'])
  if ([DUMMY_PASSWORD, DUMMY_URI].some(value => result.stdout?.includes(value) || result.stderr?.includes(value))) {
    throw new Error('QUALIFICATION_OUTPUT_REFUSED')
  }
  if (result.status !== 0 || result.stderr !== '') throw new Error('PYTHON_QUALIFICATION_FAILED')
  const python = JSON.parse(result.stdout), pipe = await runPipeMatrix()
  if (python.failures !== 0 || pipe.failures !== 0) throw new Error('SYNTHETIC_QUALIFICATION_FAILED')
  const paths = [
    'scripts/qualification/backend-private-client/libpq17.py',
    'scripts/qualification/backend-private-client/frozen-inventory.json',
    'scripts/qualification/backend-live-rehearsal/source-lock.json',
    'scripts/qualification/backend-private-host/private_worker.py',
    'scripts/qualification/backend-private-host/private-pipe.mjs',
    'scripts/qualification/backend-private-host/bridge.mjs',
    'scripts/qualification/backend-private-host/controller.mjs',
    'scripts/qualification/backend-private-host/closed-fixture.mjs',
    'scripts/qualification/backend-private-host/inert.mjs',
    'tests/qik_private_libpq_transport_test.py',
    'scripts/qualification/qik-credential-failures-20261007/qualify.py',
    'scripts/qualification/qik-credential-failures-20261007/pipe-qualification.mjs',
    'scripts/qualification/qik-credential-failures-20261007/run.mjs',
    'tests/qualification/qik-credential-failures-20261007.test.mjs',
  ]
  const filePins = Object.fromEntries(await Promise.all(paths.map(async path => {
    const bytes = await readFile(new URL('../../../' + path, import.meta.url))
    return [path, { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }]
  })))
  return { scope: 'SYNTHETIC QUALIFICATION ONLY; NO QIK OR NATIVE SERVER CONNECTION',
    sourceHead: gitValue(['rev-parse', 'HEAD']), sourceTree: gitValue(['rev-parse', 'HEAD^{tree}']),
    worktreeChangesPresent: gitValue(['status', '--porcelain']).length !== 0, filePins,
    runtime: { nodeVersion: process.version, nodeExecutable: process.execPath,
      pythonVersion: python.pythonVersion, pythonIsolation: '-I -S' },
    networkMode: 'none', nativeServerQualified: false, qikExecuted: false,
    realCredentialsUsed: false, providerInternalTelemetryObserved: false,
    tests: python.tests + pipe.tests, failures: 0, skipped: 0, python, pipe }
}

try { process.stdout.write(`${JSON.stringify(await main(), null, 2)}\n`) }
catch { process.stdout.write('{"code":"CREDENTIAL_QUALIFICATION_REFUSED","networkMode":"none","nativeServerQualified":false}\n'); process.exitCode = 1 }
