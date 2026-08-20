import assert from 'node:assert/strict'
import test from 'node:test'
import { loadArticleComparisonEvents } from '../src/lib/supabase.js'

function fakePostgrest(events) {
  const calls = []
  return {
    calls,
    from(table) {
      calls.push({ table })
      const call = calls[calls.length - 1]
      const q = {
        select(columns) { call.columns = columns; return q },
        eq(column, value) { call.eq = { column, value }; return q },
        maybeSingle() {
          return Promise.resolve({ data: table === 'articles' ? { url: 'https://publisher.example/match' } : null, error: null })
        },
        order(column) { call.order = column; return q },
        range(from, to) {
          call.range = [from, to]
          return Promise.resolve({ data: events.slice(from, to + 1), error: null })
        },
      }
      return q
    },
  }
}

test('News comparison links use only comparison_public and paginate beyond one projection page', async () => {
  const events = Array.from({ length: 101 }, (_, index) => ({
    event_key: `event-${String(index).padStart(3, '0')}`,
    canonical_title: `Event ${index}`,
    articles: index === 100 ? [{ article_url: 'https://publisher.example/match' }] : [{ article_url: `https://publisher.example/${index}` }],
  }))
  const db = fakePostgrest(events)
  const matches = await loadArticleComparisonEvents('article-1', { supabaseClient: db })

  assert.deepEqual(matches, [{ eventId: 'event-100', title: 'Event 100' }])
  assert.deepEqual(db.calls.map((call) => call.table), ['articles', 'comparison_public', 'comparison_public'])
  assert.deepEqual(db.calls[1].range, [0, 99])
  assert.deepEqual(db.calls[2].range, [100, 199])
})
