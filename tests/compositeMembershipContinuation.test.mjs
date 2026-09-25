import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Load the exact shared helper and News caller without a browser connection.
const source = readFileSync(new URL('../src/lib/supabase.js', import.meta.url), 'utf8')
const start = source.indexOf('export async function keysetAllComposite(')
const end = source.indexOf('// keysetAll pages', start)
assert.ok(start >= 0 && end > start)
const keysetAllComposite = new Function(
  source.slice(start, end).replace('export ', '') + '; return keysetAllComposite',
)()
const groupingStart = source.indexOf('export async function loadEventGrouping(')
const groupingEnd = source.indexOf('// Track B Step 4 (source attribution', groupingStart)
const loadEventGrouping = new Function('supabase', 'keysetAllComposite', 'keysetAll',
  source.slice(groupingStart, groupingEnd).replace('export ', '') + '; return loadEventGrouping')(
    null, keysetAllComposite, async (client, table) => ({ data: client.tables[table], error: null }),
)

function clientFor(tables, { failAt = null, repeat = false } = {}) {
  const calls = []
  return { tables, calls, from(table) {
    let rows = [...(tables[table] ?? [])]
    const orders = []
    const filters = []
    let size = 1000
    const q = {
      select() { return q },
      order(column) { orders.push(column); return q },
      eq(column, value) { filters.push([column, 'eq', value]); if (!repeat) rows = rows.filter(row => row[column] === value); return q },
      gt(column, value) { filters.push([column, 'gt', value]); if (!repeat) rows = rows.filter(row => row[column] > value); return q },
      gte(column, value) { filters.push([column, 'gte', value]); rows = rows.filter(row => row[column] >= value); return q },
      limit(value) { size = Math.min(value, 1000); return q },
      then(resolve, reject) {
        calls.push({ table, filters })
        // A finite harness catches the old endless repeated-page behavior.
        if (calls.length > 12 || calls.length === failAt) {
          return Promise.resolve({ data: null, error: { code: calls.length > 12 ? 'test_request_budget' : '42501' } }).then(resolve, reject)
        }
        rows.sort((left, right) => {
          for (const column of orders) {
            if (left[column] !== right[column]) return left[column] < right[column] ? -1 : 1
          }
          return 0
        })
        return Promise.resolve({ data: rows.slice(0, size), error: null }).then(resolve, reject)
      },
    }
    return q
  } }
}

const pad = n => String(n).padStart(6, '0')
const group = (event, count) => Array.from({ length: count }, (_, n) => ({
  event_id: event, article_id: event + '-' + pad(n + 1), eligible: true,
}))
const options = { keyCols: ['event_id', 'article_id'] }
const read = client => keysetAllComposite(client, 'event_articles', 'event_id, article_id', options)

test('one exact full membership page terminates after its leading group', async () => {
  const rows = group('a', 1000)
  const client = clientFor({ event_articles: rows })
  const result = await read(client)
  assert.equal(result.error, null)
  assert.deepEqual(result.data, rows)
  assert.ok(client.calls.length <= 3)
})

test('a leading membership group spanning multiple pages is complete exactly once', async () => {
  const rows = [...group('a', 2100), ...group('b', 1), ...group('c', 1000)]
  const client = clientFor({ event_articles: rows })
  const result = await read(client)
  assert.equal(result.error, null)
  assert.deepEqual(result.data, rows)
  assert.equal(new Set(result.data.map(row => row.article_id)).size, rows.length)
  assert.ok(client.calls.length <= 7)
})

test('News grouping resolves a member beyond 1000 and advances to the next event', async () => {
  const rows = [...group('a', 1005), ...group('b', 1)]
  const client = clientFor({ event_articles: rows, events: [
    { id: 'a', canonical_title: 'Synthetic first event' },
    { id: 'b', canonical_title: 'Synthetic next event' },
  ] })
  const result = await loadEventGrouping({ supabaseClient: client })
  assert.equal(result.size, 1006)
  assert.deepEqual(result.get('a-001005'), { eventId: 'a', title: 'Synthetic first event' })
  assert.deepEqual(result.get('b-000001'), { eventId: 'b', title: 'Synthetic next event' })
})

test('filters survive both cursor branches and errors discard partial results', async () => {
  const rows = [...group('a', 1001), ...group('b', 2), { event_id: 'a', article_id: 'hidden', eligible: false }]
  const client = clientFor({ event_articles: rows })
  const result = await keysetAllComposite(client, 'event_articles', 'event_id, article_id',
    { ...options, filter: q => q.eq('eligible', true) })
  assert.equal(result.error, null)
  assert.equal(result.data.length, 1003)
  assert.ok(client.calls.every(call => call.filters.some(([column, op, value]) => column === 'eligible' && op === 'eq' && value === true)))
  const denied = await read(clientFor({ event_articles: rows }, { failAt: 2 }))
  assert.deepEqual(denied, { data: null, error: { code: '42501' } })
})

test('small groups and empty tables retain the existing result contract', async () => {
  assert.deepEqual(await read(clientFor({ event_articles: [] })), { data: [], error: null })
  const rows = Array.from({ length: 1300 }, (_, n) => group(pad(n), 1)[0])
  const result = await read(clientFor({ event_articles: rows }))
  assert.equal(result.error, null)
  assert.deepEqual(result.data, rows)
})

test('a nonadvancing server response fails instead of looping forever', async () => {
  await assert.rejects(read(clientFor({ event_articles: group('a', 1000) }, { repeat: true })),
    /Composite pagination cursor did not advance/)
})

test('node-topic caller keys also traverse a leading group larger than one page', async () => {
  const rows = Array.from({ length: 1001 }, (_, n) => ({ node_id: 'node-a', topic_id: pad(n) }))
  rows.push({ node_id: 'node-b', topic_id: 'last-topic' })
  const result = await keysetAllComposite(clientFor({ node_topics: rows }), 'node_topics',
    'node_id, topic_id', { keyCols: ['node_id', 'topic_id'] })
  assert.equal(result.error, null)
  assert.deepEqual(result.data, rows)
})
