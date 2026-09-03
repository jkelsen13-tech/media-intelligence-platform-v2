// Pages / client isolation: the live bundle must talk only to V2.
//
// Failure modes these tests guard against are silent host leaks:
//   1. The GitHub Pages workflow still injects leftover Manus or
//      paused-original Supabase hosts at build time.
//   2. The JS client would construct a client for those leftover hosts
//      if they appeared in VITE_SUPABASE_URL.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { isForbiddenSupabaseUrl } from '../src/lib/supabase.js'

const WORKFLOW = readFileSync(new URL('../.github/workflows/blank.yml', import.meta.url), 'utf8')
const CLIENT = readFileSync(new URL('../src/lib/supabase.js', import.meta.url), 'utf8')
const V2_HOST = 'qikvmopbtijoebdqosyq.supabase.co'
const LEFTOVER_REFS = ['yhbwnrtlqbjtcrrlpbge', 'niejaejtbxgakyrsntxm']
const MANUS_PUBLISHABLE = 'sb_publishable_VB9q-7kUl_9zqi_K1-lVYw_Q9XCL_M2'

test('isForbiddenSupabaseUrl: leftover Manus and paused-original hosts fail closed', () => {
  assert.equal(isForbiddenSupabaseUrl(`https://${LEFTOVER_REFS[0]}.supabase.co`), true)
  assert.equal(isForbiddenSupabaseUrl(`https://${LEFTOVER_REFS[1]}.supabase.co`), true)
  assert.equal(isForbiddenSupabaseUrl(`HTTPS://${LEFTOVER_REFS[0].toUpperCase()}.SUPABASE.CO`), true)
})

test('isForbiddenSupabaseUrl: V2 host and empty values stay open / unused', () => {
  assert.equal(isForbiddenSupabaseUrl(`https://${V2_HOST}`), false)
  assert.equal(isForbiddenSupabaseUrl(''), false)
  assert.equal(isForbiddenSupabaseUrl(null), false)
  assert.equal(isForbiddenSupabaseUrl(undefined), false)
})

test('makeClient refuses leftover hosts before createClient', () => {
  const start = CLIENT.indexOf('function makeClient()')
  assert.ok(start > -1, 'makeClient not found')
  const next = CLIENT.indexOf('\nexport const supabase', start)
  const body = CLIENT.slice(start, next === -1 ? undefined : next)
  assert.match(body, /isForbiddenSupabaseUrl\(url\)/)
  assert.match(body, /return null/)
  const forbid = body.indexOf('isForbiddenSupabaseUrl(url)')
  const create = body.indexOf('createClient(url, anonKey)')
  assert.ok(forbid > -1 && create > -1 && forbid < create)
})

test('Pages workflow injects V2 URL and no leftover hosts or Manus key', () => {
  assert.match(WORKFLOW, new RegExp(`VITE_SUPABASE_URL:\\s*https://${V2_HOST}`))
  for (const ref of LEFTOVER_REFS) {
    assert.doesNotMatch(WORKFLOW, new RegExp(ref))
  }
  assert.doesNotMatch(WORKFLOW, new RegExp(MANUS_PUBLISHABLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(WORKFLOW, /VITE_SUPABASE_ANON_KEY:\s*(?:\$\{\{\s*secrets\.VITE_SUPABASE_ANON_KEY\s*\}\}|sb_publishable_)/)
})
