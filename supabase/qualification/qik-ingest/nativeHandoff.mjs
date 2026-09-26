// Existing native enqueue/finish adapter. Not a second pipeline or queue.
// Enqueue and finish stay on public.mip_pipeline_v1. Claim and expired-lease
// recovery use mip_qik_ingest_claim_bound: same import_jobs rows, lease tokens,
// attempt_count, SKIP LOCKED, and backoff as evidence_pipeline.claim_job, but
// ONLY for explicitly bound job ids. Discovery stays in qik_ingest.observed_items.

import {createRetainedExtractionBackend, extractRetainedCapture} from '../collector-native-capture/retainedExtraction.mjs'

export function asJobId(value) {
  if (value == null) return null
  return String(value)
}

function uniqueJobIds(jobIds) {
  if (!Array.isArray(jobIds)) throw new Error('bound_jobs_required')
  return [...new Set(jobIds.map(asJobId).filter(Boolean))]
}

function normalizeJobRow(row) {
  return {
    id: asJobId(row.id),
    state: row.state,
    capture_id: asJobId(row.capture_id),
    outcome: row.outcome ?? null,
    attempt_count: Number(row.attempt_count ?? 0),
    error_code: row.error_code ?? null,
    lease_token: row.lease_token == null ? null : String(row.lease_token),
  }
}

export function createPipelineRpc(db) {
  if (!db || typeof db.query !== 'function') throw new Error('pipeline_transport_required')
  const pipelineRpc = async (action, input = {}) => {
    if (action === 'claim') throw new Error('unscoped_claim_forbidden')
    const result = await db.query(
      'select public.mip_pipeline_v1($1,$2::jsonb) result',
      [action, JSON.stringify(input ?? {})],
    )
    return result.rows?.[0]?.result ?? null
  }
  pipelineRpc.claimBound = async (jobIds) => {
    const ids = uniqueJobIds(jobIds)
    if (ids.length === 0) throw new Error('bound_jobs_required')
    const result = await db.query(
      'select public.mip_qik_ingest_claim_bound($1::uuid[]) result',
      [ids],
    )
    return result.rows?.[0]?.result ?? null
  }
  pipelineRpc.readJobStates = async (jobIds) => {
    const ids = uniqueJobIds(jobIds)
    if (ids.length === 0) return []
    const result = await db.query(
      'select public.mip_qik_ingest_bound_job_states($1::uuid[]) result',
      [ids],
    )
    const rows = result.rows?.[0]?.result
    return Array.isArray(rows) ? rows.map(normalizeJobRow) : []
  }
  const extraction = createRetainedExtractionBackend(db)
  pipelineRpc.extractCapture = async ({job_id, capture_id}) => extractRetainedCapture({
    capture_id,
    backend: {
      async readCapture(id) {
        const result = await db.query(
          'select public.mip_qik_ingest_capture_for_job($1::uuid,$2::uuid) result',
          [job_id, id],
        )
        return result.rows?.[0]?.result
      },
      appendCandidate: extraction.appendCandidate,
    },
  })
  return pipelineRpc
}

// Permanent execute-only adapter: actual qik_ingest_runtime login (or its
// operation-owned member), with no service_role membership or SET ROLE.
export function createBoundNativePipelineRpc(db,{token,runId}={}) {
  if (!db || typeof db.query!=='function') throw Error('pipeline_transport_required')
  if (typeof token!=='string' || token.length<32 || typeof runId!=='string')
    throw Error('native_caller_scope_required')
  const call=async(action,input={})=>{
    const result=await db.query(
      'select public.mip_qik_ingest_native($1,$2,$3,$4::jsonb) result',
      [token,runId,action,JSON.stringify(input)])
    return result.rows?.[0]?.result??null
  }
  const pipeline=async(action,input={})=>{
    if(action!=='finish') throw Error('native_caller_action_forbidden')
    return call(action,input)
  }
  pipeline.enqueueObservation=async({runId:requestedRun,observationId})=>{
    if(requestedRun!==runId || !observationId) throw Error('native_observation_required')
    return call('enqueue',{observation_id:observationId})
  }
  pipeline.claimBound=ids=>call('claim',{job_ids:uniqueJobIds(ids)})
  pipeline.readJobStates=async ids=>{
    const bound=uniqueJobIds(ids)
    if(!bound.length)return []
    const rows=await call('states',{job_ids:bound})
    return rows.map(normalizeJobRow)
  }
  pipeline.extractCapture=({job_id,capture_id})=>extractRetainedCapture({
    capture_id,backend:{
      readCapture:id=>call('capture',{job_id,capture_id:id}),
      appendCandidate:candidate=>call('candidate',{job_id,candidate}),
    },
  })
  return pipeline
}

