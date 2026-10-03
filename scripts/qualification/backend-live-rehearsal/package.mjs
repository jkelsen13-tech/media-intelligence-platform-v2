// SOURCE PACKAGE ONLY. No driver, connect, arbitrary adapter, or live execution API.
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { bindInert, exactKeys } from './inert.mjs'

export const PACKAGE_VERSION = 'qik-rollback-client-package-1'
export const FROZEN_SOURCE_HEAD = '93adb523910172b53e96d2b5f5b160974c6af519'
export const FROZEN_SOURCE_TREE = '9a430b86a1a5f381eeb6168eef529ea794b6f256'
export const LIVE_INPUT_NAMES = Object.freeze([
  'trustedEvidenceAuthorityBinding', 'freshManagedIdentityAndAllGrantorBaseline',
  'exactSourceValueAndUnrelatedRowsPrivateBaseline', 'preciseProviderSetAndMissingColumnUpdatePermission',
  'caPathDigestReadability', 'certificateChainHostnameAndDistinctAuditorTls',
  'dblinkDetailAndServerLogSecrecyEvidence', 'secureCaptureAndExecutorClientWindow',
  'boundedRollbackOnlyOwnerAuthorization', 'independentPostRollbackVerifier', 'exactReviewedSourceClientAndManifestHashes',
])
const TARGET = Object.freeze({ project: 'qikvmopbtijoebdqosyq', database: 'postgres',
  table: 'mip_factual.audit_connection', predicate: 'id IS TRUE', column: 'connection_string',
  operationId: 'a382dcdbf2924852b711b6a8b0c713eb',
  installManifestSha256: '221fb2f848b1bbea11e80057b0ad21e5349c8370a35531e2bdc48b6f95449320' })
const SOURCE_PATHS = Object.freeze({
  guardedOperation: '../qik-audit-route-transform-proposal-20261002.sql',
  preSubmitDeadlines: '../qik-audit-route-pre-submit-deadlines-20261002.sql',
  inheritedContract: '../backend-client-contract/contract.mjs',
  inheritedInputs: '../backend-client-contract/required-inputs.json',
  package: './package.mjs', inert: './inert.mjs', cli: './inspect.mjs',
  inputs: './required-inputs.json', clientBinding: './client-binding-contract.json',
  protocol: './submission-protocol.json', auxiliary: './auxiliary-commands.json',
  sqlBoundary: '../backend-rollback-sql/boundary.mjs',
  sqlSnapshot: '../backend-rollback-sql/snapshot-public.sql',
  sqlRowGuards: '../backend-rollback-sql/inspect-rows-public.sql',
  sqlPrivateRowGuards: '../backend-rollback-sql/inspect-rows-private-booleans.sql',
  sqlPrivateCapture: '../backend-rollback-sql/capture-rows-private.sql',
  sqlPrivateCompare: '../backend-rollback-sql/compare-rows-private.sql',
  sqlAuthority: '../backend-rollback-sql/authority-commands.json',
})
const INHERITED_PINS = Object.freeze({
  guardedOperation: { sha256: '5be14204dbd68b44ccaba07222bd6a5b4f9d9f627ce4750fce596211e6d6fb46', bytes: 7101 },
  preSubmitDeadlines: { sha256: '2ac3ca583a82fc717cca12b9f64d40019339b3be7c2aeefb0948473a5336518d', bytes: 324 },
  inheritedContract: { sha256: '209102c3a77015ab53d34718e499d5568243d7eb6a7471c3035875b115b704f9' },
  inheritedInputs: { sha256: 'f7f33a1f5a391c3ee2148ae9a4b1bd3701e04f4e0467fe00fbc6ee10d84750c6' },
})
const COMMAND_IDS = Object.freeze([
  'begin', 'capture_baseline', 'capture_primary_backend', 'inspect_public_row_counts', 'verify_private_logging_guard',
  'capture_private_security', 'inspect_private_row_guards', 'capture_private_rows', 'grant_set_membership', 'set_owner_for_grant', 'grant_column_update',
  'reset_role_for_operation', 'set_statement_deadline', 'set_lock_deadline', 'observe_operation_context', 'guarded_operation',
  'verify_private_transformed_rows',
  'set_owner_for_cleanup', 'revoke_introduced_column_update', 'reset_role_after_cleanup',
  'revoke_introduced_set_membership', 'restore_statement_deadline', 'restore_lock_deadline',
  'verify_authority_restored', 'rollback', 'verify_primary_session_rollback',
  'verify_private_rollback_rows', 'verify_security_rollback', 'verify_primary_completion', 'verify_independently',
])
const FAILURE_IDS = Object.freeze(['cancel_and_drain', 'rollback', 'verify_private_rollback_rows',
  'verify_primary_session_rollback', 'verify_security_rollback', 'verify_primary_completion', 'verify_independently'])
