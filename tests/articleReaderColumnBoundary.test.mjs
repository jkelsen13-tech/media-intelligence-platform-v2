import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runArticleReaderColumnBoundary, ARTICLE_READER_COLUMNS } from '../verifier/runArticleReaderColumnBoundary.mjs'

test('source-only explicit article column grants deny raw extraction at the SQL boundary while retaining reader projections', async () => {
  const receipt = await runArticleReaderColumnBoundary()
  assert.equal(receipt.status, 'PASS')
  assert.equal(receipt.checks.length, 11)
  assert.ok(receipt.checks.every(check => check.status === 'PASS'))
  assert.equal(receipt.live_operations, 0)
  assert.equal(receipt.source_only_not_applied, true)
  assert.equal(receipt.checks[0].detail.synthetic_raw_column_read, true)
  assert.equal(receipt.checks[0].detail.frontend_dto_private, true)
  assert.equal(receipt.checks[0].detail.live_row_read, false)
  assert.ok(!ARTICLE_READER_COLUMNS.includes('claims'))
  assert.ok(ARTICLE_READER_COLUMNS.includes('body_text'))
  assert.ok(ARTICLE_READER_COLUMNS.includes('fetched_at'))
  assert.deepEqual(receipt.baseline_catalog.governed_views, receipt.final_catalog.governed_views)
  assert.deepEqual(receipt.baseline_catalog.policies, receipt.final_catalog.policies)
  assert.deepEqual(receipt.baseline_catalog.triggers, receipt.final_catalog.triggers)
  for (const role of ['anon', 'authenticated']) {
    assert.ok(receipt.executed_sql.some(query => query.role === role && query.sql.includes('select "claims"')))
    assert.ok(receipt.requests.some(request => request.role === role && request.path.endsWith('/news_detail_public')))
    assert.ok(receipt.requests.some(request => request.role === role && request.path.endsWith('/comparison_public')))
    assert.ok(receipt.executed_sql.some(query => query.role === role && query.sql.includes('"body_text" ilike')))
  }
  assert.ok(receipt.artifacts.every(file => /^[0-9a-f]{64}$/.test(file.sha256)))
})

test('deploy/rollback catalog query bytes match the standalone read-only capture', async () => {
  const files = await Promise.all(['sql','rollback.sql','catalog.sql'].map(suffix => readFile(new URL(`../supabase/source-proposals/article_reader_column_privileges_v1.${suffix}`, import.meta.url), 'utf8')))
  const query = source => source.split('-- BEGIN BASELINE QUERY\n')[1].split('  -- END BASELINE QUERY')[0].replace(' into actual','')
  assert.equal(query(files[0]), query(files[1]))
  assert.ok(files[2].includes(query(files[0])))
  assert.match(files[2], /begin read only;/)
  assert.doesNotMatch(files[2], /from public\.articles|grant |revoke /i)
})
