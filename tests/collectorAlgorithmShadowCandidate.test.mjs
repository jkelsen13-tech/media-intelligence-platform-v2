import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash, randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {canonicalJson, deriveAlgorithmShadow, PREDECESSOR, runAlgorithmShadowWorker} from '../supabase/functions/collector-algorithm-shadow-candidate/worker.js'
import {durableShadowRpc, recoverShadowRequest, runDurableAlgorithmShadowWorker} from '../supabase/functions/collector-algorithm-shadow-candidate/durableWorker.js'
import {sanitize} from '../supabase/functions/collector-algorithm-shadow-candidate/predecessorV8.js'

const sha256 = value => createHash('sha256').update(value).digest('hex')
const xml = `<?xml version="1.0"?><rss><channel>
<item><title>Council &amp; Ministry Approve Water Plan</title><link>https://news.example/a</link>
<description><![CDATA[<p>Alex Smith said the official statement confirmed a public water plan after a long review.</p>]]></description>
<pubDate>Sun, 20 Sep 2026 12:00:00 GMT</pubDate><dc:creator>Jane Reporter</dc:creator></item>
<item><title>Brief update</title><link>/b</link><description>Short.</description></item>
</channel></rss>`
function input(overrides = {}) {
  const config = {...{citation_weights: {agency_release: 0.8, named_official: 0.7}, max_items: 1, outlet_names: ['News Example']}, ...(overrides.config ?? {})}
  const sourceBase = {...{project_ref: PREDECESSOR.source_project, source_id: 'fixture-feed', feed_url: 'https://news.example/feed.xml', observed_at: '2026-09-20T12:01:00Z', registry_revision: 'fixture-registry-v1'}, ...(overrides.source ?? {})}
  const sourceBinding = {project_ref: sourceBase.project_ref, source_id: sourceBase.source_id, feed_url: sourceBase.feed_url, registry_revision: sourceBase.registry_revision}
  const source = {...sourceBase, binding_sha256: sha256(canonicalJson(sourceBinding))}
  const rightsBase = {...{visibility: 'public', basis: 'public-feed-fixture', policy_version: 'rights-v1', approval_id: 'fixture-approval-v1'}, ...(overrides.rights ?? {})}
  const rights = {...rightsBase, envelope_sha256: sha256(canonicalJson(rightsBase))}
  const payloadText = overrides.payload?.text ?? xml
  const payload = {...{content_type: 'application/rss+xml', text: payloadText, sha256: sha256(payloadText)}, ...(overrides.payload ?? {})}
  const method = {...{adapter: PREDECESSOR.adapter, edge_package_sha256: PREDECESSOR.edge_package_sha256,
    normalized_source_sha256: PREDECESSOR.normalized_source_sha256, provider_state: 'disabled', config_snapshot_sha256: sha256(canonicalJson(config))}, ...(overrides.method ?? {})}
  return {version: 1, source, payload, rights, method, config,
    knowledge_change: overrides.knowledge_change ?? {cause: 'new_relevant_evidence', prior_revision: null}, ...overrides,
    source, payload, rights, method, config}
}
const requestIds = () => { const ids = new Map(); return label => ids.has(label) ? ids.get(label) : (ids.set(label, randomUUID()), ids.get(label)) }

test('candidate seams pass the repository sanitization golden corpus', async () => {
  const fixtures = JSON.parse(await readFile(new URL('./golden/fixtures/sanitization.json', import.meta.url), 'utf8'))
  for (const fixture of fixtures.cases) {
    const result = sanitize(fixture.input)
    assert.equal(result.text, fixture.expect, fixture.name)
    if (fixture.expectImageUrl !== undefined) assert.equal(result.imageUrl, fixture.expectImageUrl, fixture.name)
    if (fixture.expectImageAlt !== undefined) assert.equal(result.imageAlt, fixture.expectImageAlt, fixture.name)
  }
})

test('network-free shadow derives deterministic staged candidates with typed coverage and declared-only effects', async () => {
  const first = await deriveAlgorithmShadow(input(), sha256)
  const second = await deriveAlgorithmShadow(input(), sha256)
  assert.deepEqual(first, second)
  assert.equal(first.output_sha256.length, 64)
  assert.equal(first.coverage.parsed_items, 2)
  assert.equal(first.coverage.evaluated_items, 1)
  assert.equal(first.coverage.remaining_state, 'coverage_incomplete')
  assert.equal(first.method.provider_result, 'disabled')
  assert.equal(first.method.qualification, 'unverified_host_assertions')
  assert.ok(first.items[0].candidates.citations.some(row => row.cited_type === 'agency_release'))
  assert.ok(first.items[0].candidates.entities.some(row => row.normalized_name === 'alex smith'))
  assert.equal(first.items[0].taint.promotion_eligible, false)
  assert.equal(first.declared_effect_scope.evidence_status, 'requires_independent_host_and_database_audit')
})

