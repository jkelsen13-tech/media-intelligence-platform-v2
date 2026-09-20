import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const config = JSON.parse(readFileSync(join(here, '../vercel.json'), 'utf8'))

test('backend-consolidation branch cannot produce a Vercel Git deployment', () => {
  assert.equal(
    config.git.deploymentEnabled['codex/mip-backend-consolidation-20260920'],
    false,
  )
})
