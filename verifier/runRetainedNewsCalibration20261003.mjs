import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { replayRetainedNewsCorpus, auditRetainedNewsSourceIndex } from '../scripts/retainedNewsReplay20261003.mjs'
import { retainedNewsRegressionCorpus } from '../tests/fixtures/retainedNewsReplay20261003.mjs'
import { loadOfficialKevBenchmark } from '../scripts/officialKevBenchmark20261003.mjs'

const indexes = ['verifier/research/google-news-project2025-doj-2025.json', 'verifier/research/project2025-trusted-2025-decoded-sequential.json', 'verifier/research/project2025-trusted-2026-decoded.json', 'verifier/research/february-2026/selected-candidates-decoded.json']
export async function runRetainedNewsCalibration20261003(corpus = retainedNewsRegressionCorpus()) {
  const inventory = await Promise.all(indexes.map(async path => auditRetainedNewsSourceIndex({ path, bytes: await readFile(new URL(`../${path}`, import.meta.url)) })))
  const seedInputs = await Promise.all(['verifier/v2_p2025_full_source_mapped_corpus_input.json', 'supabase/seeds/v2_p2025_full_source_mapped_corpus.sql'].map(async path => {
    const bytes = await readFile(new URL(`../${path}`, import.meta.url))
    return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), qualification: 'existing_source_mapped_metadata_and_named_actions_only' }
  }))
  const official = await loadOfficialKevBenchmark()
  return { date: '2026-10-03', baseline_commit: 'ca72a6df511bbb26c6b9e0a193a3e0baf01aa428', baseline_tree: 'cbcfc510a117101fd163f83b3c574dd979085b02',
    source_inventory: inventory, source_mapped_seed_scope: { publisher_metadata_records: 56, named_doj_primary_actions: 4, precision: 'date-only seed records; source index publication clocks are aggregator metadata', replay_eligible_cases: 0, inputs: seedInputs },
    official_source_receipt: official.receipt, replay: replayRetainedNewsCorpus({ ...corpus, cases: [...corpus.cases, ...official.corpus.cases] }) }
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const corpus = process.argv[2] ? JSON.parse(await readFile(process.argv[2], 'utf8')) : retainedNewsRegressionCorpus()
  console.log(JSON.stringify(await runRetainedNewsCalibration20261003(corpus), null, 2))
}
