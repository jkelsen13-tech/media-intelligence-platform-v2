// PURE SOURCE/TEST API. Candidate roots and caller clocks are not accepted trust.
// No network, credentials, private baselines, providers, callbacks or persistence.
import { createPublicKey, verify } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { canonicalJson, snapshotCanonical, parseCanonicalJson, exactKeys } from './canonical.mjs'
import { ENVELOPE_VERSION, POLICY_VERSION, TARGET, SOURCE_HEAD, GUARDED_SOURCE_SHA256,
  BINDING_NAMES, FORWARD_PHASES, RECOVERY_PHASES, SOURCE_FIELDS } from './contract.mjs'

const DOMAIN = Buffer.from('MIP-QIK-PRIVATE-AUTHORITY-1\0', 'ascii')
const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex')
const COMMON_FIELDS = ['issuer', 'audience', 'authorizationId', 'executorId', 'clientId',
  'independentVerifierId', 'target', 'source', 'issuedAtMs', 'notBeforeMs', 'notAfterMs',
  'recoveryNotAfterMs', 'revocationGeneration', 'nonce']
const REVOCATION_FIELDS = ['issuer', 'audience', 'generation', 'issuedAtMs', 'notBeforeMs',
  'notAfterMs', 'revokedKeyIds', 'revokedAuthorizationIds', 'revokedBindingIds']
const REFUSAL_CODES = new Set(['CANONICAL_INPUT_REFUSED', 'REQUEST_REFUSED', 'POLICY_REFUSED',
  'ENVELOPE_REFUSED', 'KEY_SCOPE_REFUSED', 'SIGNATURE_REFUSED', 'CONTEXT_REFUSED',
  'SCOPE_REFUSED', 'BINDINGS_REFUSED', 'CLOCK_ROLLBACK_REFUSED', 'REVOCATION_ROLLBACK_REFUSED',
  'REVOCATION_STALE_REFUSED', 'REVOKED', 'FORWARD_WINDOW_REFUSED', 'RECOVERY_WINDOW_REFUSED',
  'FRESHNESS_REFUSED', 'KEY_WINDOW_REFUSED'])
class Refusal extends Error { constructor(code) { super(code); this.code = code } }
const fail = code => { throw new Refusal(code) }
const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(value)
const integer = value => Number.isSafeInteger(value) && value >= 0
const keys = (value, expected, code) => { if (!exactKeys(value, expected)) fail(code) }
const same = (a, b, code) => { if (!isDeepStrictEqual(a, b)) fail(code) }
function uniqueIds(array, code) {
  if (!Array.isArray(array) || array.length > 64 || array.some(item => !id(item))
    || new Set(array).size !== array.length) fail(code)
}
function base64url(value, length, code) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) fail(code)
  const bytes = Buffer.from(value, 'base64url')
  if (bytes.length !== length || bytes.toString('base64url') !== value) fail(code)
  return bytes
}

export function authoritySigningBytes(unsignedEnvelope) {
  const bound = snapshotCanonical(unsignedEnvelope)
  keys(bound, ['version', 'kind', 'keyId', 'payload'], 'ENVELOPE_REFUSED')
  if (bound.version !== ENVELOPE_VERSION || !['authorization', 'bindings', 'revocation'].includes(bound.kind)
    || !id(bound.keyId)) fail('ENVELOPE_REFUSED')
  return Buffer.concat([DOMAIN, Buffer.from(canonicalJson(bound), 'utf8')])
}

