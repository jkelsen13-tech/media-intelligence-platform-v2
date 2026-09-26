// Existing native enqueue/claim/finish adapter. Not a second pipeline.
// Mirrors verifier/news-intake/native_adapter.py + native_worker.py actions
// against public.mip_pipeline_v1. Discovery stays in qik_ingest.observed_items.

export function createPipelineRpc(db) {
  if (!db || typeof db.query !== 'function') throw new Error('pipeline_transport_required')
  return async (action, input = {}) => {
    const result = await db.query(
      'select public.mip_pipeline_v1($1,$2::jsonb) result',
      [action, JSON.stringify(input ?? {})],
    )
    return result.rows?.[0]?.result ?? null
  }
}

export async function enqueueObserved({pipelineRpc, runId, article}) {
  if (typeof pipelineRpc !== 'function') throw new Error('native_pipeline_rpc_required')
  if (typeof runId !== 'string' || runId.length < 8) throw new Error('run_id required, maximum 120 characters')
  if (!article || typeof article !== 'object') throw new Error('invalid import payload')
  return pipelineRpc('enqueue', {run_id: runId, article})
}

export async function drainNativePipeline({pipelineRpc, maxJobs = 32}) {
  if (typeof pipelineRpc !== 'function') throw new Error('native_pipeline_rpc_required')
  const finished = []
  for (let i = 0; i < maxJobs; i += 1) {
    const claimed = await pipelineRpc('claim', {})
    if (!claimed) break
    finished.push(await pipelineRpc('finish', {
      job_id: claimed.id,
      lease_token: claimed.lease_token,
    }))
  }
  return finished
}

export function countHandoffOutcomes(jobIds, finished) {
  const wanted = new Set(jobIds)
  const seenFinished = new Set()
  let inserted = 0
  let duplicates = 0
  let revisions = 0
  for (const row of finished) {
    if (!wanted.has(row.job_id)) continue
    seenFinished.add(row.job_id)
    if (row.outcome === 'inserted') inserted += 1
    else if (row.outcome === 'existing') duplicates += 1
    else if (row.outcome === 'revision_pending') revisions += 1
  }
  for (const jobId of wanted) {
    if (!seenFinished.has(jobId)) duplicates += 1
  }
  return {inserted, duplicates, revisions}
}
