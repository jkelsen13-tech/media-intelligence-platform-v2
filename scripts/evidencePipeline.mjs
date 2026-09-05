import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// Server/operator module. Never import into src/ or expose its key through Vite.
export const PIPELINE_TARGET = 'https://qikvmopbtijoebdqosyq.supabase.co'
const TRANSIENT = new Set(['40001', '40P01', '53300', '57014', '08000', '08006', 'network_error', 'http_429', 'http_502', 'http_503', 'http_504'])

export function validateArticle(article) {
  if (!article || Array.isArray(article) || typeof article !== 'object') throw new Error('article must be an object')
  const allowed = new Set(['url', 'title', 'outlet', 'summary', 'body_text', 'published_at'])
  for (const [key, value] of Object.entries(article)) {
    if (!allowed.has(key) || (value !== null && typeof value !== 'string')) throw new Error('unsupported article field')
  }
  if (!article.title?.trim() || article.title.trim().length > 500 || !article.outlet?.trim() || article.outlet.trim().length > 200) throw new Error('title and outlet required')
  if (!/^https?:\/\/[a-z0-9]([a-z0-9.-]*[a-z0-9])?([/?#]|$)/i.test(article.url ?? '') || /[\s\x00-\x1f]/u.test(article.url ?? '') || Buffer.byteLength(article.url) > 2048) throw new Error('invalid article URL')
  if (article.published_at && !Number.isFinite(Date.parse(article.published_at))) throw new Error('invalid publication timestamp')
  if (Buffer.byteLength(JSON.stringify(article)) > 240000) throw new Error('article exceeds payload budget')
  return article
}

export function createPipelineRpc({ url, key, fetchImpl = fetch }) {
  if (url?.replace(/\/$/, '') !== PIPELINE_TARGET) throw new Error('pipeline target must be the current V2 project')
  if (!key) throw new Error('MIP_PIPELINE_SERVICE_KEY is required in the server environment')
  return async (action, input = {}) => {
    let response
    try {
      response = await fetchImpl(`${PIPELINE_TARGET}/rest/v1/rpc/mip_pipeline_v1`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_action: action, p_input: input }),
        signal: AbortSignal.timeout(25000),
      })
    } catch {
      throw Object.assign(new Error('pipeline request failed'), { code: 'network_error' })
    }
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      const code = /^[a-zA-Z0-9_]{1,80}$/.test(body?.code ?? '') ? body.code : `http_${response.status}`
      throw Object.assign(new Error('pipeline operation failed'), { code })
    }
    return body
  }
}

export async function enqueueManifest(rpc, { run_id, articles }, { apply = false } = {}) {
  if (typeof run_id !== 'string' || !run_id.trim() || run_id.length > 120) throw new Error('run_id required')
  if (!Array.isArray(articles) || !articles.length || articles.length > 100) throw new Error('manifest must contain 1–100 articles')
  // Validate the entire manifest before its first write.
  articles.forEach(validateArticle)
  if (!apply) return { dry_run: true, validated: articles.length, note: 'Shape validation only; database deduplication runs on enqueue.' }
  const jobIds = []
  for (const article of articles) jobIds.push(await rpc('enqueue', { run_id, article }))
  return { run_id, received: articles.length, unique_jobs: new Set(jobIds).size, job_ids: jobIds }
}

export async function runWorker(rpc, { maxJobs = 10 } = {}) {
  if (!Number.isInteger(maxJobs) || maxJobs < 1 || maxJobs > 100) throw new Error('maxJobs must be 1–100')
  const report = { completed: [], failed: [], indeterminate: [] }
  for (let i = 0; i < maxJobs; i++) {
    const job = await rpc('claim')
    if (!job) break
    try {
      report.completed.push(await rpc('finish', { job_id: job.id, lease_token: job.lease_token }))
    } catch (error) {
      const code = /^[a-zA-Z0-9_]{1,80}$/.test(error.code ?? '') ? error.code : 'worker_error'
      try {
        const state = await rpc('fail', { job_id: job.id, lease_token: job.lease_token, code, retryable: TRANSIENT.has(code) })
        report.failed.push({ job_id: job.id, state, code })
      } catch {
        // A lost response may hide a successful commit. Never compensate by
        // deleting/reinserting; the durable job state decides on the next run.
        report.indeterminate.push({ job_id: job.id, code: 'check_durable_job_state' })
      }
    }
  }
  return report
}

async function main() {
  const [command, file, ...flags] = process.argv.slice(2)
  const apply = flags.includes('--apply') || file === '--apply'
  if (!['enqueue', 'run', 'candidate', 'status', 'history', 'evidence'].includes(command)) throw new Error('Usage: evidencePipeline.mjs enqueue|run|candidate|status|history|evidence [input.json] [--apply]')
  const input = file && file !== '--apply' ? JSON.parse(await readFile(file, 'utf8')) : {}
  if (command === 'enqueue' && !apply) return enqueueManifest(null, input)
  if (['run', 'candidate'].includes(command) && !apply) throw new Error('Pass --apply to execute this write operation')
  const rpc = createPipelineRpc({ url: process.env.MIP_PIPELINE_URL, key: process.env.MIP_PIPELINE_SERVICE_KEY })
  if (command === 'enqueue') return enqueueManifest(rpc, input, { apply })
  if (command === 'run') return runWorker(rpc, input)
  return rpc(command, input)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(result => console.log(JSON.stringify(result, null, 2))).catch(error => {
    console.error(error.code ?? error.message)
    process.exitCode = 1
  })
}
