import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { createClient } from '@supabase/supabase-js'
import { applyFoundation, PUBLIC_SURFACE_TRANSFER_CHUNKS } from '../scripts/mipConsolidationRestore.mjs'
import { createPipelineRpc, enqueueManifest, runWorker, PIPELINE_TARGET } from '../scripts/evidencePipeline.mjs'
import { candidateFromExactSource, sliceCodePoints } from '../scripts/algorithmEvidenceAdapter.mjs'
import { createPublicDataBackend } from '../src/lib/publicDataBackend.js'

// A source-shaped fictional publisher record. Never a source register or live seed.
const SOURCE = Object.freeze({
  url: 'https://publisher.example.invalid/harbor-report?edition=us&utm_source=fixture#retained',
  title: 'Synthetic harbor authority report: vessel arrival',
  outlet: 'Synthetic Harbor Authority',
  summary: 'A 🚢 arrived in Cleveland. The authority recorded arrival on 2026-09-30.',
  body_text: 'A 🚢 arrived in Cleveland. The authority recorded arrival on 2026-09-30. This is fictional qualification text.',
  published_at: '2026-09-30T10:00:00Z',
})
const canonicalUrl = 'https://publisher.example.invalid/harbor-report?edition=us'
const identifier = value => {
  assert.match(value, /^[a-z_][a-z0-9_]*$/i, 'transport only accepts SQL identifiers')
  return `"${value}"`
}
const digest = bytes => createHash('sha256').update(bytes).digest('hex')

// This is a bounded test transport, not a PostgREST replacement. It executes
// only the SDK requests used by this journey against restored SQL/RLS.
function isolatedTransport(db, executed, requests) {
  let tail = Promise.resolve()
  const transaction = (role, work) => {
    const result = tail.then(async () => {
      await db.exec(`begin; set local role ${identifier(role)}`)
      try {
        const value = await work()
        await db.exec('commit')
        return value
      } catch (error) { await db.exec('rollback'); throw error }
    })
    tail = result.catch(() => {})
    return result
  }
  const query = async (role, sql, params = []) => {
    executed.push({ role, sql, params })
    return db.query(sql, params)
  }
  const forRole = role => async (input, init) => {
    const request = new Request(input, init), url = new URL(request.url)
    requests.push({ role, method: request.method, path: url.pathname, search: url.search, schema: request.headers.get('accept-profile') ?? 'public' })
    const headers = { 'content-type': 'application/json' }
    try {
      return await transaction(role, async () => {
        if (request.method === 'POST') {
          assert.equal(url.pathname, '/rest/v1/rpc/mip_pipeline_v1')
          const body = await request.json()
          const result = await query(role, 'select public.mip_pipeline_v1($1,$2::jsonb) result', [body.p_action, JSON.stringify(body.p_input ?? {})])
          return new Response(JSON.stringify(result.rows[0].result), { headers })
        }
        assert.ok(['GET', 'HEAD'].includes(request.method))
        const table = url.pathname.split('/').at(-1)
        const schema = request.headers.get('accept-profile') ?? 'public'
        const relation = `${identifier(schema)}.${identifier(table)}`
        const columns = (url.searchParams.get('select') ?? '*').split(',').map(x => x.trim())
        const selection = columns.map(x => x === '*' ? '*' : identifier(x)).join(',')
        const params = [], filters = []
        for (const [key, value] of url.searchParams) {
          if (['select', 'order', 'offset', 'limit'].includes(key)) continue
          const field = identifier(key)
          if (value === 'not.is.null') { filters.push(`${field} is not null`); continue }
          if (value.startsWith('in.')) {
            const values = value.slice(4, -1).split(',').map(x => x.replace(/^"|"$/g, ''))
            const placeholders = values.map(x => { params.push(x); return `$${params.length}` })
            filters.push(`${field} in (${placeholders.join(',')})`); continue
          }
          const match = /^(eq|gt|gte|lte)\.(.*)$/s.exec(value)
          assert.ok(match, `unsupported test transport filter ${value}`)
          params.push(match[2]); filters.push(`${field} ${{ eq: '=', gt: '>', gte: '>=', lte: '<=' }[match[1]]} $${params.length}`)
        }
        const where = filters.length ? ` where ${filters.join(' and ')}` : ''
        const total = Number((await query(role, `select count(*)::int n from ${relation}${where}`, params)).rows[0].n)
        const ordering = (url.searchParams.get('order') ?? '').split(',').filter(Boolean).map(x => {
          const [field, direction = 'asc', nulls] = x.split('.')
          assert.ok(['asc', 'desc'].includes(direction))
          assert.ok(!nulls || ['nullsfirst', 'nullslast'].includes(nulls))
          return `${identifier(field)} ${direction}${nulls ? ` nulls ${nulls === 'nullsfirst' ? 'first' : 'last'}` : ''}`
        })
        const offset = Number(url.searchParams.get('offset') ?? 0), limit = Math.min(1000, Number(url.searchParams.get('limit') ?? 1000))
        assert.ok(Number.isInteger(offset) && offset >= 0 && Number.isInteger(limit) && limit >= 1)
        const { rows } = await query(role, `select ${selection} from ${relation}${where}${ordering.length ? ` order by ${ordering.join(',')}` : ''} limit ${limit} offset ${offset}`, params)
        headers['content-range'] = `${offset}-${offset + Math.max(0, rows.length - 1)}/${total}`
        const single = request.headers.get('accept')?.includes('vnd.pgrst.object')
        if (single && rows.length !== 1) return new Response(JSON.stringify({ code: 'PGRST116', message: 'No row', details: `The result contains ${rows.length} rows` }), { status: 406, headers })
        return new Response(request.method === 'HEAD' ? null : JSON.stringify(single ? rows[0] : rows), { headers })
      })
    } catch (error) {
      return new Response(JSON.stringify({ code: error.code ?? 'fixture_transport_error', message: error.message }), { status: error.code === '42501' ? 403 : 400, headers })
    }
  }
  return { forRole, transaction, query }
}

