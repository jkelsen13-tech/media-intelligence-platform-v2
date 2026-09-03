// World View / client origin lock: talk only to V2.
//
// These tests lock the allowlist and the Trust wiring seam. They must not
// compete on leftover-URL replacement in the Pages workflow, and they must
// not require leftover project refs to appear as literals in supabase.js.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  V2_SUPABASE_HOST,
  V2_SUPABASE_URL,
  resolveV2SupabaseUrl,
  rejectNonV2Client,
  supabaseClientUrl,
} from '../src/lib/supabaseOrigin.js'
import { isForbiddenSupabaseUrl } from '../src/lib/supabase.js'
import { loadSpatialProjection, loadWorldViewGraph } from '../src/lib/spatialProjection.js'

const CLIENT = readFileSync(new URL('../src/lib/supabase.js', import.meta.url), 'utf8')
const ORIGIN = readFileSync(new URL('../src/lib/supabaseOrigin.js', import.meta.url), 'utf8')
const V2 = 'https://qikvmopbtijoebdqosyq.supabase.co'
const LEFTOVER_REFS = ['yhbwnrtlqbjtcrrlpbge', 'niejaejtbxgakyrsntxm']

function explodingClient(url) {
  let fromCalls = 0
  return {
    supabaseUrl: url,
    fromCalls: () => fromCalls,
    from() {
      fromCalls += 1
      throw new Error('non-V2 client must not fetch')
    },
  }
}

test('V2 constants match the live account-verification host', () => {
  assert.equal(V2_SUPABASE_HOST, 'qikvmopbtijoebdqosyq.supabase.co')
  assert.equal(V2_SUPABASE_URL, V2)
})

test('resolveV2SupabaseUrl: V2 https origin is accepted (optional trailing slash)', () => {
  assert.deepEqual(resolveV2SupabaseUrl(V2), { ok: true, url: V2, reason: null })
  assert.deepEqual(resolveV2SupabaseUrl(`${V2}/`), { ok: true, url: V2, reason: null })
  assert.deepEqual(resolveV2SupabaseUrl(`  ${V2}  `), { ok: true, url: V2, reason: null })
})

test('resolveV2SupabaseUrl: missing and empty fail closed', () => {
  assert.deepEqual(resolveV2SupabaseUrl(undefined), { ok: false, url: null, reason: 'missing' })
  assert.deepEqual(resolveV2SupabaseUrl(null), { ok: false, url: null, reason: 'missing' })
  assert.deepEqual(resolveV2SupabaseUrl(''), { ok: false, url: null, reason: 'empty' })
  assert.deepEqual(resolveV2SupabaseUrl('   '), { ok: false, url: null, reason: 'empty' })
})

test('resolveV2SupabaseUrl: GitHub Pages hosts are rejected', () => {
  for (const raw of [
    'https://jkelsen13-tech.github.io',
    'https://jkelsen13-tech.github.io/media-intelligence-platform-v2/',
    'https://jkelsen13-tech.github.io/media-intelligence-platform-v2/index.html',
  ]) {
    const got = resolveV2SupabaseUrl(raw)
    assert.equal(got.ok, false, raw)
    assert.equal(got.url, null, raw)
    assert.equal(got.reason, 'origin_not_v2', raw)
  }
})

test('resolveV2SupabaseUrl: leftover Manus, paused original, and any other supabase.co fail closed', () => {
  const others = [
    `https://${LEFTOVER_REFS[0]}.supabase.co`,
    `https://${LEFTOVER_REFS[1]}.supabase.co`,
    `HTTPS://${LEFTOVER_REFS[0].toUpperCase()}.SUPABASE.CO`,
    'https://abcdefghijklmnopqr.supabase.co',
    'http://qikvmopbtijoebdqosyq.supabase.co',
    'https://qikvmopbtijoebdqosyq.supabase.co/rest/v1',
    'https://qikvmopbtijoebdqosyq.supabase.co/?x=1',
    'https://qikvmopbtijoebdqosyq.supabase.co/#frag',
    'https://user:pass@qikvmopbtijoebdqosyq.supabase.co',
  ]
  for (const raw of others) {
    const got = resolveV2SupabaseUrl(raw)
    assert.equal(got.ok, false, raw)
    assert.equal(got.reason, 'origin_not_v2', raw)
  }
})

