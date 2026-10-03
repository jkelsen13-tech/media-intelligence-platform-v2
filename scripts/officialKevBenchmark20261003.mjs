import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { ownerNewsContext } from '../tests/fixtures/newsStoryFixtures.mjs'
import { bindReplaySnapshot } from '../tests/fixtures/retainedNewsReplay20261003.mjs'
import { REPLAY_CONTRACT } from './retainedNewsReplay20261003.mjs'

const hash = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex')
const root = new URL('../verifier/corpus/2026-10-03/', import.meta.url)
export const OFFICIAL_KEV_MANIFEST_SHA256 = '0ba77e64879a53221ef953d0c08cdfa9b7c720e98969418f89e8dd2bf3ec1c2e'
const check = (condition, reason) => { if (!condition) throw new Error(reason) }
// The retained CSV contains quoted commas, escaped quotes and possible newline
// fields. Parse exact strings; only the parser's optional leading BOM is removed.
export function parseKevCatalog(bytes) {
  const input = Buffer.from(bytes).toString('utf8').replace(/^\uFEFF/, '')
  const rows = [], row = []
  let field = '', quoted = false, endedQuote = false
  for (let i = 0; i < input.length; i++) {
    const character = input[i]
    if (quoted) {
      if (character === '"' && input[i + 1] === '"') { field += '"'; i++ }
      else if (character === '"') { quoted = false; endedQuote = true }
      else field += character
    } else if (character === '"') {
      check(!field && !endedQuote, 'invalid_csv_quote'); quoted = true
    } else if (character === ',') { row.push(field); field = ''; endedQuote = false }
    else if (character === '\n' || character === '\r') {
      if (character === '\r' && input[i + 1] === '\n') i++
      row.push(field); rows.push([...row]); row.length = 0; field = ''; endedQuote = false
    } else { check(!endedQuote, 'characters_after_closed_csv_quote'); field += character }
  }
  check(!quoted, 'unterminated_csv_quote')
  if (field || row.length || endedQuote) { row.push(field); rows.push([...row]) }
  const header = rows.shift()
  check(header?.includes('cveID') && new Set(header).size === header.length, 'invalid_kev_header')
  const result = new Map()
  for (const values of rows) {
    if (values.length === 1 && values[0] === '') continue
    check(values.length === header.length, 'invalid_kev_row_width')
    const item = Object.fromEntries(header.map((key, index) => [key, values[index]]))
    check(/^CVE-\d{4}-\d+$/.test(item.cveID) && !result.has(item.cveID), 'invalid_or_duplicate_cve_id')
    result.set(item.cveID, item)
  }
  return result
}
export function diffKevCatalog(before, after) {
  const added = [], removed = [], changed = []
  let unchanged = 0
  for (const [id, row] of after) {
    const previous = before.get(id)
    if (!previous) { added.push(id); continue }
    const fields = Object.fromEntries(Object.keys(row).filter(key => row[key] !== previous[key]).map(key => [key, { before: previous[key], after: row[key] }]))
    if (Object.keys(fields).length) changed.push({ cveID: id, fields }); else unchanged++
  }
  for (const id of before.keys()) if (!after.has(id)) removed.push(id)
  added.sort(); removed.sort(); changed.sort((a, b) => a.cveID < b.cveID ? -1 : a.cveID > b.cveID ? 1 : 0)
  return { method: 'cisa-kev-exact-field-diff-2026-10-03-v1', before_rows: before.size, after_rows: after.size, added, removed, changed, unchanged_common_records: unchanged }
}

