import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const run = promisify(execFile)

test('offline real-imagery producer/consumer qualification uses actual synthetic GDAL pixels and refuses absent official bytes', async () => {
  const { stdout, stderr } = await run(process.env.MIP_GEOSPATIAL_PYTHON ?? '/usr/bin/python3',
    ['verifier/realImageryDerivative.test.py'], { timeout: 120_000, maxBuffer: 1024 * 1024 })
  assert.match(stdout + stderr, /Ran 19 tests/)
  assert.match(stdout + stderr, /\nOK\n/)
})
