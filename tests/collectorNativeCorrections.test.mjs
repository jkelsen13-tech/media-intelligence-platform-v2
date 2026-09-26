import test from 'node:test'
import assert from 'node:assert/strict'
import {runQikIngestCollector} from '../supabase/qualification/qik-ingest/collector.mjs'
import {countHandoffOutcomes} from '../supabase/qualification/qik-ingest/nativeHandoff.mjs'
import {createDisposableDb, loadNativeSubstrate, installQikIngest} from './qikIngestTestKit.mjs'

test('installer refuses pre-existing reserved policies and triggers before mutation', async t => {
  for (const kind of ['replacement_policy', 'unrelated_policy', 'unrelated_trigger']) {
    await t.test(kind, async () => {
      const {db, exec} = await createDisposableDb()
      t.after(() => db.close())
      await loadNativeSubstrate(exec)
      if (kind === 'replacement_policy') {
        await db.exec('create policy qik_ingest_fn_select_articles on public.articles using (false)')
      } else {
        await db.exec('create schema unrelated; create table unrelated.kept(id int)')
        if (kind === 'unrelated_policy') {
          await db.exec('create policy qik_ingest_keep on unrelated.kept using (false)')
        } else {
          await db.exec(`create function unrelated.keep() returns trigger language plpgsql as $$
            begin return new; end $$;
            create trigger qik_ingest_keep before insert on unrelated.kept
              for each row execute function unrelated.keep();`)
        }
      }
      const policies = async () => (await db.query(`select polname,polrelid,polqual::text
        from pg_policy order by polrelid,polname`)).rows
      const triggers = async () => (await db.query(`select tgname,tgrelid,tgfoid
        from pg_trigger where not tgisinternal order by tgrelid,tgname`)).rows
      const beforePolicies = await policies(), beforeTriggers = await triggers()
      await assert.rejects(installQikIngest(exec), /qik_ingest_preexisting_policy|qik_ingest_preexisting_trigger/)
      assert.deepEqual(await policies(), beforePolicies)
      assert.deepEqual(await triggers(), beforeTriggers)
      const namespaces = (await db.query(`select count(*)::int n from pg_namespace
        where nspname in ('qik_ingest','qik_ingest_operation')`)).rows[0].n
      assert.equal(namespaces, 0)
      assert.equal((await db.query(`select count(*)::int n from pg_roles
        where rolname in ('qik_ingest_fn_owner','qik_ingest_runtime')`)).rows[0].n, 0)
    })
  }
})

function harness({urls = ['a', 'b'], enqueueFailure = false, finishFailure = null, drainMaxJobs = 32} = {}) {
  const jobs = new Map(), sourceReports = []
  let finishCount = 0, enqueues = 0
  const rpc = async (op, input) => {
    if (op === 'plan') return {collection_authorized: true, sources: [{id: 'source', feed_url: 'https://example.org/rss'}],
      config: {max_new_per_run: 8, max_items_per_feed: 4}}
    if (op === 'begin_run') return {}
    if (op === 'retain_item') return {disposition: 'observed', article: input.item}
    if (op === 'record_source_run') {sourceReports.push(input); return {}}
    if (op === 'finish_run') return {freshness: 'qik_forward_stale'}
    throw Error('unexpected collector operation')
  }
  const pipelineRpc = async (op, input) => {
    if (op === 'enqueue') {
      if (enqueueFailure && ++enqueues === 2) throw Error('later_enqueue_failed')
      const id = input.article.url
      if (!jobs.has(id)) jobs.set(id, {id, state: 'pending', outcome: null})
      return id
    }
    if (op === 'finish') {
      finishCount++
      const row = jobs.get(input.job_id)
      if (finishFailure === 'before_commit' && finishCount === 2) throw Error('finish_failed')
      row.state = 'completed'; row.outcome = 'inserted'; row.capture_id = 'capture:' + row.id
      if (finishFailure === 'lost_response' && finishCount === 2) throw Error('finish_response_lost')
      return {job_id: row.id, outcome: row.outcome}
    }
    throw Error('unexpected pipeline operation')
  }
  pipelineRpc.claimBound = async ids => {
    const row = ids.map(id => jobs.get(id)).find(row => row.state === 'pending')
    if (!row) return null
    row.state = 'processing'
    return {id: row.id, lease_token: 'test-lease'}
  }
  pipelineRpc.extractCapture = async ({capture_id}) => ({state: 'no_candidates', capture_id})
  pipelineRpc.readJobStates = async ids => [...new Set(ids)].map(id => ({...jobs.get(id)}))
  const feed = '<rss><channel>' + urls.map(url =>
    '<item><title>Source ' + url + '</title><link>https://example.org/' + url + '</link></item>').join('') + '</channel></rss>'
  return {sourceReports, run: () => runQikIngestCollector({
    rpc, pipelineRpc, token: 'test-token', runId: 'correction-run', fetchText: async () => feed, drainMaxJobs,
  })}
}