const DEADLINE_COMMANDS = Object.freeze({
  statement_timeout: "SET LOCAL statement_timeout = '7000ms';\n",
  lock_timeout: "SET LOCAL lock_timeout = '500ms';\n",
})
const SQL_FILE_KEYS = Object.freeze({ snapshotPublic: 'sqlSnapshot', inspectRowsPublic: 'sqlRowGuards',
  inspectRowsPrivateBooleans: 'sqlPrivateRowGuards', captureRowsPrivate: 'sqlPrivateCapture', compareRowsPrivate: 'sqlPrivateCompare' })
const BOOLEAN_RESULTS = Object.freeze({
  verify_private_logging_guard: ['source_logging_guard_matches'],
  observe_operation_context: ['installer_identity_matches', 'installer_flags_match', 'operation_privileges_match',
    'statement_deadline_observed', 'lock_deadline_observed'],
  verify_private_transformed_rows: ['comparison_inputs_valid', 'baseline_selected_once', 'current_selected_once',
    'baseline_source_valid', 'all_rows_match', 'unrelated_rows_match', 'opaque_credential_match'],
  verify_private_rollback_rows: ['comparison_inputs_valid', 'baseline_selected_once', 'current_selected_once',
    'baseline_source_valid', 'all_rows_match', 'unrelated_rows_match', 'opaque_credential_match'],
  verify_authority_restored: ['phase_valid', 'security_matches', 'update_denied', 'force_rls_preserved'],
  verify_primary_session_rollback: ['phase_valid', 'security_matches', 'update_denied', 'force_rls_preserved'],
  verify_security_rollback: ['phase_valid', 'security_matches', 'update_denied', 'force_rls_preserved'],
  restore_statement_deadline: ['statement_deadline_restored'], restore_lock_deadline: ['lock_deadline_restored'],
  verify_primary_completion: ['verifier_input_valid', 'original_backend_observable', 'primary_transaction_ended', 'operation_lock_released'],
})
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = code => { throw new Error(code) }

// The lock fingerprints public source, not the credential-bearing database row.
// It is itself an external approval input: matching a local lock is not a review.
async function readLockedSources() {
  try {
    const lockBytes = await readFile(new URL('./source-lock.json', import.meta.url))
    const lock = JSON.parse(lockBytes.toString('utf8'))
    if (!exactKeys(lock, ['lockVersion', 'frozenSourceHead', 'frozenSourceTree', 'sources'])
      || lock.lockVersion !== 'qik-rollback-source-lock-1' || lock.frozenSourceHead !== FROZEN_SOURCE_HEAD
      || lock.frozenSourceTree !== FROZEN_SOURCE_TREE || !exactKeys(lock.sources, Object.keys(SOURCE_PATHS))) fail('SOURCE_LOCK_REFUSED')
    const sources = {}
    for (const [name, path] of Object.entries(SOURCE_PATHS)) {
      const pin = lock.sources[name]
      if (!exactKeys(pin, ['path', 'bytes', 'sha256']) || pin.path !== path
        || !Number.isSafeInteger(pin.bytes) || pin.bytes < 1 || !/^[a-f0-9]{64}$/.test(pin.sha256)) fail('SOURCE_LOCK_REFUSED')
      const held = INHERITED_PINS[name]
      if (held && (pin.sha256 !== held.sha256 || (held.bytes !== undefined && pin.bytes !== held.bytes))) fail('SOURCE_LOCK_REFUSED')
      const bytes = await readFile(new URL(path, import.meta.url))
      if (bytes.byteLength !== pin.bytes || digest(bytes) !== pin.sha256) fail('SOURCE_DRIFT')
      sources[name] = { bytes, publicPin: { name, ...pin } }
    }
    return { sources, lockSha256: digest(lockBytes), lockBytes: lockBytes.byteLength }
  } catch (error) {
    if (['SOURCE_LOCK_REFUSED', 'SOURCE_DRIFT'].includes(error?.message)) throw error
    fail('SOURCE_LOCK_REFUSED')
  }
}

