// Package 1 item 4 (22_NOTE) — lineage-safe wording pins.
// The UI must never claim source independence without tracked lineage.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { E_LEVEL_NAMES } from '../src/lib/sourceComparisonReadPath.js'

const viewSrc = readFileSync(
  fileURLToPath(new URL('../src/views/SourceComparisonView.jsx', import.meta.url)),
  'utf8',
)
const libSrc = readFileSync(
  fileURLToPath(new URL('../src/lib/sourceComparisonReadPath.js', import.meta.url)),
  'utf8',
)

test('item4: claim meta uses an attribution label that does not imply another source', () => {
  assert.match(viewSrc, /Reported by:/)
  assert.doesNotMatch(viewSrc, /Also reported by:/)
})

test('item4: claim meta distinguishes one-outlet events from multiple outlets with lineage unverified', () => {
  assert.match(viewSrc, /one outlet in this event/i)
  assert.match(viewSrc, /multiple outlets; lineage not verified/i)
})

test('item4: no user-facing string claims independence', () => {
  // Strip comments before scanning so explanatory comments don't trip the pin.
  // Internal model field names (claim.independentOutlets) are not user-facing
  // and are intentionally unchanged; the guard targets rendered text:
  // quoted string literals and JSX text nodes.
  const noComments = viewSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1')
  const stringLiterals = noComments.match(/(["'`])(?:\\.|(?!\1).)*\1/g) ?? []
  for (const lit of stringLiterals) {
    assert.doesNotMatch(lit, /independent/i, `string literal claims independence: ${lit}`)
  }
  // The old rendered label, specifically, must be gone.
  assert.doesNotMatch(noComments, /Reported independently by/)
})

test('item4: E2 chip no longer claims corroboration', () => {
  assert.doesNotMatch(E_LEVEL_NAMES.E2, /corroborat/i)
  assert.match(E_LEVEL_NAMES.E2, /multi-outlet/i)
})

test('item4: E-level table has no independence claims anywhere', () => {
  for (const name of Object.values(E_LEVEL_NAMES)) {
    assert.doesNotMatch(name, /independent|corroborat/i)
  }
})

test('item4: read-path docstring no longer promises independence', () => {
  assert.doesNotMatch(libSrc, />=2 independent outlets -> E2 corroborated/)
})