test('empty heuristic outputs remain not_extracted rather than generic missing or negative evidence', async () => {
  const quiet = xml.replace('Alex Smith said the official statement confirmed a public water plan after a long review.', 'A brief note.')
  const result = await deriveAlgorithmShadow(input({payload: {text: quiet}, config: {citation_weights: {}, max_items: 2, outlet_names: []}}), sha256)
  assert.equal(result.items[1].absence.citations, 'not_extracted')
  assert.equal(result.items[1].absence.claims, 'not_extracted')
  assert.equal(result.items[1].absence.entities, 'not_extracted')
  assert.doesNotMatch(JSON.stringify(result), /not_reported_in_examined_source|not_present_in_retained_evidence|"missing"/)
})

test('malformed or unsupported text fails rather than reporting complete coverage', async () => {
  await assert.rejects(deriveAlgorithmShadow(input({payload: {text: 'not xml'}}), sha256), /mip_shadow_unsupported_or_malformed_feed/)
  await assert.rejects(deriveAlgorithmShadow(input({payload: {text: '<rss><item></rss>'}}), sha256), /mip_shadow_unsupported_or_malformed_feed/)
  await assert.rejects(deriveAlgorithmShadow(input({payload: {text: '<rss></rss><rss></rss>'}}), sha256), /mip_shadow_unsupported_or_malformed_feed/)
})

test('unsafe parsed URLs are quarantined and never presented as promotion eligible', async () => {
  const unsafe = '<rss><channel><item><title>Unsafe candidate</title><link>javascript:alert(1)</link><description>Alex Smith said this sufficiently long candidate sentence for extraction.</description></item></channel></rss>'
  const result = await deriveAlgorithmShadow(input({payload: {text: unsafe}}), sha256)
  assert.equal(result.items[0].disposition, 'quarantined_unsafe_url')
  assert.equal(result.items[0].taint.article_url, 'quarantined_unsafe_scheme')
  assert.equal(result.items[0].taint.promotion_eligible, false)
  assert.deepEqual(result.items[0].candidates, {citations: [], claims: [], entities: []})
})

test('canonical output digest is insensitive to nested key insertion order', async () => {
  const normal = input()
  const reordered = structuredClone(normal)
  reordered.source = {binding_sha256: normal.source.binding_sha256, registry_revision: normal.source.registry_revision,
    observed_at: normal.source.observed_at, feed_url: normal.source.feed_url, source_id: normal.source.source_id, project_ref: normal.source.project_ref}
  const [a, b] = await Promise.all([deriveAlgorithmShadow(normal, sha256), deriveAlgorithmShadow(reordered, sha256)])
  assert.equal(a.output_sha256, b.output_sha256)
})

test('input gate rejects unsafe source, rights, provider, payload, shape, and knowledge bindings', async () => {
  const badPayload = input(); badPayload.payload.sha256 = '0'.repeat(64)
  const badShape = input(); badShape.unexpected = true
  const cases = [input({source: {feed_url: 'http://news.example/feed.xml'}}), input({rights: {visibility: 'private'}}),
    input({method: {provider_state: 'enabled'}}), badPayload,
    input({knowledge_change: {cause: 'generic_change', prior_revision: null}}), badShape]
  for (const value of cases) await assert.rejects(deriveAlgorithmShadow(value, sha256), /mip_shadow_/)
})