function validatePolicy(policy) {
  keys(policy, ['version', 'audience', 'authorizationKeyId', 'revocationKeyId', 'bindingKeyIds',
    'keys', 'minRevocationGeneration', 'maxAuthorizationAgeMs', 'maxBindingAgeMs', 'maxRevocationAgeMs',
    'maxForwardWindowMs', 'maxRecoveryWindowMs'], 'POLICY_REFUSED')
  if (policy.version !== POLICY_VERSION || !id(policy.audience) || !id(policy.authorizationKeyId)
    || !id(policy.revocationKeyId) || !integer(policy.minRevocationGeneration)
    || !Array.isArray(policy.keys) || policy.keys.length < 1 || policy.keys.length > 16) fail('POLICY_REFUSED')
  keys(policy.bindingKeyIds, BINDING_NAMES, 'POLICY_REFUSED')
  if (Object.values(policy.bindingKeyIds).some(value => !id(value))) fail('POLICY_REFUSED')
  for (const name of ['maxAuthorizationAgeMs', 'maxBindingAgeMs', 'maxRevocationAgeMs', 'maxForwardWindowMs', 'maxRecoveryWindowMs']) {
    const cap = name === 'maxRecoveryWindowMs' ? 86400000 : 3600000
    if (!integer(policy[name]) || policy[name] < 1 || policy[name] > cap) fail('POLICY_REFUSED')
  }
  const keyMap = new Map()
  for (const key of policy.keys) {
    keys(key, ['keyId', 'issuer', 'publicKeySpkiBase64url', 'usages', 'notBeforeMs', 'notAfterMs'], 'POLICY_REFUSED')
    if (!id(key.keyId) || !id(key.issuer) || keyMap.has(key.keyId) || !integer(key.notBeforeMs)
      || !integer(key.notAfterMs) || key.notAfterMs < key.notBeforeMs) fail('POLICY_REFUSED')
    uniqueIds(key.usages, 'POLICY_REFUSED')
    const permitted = ['authorization', 'revocation', ...BINDING_NAMES.map(name => `binding:${name}`)]
    if (!key.usages.length || key.usages.some(usage => !permitted.includes(usage))) fail('POLICY_REFUSED')
    const der = base64url(key.publicKeySpkiBase64url, 44, 'POLICY_REFUSED')
    if (!der.subarray(0, 12).equals(SPKI_PREFIX)) fail('POLICY_REFUSED')
    let publicKey
    try { publicKey = createPublicKey({ key: der, type: 'spki', format: 'der' }) } catch { fail('POLICY_REFUSED') }
    if (publicKey.type !== 'public' || publicKey.asymmetricKeyType !== 'ed25519'
      || !publicKey.export({ type: 'spki', format: 'der' }).equals(der)) fail('POLICY_REFUSED')
    keyMap.set(key.keyId, { ...key, publicKey })
  }
  for (const [keyId, usage] of [[policy.authorizationKeyId, 'authorization'], [policy.revocationKeyId, 'revocation'],
    ...BINDING_NAMES.map(name => [policy.bindingKeyIds[name], `binding:${name}`])]) {
    if (!keyMap.get(keyId)?.usages.includes(usage)) fail('POLICY_REFUSED')
  }
  return keyMap
}

function signedEnvelope(text, kind, keyMap, expectedKeyId, usages) {
  const envelope = parseCanonicalJson(text)
  keys(envelope, ['version', 'kind', 'keyId', 'payload', 'signature'], 'ENVELOPE_REFUSED')
  if (envelope.version !== ENVELOPE_VERSION || envelope.kind !== kind || !id(envelope.keyId)
    || envelope.keyId !== expectedKeyId) fail('KEY_SCOPE_REFUSED')
  const key = keyMap.get(envelope.keyId)
  if (!key || usages.some(usage => !key.usages.includes(usage))
    || envelope.payload?.issuer !== key.issuer) fail('KEY_SCOPE_REFUSED')
  const signature = base64url(envelope.signature, 64, 'SIGNATURE_REFUSED')
  const { signature: ignored, ...unsigned } = envelope
  if (!verify(null, authoritySigningBytes(unsigned), key.publicKey, signature)) fail('SIGNATURE_REFUSED')
  return { payload: envelope.payload, key }
}