export async function runCanonicalIntakeReaderJourney({ receiptPath } = {}) {
  const db = await PGlite.create(), checks = [], executed = [], requests = []
  const check = async (name, work) => { const detail = await work(); checks.push({ name, status: 'PASS', detail: detail ?? null }) }
  try {
    await applyFoundation(db)
    const transport = isolatedTransport(db, executed, requests)
    const admin = async (sql, params = []) => transport.transaction('postgres', () => transport.query('postgres', sql, params))
    const scalar = async (sql, params = []) => Object.values((await admin(sql, params)).rows[0])[0]
    const rpc = createPipelineRpc({ url: PIPELINE_TARGET, key: 'isolated-fixture-service-key', fetchImpl: transport.forRole('service_role') })
    const clients = Object.fromEntries(['anon', 'authenticated'].map(role => [role, createClient('https://intake-reader.example.invalid', 'sb_publishable_fixture', {
      accessToken: async () => `fixture-${role}`, global: { fetch: transport.forRole(role) }, realtime: { transport: class { constructor() { throw new Error('no fixture websocket') } } },
    })]))
    const readers = Object.fromEntries(Object.entries(clients).map(([role, client]) => [role, createPublicDataBackend(client)]))
    const forReaders = async work => { for (const [role, backend] of Object.entries(readers)) await work(backend, role) }
    let firstJob, firstFinish, firstCapture, event, counterpart, publicClaim, originalPublicDetail

    await check('dry-run and malformed manifests produce no durable intake', async () => {
      assert.equal((await enqueueManifest(rpc, { run_id: 'dry', articles: [SOURCE] })).validated, 1)
      for (const manifest of [{ run_id: 'bad', articles: [] }, { run_id: 'bad', articles: Array(101).fill(SOURCE) }, { run_id: 'bad', articles: [{ ...SOURCE, reader_state: 'eligible' }] }]) await assert.rejects(enqueueManifest(rpc, manifest, { apply: true }))
      for (const maxJobs of [0, 101, 1.5]) await assert.rejects(runWorker(rpc, { maxJobs }))
      assert.equal(await scalar('select count(*)::int from evidence_pipeline.import_jobs'), 0)
    })
    await check('adapter delivery deduplicates native identity while retaining each run receipt', async () => {
      const initial = await enqueueManifest(rpc, { run_id: 'source-v1', articles: [SOURCE] }, { apply: true })
      const replay = await enqueueManifest(rpc, { run_id: 'source-v1-replay', articles: [{ ...SOURCE, url: canonicalUrl }] }, { apply: true })
      firstJob = initial.job_ids[0]
      assert.equal(replay.job_ids[0], firstJob)
      assert.equal((await enqueueManifest(rpc, { run_id: 'source-v1-replay', articles: [{ ...SOURCE, url: canonicalUrl }] }, { apply: true })).job_ids[0], firstJob)
      assert.equal(await scalar('select count(*)::int from evidence_pipeline.import_jobs'), 1)
      assert.equal(await scalar('select count(*)::int from evidence_pipeline.import_receipts'), 2)
      assert.deepEqual(await rpc('status', { run_id: 'source-v1' }), [{ state: 'pending', jobs: 1 }])
      await forReaders(async backend => { assert.equal((await backend.news.loadArticles()).total, 0); assert.equal((await backend.loadCorpusMeta()).count, 0) })
      return { job_id: firstJob, durable_state: 'pending', visible_articles: 0, dispatch_is_ingestion: false }
    })
    await check('actual worker commits exact native pending capture without reader publication', async () => {
      const result = await runWorker(rpc, { maxJobs: 1 })
      assert.equal(result.completed.length, 1); assert.equal(result.failed.length, 0)
      firstFinish = result.completed[0]
      assert.equal(firstFinish.job_id, firstJob); assert.equal(firstFinish.outcome, 'inserted')
      firstCapture = (await admin('select *,encode(sha256(convert_to(payload::text,\'UTF8\')),\'hex\') computed_hash from evidence_pipeline.article_captures where id=$1', [firstFinish.capture_id])).rows[0]
      assert.equal(firstCapture.content_hash, firstCapture.computed_hash)
      const completedReplay = await enqueueManifest(rpc, { run_id: 'source-v1-after-completion', articles: [{ ...SOURCE, url: canonicalUrl }] }, { apply: true })
      assert.equal(completedReplay.job_ids[0], firstJob)
      assert.equal((await runWorker(rpc, { maxJobs: 1 })).completed.length, 0)
      assert.equal(await scalar('select count(*)::int from evidence_pipeline.article_captures'), 1)
      assert.equal(firstCapture.review_state, 'pending'); assert.equal(firstCapture.payload.url, canonicalUrl)
      assert.equal(firstCapture.payload.summary, SOURCE.summary)
      assert.equal(await scalar('select reader_state from articles where id=$1', [firstFinish.article_id]), 'pending_review')
      await forReaders(async (backend, role) => {
        assert.equal((await backend.news.loadArticleDetail(firstFinish.article_id)).articleMissing, true)
        assert.equal((await backend.news.loadArticles()).total, 0)
        const denied = await clients[role].schema('evidence_pipeline').from('article_captures').select('id')
        assert.equal(denied.error?.code, '42501'); assert.equal(denied.data, null)
        const rpcDenied = await clients[role].rpc('mip_pipeline_v1', { p_action: 'claim', p_input: {} })
        assert.equal(rpcDenied.error?.code, '42501'); assert.equal(rpcDenied.data, null)
      })
      return { ...firstFinish, content_hash: firstCapture.content_hash, captured_at: firstCapture.captured_at, publisher_time: firstCapture.payload.published_at, capture_review: 'pending', reader_state: 'pending_review' }
    })
    await check('exact-source adapter creates private candidate without canonical facts', async () => {
      event = await scalar("insert into nodes(type,label,slug) values('event','Explicit synthetic review anchor','fixture-review-anchor') returning id")
      const candidate = candidateFromExactSource({ capture_id: firstCapture.id, candidate_key: 'source-v1-arrival', candidate_kind: 'claim', statement: 'The retained fictional authority says a vessel arrived.', source_field: 'summary', source_text: firstCapture.payload.summary, excerpt: 'A 🚢 arrived in Cleveland.', event_node_id: event, remaining_uncertainty: 'Synthetic source statement only; pending review, no independent corroboration.' })
      assert.equal(sliceCodePoints(firstCapture.payload.summary, candidate.span_start, candidate.span_end), candidate.excerpt)
      const id = await rpc('candidate', candidate)
      assert.equal(await rpc('candidate', candidate), id)
      const evidence = await rpc('evidence', { event_node_id: event })
      assert.equal(evidence.length, 1); assert.equal(evidence[0].review_state, 'pending'); assert.equal(evidence[0].content_hash, firstCapture.content_hash)
      await assert.rejects(rpc('candidate', { ...candidate, candidate_key: 'invented', excerpt: 'Invented text' }))
      await assert.rejects(rpc('candidate', { ...candidate, candidate_key: 'bad-span', span_end: 999 }))
      await assert.rejects(rpc('candidate', { ...candidate, review_state: 'published' }))
      assert.equal(await scalar('select count(*)::int from claims'), 0)
      await forReaders(async backend => assert.equal((await backend.news.loadArticles()).total, 0))
      return { candidate_id: id, capture_id: candidate.capture_id, state: 'pending', span: [candidate.span_start, candidate.span_end], canonical_claim_created: false }
    })
    await check('explicit synthetic fixture eligibility exposes source identity but no raw extraction claims', async () => {
      // Fixture administrator, not an automatic policy or proposed live approval.
      await admin("update articles set reader_state='eligible',claims=$2::jsonb where id=$1", [firstFinish.article_id, JSON.stringify([{ kind: 'substantive', text: 'UNADMITTED_RAW_EXTRACTION' }])])
      await forReaders(async backend => {
        const page = await backend.news.loadArticles(), detail = await backend.news.loadArticleDetail(firstFinish.article_id)
        assert.equal(page.total, 1); assert.equal(page.articles[0].id, firstFinish.article_id)
        assert.equal(detail.url, canonicalUrl); assert.equal(detail.summary, SOURCE.summary); assert.deepEqual(detail.claims, [])
        assert.doesNotMatch(JSON.stringify(detail), /UNADMITTED_RAW_EXTRACTION/)
      })
      return { fixture_admin_review: true, article_id: firstFinish.article_id, reader_state: 'eligible', claims: 0 }
    })
    await check('retention clocks remain distinct from publication and absent public revision fields remain explicit gaps', async () => {
      const article = (await admin('select published_at,fetched_at from articles where id=$1', [firstFinish.article_id])).rows[0]
      assert.equal(new Date(article.published_at).getTime(), new Date(SOURCE.published_at).getTime())
      assert.ok(new Date(firstCapture.captured_at).getTime() >= new Date(article.fetched_at).getTime())
      await forReaders(async backend => {
        const detail = await backend.news.loadArticleDetail(firstFinish.article_id)
        assert.equal(new Date(detail.published_at).getTime(), new Date(SOURCE.published_at).getTime())
        assert.equal(detail.capture_id, undefined)
        assert.equal(detail.breaking, undefined)
        assert.equal(detail.material_change_at, undefined)
      })
      return { source_publication_time: article.published_at, first_observed_time: article.fetched_at, capture_retained_time: firstCapture.captured_at, inferred_event_time: null, inferred_breaking_status: null, open_reader_contract_fields: ['capture/revision identity', 'per-article observed/fetched clock', 'projection version', 'material-change/update envelope'] }
    })
    await check('actual reviewed projection admits exact claim while pending surfaces remain private', async () => {
      const second = { ...SOURCE, url: 'https://second.example.invalid/harbor-report', outlet: 'Synthetic Secondary Publisher' }
      await enqueueManifest(rpc, { run_id: 'second-source', articles: [second] }, { apply: true })
      counterpart = (await runWorker(rpc, { maxJobs: 1 })).completed[0]
      await admin("update articles set reader_state='eligible' where id=$1", [counterpart.article_id])
      const comparisonEvent = await scalar("insert into events(canonical_title,status,comparison_validation_state) values('Explicitly reviewed synthetic comparison','active','approved') returning id")
      await admin("insert into event_articles(event_id,article_id,membership_method) values($1,$2,'synthetic_admin_review'),($1,$3,'synthetic_admin_review')", [comparisonEvent, firstFinish.article_id, counterpart.article_id])
      publicClaim = await scalar("insert into claims(event_id,canonical_text,rule_version) values($1,'Synthetic authority recorded vessel arrival','sc-v2-event-projection') returning id", [comparisonEvent])
      await admin("insert into article_claims(claim_id,article_id,surface_text,auditability_state,evidence_source_field,evidence_excerpt) values($1,$2,$3,'verified_retained_source','summary',$3),($1,$4,'UNVERIFIED_SURFACE','unverified_against_retained_source','summary','UNVERIFIED_SURFACE')", [publicClaim, firstFinish.article_id, 'A 🚢 arrived in Cleveland.', counterpart.article_id])
      await admin('insert into claim_evidence_links(claim_id,evidence_url,linked_from_article_id) values($1,$2,$3)', [publicClaim, canonicalUrl, firstFinish.article_id])
      await forReaders(async backend => {
        const detail = await backend.news.loadArticleDetail(firstFinish.article_id)
        assert.deepEqual(detail.claims.map(c => c.text), ['A 🚢 arrived in Cleveland.'])
        assert.equal(detail.claims[0].auditability_state, 'verified_retained_source')
        assert.equal(detail.claims[0].evidence_excerpt, 'A 🚢 arrived in Cleveland.')
        assert.equal(detail.evidenceRecords[0].evidence_url, canonicalUrl)
        assert.deepEqual((await backend.news.loadArticleDetail(counterpart.article_id)).claims, [])
        assert.doesNotMatch(JSON.stringify(await backend.loadSourceComparisonView()), /UNVERIFIED_SURFACE|UNADMITTED_RAW_EXTRACTION/)
      })
      originalPublicDetail = await readers.anon.news.loadArticleDetail(firstFinish.article_id)
      return { fixture_admin_review: true, article_id: firstFinish.article_id, admitted_claim_id: publicClaim, source_capture_id: firstCapture.id, public_excerpt: 'A 🚢 arrived in Cleveland.' }
    })
    await check('source correction is a separate pending capture with no inherited eligibility or overwrite', async () => {
      const corrected = { ...SOURCE, url: canonicalUrl, title: 'Synthetic corrected arrival report', summary: 'The 🚢 arrival was corrected to 2026-10-01.' }
      await enqueueManifest(rpc, { run_id: 'source-v2-correction', articles: [corrected] }, { apply: true })
      const revision = (await runWorker(rpc, { maxJobs: 1 })).completed[0]
      assert.equal(revision.outcome, 'revision_pending'); assert.equal(revision.article_id, firstFinish.article_id); assert.notEqual(revision.capture_id, firstCapture.id)
      const captures = (await admin('select * from evidence_pipeline.article_captures where article_id=$1 order by captured_at,id', [firstFinish.article_id])).rows
      assert.equal(captures.length, 2); assert.equal(captures[0].content_hash, firstCapture.content_hash); assert.equal(captures[0].payload.summary, SOURCE.summary)
      assert.equal(captures[1].review_state, 'pending'); assert.equal(captures[1].payload.summary, corrected.summary); assert.notEqual(captures[1].content_hash, firstCapture.content_hash)
      await forReaders(async backend => { const detail = await backend.news.loadArticleDetail(firstFinish.article_id); assert.equal(detail.summary, originalPublicDetail.summary); assert.equal(detail.title, SOURCE.title) })
      return { article_id: revision.article_id, previous_version: { capture_id: firstCapture.id, content_hash: firstCapture.content_hash, captured_at: firstCapture.captured_at }, new_version: { capture_id: revision.capture_id, content_hash: captures[1].content_hash, captured_at: captures[1].captured_at }, new_state: 'pending', outcome: revision.outcome, reader_remains_previous_approved_version: true, reader_update_envelope_available: false }
    })
    await check('withdrawal removes article, nested source claims and comparison visibility without deleting captures', async () => {
      await admin("update articles set source_status='withdrawn' where id=$1", [firstFinish.article_id])
      await forReaders(async backend => {
        assert.equal((await backend.news.loadArticleDetail(firstFinish.article_id)).articleMissing, true)
        assert.equal((await backend.news.loadArticles()).total, 1)
        assert.equal(await backend.resolveEligibleArticleForNews({ url: canonicalUrl }), null)
        assert.deepEqual((await backend.loadSourceComparisonView()).events, [])
      })
      assert.equal(await scalar('select count(*)::int from evidence_pipeline.article_captures where article_id=$1', [firstFinish.article_id]), 2)
      const history = await rpc('history', { record_kind: 'article', record_key: firstFinish.article_id })
      assert.ok(history.some(h => h.payload.reader_state === 'pending_review'))
      assert.ok(history.some(h => h.payload.reader_state === 'eligible' && h.payload.source_status === 'active'))
      assert.equal(history.at(-1).payload.source_status, 'withdrawn')
      return { preserved_captures: 2, article_history_ordinals: history.map(h => h.ordinal), current_source_status: 'withdrawn', comparison_events: 0 }
    })
    await check('bounded partial worker and delayed retry receipts never claim complete ingestion', async () => {
      const pending = [1, 2].map(n => ({ ...SOURCE, url: `https://pending.example.invalid/report-${n}`, title: `Synthetic pending ${n}` }))
      const submitted = await enqueueManifest(rpc, { run_id: 'partial', articles: pending }, { apply: true })
      assert.equal(submitted.received, 2)
      const partial = await runWorker(rpc, { maxJobs: 1 })
      assert.equal(partial.completed.length, 1)
      assert.deepEqual(await rpc('status', { run_id: 'partial' }), [{ state: 'completed', jobs: 1 }, { state: 'pending', jobs: 1 }])
      const delayed = await runWorker(async (action, input) => { if (action === 'finish') throw Object.assign(new Error('Synthetic transient failure before SQL finish'), { code: 'http_503' }); return rpc(action, input) }, { maxJobs: 1 })
      assert.equal(delayed.failed[0].state, 'retry_wait'); assert.equal(delayed.completed.length, 0)
      const noReady = await runWorker(rpc, { maxJobs: 1 }); assert.equal(noReady.completed.length, 0)
      await forReaders(async backend => assert.equal((await backend.news.loadArticles()).total, 1))
      return { run_id: 'partial', completed: partial.completed.length, delayed: delayed.failed, ready_now: 0, public_articles_unchanged: true }
    })
    await check('lost committed response is indeterminate until native status is reconciled', async () => {
      await enqueueManifest(rpc, { run_id: 'lost-response', articles: [{ ...SOURCE, url: 'https://lost.example.invalid/report' }] }, { apply: true })
      const result = await runWorker(async (action, input) => {
        const committed = await rpc(action, input)
        if (action === 'finish') throw Object.assign(new Error('Synthetic committed response loss'), { code: 'network_error' })
        return committed
      }, { maxJobs: 1 })
      assert.equal(result.completed.length, 0); assert.equal(result.indeterminate.length, 1)
      const durable = await rpc('status', { run_id: 'lost-response' })
      assert.deepEqual(durable, [{ state: 'completed', jobs: 1 }])
      await forReaders(async backend => assert.equal((await backend.news.loadArticles()).total, 1))
      return { worker_report: result, reconciled_native_status: durable, compensation_writes: 0 }
    })
    const artifacts = []
    const migrationFiles = ['20260905082406_evidence_pipeline_reliability.sql', '20260905151626_mip_consolidation_delta.sql', '20260905160001_event_scoped_public_article_counts.sql', ...PUBLIC_SURFACE_TRANSFER_CHUNKS, '20260905180142_mip_public_surface_publication_gates.sql', '20260905181254_mip_public_surface_authenticated_review_revoke.sql', '20260905182355_mip_nested_claim_publication_gates.sql', '20260905203600_mip_legacy_graph_private_staging.sql', '20260909153133_comparison_explanation_event_binding.sql']
    for (const path of ['scripts/evidencePipeline.mjs', 'scripts/algorithmEvidenceAdapter.mjs', 'scripts/mipConsolidationRestore.mjs', 'src/lib/publicDataBackend.js', 'src/lib/newsBackend.js', 'src/lib/supabase.js', 'src/lib/supabaseOrigin.js', ...migrationFiles.map(name => 'supabase/migrations/' + name)]) {
      const bytes = await readFile(new URL('../' + path, import.meta.url)); artifacts.push({ path, bytes: bytes.length, sha256: digest(bytes) })
    }
    const receipt = { qualification: 'canonical-intake-reader-isolated', status: 'PASS', synthetic_fixture: true, live_operations: 0, external_network_requests: 0, intercepted_http_requests: requests.length, foundation: 'existing restored SQL/RLS and real adapters; no new publication policy', checks, source: SOURCE, artifacts, requests, executed_sql: executed,
      limits: ['Synthetic administrator eligibility/admission setup is not production review or live authority.', 'Mock HTTP exercises installed SDK and native SQL/RLS but not deployed PostgREST, TLS, collector acquisition, rights or production concurrency.', 'A pending publisher correction remains separate; current public DTOs do not include capture/version digest or material-change/update envelope, and this qualification does not add that contract.', 'Independent projection reads are not an atomic shared snapshot.', 'No persistent story/coverage-group or accelerated source-only visibility policy is introduced.'] }
    if (receiptPath) { await mkdir(dirname(receiptPath), { recursive: true }); await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n') }
    return receipt
  } finally { await db.close() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [flag, path] = process.argv.slice(2)
  if (flag !== '--receipt' || !path) throw new Error('Usage: node verifier/runCanonicalIntakeReaderJourney.mjs --receipt /path/to/receipt.json')
  runCanonicalIntakeReaderJourney({ receiptPath: path }).then(result => console.log(JSON.stringify({ status: result.status, checks: result.checks.length, receipt: path, live_operations: 0 }))).catch(error => { console.error(error); process.exitCode = 1 })
}
