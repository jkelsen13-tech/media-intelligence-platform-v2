// Pins for src/lib/jumpReset.js (Package 1 item 1) — plus a static drift
// guard that every cross-view handler in App.jsx routes through the reset.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { JUMP_CLEARS, jumpFocusStack } from '../src/lib/jumpReset.js'

const here = dirname(fileURLToPath(import.meta.url))
const appSrc = readFileSync(join(here, '../src/App.jsx'), 'utf8')

test('a jump always returns a single-crumb stack rooted at the target', () => {
  const stack = jumpFocusStack('node', 'n-1', 'Middle East')
  assert.equal(stack.length, 1)
  assert.deepEqual(stack[0], { kind: 'node', id: 'n-1', label: 'Middle East' })
})

test('jump stack carries kind-specific extra payload without widening the contract', () => {
  const stack = jumpFocusStack('topic', 't-7', 'Sanctions', { memberIds: ['a', 'b'] })
  assert.equal(stack.length, 1)
  assert.equal(stack[0].kind, 'topic')
  assert.deepEqual(stack[0].memberIds, ['a', 'b'])
})

test('extra defaults to nothing (null-safe)', () => {
  assert.deepEqual(jumpFocusStack('node', 'x', 'X'), [{ kind: 'node', id: 'x', label: 'X' }])
})

test('JUMP_CLEARS names every transient panel state App holds', () => {
  assert.deepEqual([...JUMP_CLEARS].sort(), [
    'edgeEvidence',
    'edgeListOpen',
    'pinned',
    'policyNode',
    'reviewStatusOpen',
    'selected',
    'topicsOpen',
  ])
})

// Static drift guard: the seam is worthless if a cross-view handler forgets
// to call the reset. Each App.jsx handler must reference resetJumpContext.
test('every cross-view handler in App.jsx routes through resetJumpContext', () => {
  for (const handler of [
    'openNodeInGraph',
    'openArcInView',
    'openArticleInNews',
    'openEventInTimeline',
    'openComparisonEvent',
  ]) {
    const i = appSrc.indexOf(`${handler} = useCallback`)
    assert.notEqual(i, -1, `${handler} not found in App.jsx`)
    const body = appSrc.slice(i, appSrc.indexOf(']', i)) // up to dep array
    assert.ok(
      body.includes('resetJumpContext()'),
      `${handler} does not call resetJumpContext() — stale panels would survive the jump`,
    )
  }
})

// And the Arc→Graph jump must RESET the focus stack (jumpFocusStack), not
// append to a stale one (pushFocus) — the pre-fix behavior.
test('openNodeInGraph resets the focus stack via the seam, never appends', () => {
  const i = appSrc.indexOf('openNodeInGraph = useCallback')
  const body = appSrc.slice(i, appSrc.indexOf('],', i))
  assert.ok(body.includes('jumpFocusStack('), 'openNodeInGraph must root the stack at the jump target')
  assert.ok(!body.includes('pushFocus('), 'openNodeInGraph must not append to the prior stack')
})