function validateManifest(manifest) {
  if (!exactKeys(manifest, ['packageVersion', 'mode', 'liveImplementation', 'authorityVerifier',
    'target', 'executionWindow', 'liveRequiredInputs']) || manifest.packageVersion !== PACKAGE_VERSION
    || manifest.mode !== 'source-only-offline' || manifest.liveImplementation !== 'absent-unqualified'
    || manifest.authorityVerifier !== 'absent-unqualified' || !isDeepStrictEqual(manifest.target, TARGET)
    || !exactKeys(manifest.liveRequiredInputs, LIVE_INPUT_NAMES)) fail('MANIFEST_REFUSED')
  // This source-only package accepts claims for assessment, never as authority.
  if (manifest.executionWindow !== null && !exactKeys(manifest.executionWindow, ['startUtc', 'endUtc'])) fail('MANIFEST_REFUSED')
}

export function assessLiveReadiness(manifest) {
  const bound = bindInert(manifest, 'MANIFEST_REFUSED')
  validateManifest(bound)
  return Object.freeze({ ready: false, code: 'UNBOUND_NO_QUALIFIED_PRIVATE_CLIENT_OR_AUTHORITY',
    missingInputNames: LIVE_INPUT_NAMES.filter(name => bound.liveRequiredInputs[name] === null),
    unverifiedInputNames: LIVE_INPUT_NAMES.filter(name => bound.liveRequiredInputs[name] !== null),
    executionWindowVerified: false,
    blockers: ['QUALIFIED_PRIVATE_PG17_CLIENT_ABSENT', 'TRUSTED_AUTHORITY_VERIFIER_ABSENT',
      'EXACT_APPROVED_EXECUTION_WINDOW_UNBOUND', 'PRIVATE_EXECUTION_BASELINE_UNBOUND'] })
}

function parseJsonSource(sources, name, code) {
  try { return JSON.parse(sources[name].bytes.toString('utf8')) } catch { fail(code) }
}

