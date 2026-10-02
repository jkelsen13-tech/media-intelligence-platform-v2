import { createClient } from '@supabase/supabase-js'
import { createNewsBackend } from '../src/lib/newsBackend.js'

// Synthetic HTTP fixture for the installed SDK. It is never a production seed.
export function newsBackendFixture({ tables = {}, errors = {}, url = 'https://news-backend.example.invalid' } = {}) {
  const calls = []
  let token = 'news-session-one'
  const client = createClient(url, 'fixture-browser-key', {
    accessToken: async () => token,
    realtime: { transport: class { constructor() { throw new Error('unexpected websocket') } } },
    global: { fetch: async (input, init) => {
      const request = new Request(input, init), url = new URL(request.url), params = url.searchParams
      const table = url.pathname.split('/').at(-1)
      calls.push({ table, params, request })
      const headers = { 'content-type': 'application/json' }
      const error = typeof errors[table] === 'function' ? errors[table](params) : errors[table]
      if (error) return new Response(JSON.stringify(error), { status: 403, headers })
      let rows = [...(tables[table] ?? [])]
      for (const [key, value] of params) {
        const valuePart = value.slice(value.indexOf('.') + 1)
        if (value.startsWith('eq.')) rows = rows.filter(row => String(row[key]) === valuePart)
        if (value.startsWith('gt.')) rows = rows.filter(row => String(row[key]) > valuePart)
        if (value.startsWith('gte.')) rows = rows.filter(row => String(row[key]) >= valuePart)
        if (value.startsWith('lte.')) rows = rows.filter(row => String(row[key]) <= valuePart)
        if (value === 'not.is.null') rows = rows.filter(row => row[key] != null)
        if (value.startsWith('in.')) rows = rows.filter(row => valuePart.slice(1, -1).split(',').map(v => v.replace(/^"|"$/g, '')).includes(String(row[key])))
        if (value.startsWith('like.')) rows = rows.filter(row => String(row[key]).endsWith(valuePart.replace(/[%*]/g, '')))
      }
      const count = rows.length
      const fields = params.get('order')?.split(',') ?? []
      rows.sort((a, b) => {
        for (const field of fields) {
          const [key, dir] = field.split('.')
          const result = String(a[key] ?? '').localeCompare(String(b[key] ?? ''))
          if (result) return result * (dir === 'desc' ? -1 : 1)
        }
        return 0
      })
      const offset = Number(params.get('offset') ?? 0)
      rows = rows.slice(offset, offset + Math.min(1000, Number(params.get('limit') ?? 1000)))
      headers['content-range'] = `${offset}-${offset + Math.max(0, rows.length - 1)}/${count}`
      const single = request.headers.get('accept')?.includes('vnd.pgrst.object')
      if (single && rows.length !== 1) return new Response(JSON.stringify({ code: 'PGRST116', details: 'The result contains 0 rows', message: 'No row' }), { status: 406, headers })
      return new Response(request.method === 'HEAD' ? null : JSON.stringify(single ? rows[0] : rows), { headers })
    } },
  })
  return { client, backend: createNewsBackend(client), calls, setToken: value => { token = value } }
}

// An explicit synthetic reviewed-version grant for News DTO tests. Callers must
// supply this row separately from mutable articles; eligibility alone creates none.
export function reviewedNewsArticleFixture(article, { authorName = article.author_name ?? null, admittedClaims = [] } = {}) {
  const suffix = article.id.slice(-12)
  const publicId = `aaaaaaaa-aaaa-4aaa-8aaa-${suffix}`, captureId = `bbbbbbbb-bbbb-4bbb-8bbb-${suffix}`
  const capturedAt = article.fetched_at ?? article.published_at ?? '2026-08-03T12:00:00Z'
  const declarations = admittedClaims.length ? admittedClaims : [{ text: 'Synthetic reviewed fixture claim', excerpt: 'Exact retained words' }]
  const evidence = declarations.map((claim, index) => {
    const excerpt = claim.excerpt ?? 'Exact retained words'
    return { article_claim_id: `cccccccc-cccc-4ccc-8ccc-${String(index + 1).padStart(12, '0')}`,
      claim_id: `dddddddd-dddd-4ddd-8ddd-${String(index + 1).padStart(12, '0')}`, capture_id: captureId, capture_hash: 'a'.repeat(64),
      source_field: 'body_text', span_start: 0, span_end: Array.from(excerpt).length, excerpt, excerpt_hash: 'b'.repeat(64),
      surface_text: claim.text, canonical_text: claim.text }
  })
  const version = { contract: 'mip-reviewed-public-version-v1', article_id: article.id, public_version_id: publicId,
    capture_id: captureId, source_version_id: captureId, capture_hash: 'a'.repeat(64), sequence: '1',
    predecessor_public_version_id: null, correction_reason: null, review_ref: 'explicit-synthetic-source-review', reviewed_by: 'synthetic-reviewer',
    reviewed_at: capturedAt, visible_at: capturedAt, policy_version: 'synthetic-publication-v1', review_state: 'reviewed', visibility_state: 'public',
    admission_kind: 'reviewed_proposition', source_url: article.url, source_outlet: article.outlet,
    title: article.title, summary: article.summary ?? null, published_at: article.published_at ?? null, fetched_at: capturedAt,
    fetched_at_semantics: 'article_original_fetch', captured_at: capturedAt,
    remaining_uncertainty: 'Synthetic qualification only.', pending_revision: false, evidence,
    display_metadata: { feed: article.feed ?? null, monoculture: article.monoculture ?? null, unattributed: article.unattributed ?? null,
      arc_id: article.arc_id ?? null, author_name: authorName },
  }
  return { id: article.id, reader_state: 'eligible', source_status: 'active', published_at: version.published_at, fetched_at: version.fetched_at, public_version_id: publicId,
    public_version: version, title: version.title, summary: version.summary, outlet: version.source_outlet, feed: article.feed ?? null,
    monoculture: article.monoculture ?? null, unattributed: article.unattributed ?? null, arc_id: article.arc_id ?? null }
}