test('candidate source has no ambient database, service-role, environment, network, or provider path', async () => {
  const files = await Promise.all(['worker.js','durableWorker.js','predecessorV8.js'].map(name =>
    readFile(new URL(`../supabase/functions/collector-algorithm-shadow-candidate/${name}`, import.meta.url), 'utf8')))
  const source = files.join('\n')
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|createClient|Deno\.env|process\.env|\.from\(|fetch\s*\(|NER_API|HF_API|cron\.schedule|net\.http/)
})

test('worker uses unique request IDs, typed failure, dedicated capabilities, and exact completion retry', async () => {
  const retained = JSON.stringify(input())
  const claim = {generation_id: randomUUID(), lease_token: randomUUID(), input_hash: sha256(retained), input_text: retained, implementation_ref: PREDECESSOR.adapter}
  const calls = []; let lose = true
  const rpc = async (operation, args) => {
    calls.push({operation, args: structuredClone(args)})
    if (operation === 'shadow_claim') return claim
    if (operation === 'shadow_complete' && lose) { lose = false; throw new Error('lost response') }
    return operation === 'shadow_complete' ? 'completed' : 'failed'
  }
  const result = await runAlgorithmShadowWorker({rpc, requestId: requestIds(), session: 'session', runtime: 'runtime', implementation: PREDECESSOR.adapter, sha256})
  assert.equal(result.state, 'completion_unconfirmed')
  const completion = calls.find(call => call.operation === 'shadow_complete').args
  assert.equal(await result.retry(), 'completed')
  assert.deepEqual(calls.filter(call => call.operation === 'shadow_complete')[1].args, completion)
  assert.equal(new Set(calls.slice(0, 2).map(call => call.args.p_request)).size, 2)
  await assert.rejects(runAlgorithmShadowWorker({rpc, requestId: () => 'not-a-uuid', session: 's', runtime: 'r', implementation: PREDECESSOR.adapter, sha256}), /mip_shadow_request_id_binding/)
})

test('worker preserves a bounded typed parser failure for operational diagnosis', async () => {
  const malformed = input({payload: {text: 'not xml'}})
  const retained = JSON.stringify(malformed)
  const claim = {generation_id: randomUUID(), lease_token: randomUUID(), input_hash: sha256(retained), input_text: retained, implementation_ref: PREDECESSOR.adapter}
  let failure
  const rpc = async (operation, args) => {
    if (operation === 'shadow_claim') return claim
    if (operation === 'shadow_fail') { failure = structuredClone(args); return 'failed' }
    throw new Error('unexpected operation')
  }
  const result = await runAlgorithmShadowWorker({rpc, requestId: requestIds(), session: 'session', runtime: 'runtime', implementation: PREDECESSOR.adapter, sha256})
  assert.equal(result.state, 'failed')
  assert.equal(failure.p_failure_code, 'mip_shadow_unsupported_or_malformed_feed')
  assert.doesNotMatch(JSON.stringify(failure), /not xml/)

  const oversized = 'x'.repeat(2_100_001); let sizeFailure
  const oversizedRpc = async (operation, args) => {
    if (operation === 'shadow_claim') return {...claim, input_text: oversized, input_hash: sha256(oversized)}
    if (operation === 'shadow_fail') { sizeFailure = structuredClone(args); return 'failed' }
    throw new Error('unexpected operation')
  }
  assert.equal((await runAlgorithmShadowWorker({rpc: oversizedRpc, requestId: requestIds(), session: 'session', runtime: 'runtime', implementation: PREDECESSOR.adapter, sha256})).state, 'failed')
  assert.equal(sizeFailure.p_failure_code, 'mip_shadow_retained_input_size')
})

function journal() {
  const rows = new Map(); let securityAssertions = 0
  return {rows, get securityAssertions() { return securityAssertions }, assertSecurity(required) {
    assert.deepEqual(required, {access_controlled: true, encrypted_at_rest: true, lease_tokens_redacted_from_logs: true, explicit_retention_policy: true}); securityAssertions++
  }, async get(key) { return structuredClone(rows.get(key)) }, async putOnce(key, value) {
    if (rows.has(key)) assert.deepEqual(rows.get(key), value); else rows.set(key, structuredClone(value))
  }}
}

test('remote journal declares security requirements, precedes calls, and recovers with fresh current authority', async () => {
  const retained = JSON.stringify(input())
  const claim = {generation_id: randomUUID(), lease_token: randomUUID(), input_hash: sha256(retained), input_text: retained, implementation_ref: PREDECESSOR.adapter}
  const stored = journal(); let lose = true
  const rpc = async operation => {
    if (operation === 'shadow_claim') return claim
    if (operation === 'shadow_complete' && lose) { lose = false; throw new Error('lost response') }
    return 'completed'
  }
  const result = await runDurableAlgorithmShadowWorker({rpc, journal: stored, runtime: 'runtime', session: 'old-session',
    implementation: PREDECESSOR.adapter, sha256, requestId: requestIds()})
  assert.equal(result.state, 'completion_unconfirmed')
  const key = [...stored.rows.keys()].find(value => value.startsWith('shadow_complete:') && !value.endsWith(':receipt'))
  assert.ok(key); assert.equal(Object.hasOwn(stored.rows.get(key).args, 'p_session'), false)
  assert.equal(await recoverShadowRequest({rpc, journal: stored, runtime: 'runtime', session: 'fresh-session', key}), 'completed')
  assert.ok(stored.securityAssertions >= 2)
  await assert.rejects(recoverShadowRequest({rpc, journal: stored, runtime: 'other-runtime', session: 'fresh-session', key}), /mip_shadow_recovery_binding/)
})

test('missing security assertion or journal failure prevents any capability call', async () => {
  let calls = 0
  assert.throws(() => durableShadowRpc({rpc: async () => null, runtime: 'runtime', session: 'session', journal: {get: async () => null, putOnce: async () => {}}}), /mip_remote_journal_required/)
  const rpc = durableShadowRpc({rpc: async () => { calls++; return null }, runtime: 'runtime', session: 'session',
    journal: {assertSecurity() {}, get: async () => null, putOnce: async () => { throw new Error('journal unavailable') }}})
  await assert.rejects(rpc('shadow_claim', {p_request: randomUUID(), p_runtime: 'runtime', p_session: 'session'}), /journal unavailable/)
  assert.equal(calls, 0)
})