function validateProtocol(protocol) {
  if (!exactKeys(protocol, ['protocolVersion', 'sourceOnly', 'clientImplementation', 'authorityImplementation',
    'privateAuthorityPhases', 'successPath', 'failurePath']) || protocol.protocolVersion !== 'qik-rollback-submissions-1'
    || protocol.sourceOnly !== true || protocol.clientImplementation !== null || protocol.authorityImplementation !== null
    || protocol.privateAuthorityPhases !== SOURCE_PATHS.sqlBoundary || !Array.isArray(protocol.successPath) || !Array.isArray(protocol.failurePath)
    || !isDeepStrictEqual(protocol.successPath.map(c => c.commandId), COMMAND_IDS)
    || !isDeepStrictEqual(protocol.failurePath.map(c => c.commandId), FAILURE_IDS)) fail('PROTOCOL_REFUSED')
  for (const phase of [...protocol.successPath, ...protocol.failurePath]) {
    const permitted = ['commandId', 'kind', 'text', 'setting', 'requires', 'condition', 'sourceKey', 'parameters']
    if (!phase || typeof phase !== 'object' || Object.keys(phase).some(k => !permitted.includes(k))
      || typeof phase.requires !== 'string' || !['sql', 'private-phase', 'catalog-source', 'auxiliary-source',
        'independent-source', 'independent-auxiliary-source', 'independent-control',
        'deadline-source', 'guarded-source', 'client-control'].includes(phase.kind)) fail('PROTOCOL_REFUSED')
    if (phase.kind === 'sql' && phase.text !== (phase.commandId === 'begin' ? 'BEGIN;' : 'ROLLBACK;')) fail('PROTOCOL_REFUSED')
    if (phase.text !== undefined && phase.kind !== 'sql') fail('PROTOCOL_REFUSED')
    if (phase.kind === 'deadline-source' && !Object.hasOwn(DEADLINE_COMMANDS, phase.setting)) fail('PROTOCOL_REFUSED')
    if (phase.parameters !== undefined && (!Array.isArray(phase.parameters)
      || phase.parameters.some(p => typeof p !== 'string'))) fail('PROTOCOL_REFUSED')
  }
}

export async function inspectPackage() {
  const { sources, lockSha256, lockBytes } = await readLockedSources()
  const manifest = parseJsonSource(sources, 'inputs', 'MANIFEST_REFUSED')
  const protocol = parseJsonSource(sources, 'protocol', 'PROTOCOL_REFUSED')
  const binding = parseJsonSource(sources, 'clientBinding', 'CLIENT_BINDING_REFUSED')
  validateProtocol(protocol)
  if (binding.contractVersion !== 'qik-private-pg17-client-binding-1' || binding.implementationPresent !== false
    || binding.qualificationPresent !== false || binding.execution?.allowedFinalCommand !== 'ROLLBACK'
    || binding.authority?.bindingCount !== LIVE_INPUT_NAMES.length) fail('CLIENT_BINDING_REFUSED')
  const readiness = assessLiveReadiness(manifest)
  return Object.freeze({ packageVersion: PACKAGE_VERSION, mode: 'source-only-offline', networkMode: 'none',
    sourceIntegrity: 'MATCHES_LOCAL_LOCK', sourceReviewApproval: false, liveReady: false,
    frozenSourceHead: FROZEN_SOURCE_HEAD, frozenSourceTree: FROZEN_SOURCE_TREE,
    sourceLock: { sha256: lockSha256, bytes: lockBytes }, publicSources: Object.values(sources).map(s => s.publicPin),
    successCommandIds: protocol.successPath.map(c => c.commandId), readiness })
}