export async function enqueueObserved({pipelineRpc, runId, article, observationId}) {
  if (typeof pipelineRpc !== 'function') throw new Error('native_pipeline_rpc_required')
  if (typeof runId !== 'string' || runId.length < 8) throw new Error('run_id required, maximum 120 characters')
  if (typeof pipelineRpc.enqueueObservation==='function') {
    return asJobId(await pipelineRpc.enqueueObservation({runId,observationId}))
  }
  if (!article || typeof article !== 'object') throw new Error('invalid import payload')
  return asJobId(await pipelineRpc('enqueue', {run_id: runId, article}))
}

export async function drainNativePipeline({pipelineRpc, jobIds, maxJobs = 32, finished = [], attemptedJobIds = new Set()}) {
  if (typeof pipelineRpc !== 'function') throw new Error('native_pipeline_rpc_required')
  if (typeof pipelineRpc.claimBound !== 'function') throw new Error('bound_claim_required')
  const bound = uniqueJobIds(jobIds)
  if (bound.length === 0) return []
  const boundSet = new Set(bound)
  const limit = Number(maxJobs)
  if (!Number.isInteger(limit) || limit < 0) throw new Error('drain_limit_invalid')
  for (let i = 0; i < limit; i += 1) {
    const claimed = await pipelineRpc.claimBound(bound)
    if (!claimed) break
    const claimedId = asJobId(claimed.id)
    // Bound SQL is the enforced boundary (claim already mutates). This tripwire
    // refuses finish effects on a job the bound claim must never return.
    if (!boundSet.has(claimedId)) throw new Error('claim_bound_violated')
    // Retain the attempt before awaiting: finish may commit and lose its response.
    attemptedJobIds.add(claimedId)
    finished.push(await pipelineRpc('finish', {
      job_id: claimedId,
      lease_token: claimed.lease_token,
    }))
  }
  return finished
}

export function countHandoffOutcomes(jobIds, finished, jobRows, attemptedJobIds = new Set()) {
  if (!Array.isArray(jobRows)) throw new Error('job_states_required')
  const wanted = uniqueJobIds(jobIds)
  const observations = new Map()
  for (const id of jobIds.map(asJobId).filter(Boolean)) observations.set(id, (observations.get(id) ?? 0) + 1)
  const finishedById = new Map()
  for (const row of Array.isArray(finished) ? finished : []) {
    const id = asJobId(row?.job_id)
    if (!id) continue
    finishedById.set(id, row)
  }
  const stateById = new Map(jobRows.map(row => [normalizeJobRow(row).id, normalizeJobRow(row)]))
  let inserted = 0
  let duplicates = 0
  let revisions = 0
  let unresolved = 0
  let failed = 0
  for (const id of wanted) {
    const row = stateById.get(id)
    if (!row) {
      unresolved += 1
      continue
    }
    if (row.state === 'completed') {
      // Repeated discovery is a duplicate only after native completion.
      duplicates += observations.get(id) - 1
      const thisDrain = finishedById.get(id) ?? (attemptedJobIds.has(id) ? row : null)
      if (!thisDrain) {
        duplicates += 1
        continue
      }
      if (thisDrain.outcome === 'inserted') inserted += 1
      else if (thisDrain.outcome === 'existing') duplicates += 1
      else if (thisDrain.outcome === 'revision_pending') revisions += 1
      else unresolved += 1
    } else if (row.state === 'dead_letter') {
      failed += 1
    } else {
      unresolved += 1
    }
  }
  return {inserted, duplicates, revisions, unresolved, failed}
}