export async function loadOfficialKevBenchmark() {
  const manifestBytes = await readFile(new URL('retained-source-manifest.json', root)), manifest = JSON.parse(manifestBytes)
  check(hash(manifestBytes) === OFFICIAL_KEV_MANIFEST_SHA256, 'official_acquisition_manifest_pin_mismatch')
  check(manifest.schema_version === 'retained-official-corpus-v1' && manifest.records.length === 2, 'unexpected_official_corpus_shape')
  const rights = await readFile(new URL(manifest.rights.rights_retained_relative_path, root))
  const readme = await readFile(new URL(manifest.rights.provider_readme_relative_path, root))
  check(manifest.rights.license === 'CC0-1.0' && hash(rights) === manifest.rights.rights_sha256
    && hash(readme) === manifest.rights.provider_readme_sha256, 'rights_or_provider_receipt_digest_mismatch')
  const payloads = await Promise.all(manifest.records.map(async record => {
    const bytes = await readFile(new URL(record.retained_relative_path, root))
    check(bytes.length === record.byte_length && hash(bytes) === record.content_sha256, 'official_source_bytes_mismatch')
    const gitHash = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
    check(gitHash === record.git_blob_sha1, 'official_git_blob_digest_mismatch')
    const rows = parseKevCatalog(bytes)
    check(rows.size === record.row_count, 'official_row_count_mismatch')
    return { record, bytes, rows }
  }))
  check(manifest.records[1].parent_commit_sha === manifest.records[0].source_version, 'repository_revisions_not_direct_parent_child')
  const difference = diffKevCatalog(payloads[0].rows, payloads[1].rows)
  const reference = JSON.parse(await readFile(new URL('derived-material-diff.json', root)))
  check(JSON.stringify(difference.added) === JSON.stringify(reference.added_records.map(row => row.cveID))
    && JSON.stringify(difference.removed) === JSON.stringify(reference.removed_records.map(row => row.cveID))
    && difference.unchanged_common_records === reference.unchanged_common_records
    && JSON.stringify(difference.changed.map(row => ({ cveID: row.cveID, diff: row.fields }))) === JSON.stringify(reference.changed_records), 'independent_catalog_diff_mismatch')

  // This is an offline benchmark adapter reusing the existing owner fixtures.
  // No actual Story admission, historical review or material clock is invented.
  // Retrieval/review clocks are current. A separate missing-time control keeps
  // published_at null, since provider issue/availability time is unknown.
  function benchmark(missingTime) {
    const context = ownerNewsContext([{ at: 0 }, { at: 0 }], { report: true })
    const observed = manifest.records[1].retrieved_at_utc
    const sourceBytes = new Map()
    context.evidence_versions.forEach((member, index) => {
      const { record, bytes } = payloads[index]
      Object.assign(member, { capture_hash: record.content_sha256, source_url: record.source_url,
        source_outlet: 'CISA KEV official repository', title: 'CISA KEV catalog — retained repository revision',
        summary: 'Official catalog source report; offline benchmark review is simulated and no proposition is independently admitted.',
        published_at: missingTime ? null : record.repository_committed_at_utc,
        fetched_at: record.retrieved_at_utc, captured_at: record.retrieved_at_utc,
        reviewed_at: observed, visible_at: observed, reviewed_by: 'SIMULATED_OFFLINE_BENCHMARK',
        review_ref: 'simulated-cisa-source-report-review-2026-10-03', policy_version: 'simulated-cisa-source-report-v1',
        remaining_uncertainty: 'Actual issue, vulnerability event and canonical publication availability clocks are unknown. Repository commit clock is an explicit benchmark proxy only.',
        is_current_source_version: index === payloads.length - 1,
        superseded_by_public_version_id: index === 0 ? context.evidence_versions[1].public_version_id : null })
      sourceBytes.set(member.public_version_id, bytes)
      const change = context.material_changes[index]
      Object.assign(change, { effective_at: record.repository_committed_at_utc, declared_at: observed,
        kind: index ? 'update' : 'event_established', importance: 'material', novelty: 'genuinely_new', event_state: 'unresolved',
        reason: 'SIMULATED source-catalog declaration uses repository commit clock as a proxy; it does not assert vulnerability event time, materiality ground truth or historical MIP review.',
        review_refs: [member.review_ref], policy_version: 'simulated-cisa-catalog-declaration-v1' })
    })
    context.story.members = [context.evidence_versions.at(-1)]
    Object.assign(context.story, { reviewed_at: observed, visible_at: observed, reviewed_by: 'SIMULATED_OFFLINE_BENCHMARK',
      review_ref: 'simulated-cisa-source-report-review-2026-10-03', policy_version: 'simulated-cisa-source-report-v1' })
    const first = bindReplaySnapshot(context, observed, sourceBytes, manifest.rights.rights_url)
    first.source_receipts.forEach(receipt => { receipt.capture_binding_ref = `actual-repository-bytes:${hash(manifestBytes)}` })
    const later = structuredClone(first)
    later.observed_at = new Date(Date.parse(observed) + 2 * 3600000).toISOString()
    return { id: missingTime ? 'official-cisa-missing-issue-time' : 'official-cisa-late-retention-commit-clock-proxy',
      classification: 'retained_real_simulated_review', label_provenance: 'derived_benchmark_simulated_review',
      scenarios: missingTime ? ['missing_time', 'late_evidence'] : ['slow', 'late_evidence', 'repeated_fetch', 'stale_source_report'],
      chronology_ref: `actual-retained-cisa-manifest:${hash(manifestBytes)}`, label_review_ref: 'simulated-categorical-stale-or-missing-clock-constraint-v1',
      snapshots: [first, later], intervals: [{ from: observed, to: new Date(Date.parse(observed) + 4 * 3600000).toISOString(),
        allowed_states: ['UNAVAILABLE'], allowed_report_labels: ['SOURCE REPORT'], expected_material_change_id: context.material_changes.at(-1).material_change_id,
        review_ref: 'simulated-categorical-stale-or-missing-clock-constraint-v1' }] }
  }
  return { corpus: { contract: REPLAY_CONTRACT, cases: [benchmark(false), benchmark(true)] },
    receipt: { manifest_sha256: hash(manifestBytes), source_bytes: manifest.source_byte_count,
      records: manifest.records.map(record => ({ id: record.id, source_url: record.source_url, content_sha256: record.content_sha256, git_blob_sha1: record.git_blob_sha1,
        byte_length: record.byte_length, repository_committed_at_utc: record.repository_committed_at_utc, retrieved_at_utc: record.retrieved_at_utc,
        issued_at_utc: null, canonical_source_publication_available_at_utc: null })),
      repository_revision_interval_seconds: manifest.chronology.repository_revision_interval_seconds,
      rights: manifest.rights, observed_source_difference: difference,
      benchmark_authority: 'SIMULATED_TEST_AUTHORITY_ONLY', actual_mip_admissions: 0,
      clock_mapping: 'effective_at uses actual repository commit UTC only as explicitly simulated catalog-change proxy; declared/review/capture/fetch clocks use actual later retrieval; published_at is either explicit commit-clock proxy or null. No earlier MIP reader snapshot is synthesized.',
      labels: 'Categorical stale/unknown source-clock constraints; no numerical calibration or real materiality truth labels.',
      open_claims: manifest.open_or_excluded_claims } }
}