// Inspection emits a source submission inventory, not a driver invocation.
// There is deliberately no API that promotes this inventory to live execution.
export async function buildSubmissionBundle() {
  const { sources, lockSha256 } = await readLockedSources()
  const protocol = parseJsonSource(sources, 'protocol', 'PROTOCOL_REFUSED')
  validateProtocol(protocol)
  // Fixed reviewed local module only, after every source byte has matched the lock.
  // This module reads source and derives plans; it has no driver/network interface.
  const { loadSqlPackage } = await import('../backend-rollback-sql/boundary.mjs')
  const sqlPackage = await loadSqlPackage()
  const auxiliary = parseJsonSource(sources, 'auxiliary', 'PROTOCOL_REFUSED')
  // Refuse accidental drift during fixed module/template resolution. This is a
  // point-in-time recheck, not an immutable filesystem or live execution binding.
  for (const [key, name] of Object.entries(SQL_FILE_KEYS)) {
    if (sqlPackage.sql[key] !== sources[name].bytes.toString('utf8')) fail('SOURCE_DRIFT')
  }
  if (!isDeepStrictEqual(sqlPackage.authority, parseJsonSource(sources, 'sqlAuthority', 'PROTOCOL_REFUSED'))
    || sqlPackage.guardedOperation !== sources.guardedOperation.bytes.toString('utf8')) fail('SOURCE_DRIFT')
  const rechecked = await readLockedSources()
  if (rechecked.lockSha256 !== lockSha256) fail('SOURCE_DRIFT')
  const fragment = sources.preSubmitDeadlines.bytes.toString('utf8')
  const actual = fragment.split('\n').filter(line => line && !line.startsWith('--')).map(line => `${line}\n`)
  if (!isDeepStrictEqual(actual, Object.values(DEADLINE_COMMANDS))) fail('SOURCE_DRIFT')
  const prepare = phase => {
    let bytes = null, importedSourceSha256 = null
    if (phase.kind === 'sql') bytes = Buffer.from(`${phase.text}\n`, 'utf8')
    if (phase.kind === 'deadline-source') {
      bytes = Buffer.from(DEADLINE_COMMANDS[phase.setting], 'utf8')
      importedSourceSha256 = INHERITED_PINS.preSubmitDeadlines.sha256
    }
    if (phase.kind === 'guarded-source') {
      bytes = sources.guardedOperation.bytes
      importedSourceSha256 = INHERITED_PINS.guardedOperation.sha256
    }
    if (phase.kind === 'private-phase') {
      if (typeof sqlPackage.authority[phase.commandId] !== 'string') fail('PROTOCOL_REFUSED')
      bytes = Buffer.from(sqlPackage.authority[phase.commandId], 'utf8')
      importedSourceSha256 = sources.sqlAuthority.publicPin.sha256
    }
    if (['catalog-source', 'independent-source'].includes(phase.kind)) {
      if (typeof sqlPackage.sql[phase.sourceKey] !== 'string') fail('PROTOCOL_REFUSED')
      bytes = Buffer.from(sqlPackage.sql[phase.sourceKey], 'utf8')
      importedSourceSha256 = sqlPackage.hashes[phase.sourceKey]
    }
    if (['auxiliary-source', 'independent-auxiliary-source'].includes(phase.kind)) {
      if (typeof auxiliary[phase.sourceKey] !== 'string') fail('PROTOCOL_REFUSED')
      bytes = Buffer.from(auxiliary[phase.sourceKey], 'utf8')
      importedSourceSha256 = sources.auxiliary.publicPin.sha256
    }
    return { ...phase, submission: bytes === null ? null : { text: bytes.toString('utf8'),
      bytes: bytes.byteLength, sha256: digest(bytes), importedSourceSha256 },
      session: phase.kind.startsWith('independent') ? 'distinct-approved-read-only-verifier' : 'primary-approved-private-executor',
      resultPolicy: ['capture_private_rows', 'capture_private_security'].includes(phase.commandId) ? 'PRIVATE SECRET-BEARING MEMORY ONLY; NEVER RECEIPT/ERROR OUTPUT'
        : 'allowlisted counts/booleans or nonsecret catalog; no raw errors',
      expectedResult: BOOLEAN_RESULTS[phase.commandId] ? {
        rowCount: 1, exactColumnNames: BOOLEAN_RESULTS[phase.commandId], everyBooleanMustBeTrue: true,
        extraMissingNullOrFalseColumnsRefused: true,
      } : phase.commandId === 'guarded_operation' ? { commandTag: 'DO', resultRows: 0,
        updateOneEstablishedByInternalGuard: true } : null,
      completedAcknowledgmentRequiredBeforeNextSubmission: true }
  }
  return Object.freeze({ packageVersion: PACKAGE_VERSION, purpose: 'SOURCE-ONLY SUBMISSION INVENTORY',
    executableLivePackage: false, sqlSourceInventoryComplete: true, runtimeParameterBindingsComplete: false,
    genuineAuthorityBindingsComplete: false, sourceLockSha256: lockSha256,
    noLiveExecutionAPI: true, clientBindingSha256: sources.clientBinding.publicPin.sha256,
    successPath: protocol.successPath.map(prepare), failurePath: protocol.failurePath.map(prepare),
    unimplementedClientControlIds: ['cancel_and_drain', 'verify_independently'],
    parameterizedPhaseCommandIds: protocol.successPath.filter(p => p.parameters !== undefined).map(p => p.commandId) })
}

