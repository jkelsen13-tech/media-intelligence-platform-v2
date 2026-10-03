import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { readFile, mkdtemp, writeFile, copyFile, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { canonicalJson, parseCanonicalJson, snapshotCanonical } from '../scripts/qualification/backend-private-authority/canonical.mjs'
import { authoritySigningBytes, verifyCandidateAuthority } from '../scripts/qualification/backend-private-authority/verifier.mjs'
import { loadProductionAuthorityVerifier } from '../scripts/qualification/backend-private-authority/production.mjs'
import { ENVELOPE_VERSION, POLICY_VERSION, TARGET, SOURCE_HEAD, GUARDED_SOURCE_SHA256,
  BINDING_NAMES, FORWARD_PHASES, RECOVERY_PHASES } from '../scripts/qualification/backend-private-authority/contract.mjs'

// Ephemeral TEST FIXTURES ONLY. These are not credentials, accepted roots,
// owner attestations, reviewed evidence or live authority. No private key is saved.
function fixture() {
  const start = 1_000_000
  const signer = generateKeyPairSync('ed25519'), revoker = generateKeyPairSync('ed25519')
  const key = (keyId, issuer, pair, usages) => ({ keyId, issuer,
    publicKeySpkiBase64url: pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64url'),
    usages, notBeforeMs: start - 10000, notAfterMs: start + 20000 })
  const policy = { version: POLICY_VERSION, audience: 'TEST_ONLY_PRIVATE_HOST',
    authorizationKeyId: 'TEST_ONLY_AUTH', revocationKeyId: 'TEST_ONLY_REVOKER',
    bindingKeyIds: Object.fromEntries(BINDING_NAMES.map(name => [name, 'TEST_ONLY_AUTH'])),
    keys: [key('TEST_ONLY_AUTH', 'TEST_ONLY_EVIDENCE_ISSUER', signer,
      ['authorization', ...BINDING_NAMES.map(name => `binding:${name}`)]),
    key('TEST_ONLY_REVOKER', 'TEST_ONLY_REVOCATION_ISSUER', revoker, ['revocation'])],
    minRevocationGeneration: 7, maxAuthorizationAgeMs: 10000, maxBindingAgeMs: 10000,
    maxRevocationAgeMs: 10000, maxForwardWindowMs: 2000, maxRecoveryWindowMs: 4000 }
  const common = { issuer: 'TEST_ONLY_EVIDENCE_ISSUER', audience: policy.audience,
    authorizationId: 'TEST_ONLY_AUTHORIZATION', executorId: 'TEST_ONLY_EXECUTOR', clientId: 'TEST_ONLY_CLIENT',
    independentVerifierId: 'TEST_ONLY_DISTINCT_VERIFIER', target: structuredClone(TARGET),
    source: { frozenHead: SOURCE_HEAD, guardedOperationSha256: GUARDED_SOURCE_SHA256,
      sourceLockSha256: '1'.repeat(64), bundleSha256: '2'.repeat(64), manifestSha256: '3'.repeat(64),
      clientArtifactSha256: '4'.repeat(64), authorityArtifactSha256: '5'.repeat(64) },
    issuedAtMs: start - 100, notBeforeMs: start, notAfterMs: start + 2000,
    recoveryNotAfterMs: start + 6000, revocationGeneration: 7, nonce: 'TEST_ONLY_NONCE' }
  const bindingIds = Object.fromEntries(BINDING_NAMES.map((name, i) => [name, `TEST_ONLY_BINDING_${i}`]))
  const auth = { ...structuredClone(common), scope: { mode: 'single-attempt-single-transaction-rollback-only',
    forwardPhaseIds: [...FORWARD_PHASES], recoveryPhaseIds: [...RECOVERY_PHASES], bindingIds } }
  const bindings = [{ ...structuredClone(common), bindings: BINDING_NAMES.map(inputName => ({ inputName, bindingId: bindingIds[inputName] })) }]
  const rev = { issuer: 'TEST_ONLY_REVOCATION_ISSUER', audience: policy.audience, generation: 7,
    issuedAtMs: start - 10, notBeforeMs: start - 10, notAfterMs: start + 10000,
    revokedKeyIds: [], revokedAuthorizationIds: [], revokedBindingIds: [] }
  const context = { audience: common.audience, authorizationId: common.authorizationId, executorId: common.executorId,
    clientId: common.clientId, independentVerifierId: common.independentVerifierId, target: structuredClone(common.target),
    source: structuredClone(common.source), nonce: common.nonce, nowMs: start, phaseId: 'connect', mode: 'forward',
    executionWindow: { startMs: common.notBeforeMs, endMs: common.notAfterMs, recoveryEndMs: common.recoveryNotAfterMs } }
  return { policy, auth, bindings, rev, context, checkpoint: { nowMs: 0, revocationPayload: null },
    privateKeys: new Map([['TEST_ONLY_AUTH', signer.privateKey], ['TEST_ONLY_REVOKER', revoker.privateKey]]) }
}
function envelope(kind, payload, keyId, privateKey) {
  const unsigned = { version: ENVELOPE_VERSION, kind, keyId, payload }
  return canonicalJson({ ...unsigned, signature: sign(null, authoritySigningBytes(unsigned), privateKey).toString('base64url') })
}
function request(f) {
  return { authorizationEnvelope: envelope('authorization', f.auth, f.policy.authorizationKeyId, f.privateKeys.get(f.policy.authorizationKeyId)),
    bindingEnvelopes: f.bindings.map(payload => envelope('bindings', payload,
      f.policy.bindingKeyIds[payload.bindings[0].inputName], f.privateKeys.get(f.policy.bindingKeyIds[payload.bindings[0].inputName]))),
    revocationEnvelope: envelope('revocation', f.rev, f.policy.revocationKeyId, f.privateKeys.get(f.policy.revocationKeyId)),
    candidatePolicy: f.policy, context: f.context, checkpoint: f.checkpoint }
}
function result(f) { return verifyCandidateAuthority(request(f)) }
function valid(actual) {
  assert.deepEqual(actual, { code: 'CANDIDATE_CRYPTOGRAPHIC_CONTEXT_VALID', cryptographicValid: true,
    contextValid: true, trusted: false, liveAuthorized: false })
  assert.ok(Object.isFrozen(actual))
}
function refused(actual, expectedCode) {
  assert.equal(actual.contextValid, false)
  assert.equal(actual.trusted, false)
  assert.equal(actual.liveAuthorized, false)
  if (expectedCode) assert.equal(actual.code, expectedCode)
}

test('actual Ed25519 signatures verify one issuer covering all eleven exact names without granting trust', () => {
  valid(result(fixture()))
})
test('one evidence key can sign several scoped batches; no eleven-key owner requirement', () => {
  const f = fixture(), [all] = f.bindings
  f.bindings = [0, 4, 8].map((start, i) => ({ ...structuredClone(all), bindings: all.bindings.slice(start, i === 2 ? 11 : start + 4) }))
  valid(result(f))
})
test('several explicitly scoped evidence issuers can cover the eleven inputs', () => {
  const f = fixture(), [all] = f.bindings, extra = generateKeyPairSync('ed25519')
  const selected = BINDING_NAMES.slice(5)
  const keyId = 'TEST_ONLY_SECOND_EVIDENCE_KEY'
  f.policy.keys.push({ keyId, issuer: 'TEST_ONLY_SECOND_EVIDENCE_ISSUER',
    publicKeySpkiBase64url: extra.publicKey.export({ type: 'spki', format: 'der' }).toString('base64url'),
    usages: selected.map(name => `binding:${name}`), notBeforeMs: 990000, notAfterMs: 1020000 })
  f.privateKeys.set(keyId, extra.privateKey)
  for (const name of selected) f.policy.bindingKeyIds[name] = keyId
  f.bindings = [{ ...structuredClone(all), bindings: all.bindings.slice(0, 5) },
    { ...structuredClone(all), issuer: 'TEST_ONLY_SECOND_EVIDENCE_ISSUER', bindings: all.bindings.slice(5) }]
  valid(result(f))
  // A batch cannot enlarge the second issuer's exact per-input key authority.
  f.policy.bindingKeyIds[BINDING_NAMES[0]] = keyId
  refused(result(f), 'POLICY_REFUSED')
})
test('mathematical candidate format agrees with the frozen package eleven names and target', async () => {
  const source = JSON.parse(await readFile(new URL('../scripts/qualification/backend-live-rehearsal/required-inputs.json', import.meta.url), 'utf8'))
  assert.deepEqual(BINDING_NAMES, Object.keys(source.liveRequiredInputs))
  assert.deepEqual(TARGET, source.target)
  const protocol = JSON.parse(await readFile(new URL('../scripts/qualification/backend-live-rehearsal/submission-protocol.json', import.meta.url), 'utf8'))
  for (const phase of [...protocol.successPath, ...protocol.failurePath])
    assert.ok([...FORWARD_PHASES, ...RECOVERY_PHASES].includes(phase.commandId))
})
test('unsigned payload changes, wrong keys and fabricated signatures fail real verification', () => {
  const f = fixture(), original = request(f)
  const changed = parseCanonicalJson(original.authorizationEnvelope)
  changed.payload.nonce = 'TEST_ONLY_CHANGED'
  refused(verifyCandidateAuthority({ ...original, authorizationEnvelope: canonicalJson(changed) }), 'SIGNATURE_REFUSED')
  changed.payload.nonce = f.auth.nonce
  changed.signature = Buffer.alloc(64, 9).toString('base64url')
  refused(verifyCandidateAuthority({ ...original, authorizationEnvelope: canonicalJson(changed) }), 'SIGNATURE_REFUSED')
  const wrong = generateKeyPairSync('ed25519')
  refused(verifyCandidateAuthority({ ...original, authorizationEnvelope: envelope('authorization', f.auth,
    f.policy.authorizationKeyId, wrong.privateKey) }), 'SIGNATURE_REFUSED')
})
test('domain separation binds version, envelope kind and key ID in actual signed bytes', () => {
  const f = fixture(), input = request(f), e = parseCanonicalJson(input.authorizationEnvelope)
  const unsigned = { version: e.version, kind: e.kind, keyId: e.keyId, payload: e.payload }
  e.signature = sign(null, Buffer.from(canonicalJson(unsigned)), f.privateKeys.get(f.policy.authorizationKeyId)).toString('base64url')
  refused(verifyCandidateAuthority({ ...input, authorizationEnvelope: canonicalJson(e) }), 'SIGNATURE_REFUSED')
  for (const [name, value] of [['kind', 'bindings'], ['keyId', 'TEST_ONLY_OTHER'], ['version', 'qik-private-authority-envelope-2']]) {
    const changed = { ...parseCanonicalJson(input.authorizationEnvelope), [name]: value }
    refused(verifyCandidateAuthority({ ...input, authorizationEnvelope: canonicalJson(changed) }), 'KEY_SCOPE_REFUSED')
  }
})
test('fixed issuer, key lifecycle and usage constraints refuse delegation and key confusion', () => {
  let f = fixture()
  f.auth.issuer = 'TEST_ONLY_DIFFERENT_ISSUER'
  refused(result(f), 'KEY_SCOPE_REFUSED')
  f = fixture(); f.policy.keys[0].usages = ['authorization']
  refused(result(f), 'POLICY_REFUSED')
  f = fixture(); f.auth.delegatedKey = 'TEST_ONLY_EXTRA'
  refused(result(f), 'ENVELOPE_REFUSED')
  f = fixture(); f.policy.keys[0].notAfterMs = f.auth.recoveryNotAfterMs - 1
  refused(result(f), 'KEY_WINDOW_REFUSED')
  f = fixture(); f.policy.keys[0].notBeforeMs = f.auth.issuedAtMs + 1
  refused(result(f), 'KEY_WINDOW_REFUSED')
  f = fixture(); f.policy.keys[0].publicKeySpkiBase64url = generateKeyPairSync('x25519').publicKey.export({ format: 'der', type: 'spki' }).toString('base64url')
  refused(result(f), 'POLICY_REFUSED')
})
test('every exact audience/executor/client/verifier/target/source/bundle/manifest/nonce/window field is bound', () => {
  for (const name of ['audience', 'authorizationId', 'executorId', 'clientId', 'independentVerifierId', 'nonce']) {
    const f = fixture(); f.context[name] += '_OTHER'
    const actual = result(f)
    refused(actual, 'CONTEXT_REFUSED'); assert.equal(actual.cryptographicValid, true)
  }
  for (const name of Object.keys(TARGET)) {
    const f = fixture(); f.context.target[name] += '_OTHER'
    refused(result(f), 'CONTEXT_REFUSED')
  }
  for (const name of Object.keys(fixture().context.source)) {
    const f = fixture(); f.context.source[name] = 'a'.repeat(name === 'frozenHead' ? 40 : 64)
    refused(result(f), 'CONTEXT_REFUSED')
  }
  for (const name of ['startMs', 'endMs', 'recoveryEndMs']) {
    const f = fixture(); f.context.executionWindow[name]++
    refused(result(f), 'CONTEXT_REFUSED')
  }
  const f = fixture(); f.auth.target.project = 'TEST_ONLY_OTHER'
  refused(result(f), 'CONTEXT_REFUSED')
})
test('eleven bindings must be authenticated, exact, unique, scoped and bound to the same context', () => {
  let f = fixture(); f.bindings[0].bindings.pop()
  refused(result(f), 'BINDINGS_REFUSED')
  f = fixture(); f.bindings[0].bindings[1] = structuredClone(f.bindings[0].bindings[0])
  refused(result(f), 'BINDINGS_REFUSED')
  f = fixture(); f.bindings[0].bindings[0].bindingId = 'TEST_ONLY_WRONG'
  refused(result(f), 'BINDINGS_REFUSED')
  f = fixture(); f.bindings[0].nonce = 'TEST_ONLY_WRONG'
  refused(result(f), 'BINDINGS_REFUSED')
  f = fixture(); f.bindings[0].issuer = 'TEST_ONLY_WRONG'
  refused(result(f), 'KEY_SCOPE_REFUSED')
  f = fixture(); f.bindings[0].bindings[0].inputName = 'TEST_ONLY_NEW_INPUT'
  // Build the signed malformed batch without consulting a nonexistent policy key.
  const input = request(fixture())
  input.bindingEnvelopes = [envelope('bindings', f.bindings[0], 'TEST_ONLY_AUTH', f.privateKeys.get('TEST_ONLY_AUTH'))]
  refused(verifyCandidateAuthority(input), 'BINDINGS_REFUSED')
  f = fixture(); f.auth.scope.bindingIds = Object.fromEntries(BINDING_NAMES.map(name => [name, 'TEST_ONLY_REUSED']))
  refused(result(f), 'BINDINGS_REFUSED')
})
test('inclusive forward boundaries and each dependent phase recheck are explicit', () => {
  const f = fixture()
  for (const phase of FORWARD_PHASES) { f.context.phaseId = phase; valid(result(f)) }
  f.context.phaseId = 'connect'
  valid(result(f))
  f.context.nowMs = f.auth.notAfterMs; f.context.phaseId = 'guarded_operation'
  valid(result(f))
  f.context.nowMs++
  refused(result(f), 'FORWARD_WINDOW_REFUSED')
  for (const phase of FORWARD_PHASES) { f.context.phaseId = phase; refused(result(f), 'FORWARD_WINDOW_REFUSED') }
  f.context.nowMs = f.auth.notBeforeMs - 1
  refused(result(f), 'FORWARD_WINDOW_REFUSED')
  f.context.nowMs = f.auth.notBeforeMs; f.context.phaseId = 'COMMIT'
  refused(result(f), 'SCOPE_REFUSED')
  f.context.phaseId = 'rollback'
  refused(result(f), 'SCOPE_REFUSED')
  f.context.phaseId = 'guarded_operation'; f.auth.scope.forwardPhaseIds = ['connect']
  refused(result(f), 'SCOPE_REFUSED')
})
test('expired forward authority has a separate explicitly bounded recovery scope', () => {
  const f = fixture()
  f.context.nowMs = f.auth.notAfterMs + 1
  refused(result(f), 'FORWARD_WINDOW_REFUSED')
  f.context.mode = 'recovery'; f.context.phaseId = 'rollback'
  valid(result(f))
  for (const phase of RECOVERY_PHASES) { f.context.phaseId = phase; valid(result(f)) }
  f.context.phaseId = 'rollback'
  f.context.nowMs = f.auth.recoveryNotAfterMs
  valid(result(f))
  f.context.nowMs++
  refused(result(f), 'RECOVERY_WINDOW_REFUSED')
  for (const phase of RECOVERY_PHASES) { f.context.phaseId = phase; refused(result(f), 'RECOVERY_WINDOW_REFUSED') }
  f.context.nowMs--; f.context.phaseId = 'guarded_operation'
  refused(result(f), 'SCOPE_REFUSED')
  f.context.phaseId = 'rollback'; f.auth.scope.recoveryPhaseIds = ['verify_independently']
  refused(result(f), 'SCOPE_REFUSED')
})
test('freshness limits are inclusive for authorization, evidence and signed revocation', () => {
  let f = fixture(); f.policy.maxAuthorizationAgeMs = 100
  valid(result(f)); f.context.nowMs++
  refused(result(f), 'FRESHNESS_REFUSED')
  f = fixture(); f.policy.maxBindingAgeMs = 100
  valid(result(f)); f.context.nowMs++
  refused(result(f), 'FRESHNESS_REFUSED')
  f = fixture(); f.policy.maxRevocationAgeMs = 10
  valid(result(f)); f.context.nowMs++
  refused(result(f), 'REVOCATION_STALE_REFUSED')
  f = fixture(); f.rev.notAfterMs = f.context.nowMs
  valid(result(f)); f.context.nowMs++
  refused(result(f), 'REVOCATION_STALE_REFUSED')
  f = fixture(); f.rev.issuedAtMs = f.context.nowMs + 1; f.rev.notBeforeMs = f.rev.issuedAtMs
  refused(result(f), 'REVOCATION_STALE_REFUSED')
})
test('revocation of issuer key, authorization or any evidence binding refuses forward and recovery', () => {
  for (const [field, value] of [['revokedKeyIds', 'TEST_ONLY_AUTH'], ['revokedKeyIds', 'TEST_ONLY_REVOKER'],
    ['revokedAuthorizationIds', 'TEST_ONLY_AUTHORIZATION'], ['revokedBindingIds', 'TEST_ONLY_BINDING_5']]) {
    const f = fixture(); f.rev[field] = [value]
    refused(result(f), 'REVOKED')
    f.context.mode = 'recovery'; f.context.phaseId = 'rollback'; f.context.nowMs += 2001
    refused(result(f), 'REVOKED')
  }
})
test('private candidate checkpoint checks generation/time monotonicity and revocation continuity', () => {
  const f = fixture(); f.checkpoint = { nowMs: f.context.nowMs, revocationPayload: structuredClone(f.rev) }
  valid(result(f))
  f.context.nowMs--
  refused(result(f), 'FORWARD_WINDOW_REFUSED')
  f.context.nowMs += 2; f.checkpoint.nowMs = f.context.nowMs + 1
  refused(result(f), 'CLOCK_ROLLBACK_REFUSED')
  f.checkpoint.nowMs = f.context.nowMs - 1; f.rev.generation--
  refused(result(f), 'REVOCATION_ROLLBACK_REFUSED')
  f.rev.generation += 2
  refused(result(f), 'REVOCATION_ROLLBACK_REFUSED')
  f.rev.issuedAtMs++; f.rev.notBeforeMs++
  valid(result(f))
  f.checkpoint.revocationPayload.revokedKeyIds = ['TEST_ONLY_OLD_REVOKED_KEY']
  refused(result(f), 'REVOCATION_ROLLBACK_REFUSED')
  f.rev.revokedKeyIds = ['TEST_ONLY_OLD_REVOKED_KEY']
  valid(result(f))
  f.rev.generation = f.checkpoint.revocationPayload.generation
  refused(result(f), 'REVOCATION_ROLLBACK_REFUSED')
})
test('same-generation changed signed revocation state and below-policy generation are refused', () => {
  let f = fixture(); f.checkpoint.revocationPayload = structuredClone(f.rev)
  f.checkpoint.nowMs = f.context.nowMs
  f.rev.revokedBindingIds = ['TEST_ONLY_OTHER_BINDING']
  refused(result(f), 'REVOCATION_ROLLBACK_REFUSED')
  f = fixture(); f.policy.minRevocationGeneration++
  refused(result(f), 'REVOCATION_ROLLBACK_REFUSED')
})
test('an internally inconsistent private checkpoint is not accepted as prior observation', () => {
  const f = fixture(); f.checkpoint.revocationPayload = structuredClone(f.rev)
  refused(result(f), 'REQUEST_REFUSED')
})
test('canonical exact bytes reject duplicate keys, unknown fields, whitespace and alternative encodings', () => {
  const f = fixture(), input = request(f)
  for (const text of [input.authorizationEnvelope + '\n', ' ' + input.authorizationEnvelope,
    input.authorizationEnvelope.replace('"keyId":', '"keyId":"TEST_ONLY_AUTH","keyId":'),
    input.authorizationEnvelope.replace('1000000', '1e6'),
    input.authorizationEnvelope.replace('TEST_ONLY_AUTH', '\\u0054EST_ONLY_AUTH')]) {
    refused(verifyCandidateAuthority({ ...input, authorizationEnvelope: text }), 'CANONICAL_INPUT_REFUSED')
  }
  const extra = parseCanonicalJson(input.authorizationEnvelope); extra.extra = true
  refused(verifyCandidateAuthority({ ...input, authorizationEnvelope: canonicalJson(extra) }), 'ENVELOPE_REFUSED')
  assert.throws(() => parseCanonicalJson('{"__proto__":{}}'), /CANONICAL_INPUT_REFUSED/)
  assert.throws(() => parseCanonicalJson('{"x":-0}'), /CANONICAL_INPUT_REFUSED/)
  assert.throws(() => parseCanonicalJson('{"x":9007199254740992}'), /CANONICAL_INPUT_REFUSED/)
})
test('accessors/proxies/prototypes/cycles/sparse arrays and huge input are rejected without callbacks', () => {
  let reads = 0
  const accessor = { get candidatePolicy() { reads++; throw new Error('TEST_ONLY_SENSITIVE') } }
  refused(verifyCandidateAuthority(accessor), 'CANONICAL_INPUT_REFUSED')
  const proxy = new Proxy({}, { ownKeys() { reads++; throw new Error('TEST_ONLY_SENSITIVE') } })
  refused(verifyCandidateAuthority(proxy), 'CANONICAL_INPUT_REFUSED')
  assert.equal(reads, 0)
  for (const value of [Object.create({ inherited: true }), new Date(), [,], { x: NaN }, { x: Infinity },
    { x: -1 }, { x: 0.5 }, { x: 1n }, { x: '\ud800' }, { x: 'x'.repeat(65537) }])
    assert.throws(() => snapshotCanonical(value), /CANONICAL_INPUT_REFUSED/)
  const cycle = {}; cycle.self = cycle
  assert.throws(() => snapshotCanonical(cycle), /CANONICAL_INPUT_REFUSED/)
  const symbol = { [Symbol('x')]: 1 }
  assert.throws(() => snapshotCanonical(symbol), /CANONICAL_INPUT_REFUSED/)
  const hidden = {}; Object.defineProperty(hidden, 'x', { value: 1 })
  assert.throws(() => snapshotCanonical(hidden), /CANONICAL_INPUT_REFUSED/)
  let deep = 0; for (let i = 0; i < 18; i++) deep = { x: deep }
  assert.throws(() => snapshotCanonical(deep), /CANONICAL_INPUT_REFUSED/)
  const huge = Object.fromEntries(Array.from({ length: 129 }, (_, i) => [`x${i}`, 1]))
  assert.throws(() => snapshotCanonical(huge), /CANONICAL_INPUT_REFUSED/)
})
test('candidate result has fixed codes and booleans only, without signed or sensitive-derived output', () => {
  const f = fixture(), input = request(f)
  const expected = ['code', 'cryptographicValid', 'contextValid', 'trusted', 'liveAuthorized']
  for (const actual of [verifyCandidateAuthority(input), verifyCandidateAuthority({ ...input, context: { rawSecret: 'TEST_ONLY_SENTINEL' } })]) {
    assert.deepEqual(Object.keys(actual), expected)
    const text = JSON.stringify(actual)
    for (const value of [input.authorizationEnvelope, f.auth.nonce, f.auth.authorizationId,
      f.policy.keys[0].publicKeySpkiBase64url, 'TEST_ONLY_SENTINEL']) assert.equal(text.includes(value), false)
  }
})
test('production fixed registry is empty; candidate policies/callbacks never activate authority', async () => {
  const production = await loadProductionAuthorityVerifier()
  assert.equal(production.ready, false); assert.equal(production.acceptedRootCount, 0)
  refused(production.authorizePhase(request(fixture())), 'TRUST_ROOT_UNBOUND')
  refused(production.authorizePhase({ trusted: true, liveAuthorized: true }), 'TRUST_ROOT_UNBOUND')
  let invoked = 0
  const malicious = { get key() { invoked++; throw new Error('TEST_ONLY_SECRET') } }
  refused(production.authorizePhase(malicious), 'TRUST_ROOT_UNBOUND')
  const withInput = await loadProductionAuthorityVerifier({ candidatePolicy: fixture().policy })
  assert.equal(withInput.code, 'PRODUCTION_LOADER_INPUT_REFUSED')
  assert.equal(invoked, 0)
  const registry = JSON.parse(await readFile(new URL('../scripts/qualification/backend-private-authority/trust-registry.json', import.meta.url), 'utf8'))
  assert.deepEqual(registry.acceptedRoots, []); assert.equal(registry.status, 'unbound')
})
test('production loader refuses a modified registry and refuses unavailable registry source', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qik-authority-test-only-'))
  try {
    for (const name of ['production.mjs', 'canonical.mjs'])
      await copyFile(new URL(`../scripts/qualification/backend-private-authority/${name}`, import.meta.url), join(directory, name))
    await writeFile(join(directory, 'trust-registry.json'), canonicalJson({ acceptedRoots: ['TEST_ONLY_ROOT_CLAIM'], status: 'accepted' }) + '\n')
    const copy = await import(pathToFileURL(join(directory, 'production.mjs')).href)
    const drift = await copy.loadProductionAuthorityVerifier()
    assert.equal(drift.ready, false)
    refused(drift.authorizePhase(), 'PRODUCTION_REGISTRY_DRIFT_REFUSED')
    await rm(join(directory, 'trust-registry.json'))
    const missing = await copy.loadProductionAuthorityVerifier()
    refused(missing.authorizePhase(), 'PRODUCTION_REGISTRY_UNAVAILABLE')
  } finally { await rm(directory, { recursive: true, force: true }) }
})
test('operational CLI remains offline-only and inventories only public source hashes', () => {
  const cli = new URL('../scripts/qualification/backend-private-authority/inspect.mjs', import.meta.url)
  const inspect = spawnSync(process.execPath, [cli.pathname, '--inspect'], { encoding: 'utf8' })
  assert.equal(inspect.status, 0); assert.equal(inspect.stderr, '')
  const receipt = JSON.parse(inspect.stdout)
  assert.equal(receipt.code, 'TRUST_ROOT_UNBOUND'); assert.equal(receipt.liveAuthorized, false)
  assert.equal(receipt.publicSources.length, 6)
  assert.ok(receipt.publicSources.every(source => /^[a-f0-9]{64}$/.test(source.sha256)))
  const activate = spawnSync(process.execPath, [cli.pathname, '--activate'], { encoding: 'utf8' })
  assert.equal(activate.status, 2); assert.equal(JSON.parse(activate.stdout).code, 'OFFLINE_INSPECTION_ONLY')
})