function validateSource(source) {
  keys(source, SOURCE_FIELDS, 'CONTEXT_REFUSED')
  if (source.frozenHead !== SOURCE_HEAD || source.guardedOperationSha256 !== GUARDED_SOURCE_SHA256
    || SOURCE_FIELDS.filter(name => name !== 'frozenHead').some(name => !/^[a-f0-9]{64}$/.test(source[name]))) fail('CONTEXT_REFUSED')
}
function validateCommon(payload) {
  for (const name of ['issuer', 'audience', 'authorizationId', 'executorId', 'clientId', 'independentVerifierId', 'nonce']) {
    if (!id(payload[name])) fail('CONTEXT_REFUSED')
  }
  if (payload.independentVerifierId === payload.executorId) fail('CONTEXT_REFUSED')
  same(payload.target, TARGET, 'CONTEXT_REFUSED')
  validateSource(payload.source)
  for (const name of ['issuedAtMs', 'notBeforeMs', 'notAfterMs', 'recoveryNotAfterMs', 'revocationGeneration']) {
    if (!integer(payload[name])) fail('CONTEXT_REFUSED')
  }
  if (payload.issuedAtMs > payload.notBeforeMs || payload.notBeforeMs > payload.notAfterMs
    || payload.notAfterMs > payload.recoveryNotAfterMs) fail('CONTEXT_REFUSED')
}
function validateRevocation(payload) {
  keys(payload, REVOCATION_FIELDS, 'ENVELOPE_REFUSED')
  if (!id(payload.issuer) || !id(payload.audience)
    || ['generation', 'issuedAtMs', 'notBeforeMs', 'notAfterMs'].some(name => !integer(payload[name]))
    || payload.issuedAtMs > payload.notBeforeMs || payload.notBeforeMs > payload.notAfterMs) fail('ENVELOPE_REFUSED')
  for (const name of ['revokedKeyIds', 'revokedAuthorizationIds', 'revokedBindingIds']) uniqueIds(payload[name], 'ENVELOPE_REFUSED')
}
function validatePhaseScope(scope) {
  keys(scope, ['mode', 'forwardPhaseIds', 'recoveryPhaseIds', 'bindingIds'], 'SCOPE_REFUSED')
  if (scope.mode !== 'single-attempt-single-transaction-rollback-only') fail('SCOPE_REFUSED')
  uniqueIds(scope.forwardPhaseIds, 'SCOPE_REFUSED'); uniqueIds(scope.recoveryPhaseIds, 'SCOPE_REFUSED')
  if (!scope.forwardPhaseIds.length || !scope.recoveryPhaseIds.length
    || scope.forwardPhaseIds.some(phase => !FORWARD_PHASES.includes(phase))
    || scope.recoveryPhaseIds.some(phase => !RECOVERY_PHASES.includes(phase))) fail('SCOPE_REFUSED')
  keys(scope.bindingIds, BINDING_NAMES, 'BINDINGS_REFUSED')
  const values = Object.values(scope.bindingIds)
  if (values.some(value => !id(value)) || new Set(values).size !== BINDING_NAMES.length) fail('BINDINGS_REFUSED')
}
function withinKey(key, payload, nowMs) {
  if (payload.issuedAtMs < key.notBeforeMs || payload.recoveryNotAfterMs > key.notAfterMs
    || nowMs < key.notBeforeMs || nowMs > key.notAfterMs) fail('KEY_WINDOW_REFUSED')
}

