import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('..', import.meta.url)
const source = await readFile(new URL('./src/lib/supabase.js', root), 'utf8')
const migration = await readFile(new URL('./supabase/migrations/20260820_v2_accelerate_public_news_search.sql', root), 'utf8')

const proposal = await readFile(new URL('./supabase/source-proposals/public-reviewed-versions-v1.sql', root), 'utf8')

test('News search delegates to bounded exact public fields and explicitly reviewed source excerpts', () => {
  assert.match(source, /loadArticleSearchIds\(term\)/)
  assert.match(source, /query = query\.in\('id', searchIds\)/)
  const search = proposal.slice(proposal.indexOf('create function public.search_reviewed_public_article_ids_v1'), proposal.indexOf('-- Close the predecessor API path'))
  assert.match(search, /public\.news_reviewed_articles_public/)
  assert.match(search, /coalesce\(a\.title,' '\)|coalesce\(a\.title,''\)/)
  assert.match(search, /coalesce\(a\.summary,''\)/)
  assert.match(search, /public_reviewed_article_evidence e/)
  assert.match(search, /e\.public_version_id=a\.public_version_id/)
  assert.match(search, /lower\(e\.excerpt\)/)
  assert.doesNotMatch(search, /body_text|article_captures|public\.articles/)
})

test('News search migration indexes every public substring-search field without changing access rules', () => {
  assert.match(migration, /create extension if not exists pg_trgm with schema extensions/i)
  for (const field of ['title', 'summary', 'body_text']) {
    assert.match(migration, new RegExp(`articles_${field}_trgm_idx`, 'i'))
    assert.match(migration, new RegExp(`\\(${field} extensions\\.gin_trgm_ops\\)`, 'i'))
  }
  assert.doesNotMatch(migration, /grant\s+|revoke\s+|alter table[^;]*enable row level security/i)
})
