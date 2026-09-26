// Testable qik retain collector. No network unless the caller injects fetchText.
// Parser seams are captured YHB ingest-rss v8 (predecessorV8), not the later
// local ingest-rss body. Publication, NER, embeddings, and arcs are out of scope.

import { parseFeed } from '../../functions/collector-algorithm-shadow-candidate/predecessorV8.js'
import {countHandoffOutcomes, drainNativePipeline, enqueueObserved} from './nativeHandoff.mjs'

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
  pipelineRpc,
  fetchText,
  token,
  runId,
  now = new Date().toISOString(),
  drainMaxJobs = 32,
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
  let revisions = 0
  let unresolved = 0
  let failedJobs = 0
  let sourceFailures = 0
  const sourceReports = []
  const allJobIds = []
  const finishedJobs = []
  const attemptedJobIds = new Set()
  const latestJobRows = new Map()
  const extractedCaptures = new Set()
  const incompleteCaptures = new Set()

  for (const source of sources) {
    if (inserted + revisions >= maxNew) break
    // Keep bound identities and partial receipts outside the failure scope.
    const sourceJobIds = []
    const sourceFinished = []
    const sourceAttempts = new Set()
    let fetched = 0
    let failure = null
    try {
      if (typeof fetchText !== 'function') throw new Error('fetchText_not_injected')
      const xml = await fetchText(source.feed_url)
      const items = parseFeed(xml, source.feed_url)
      fetched = items.length
      const uniqueSourceJobs = new Set()
      for (const item of items) {
        if (uniqueSourceJobs.size >= maxPerFeed || inserted + revisions + uniqueSourceJobs.size >= maxNew) break
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
        if (result.disposition === 'rejected') {
          rejected += 1
          continue
        }
        if (result.disposition !== 'observed' || !result.article) {
          throw new Error('qik_ingest_native_handoff_required')
        }
        const jobId = await enqueueObserved({pipelineRpc, runId, article: result.article, observationId: result.id})
        if (!jobId) throw new Error('native_job_id_required')
        sourceJobIds.push(jobId)
        allJobIds.push(jobId)
        uniqueSourceJobs.add(jobId)
      }
      await drainNativePipeline({
        pipelineRpc,
        jobIds: sourceJobIds,
        maxJobs: drainMaxJobs,
        finished: sourceFinished,
        attemptedJobIds: sourceAttempts,
      })
    } catch (error) {
      failure = boundedError(error)
    }
    finishedJobs.push(...sourceFinished)
    for (const id of sourceAttempts) attemptedJobIds.add(id)

    // Reconcile even after enqueue/claim/finish fails. In particular an
    // ambiguous finish response must not erase an earlier committed capture.
    let sourceRows = []
    if (sourceJobIds.length) {
      try {
        if (typeof pipelineRpc?.readJobStates !== 'function') throw new Error('bound_job_states_required')
        sourceRows = await pipelineRpc.readJobStates(sourceJobIds)
        if (!Array.isArray(sourceRows)) throw new Error('job_states_required')
        for (const row of sourceRows) latestJobRows.set(String(row.id), row)
      } catch (error) {
        failure = failure ?? boundedError(error)
      }
    }
    // C5 is part of source completion. Use durable bound-state readback so
    // duplicate delivery and a lost finish response also reach extraction.
    for (const row of sourceRows) {
      if (row.state !== 'completed') continue
      const captureId = row.capture_id
      if (extractedCaptures.has(captureId)) continue
      try {
        if (!captureId) throw new Error('completed_capture_binding_required')
        if (typeof pipelineRpc.extractCapture !== 'function') throw new Error('retained_extraction_required')
        const extracted = await pipelineRpc.extractCapture({job_id: row.id, capture_id: captureId})
        if (extracted?.capture_id !== captureId ||
          !['candidates_retained', 'no_candidates'].includes(extracted?.state))
          throw new Error('retained_extraction_incomplete')
        extractedCaptures.add(captureId)
        incompleteCaptures.delete(captureId)
      } catch (error) {
        incompleteCaptures.add(captureId ?? row.id)
        failure = failure ?? boundedError(error)
      }
    }
    const counts = countHandoffOutcomes(sourceJobIds, sourceFinished, sourceRows, sourceAttempts)
    const totals = countHandoffOutcomes(allJobIds, finishedJobs, [...latestJobRows.values()], attemptedJobIds)
    inserted = totals.inserted
    duplicates = totals.duplicates
    revisions = totals.revisions
    unresolved = totals.unresolved
    failedJobs = totals.failed
    if (failure) sourceFailures += 1
    const state = failure ? 'failed' : 'succeeded'
    await rpc('record_source_run', {
      token,
      run_id: runId,
      source_id: source.id,
      state,
      fetched,
      new_items: counts.inserted + counts.revisions,
      error_note: failure,
      now,
    })
    sourceReports.push({
      source_id: source.id,
      state,
      fetched,
      new: counts.inserted + counts.revisions,
      duplicates: counts.duplicates,
      revisions: counts.revisions,
      unresolved: counts.unresolved,
      failed_jobs: counts.failed,
      ...(failure ? {error: failure} : {}),
    })
  }

  const processingIncomplete = unresolved > 0 || failedJobs > 0
  const finishState = sourceFailures === 0 && !processingIncomplete
    ? 'completed'
    : (inserted + revisions > 0 ? 'completed_with_errors' : 'failed')
  const finished = await rpc('finish_run', {
    token,
    run_id: runId,
    state: finishState,
    counters: {
      inserted,
      duplicates,
      rejected,
      revisions,
      unresolved,
      failed_jobs: failedJobs,
      source_failures: sourceFailures,
      extracted_captures: extractedCaptures.size,
      extraction_incomplete: incompleteCaptures.size,
    },
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
      revisions,
      unresolved,
      failed_jobs: failedJobs,
      source_failures: sourceFailures,
      extracted_captures: extractedCaptures.size,
      extraction_incomplete: incompleteCaptures.size,
      sources: sourceReports,
      freshness: finished.freshness,
      is_current: false,
      begun,
    },
  }
}
