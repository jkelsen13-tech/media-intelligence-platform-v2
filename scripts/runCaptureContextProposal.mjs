import { readFile, open, stat } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { CONTRACT, createProposalSession } from './captureContextProposal.mjs'
import { prepareCollection, evaluateCollection } from './evaluateCaptureCollection.mjs'

export async function compareCaptureProposals(rows, contexts = []) {
  const session = createProposalSession(rows, contexts)
  // Reuses the unchanged SQL baseline in ephemeral PGlite, never a live endpoint.
  const baseline = await evaluateCollection(prepareCollection(rows))
  const pairs = new Map()
  let partialPages = 0
  for (const source of session.manifest.admitted) {
    let after = null
    do {
      const page = session.page({ source_id: source.source_article_id, after })
      if (page.coverage === 'partial') partialPages++
      for (const item of page.items) pairs.set(item.proposal_id, item)
      after = page.next_after
    } while (after)
  }
  const expected = session.manifest.admitted.length * (session.manifest.admitted.length - 1) / 2
  if (pairs.size !== expected) throw new Error('pair coverage mismatch')
  const items = [...pairs.values()].sort((a, b) => a.proposal_id.localeCompare(b.proposal_id))
  const proposals = items.filter(item => item.disposition === 'retrieval_proposal')
  return { contract: CONTRACT, manifest: session.manifest,
    inputs: session.manifest.admitted.map(source => session.input(source.source_article_id)),
    summary: { admitted: session.manifest.admitted.length, rejected: session.manifest.rejected.length,
      enumerated_pairs: pairs.size, expected_pairs: expected, partial_pages: partialPages,
      baseline_contract: 'capture-lexical-1', baseline_proposals: baseline.counts.retrieval_candidate ?? 0,
      context_proposals: proposals.length,
      needs_semantic_verification: proposals.filter(item => item.verification_state === 'needs_semantic_verification').length,
      insufficient_bound_context: proposals.filter(item => item.verification_state === 'insufficient_bound_context').length,
      precision: null, recall: null, semantic_accuracy: null, deployed: false }, items,
    interpretation: 'Private bounded diagnostic, not an adjudicated benchmark. Counts cannot establish accuracy or authorize publication.' }
}

export async function writePrivateResult(path, result) {
  // Exclusive creation avoids overwriting input files and refuses existing symlinks.
  const file = await open(path, 'wx', 0o600)
  try { await file.writeFile(JSON.stringify(result, null, 2) + '\n') } finally { await file.close() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [input, output, contextPath, ...extra] = process.argv.slice(2)
    if (!input || !output || extra.length) throw new Error('Usage: node scripts/runCaptureContextProposal.mjs private-input.json NEW-private-output.json [private-contexts.json]')
    const load = async path => {
      if ((await stat(path)).size > 32 * 1024 * 1024) throw new Error('input exceeds 32 MiB budget')
      return JSON.parse(await readFile(path, 'utf8'))
    }
    const result = await compareCaptureProposals(await load(input), contextPath ? await load(contextPath) : [])
    await writePrivateResult(output, result)
    console.log(JSON.stringify(result.summary))
  } catch {
    // Parser/SQL errors may embed source text. Keep diagnostics out of shared logs.
    console.error('Private evaluation failed. Check input shape, context spans and a new writable output path; inspect privately.')
    process.exitCode = 1
  }
}
