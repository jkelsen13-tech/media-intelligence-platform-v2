// Testable qik retain collector. No network unless the caller injects fetchText.
// Parser seams are captured YHB ingest-rss v8 (predecessorV8), not the later
// local ingest-rss body. Publication, NER, embeddings, and arcs are out of scope.

import { parseFeed } from '../../functions/collector-algorithm-shadow-candidate/predecessorV8.js'

export const ALGORITHM_VERSION = 'qik-ingest-rss-v1-retain-from-yhb-v8'
export const EDGE_SLUG = 'qik-ingest-rss'
export const ENV_RUN_KEY = 'MIP_QIK_INGEST_RUN_KEY'
export const HEADER_RUN_KEY = 'x-mip-qik-ingest-key'
export const HEADER_SCHEDULER_TOKEN = 'x-mip-qik-ingest-scheduler-token'
export const VAULT_SECRET_NAME = 'mip_qik_ingest_scheduler_token'
export const JOB_NAME = 'mip-qik-ingest-rss'
export const YHB_FENCE_ARTICLES = 36183
export const QIK_PHASE_A_ARTICLES = 98
export const DISPOSABLE_TEST_TOKEN = 'qik-ingest-disposable-test-token'

export { parseFeed }

function boundedError(error) {
  return String(error instanceof Error ? error.message : error).slice(0, 1000)
}

export async function runQikIngestCollector({
  rpc,
  fetchText,
  token,
  runId,
  now = new Date().toISOString(),
}) {
  let plan
  try {
    plan = await rpc('plan', { token })
  } catch (error) {
    const message = boundedError(error)
    const unauthorized = /qik_ingest_unauthorized/.test(message)
    return {
      httpStatus: unauthorized ? 401 : 500,
      body: { error: unauthorized ? 'unauthorized' : message },
    }
  }
  if (!plan?.collection_authorized) {
    return {
      httpStatus: 503,
      body: { error: 'writer_disabled', collection_authorized: false },
    }
  }

  let begun
  try {
    begun = await rpc('begin_run', { token, run_id: runId, now })
  } catch (error) {
    return { httpStatus: 409, body: { error: boundedError(error) } }
  }

  const sources = Array.isArray(plan.sources) ? plan.sources : []
  const maxNew = Number(plan.config?.max_new_per_run ?? 8)
  const maxPerFeed = Number(plan.config?.max_items_per_feed ?? 4)
  let inserted = 0
  let duplicates = 0
  let rejected = 0
  let sourceFailures = 0
  const sourceReports = []

  for (const source of sources) {
    if (inserted >= maxNew) break
    try {
      if (typeof fetchText !== 'function') throw new Error('fetchText_not_injected')
      const xml = await fetchText(source.feed_url)
      const items = parseFeed(xml, source.feed_url)
      let newForSource = 0
      let dupForSource = 0
      for (const item of items) {
        if (newForSource >= maxPerFeed || inserted >= maxNew) break
        const result = await rpc('retain_item', {
          token,
          run_id: runId,
          source_id: source.id,
          item: {
            title: item.title,
            url: item.url,
            summary: item.summary,
            published_at: item.published_at,
          },
        })
        if (result.disposition === 'inserted') {
          inserted += 1
          newForSource += 1
        } else if (result.disposition === 'duplicate') {
          duplicates += 1
          dupForSource += 1
        } else if (result.disposition === 'rejected') {
          rejected += 1
        }
      }
      await rpc('record_source_run', {
        token,
        run_id: runId,
        source_id: source.id,
        state: 'succeeded',
        fetched: items.length,
        new_items: newForSource,
        error_note: null,
        now,
      })
      sourceReports.push({
        source_id: source.id,
        state: 'succeeded',
        fetched: items.length,
        new: newForSource,
        duplicates: dupForSource,
      })
    } catch (error) {
      sourceFailures += 1
      const note = boundedError(error)
      await rpc('record_source_run', {
        token,
        run_id: runId,
        source_id: source.id,
        state: 'failed',
        fetched: 0,
        new_items: 0,
        error_note: note,
        now,
      })
      sourceReports.push({ source_id: source.id, state: 'failed', error: note })
    }
  }

  const finishState = sourceFailures === 0
    ? 'completed'
    : (inserted > 0 ? 'completed_with_errors' : 'failed')
  const finished = await rpc('finish_run', {
    token,
    run_id: runId,
    state: finishState,
    counters: { inserted, duplicates, rejected, source_failures: sourceFailures },
    now,
  })

  return {
    httpStatus: finishState === 'failed' ? 502 : 200,
    body: {
      run_id: runId,
      state: finishState,
      inserted,
      duplicates,
      rejected,
      source_failures: sourceFailures,
      sources: sourceReports,
      freshness: finished.freshness,
      is_current: false,
      begun,
    },
  }
}
