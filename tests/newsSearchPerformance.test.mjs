import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('..', import.meta.url)
const source = await readFile(new URL('./src/lib/supabase.js', root), 'utf8')
const migration = await readFile(new URL('./supabase/migrations/20260820_v2_accelerate_public_news_search.sql', root), 'utf8')

test('News search keeps title, summary, and article-text matching semantics', () => {
  assert.match(
    source,
    /title\.ilike\.\%\$\{term\}\%\s*,summary\.ilike\.\%\$\{term\}\%\s*,body_text\.ilike\.\%\$\{term\}\%/,
  )
})

test('News search migration indexes every public substring-search field without changing access rules', () => {
  assert.match(migration, /create extension if not exists pg_trgm with schema extensions/i)
  for (const field of ['title', 'summary', 'body_text']) {
    assert.match(migration, new RegExp(`articles_${field}_trgm_idx`, 'i'))
    assert.match(migration, new RegExp(`\\(${field} extensions\\.gin_trgm_ops\\)`, 'i'))
  }
  assert.doesNotMatch(migration, /grant\s+|revoke\s+|alter table[^;]*enable row level security/i)
})