// Pure source planning from unauthenticated, inert, nonsecret catalog/guard data.
// No supplied value is promoted to approval, and no private row value is accepted.
export async function compileMinimalSubmissionBundle(snapshot, rowInspection) {
  const boundSnapshot = bindInert(snapshot, 'MANIFEST_REFUSED')
  const boundRows = bindInert(rowInspection, 'MANIFEST_REFUSED')
  if (!exactKeys(boundSnapshot, ['version', 'identity', 'deadlines', 'roles', 'memberships', 'relation', 'columns',
    'policies', 'schemas', 'publications', 'effective', 'logging', 'optional_logging', 'ca_path', 'dblink'])
    || !exactKeys(boundRows, ['selected_count', 'unrelated_count', 'selected_nonnull', 'selected_source_matches',
      'receipt_count', 'bootstrap_count', 'head_count', 'qualification_count'])) fail('OFFLINE_BASELINE_REFUSED')
  await inspectPackage()
  const { deriveMinimalAuthorityPlan } = await import('../backend-rollback-sql/boundary.mjs')
  let plan
  try { plan = deriveMinimalAuthorityPlan(boundSnapshot, boundRows) } catch { fail('OFFLINE_BASELINE_REFUSED') }
  const bundle = await buildSubmissionBundle()
  return Object.freeze({ ...bundle, inputBasis: 'UNAUTHENTICATED INERT SOURCE-PLANNING INPUT',
    liveReady: false, introducesMembership: plan.introducesMembership,
    introducesColumnUpdate: plan.introducesColumnUpdate, addsSelect: plan.addsSelect,
    proposedPermission: plan.permission })
}

// Only the inherited privately branded in-memory fixture is used. No adapter or
// callback parameter is exposed, and observations never qualify a live driver.
export async function runClosedSyntheticQualification(options = {}) {
  const bound = bindInert(options, 'SYNTHETIC_OPTIONS_REFUSED')
  if (!bound || typeof bound !== 'object' || Array.isArray(bound)
    || Object.keys(bound).some(key => !['baseline', 'faults', 'clientDeadlinesMs'].includes(key))) fail('SYNTHETIC_OPTIONS_REFUSED')
  await inspectPackage()
  const { createSyntheticAdapter, loadSyntheticManifest, runSyntheticRollbackRehearsal } =
    await import('../backend-client-contract/contract.mjs')
  const manifest = await loadSyntheticManifest()
  if (bound.clientDeadlinesMs !== undefined) {
    if (!exactKeys(bound.clientDeadlinesMs, ['command', 'operation', 'rollback', 'verification', 'cancelDrain'])
      || Object.values(bound.clientDeadlinesMs).some(ms => !Number.isInteger(ms) || ms < 1 || ms > 30000)) fail('SYNTHETIC_OPTIONS_REFUSED')
    manifest.clientDeadlinesMs = bound.clientDeadlinesMs
  }
  const fixture = {}
  for (const key of ['baseline', 'faults']) if (Object.hasOwn(bound, key)) fixture[key] = bound[key]
  const receipt = await runSyntheticRollbackRehearsal(manifest, createSyntheticAdapter(fixture))
  return Object.freeze({ packageVersion: PACKAGE_VERSION, qualification: 'CLOSED IN-MEMORY MODEL ONLY',
    nativePg17Qualified: false, libpqQualified: false, tlsDblinkOrProviderLogsQualified: false,
    distinctLiveVerifierQualified: false, ...receipt, liveReady: false,
    independentVerificationRequired: receipt.outcome !== 'REFUSED' && !receipt.independentlyVerified,
    externalRecoveryRequired: receipt.outcome === 'UNKNOWN' })
}
