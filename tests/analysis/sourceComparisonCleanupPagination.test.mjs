// V2 Source Comparison projection regression: complete event reads must survive
// the PostgREST 1000-row cap, while the projection must not mutate V2 events.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { pagedSelect } from '../../supabase/functions/source-comparison-run/lib.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const INDEX_TS = join(HERE, '..', '..', 'supabase', 'functions', 'source-comparison-run', 'index.ts')

function fakePostgrest(tables) {
  return {
    from(table) {
      let rows = [...(tables[table] ?? [])]
      const state = { range: null }
      const q = {
        select: () => q,
        neq: (column, value) => { rows = rows.filter((row) => row[column] !== value); return q },
        eq: (column, value) => { rows = rows.filter((row) => row[column] === value); return q },
        order: (column, { ascending = true } = {}) => {
          rows = [...rows].sort((a, b) => (String(a[column] ?? '') < String(b[column] ?? '') ? -1 : String(a[column] ?? '') > String(b[column] ?? '') ? 1 : 0) * (ascending ? 1 : -1))
          return q
        },
        range: (from, to) => { state.range = [from, to]; return q },
        then: (resolve) => {
          let result = rows
          if (state.range) result = result.slice(state.range[0], state.range[1] + 1)
          resolve({ data: result.slice(0, 1000), error: null })
        },
      }
      return q
    },
  }
}

const pad = (n) => String(n).padStart(6, '0')
const N_ELIGIBLE = 1300
const N_TIMELINE_ONLY = 400

function buildTables() {
  const events = []
  for (let i = 1; i <= N_ELIGIBLE; i++) events.push({ id: `ev-${pad(i)}`, status: 'candidate', comparison_validation_state: 'approved' })
  for (let i = 1; i <= N_TIMELINE_ONLY; i++) events.push({ id: `tl-${pad(i)}`, status: 'timeline_only' })
  return { events }
}

async function readProjectionEventIds(db) {
  const { data, error } = await pagedSelect(db, 'events', 'id,canonical_title,status,comparison_validation_state', ['id'], 500, (q) => q.neq('status', 'timeline_only').eq('comparison_validation_state', 'approved'))
  assert.equal(error, null)
  return (data ?? []).map((row) => row.id)
}

test('control: the fake PostgREST caps a naive event select at 1000 rows', async () => {
  const db = fakePostgrest(buildTables())
  const { data } = await db.from('events').select('id')
  assert.equal(data.length, 1000)
})

test('V2 projection event read returns every non-timeline event past 1000 rows', async () => {
  const ids = await readProjectionEventIds(fakePostgrest(buildTables()))
  assert.equal(ids.length, N_ELIGIBLE)
  assert.ok(ids.includes(`ev-${pad(1001)}`), 'event at position 1001 missing from projection input')
  assert.ok(ids.includes(`ev-${pad(N_ELIGIBLE)}`), 'final event missing from projection input')
  assert.ok(!ids.some((id) => id.startsWith('tl-')), 'timeline-only event leaked into projection input')
})

test('source structure paginates V2 projection input and never mutates events', () => {
  const src = readFileSync(INDEX_TS, 'utf8')
  assert.match(src, /'id,canonical_title,status,comparison_validation_state'/)
  assert.match(src, /q\.neq\('status', 'timeline_only'\)\.eq\('comparison_validation_state', 'approved'\)/)
  assert.doesNotMatch(src, /from\('events'\)\.insert\(/)
  assert.doesNotMatch(src, /from\('events'\)\.delete\(/)
  assert.doesNotMatch(src, /from\('event_articles'\)\.insert\(/)
  const lib = readFileSync(join(HERE, '..', '..', 'supabase', 'functions', 'source-comparison-run', 'lib.js'), 'utf8')
  assert.match(lib, /export async function pagedSelect\(supabase, table, cols, orderCols, pageSize, filter = \(q\) => q\)/)
})
