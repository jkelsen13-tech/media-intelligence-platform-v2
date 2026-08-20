import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { loadPublicAuthorNameMap } from '../src/lib/supabase.js'

function fakePostgrest(rows) {
  const calls = []
  return {
    calls,
    from(table) {
      calls.push({ table })
      return {
        select(columns) {
          calls[calls.length - 1].columns = columns
          return {
            in(column, ids) {
              calls[calls.length - 1].filter = { column, ids }
              return Promise.resolve({ data: rows, error: null })
            },
          }
        },
      }
    },
  }
}

test('News byline lookup reads only the narrow authors_public projection', async () => {
  const db = fakePostgrest([
    { id: 'author-a', name: 'A. Reporter' },
    { id: 'author-b', name: 'B. Correspondent' },
  ])
  const names = await loadPublicAuthorNameMap(['author-a', null, 'author-b', 'author-a'], { supabaseClient: db })

  assert.deepEqual([...names.entries()], [['author-a', 'A. Reporter'], ['author-b', 'B. Correspondent']])
  assert.deepEqual(db.calls, [
    { table: 'authors_public', columns: 'id, name', filter: { column: 'id', ids: ['author-a', 'author-b'] } },
  ])
})

test('News loader does not embed the private authors relation', async () => {
  const source = await readFile(new URL('../src/lib/supabase.js', import.meta.url), 'utf8')
  assert.match(source, /\.from\('authors_public'\)\.select\('id, name'\)/)
  assert.doesNotMatch(source, /authors\(name\)/)
})
