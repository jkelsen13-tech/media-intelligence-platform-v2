import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Exercise the committed loader without initializing a browser/backend client.
const source = readFileSync(new URL('../src/lib/supabase.js', import.meta.url), 'utf8')
const begin = source.indexOf('export async function loadArticles(')
const end = source.indexOf('\n// Full detail', begin)
assert.ok(begin >= 0 && end > begin)
const loadArticles = new Function('supabase', 'applyNewsArticleFilters',
  'loadPublicAuthorNameMap', 'eligibleNewsEnvelope', 'isPostgrestPermissionDenied',
  'emptyArticlesUnavailable', source.slice(begin, end).replace('export ', '') + '; return loadArticles')(
    null, q => q.eq('reader_state', 'eligible'), async () => new Map(),
    row => ({ sourceRecord: { articleId: row.id } }),
    error => error.code === '42501', () => ({ articles: [], total: 0, articlesUnavailable: 'permission_denied' }),
)

function clientFor(rows, { denied = false } = {}) {
  let request = 0
  const calls = []
  return { calls, from(table) {
    assert.equal(table, 'articles')
    const orders = []
    let bounds
    let eligibility
    return {
      select() { return this },
      order(column, options) { orders.push({ column, ...options }); return this },
      range(first, last) { bounds = [first, last]; return this },
      eq(column, value) { eligibility = [column, value]; return this },
      then(resolve, reject) {
        calls.push({ orders, eligibility, bounds })
        if (denied) return Promise.resolve({ error: { code: '42501' } }).then(resolve, reject)
        // PostgreSQL may emit either physical ordering for ties. Alternate the
        // input ordering between pages to expose an incomplete ORDER BY.
        const input = (++request % 2 ? [...rows] : [...rows].reverse())
        input.sort((left, right) => {
          for (const { column, ascending } of orders) {
            if (left[column] === right[column]) continue
            const difference = left[column] < right[column] ? -1 : 1
            return ascending ? difference : -difference
          }
          return 0
        })
        return Promise.resolve({
          data: input.slice(bounds[0], bounds[1] + 1), count: rows.length, error: null,
        }).then(resolve, reject)
      },
    }
  } }
}

const batch = ['a', 'b', 'c', 'd'].map(id => ({
  id, url: 'https://synthetic.invalid/' + id, title: 'Synthetic ' + id,
  published_at: '2026-01-01T00:00:00Z', fetched_at: '2026-01-02T00:00:00Z',
}))

test('native intake rows sharing both clocks traverse News pages exactly once', async () => {
  const client = clientFor(batch)
  const first = await loadArticles({ supabaseClient: client, limit: 2, offset: 0 })
  const second = await loadArticles({ supabaseClient: client, limit: 2, offset: 2 })
  assert.deepEqual([...first.articles, ...second.articles].map(row => row.id), ['a', 'b', 'c', 'd'])
  assert.equal(first.total, 4)
  assert.ok(client.calls.every(call => call.eligibility.join(':') === 'reader_state:eligible'))
})

test('null publication times still have a stable batch tie-breaker', async () => {
  const client = clientFor(batch.map(row => ({ ...row, published_at: null })))
  const pages = await Promise.all([0, 2].map(offset => loadArticles({ supabaseClient: client, limit: 2, offset })))
  assert.deepEqual(pages.flatMap(page => page.articles.map(row => row.id)), ['a', 'b', 'c', 'd'])
})

test('publication and fetched order remain ahead of ID', async () => {
  const client = clientFor([
    { ...batch[0], id: 'a', published_at: '2025-01-01T00:00:00Z' },
    { ...batch[1], id: 'b', fetched_at: '2026-01-03T00:00:00Z' },
    { ...batch[2], id: 'c' },
  ])
  const page = await loadArticles({ supabaseClient: client })
  assert.deepEqual(page.articles.map(row => row.id), ['b', 'c', 'a'])
  assert.deepEqual(client.calls[0].orders.map(order => order.column), ['published_at', 'fetched_at', 'id'])
})

test('reader denial stays closed and source navigation stays canonical', async () => {
  const denied = await loadArticles({ supabaseClient: clientFor(batch, { denied: true }) })
  assert.equal(denied.articlesUnavailable, 'permission_denied')
  assert.deepEqual(denied.articles, [])
  const page = await loadArticles({ supabaseClient: clientFor(batch), limit: 1 })
  assert.equal(page.articles[0].readerEnvelope.sourceRecord.articleId, page.articles[0].id)
})