test('Trust leftover-host hashes still fail closed; V2 stays open', () => {
  assert.equal(isForbiddenSupabaseUrl(`https://${LEFTOVER_REFS[0]}.supabase.co`), true)
  assert.equal(isForbiddenSupabaseUrl(`https://${LEFTOVER_REFS[1]}.supabase.co`), true)
  assert.equal(isForbiddenSupabaseUrl(V2), false)
})

test('makeClient keeps Trust refuse-before-createClient and adds V2 allowlist', () => {
  const start = CLIENT.indexOf('function makeClient()')
  assert.ok(start > -1, 'makeClient not found')
  const next = CLIENT.indexOf('\nexport const supabase', start)
  const body = CLIENT.slice(start, next === -1 ? undefined : next)
  assert.match(body, /isForbiddenSupabaseUrl\(url\)/)
  assert.match(body, /resolveV2SupabaseUrl\(url\)/)
  assert.match(body, /createClient\(url, anonKey\)/)
  const forbid = body.indexOf('isForbiddenSupabaseUrl(url)')
  const allow = body.indexOf('resolveV2SupabaseUrl(url)')
  const create = body.indexOf('createClient(url, anonKey)')
  assert.ok(forbid > -1 && allow > -1 && create > -1)
  assert.ok(forbid < allow, 'isForbiddenSupabaseUrl must run before the V2 allowlist')
  assert.ok(allow < create, 'resolveV2SupabaseUrl must run before createClient')
})

test('supabase.js still does not embed leftover project refs as literals', () => {
  for (const ref of LEFTOVER_REFS) {
    assert.doesNotMatch(CLIENT, new RegExp(ref))
  }
})

test('injected non-V2 clients never call .from() for spatial or World View graph', async () => {
  const rejected = [
    `https://${LEFTOVER_REFS[0]}.supabase.co`,
    `https://${LEFTOVER_REFS[1]}.supabase.co`,
    'https://jkelsen13-tech.github.io/media-intelligence-platform-v2/',
    'https://otherprojectref1234.supabase.co',
  ]
  for (const url of rejected) {
    const client = explodingClient(url)
    assert.equal(rejectNonV2Client(client), 'origin_not_v2')
    const spatial = await loadSpatialProjection({ supabaseClient: client })
    const graph = await loadWorldViewGraph({ supabaseClient: client })
    assert.equal(spatial.status, 'unavailable')
    assert.equal(spatial.reason, 'origin_not_v2')
    assert.deepEqual(spatial.rows, [])
    assert.equal(graph.status, 'unavailable')
    assert.equal(graph.reason, 'origin_not_v2')
    assert.deepEqual(graph.nodes, [])
    assert.deepEqual(graph.edges, [])
    assert.equal(client.fromCalls(), 0, url)
  }
})

test('default spatial/graph load without VITE_SUPABASE_URL fails closed and does not invent pins', async () => {
  const spatial = await loadSpatialProjection({ envUrl: undefined })
  const graph = await loadWorldViewGraph({ envUrl: '' })
  assert.equal(spatial.status, 'unavailable')
  assert.ok(spatial.reason === 'missing' || spatial.reason === 'empty' || spatial.reason === 'client_not_configured')
  assert.deepEqual(spatial.rows, [])
  assert.equal(graph.status, 'unavailable')
  assert.deepEqual(graph.edges, [])
})

test('non-V2 envUrl fails closed before any client fetch', async () => {
  const spatial = await loadSpatialProjection({ envUrl: 'https://jkelsen13-tech.github.io' })
  assert.equal(spatial.status, 'unavailable')
  assert.equal(spatial.reason, 'origin_not_v2')
  assert.deepEqual(spatial.rows, [])
})

test('supabaseClientUrl reads supabase-js and rest.url shapes', () => {
  assert.equal(supabaseClientUrl({ supabaseUrl: V2 }), V2)
  assert.equal(supabaseClientUrl({ rest: { url: `${V2}/rest/v1` } }), V2)
  assert.equal(supabaseClientUrl(null), null)
})

test('origin module comments do not bake leftover project refs', () => {
  for (const ref of LEFTOVER_REFS) {
    assert.doesNotMatch(ORIGIN, new RegExp(ref))
  }
})
