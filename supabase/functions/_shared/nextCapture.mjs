import { runCaptureRetrieval } from './captureRetrieval.mjs'

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)

export function validateNextCapture(input = {}) {
  if (!input || Array.isArray(input) || typeof input !== 'object' ||
      Object.keys(input).some(key => !['maxPages', 'pageSize'].includes(key))) throw new Error('invalid worker input')
  const { maxPages = 1, pageSize = 25 } = input
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 2 ||
      !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 25) throw new Error('invalid worker budget')
  return { maxPages, pageSize }
}

// Exactly one producer-scoped claim. Never retry an ambiguous claim or invent
// queue finish/fail receipts. The existing runner verifies durable completion.
export async function runNextCapture(backend, input = {}) {
  const options = validateNextCapture(input)
  let job
  try { job = await backend.captureClaims('claim') }
  catch { return { state: 'indeterminate', code: 'claim_outcome_unknown', pages: 0 } }
  if (job === null) return { state: 'no_ready_capture', pages: 0 }
  if (!job || !uuid(job.id) || !uuid(job.lease_token) ||
      job.route !== 'new_candidate_search' || job.state !== 'processing' ||
      job.contract_version !== 'discovery-v1' ||
      !Number.isInteger(job.attempt_count) || job.attempt_count < 1 || job.attempt_count > 5 ||
      !uuid(job.change?.capture_id) || job.change.record_version_id != null ||
      !Number.isFinite(Date.parse(job.lease_expires_at)) || Date.parse(job.lease_expires_at) <= Date.now()) {
    return { state: 'indeterminate', code: 'invalid_claim_response', pages: 0 }
  }
  const result = await runCaptureRetrieval(backend, {
    mode: 'start', job_id: job.id, lease_token: job.lease_token, ...options,
  })
  return {
    ...result,
    ...(result.state !== 'completed' ? { recovery: 'inspect_saved_run_and_current_lease' } : {}),
  }
}
