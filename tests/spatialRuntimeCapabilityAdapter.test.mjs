import assert from 'node:assert/strict'
import test from 'node:test'
import { createHandler } from '../supabase/functions/spatial-runtime-capability/handler.ts'

const userId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const runId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const params = {
  policy_family_code: 'fixture',
  policy_version: '1',
  canonical_content: { a: 1 },
  effective_at: '2026-01-01T00:00:00Z',
}

function request(operation = 'append_policy_artifact') {
  return new Request('https://fixture.invalid/spatial-runtime', {
    method: 'POST',
    headers: {
      authorization: 'Bearer fixture-only',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ operation, params }),
  })
}

function fixture(allowed = true) {
  const calls = []
  let releases = 0
  const client = {
    async queryObject(sql, args) {
      calls.push({ sql, args })
      if (sql.includes('spatial_runtime_operation_allowed')) {
        return { rows: [{ mip_profile_exists: allowed }] }
      }
      return { rows: [] }
    },
    release() {
      releases++
    },
  }
  return {
    calls,
    get releases() {
      return releases
    },
    handler: createHandler({
      env: {
        SUPABASE_URL: 'https://fixture.invalid',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
      },
      pool: { async connect() { return client } },
      authFetch: async () => new Response(JSON.stringify({ id: userId }), { status: 200 }),
      randomUUID: () => runId,
      log: () => {},
    }),
  }
}

test('adapter binds the authenticated user and exact operation to the database capability gate', async () => {
  const f = fixture(true)
  const response = await f.handler(request())
  assert.equal(response.status, 200)
  const gate = f.calls.find(({ sql }) => sql.includes('spatial_runtime_operation_allowed'))
  assert.deepEqual(gate.args, [userId, 'append_policy_artifact'])
  assert.ok(f.calls.some(({ sql }) => sql.startsWith('select spatial.append_policy_artifact')))
  assert.equal(f.releases, 1)
})

test('capability denial rolls back before a spatial append', async () => {
  const f = fixture(false)
  const response = await f.handler(request())
  assert.equal(response.status, 403)
  assert.deepEqual(await response.json(), { ok: false, code: 'NO_PROFILE' })
  assert.ok(f.calls.some(({ sql }) => sql === 'ROLLBACK'))
  assert.ok(!f.calls.some(({ sql }) => sql.startsWith('select spatial.')))
  assert.equal(f.releases, 1)
})

test('unknown operations are rejected before database checkout', async () => {
  const f = fixture(true)
  const response = await f.handler(request('not_registered'))
  assert.equal(response.status, 400)
  assert.deepEqual(f.calls, [])
  assert.equal(f.releases, 0)
})