export function verifyCandidateAuthority(request) {
  let cryptographicValid = false
  try {
    const bound = snapshotCanonical(request)
    keys(bound, ['authorizationEnvelope', 'bindingEnvelopes', 'revocationEnvelope', 'candidatePolicy', 'context', 'checkpoint'], 'REQUEST_REFUSED')
    const { candidatePolicy: policy, context, checkpoint } = bound
    const keyMap = validatePolicy(policy)
    if (!Array.isArray(bound.bindingEnvelopes) || bound.bindingEnvelopes.length < 1
      || bound.bindingEnvelopes.length > BINDING_NAMES.length) fail('BINDINGS_REFUSED')
    const authorization = signedEnvelope(bound.authorizationEnvelope, 'authorization', keyMap, policy.authorizationKeyId, ['authorization'])
    const revocation = signedEnvelope(bound.revocationEnvelope, 'revocation', keyMap, policy.revocationKeyId, ['revocation'])
    const auth = authorization.payload, rev = revocation.payload
    keys(auth, [...COMMON_FIELDS, 'scope'], 'ENVELOPE_REFUSED')
    validateCommon(auth); validatePhaseScope(auth.scope); validateRevocation(rev)
    const evidence = [], foundBindings = new Set()
    for (const text of bound.bindingEnvelopes) {
      const unverified = parseCanonicalJson(text)
      keys(unverified, ['version', 'kind', 'keyId', 'payload', 'signature'], 'ENVELOPE_REFUSED')
      keys(unverified.payload, [...COMMON_FIELDS, 'bindings'], 'ENVELOPE_REFUSED')
      const bindings = unverified.payload.bindings
      if (!Array.isArray(bindings) || !bindings.length || bindings.length > BINDING_NAMES.length) fail('BINDINGS_REFUSED')
      let expectedKeyId
      const usages = []
      for (const binding of bindings) {
        keys(binding, ['inputName', 'bindingId'], 'BINDINGS_REFUSED')
        if (!BINDING_NAMES.includes(binding.inputName) || foundBindings.has(binding.inputName)
          || binding.bindingId !== auth.scope.bindingIds[binding.inputName]) fail('BINDINGS_REFUSED')
        foundBindings.add(binding.inputName)
        const keyId = policy.bindingKeyIds[binding.inputName]
        if (expectedKeyId && expectedKeyId !== keyId) fail('KEY_SCOPE_REFUSED')
        expectedKeyId = keyId; usages.push(`binding:${binding.inputName}`)
      }
      evidence.push(signedEnvelope(text, 'bindings', keyMap, expectedKeyId, usages))
    }
    if (foundBindings.size !== BINDING_NAMES.length) fail('BINDINGS_REFUSED')
    cryptographicValid = true

    keys(context, ['audience', 'authorizationId', 'executorId', 'clientId', 'independentVerifierId',
      'target', 'source', 'nonce', 'nowMs', 'phaseId', 'mode', 'executionWindow'], 'CONTEXT_REFUSED')
    keys(context.executionWindow, ['startMs', 'endMs', 'recoveryEndMs'], 'CONTEXT_REFUSED')
    if (!integer(context.nowMs) || !id(context.phaseId) || !['forward', 'recovery'].includes(context.mode)) fail('CONTEXT_REFUSED')
    if (auth.audience !== policy.audience || rev.audience !== policy.audience) fail('CONTEXT_REFUSED')
    for (const name of ['audience', 'authorizationId', 'executorId', 'clientId', 'independentVerifierId', 'target', 'source', 'nonce']) same(context[name], auth[name], 'CONTEXT_REFUSED')
    same(context.executionWindow, { startMs: auth.notBeforeMs, endMs: auth.notAfterMs, recoveryEndMs: auth.recoveryNotAfterMs }, 'CONTEXT_REFUSED')
    if (auth.notAfterMs - auth.notBeforeMs > policy.maxForwardWindowMs
      || auth.recoveryNotAfterMs - auth.notAfterMs > policy.maxRecoveryWindowMs) fail('SCOPE_REFUSED')
    const phaseList = context.mode === 'forward' ? auth.scope.forwardPhaseIds : auth.scope.recoveryPhaseIds
    if (!phaseList.includes(context.phaseId)) fail('SCOPE_REFUSED')
    const now = context.nowMs
    if (now < auth.notBeforeMs || (context.mode === 'forward' && now > auth.notAfterMs)) fail('FORWARD_WINDOW_REFUSED')
    if (context.mode === 'recovery' && now > auth.recoveryNotAfterMs) fail('RECOVERY_WINDOW_REFUSED')
    const recoveryAllowance = context.mode === 'recovery' ? policy.maxRecoveryWindowMs : 0
    if (auth.issuedAtMs > now || now - auth.issuedAtMs > policy.maxAuthorizationAgeMs + recoveryAllowance) fail('FRESHNESS_REFUSED')
    withinKey(authorization.key, auth, now)
    for (const item of evidence) {
      const payload = item.payload
      validateCommon(payload)
      for (const name of COMMON_FIELDS.filter(name => !['issuer', 'issuedAtMs'].includes(name))) same(payload[name], auth[name], 'BINDINGS_REFUSED')
      if (payload.issuedAtMs > now || now - payload.issuedAtMs > policy.maxBindingAgeMs + recoveryAllowance) fail('FRESHNESS_REFUSED')
      withinKey(item.key, payload, now)
    }
    keys(checkpoint, ['nowMs', 'revocationPayload'], 'REQUEST_REFUSED')
    if (!integer(checkpoint.nowMs) || now < checkpoint.nowMs) fail('CLOCK_ROLLBACK_REFUSED')
    if (checkpoint.revocationPayload !== null) {
      const previous = checkpoint.revocationPayload
      validateRevocation(previous)
      if (previous.issuedAtMs > checkpoint.nowMs || previous.notBeforeMs > checkpoint.nowMs
        || previous.notAfterMs < checkpoint.nowMs) fail('REQUEST_REFUSED')
      if (previous.issuer !== rev.issuer || previous.audience !== rev.audience
        || rev.generation < previous.generation || rev.issuedAtMs < previous.issuedAtMs) fail('REVOCATION_ROLLBACK_REFUSED')
      if (rev.generation === previous.generation) same(rev, previous, 'REVOCATION_ROLLBACK_REFUSED')
      else if (rev.issuedAtMs <= previous.issuedAtMs) fail('REVOCATION_ROLLBACK_REFUSED')
      for (const name of ['revokedKeyIds', 'revokedAuthorizationIds', 'revokedBindingIds']) {
        if (previous[name].some(value => !rev[name].includes(value))) fail('REVOCATION_ROLLBACK_REFUSED')
      }
    }
    if (rev.generation < policy.minRevocationGeneration || rev.generation < auth.revocationGeneration) fail('REVOCATION_ROLLBACK_REFUSED')
    if (rev.issuedAtMs > now || now < rev.notBeforeMs || now > rev.notAfterMs
      || now - rev.issuedAtMs > policy.maxRevocationAgeMs) fail('REVOCATION_STALE_REFUSED')
    if (rev.issuedAtMs < revocation.key.notBeforeMs || rev.notAfterMs > revocation.key.notAfterMs
      || now < revocation.key.notBeforeMs || now > revocation.key.notAfterMs) fail('KEY_WINDOW_REFUSED')
    if ([authorization.key, revocation.key, ...evidence.map(item => item.key)].some(key => rev.revokedKeyIds.includes(key.keyId))
      || rev.revokedAuthorizationIds.includes(auth.authorizationId)
      || Object.values(auth.scope.bindingIds).some(bindingId => rev.revokedBindingIds.includes(bindingId))) fail('REVOKED')
    return Object.freeze({ code: 'CANDIDATE_CRYPTOGRAPHIC_CONTEXT_VALID', cryptographicValid: true,
      contextValid: true, trusted: false, liveAuthorized: false })
  } catch (error) {
    const code = error instanceof Refusal && REFUSAL_CODES.has(error.code) ? error.code : 'CANONICAL_INPUT_REFUSED'
    return Object.freeze({ code, cryptographicValid, contextValid: false, trusted: false, liveAuthorized: false })
  }
}
