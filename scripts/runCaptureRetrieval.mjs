import { open } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { createOperatorBackend } from './operatorBackend.mjs'

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
const fault = code => Object.assign(new Error('retrieval operation could not be verified'), { code })

function validate(input) {
  if (!input || Array.isArray(input) || typeof input !== 'object') throw new Error('retrieval input must be an object')
  const { mode, job_id, run_id, lease_token, maxPages = 4, pageSize = 25 } = input
  if (!['start', 'resume', 'refresh'].includes(mode)) throw new Error('mode must be start, resume or refresh')
  const allowed = new Set(['mode', 'maxPages', 'pageSize', mode === 'resume' ? 'run_id' : 'job_id', ...(mode === 'refresh' ? [] : ['lease_token'])])
  if (Object.keys(input).some(key => !allowed.has(key))) throw new Error('unsupported retrieval field')
  if (!uuid(mode === 'resume' ? run_id : job_id) || (lease_token !== undefined && !uuid(lease_token)) || (mode === 'start' && !uuid(lease_token))) throw new Error('valid identifiers and initial lease required')
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 80 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 25) throw new Error('maxPages must be 1..80 and pageSize 1..25')
  return { mode, job_id, run_id, lease_token, maxPages, pageSize }
}

function checkRun(run, expectedId, expectedJob) {
  if (!run || !uuid(run.id) || !uuid(run.job_id) || (expectedId && run.id !== expectedId) || (expectedJob && run.job_id !== expectedJob) || run.contract !== 'capture-lexical-1' || !Array.isArray(run.targets) || run.targets.length > 2000 || !Number.isInteger(run.next_index) || run.next_index < 0 || run.next_index > run.targets.length || typeof run.is_refresh !== 'boolean') throw fault('invalid_run')
  if (run.completed_at && (!Number.isFinite(Date.parse(run.completed_at)) || run.next_index !== run.targets.length)) throw fault('invalid_completion')
  return run
}

// Works only on an explicitly selected existing lease/run. It never claims an
// arbitrary queue item: record-history producers need different adapters.
export async function runCaptureRetrieval(backend, input) {
  const options = validate(input)
  const { mode, job_id, lease_token, maxPages, pageSize } = options
  let runId = options.run_id
  let pages = 0
  let errorCode
  try {
    const run = checkRun(await backend.retrieval(mode === 'resume' ? 'read' : mode, mode === 'resume' ? { run_id: runId } : mode === 'refresh' ? { job_id } : { job_id, lease_token }), runId, job_id)
    runId = run.id
    if (!run.completed_at) {
      if (!run.is_refresh && !lease_token) throw fault('lease_required')
      for (; pages < maxPages;) {
        pages++
        const receipt = await backend.retrieval('page', { run_id: runId, ...(run.is_refresh ? {} : { lease_token }), limit: pageSize })
        if (receipt?.coverage === 'complete') break
        if (receipt?.coverage !== 'partial' || receipt.run_id !== runId) throw fault('invalid_receipt')
      }
    }
  } catch (error) {
    errorCode = /^[a-zA-Z0-9_]{1,80}$/.test(error.code ?? '') ? error.code : 'retrieval_error'
  }
  // A lost HTTP response may hide a committed page. Read durable state before
  // deciding; never issue a synthetic queue completion or compensating failure.
  if (runId) {
    try {
      const run = checkRun(await backend.retrieval('read', { run_id: runId }), runId, job_id)
      return {
        state: run.completed_at ? 'completed' : errorCode ? 'indeterminate' : 'partial',
        job_id: run.job_id, run_id: run.id, pages,
        scanned: run.next_index, targets: run.targets.length,
        contract: run.contract, is_refresh: run.is_refresh,
        ...(run.completed_at ? { work_ref: `capture-retrieval:${run.id}` } : errorCode ? { code: errorCode } : {}),
      }
    } catch { errorCode = 'check_durable_run_state' }
  }
  return { state: 'indeterminate', ...(job_id ? { job_id } : {}), ...(runId ? { run_id: runId } : {}), pages, code: errorCode ?? 'check_durable_run_state' }
}

async function readInput(file) {
  const handle = await open(file, 'r')
  try {
    const buffer = Buffer.alloc(8193)
    let size = 0
    while (size < buffer.length) {
      const { bytesRead } = await handle.read(buffer, size, buffer.length - size, null)
      if (!bytesRead) break
      size += bytesRead
    }
    if (size > 8192) throw new Error('input exceeds 8 KiB')
    try { return JSON.parse(buffer.subarray(0, size).toString('utf8')) } catch { throw new Error('input must be valid JSON') }
  } finally { await handle.close() }
}

export async function runOperatorCommand(args, { env = process.env, makeBackend = createOperatorBackend, read = readInput } = {}) {
  const [command, file, apply, ...extra] = args
  if (command === 'status' && args.length === 1) {
    const backend = makeBackend({ url: env.MIP_PIPELINE_URL, key: env.MIP_PIPELINE_SERVICE_KEY })
    const [intake, changes] = await Promise.all([backend.intake('status'), backend.changes('status')])
    return { intake, changes }
  }
  if (command !== 'retrieval' || !file || apply !== '--apply' || extra.length) throw new Error('Usage: runCaptureRetrieval.mjs status | retrieval input.json --apply')
  const input = await read(file)
  validate(input)
  return runCaptureRetrieval(makeBackend({ url: env.MIP_PIPELINE_URL, key: env.MIP_PIPELINE_SERVICE_KEY }), input)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runOperatorCommand(process.argv.slice(2)).then(result => {
    console.log(JSON.stringify(result, null, 2))
    if (result.state === 'indeterminate') process.exitCode = 1
  }).catch(() => {
    console.error('Operator command failed. Check command, input and server configuration; no verified completion is available.')
    process.exitCode = 1
  })
}
