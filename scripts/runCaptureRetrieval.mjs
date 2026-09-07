import { open } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { createOperatorBackend } from './operatorBackend.mjs'

import { runCaptureRetrieval, validateCaptureRetrieval } from '../supabase/functions/_shared/captureRetrieval.mjs'
export { runCaptureRetrieval } from '../supabase/functions/_shared/captureRetrieval.mjs'

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
  validateCaptureRetrieval(input)
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
