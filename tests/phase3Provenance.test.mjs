import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const readPath = readFileSync(new URL('../src/lib/phase3ReadPath.js', import.meta.url), 'utf8')
const view = readFileSync(new URL('../src/views/Phase3View.jsx', import.meta.url), 'utf8')

test('Phase 3 policy loader selects agency and structured source-locator provenance', () => {
  assert.match(readPath, /created_at, agency, source_locator/)
})

test('Phase 3 policy cards render agency and chapter/page provenance without a score', () => {
  assert.match(view, /Owning agency: \{policy\.agency\}/)
  assert.match(view, /Source locator: Chapter \{policy\.source_locator\.chapter\}/)
  assert.match(view, /policy\.source_locator\.chapter_title/)
  assert.match(view, /policy\.source_locator\.pages/)
  assert.match(view, /No composite alignment scores are computed\./)
})