test('later enqueue failure preserves earlier pending bound work', async () => {
  const h = harness({enqueueFailure: true})
  const {body} = await h.run()
  assert.equal(body.state, 'failed')
  assert.equal(body.unresolved, 1)
  assert.equal(body.duplicates, 0)
  assert.equal(body.source_failures, 1)
  assert.equal(h.sourceReports[0].fetched, 2)
})

test('later finish failure retains earlier commit and unresolved work', async () => {
  const h = harness({finishFailure: 'before_commit'})
  const {body} = await h.run()
  assert.equal(body.state, 'completed_with_errors')
  assert.equal(body.inserted, 1)
  assert.equal(body.unresolved, 1)
  assert.equal(body.duplicates, 0)
  assert.equal(h.sourceReports[0].new_items, 1)
  assert.equal(h.sourceReports[0].state, 'failed')
})

test('committed finish with lost response reconciles from native state', async () => {
  const h = harness({finishFailure: 'lost_response'})
  const {body} = await h.run()
  assert.equal(body.state, 'completed_with_errors')
  assert.equal(body.inserted, 2)
  assert.equal(body.unresolved, 0)
  assert.equal(body.duplicates, 0)
  assert.equal(body.source_failures, 1)
  assert.equal(h.sourceReports[0].new_items, 2)
})

test('repeated pending discovery is unresolved, never a terminal duplicate', async () => {
  const {body} = await harness({urls: ['a', 'a'], drainMaxJobs: 0}).run()
  assert.equal(body.unresolved, 1)
  assert.equal(body.duplicates, 0)
  assert.equal(body.state, 'failed')
  const completed = await harness({urls: ['a', 'a']}).run()
  assert.equal(completed.body.inserted, 1)
  assert.equal(completed.body.duplicates, 1)
})

test('repeated dead-letter and missing jobs retain honest unique-job counts', () => {
  assert.deepEqual(countHandoffOutcomes(['a', 'a', 'b', 'b'], [], [
    {id: 'a', state: 'dead_letter', outcome: null},
  ]), {inserted: 0, duplicates: 0, revisions: 0, unresolved: 1, failed: 1})
})

test('native committed captures survive later finish failures in collector accounting', async t => {
  const {FEED, loadQikIngest, enableDisposableWriter, createPipelineRpc, rpc} = await import('./qikIngestTestKit.mjs')
  for (const lostResponse of [false, true]) {
    await t.test(lostResponse ? 'after commit' : 'before commit', async () => {
      const {db, exec} = await createDisposableDb()
      t.after(() => db.close())
      await loadQikIngest(exec)
      await enableDisposableWriter(db)
      const native = createPipelineRpc(db)
      let finishes = 0
      const wrapped = async (action, input) => {
        if (action === 'finish' && ++finishes === 2) {
          if (lostResponse) await native(action, input)
          throw Error('injected_later_finish_failure')
        }
        return native(action, input)
      }
      wrapped.claimBound = native.claimBound
      wrapped.readJobStates = native.readJobStates
      wrapped.extractCapture = native.extractCapture
      const {body} = await runQikIngestCollector({
        rpc: rpc(db), pipelineRpc: wrapped, token: 'qik-ingest-disposable-test-token',
        runId: 'native-finish-' + lostResponse, fetchText: async () => FEED,
      })
      const expected = lostResponse ? 2 : 1
      assert.equal(body.inserted, expected)
      assert.equal(body.unresolved, lostResponse ? 0 : 1)
      assert.equal(body.state, 'completed_with_errors')
      assert.equal((await db.query('select count(*)::int n from evidence_pipeline.article_captures')).rows[0].n, expected)
      assert.equal((await db.query("select count(*)::int n from evidence_pipeline.import_jobs where state='completed'")).rows[0].n, expected)
      assert.equal((await db.query("select count(*)::int n from evidence_pipeline.import_jobs where state='processing'")).rows[0].n, lostResponse ? 0 : 1)
      assert.equal((await db.query("select count(*)::int n from evidence_pipeline.record_versions where record_kind='article' and operation='insert'")).rows[0].n, expected)
    })
  }
})
