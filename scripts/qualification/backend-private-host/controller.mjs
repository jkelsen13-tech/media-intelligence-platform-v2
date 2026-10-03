// Bounded controller SOURCE. The only exposed execution factory is a closed,
// fixed test fixture. No runtime adapter/callback can become trusted authority.
import { isDeepStrictEqual } from 'node:util'
import { deriveMinimalAuthorityPlan } from '../backend-rollback-sql/boundary.mjs'
import { exactKeys } from '../backend-live-rehearsal/inert.mjs'
import { bindHostInert as bindInert } from './inert.mjs'
import { loadHeldSource, HOST_VERSION } from './source.mjs'
import { createClosedFixture } from './closed-fixture.mjs'
import { createFixedProductionPort } from './bridge.mjs'

const RESPONSE_KEYS = ['completed', 'commandTag', 'transactionStatus', 'columnNames', 'typeOids', 'rows']
const COUNT_NAMES = ['selected_count', 'unrelated_count', 'selected_nonnull', 'selected_source_matches',
  'receipt_count', 'bootstrap_count', 'head_count', 'qualification_count']
const TAGS = Object.freeze({ begin: 'BEGIN', rollback: 'ROLLBACK', grant_set_membership: 'GRANT ROLE',
  grant_column_update: 'GRANT', revoke_introduced_column_update: 'REVOKE', revoke_introduced_set_membership: 'REVOKE ROLE',
  set_owner_for_grant: 'SET', set_owner_for_cleanup: 'SET', reset_role_for_operation: 'RESET',
  reset_role_after_cleanup: 'RESET', set_statement_deadline: 'SET', set_lock_deadline: 'SET', guarded_operation: 'DO' })
const CAPTURES = Object.freeze({ capture_baseline: [['snapshot'], [3802]],
  capture_primary_backend: [['primary_backend_pid', 'primary_backend_start'], [23, 25]],
  inspect_public_row_counts: [['selected_count', 'unrelated_count'], [20, 20]],
  capture_private_security: [['private_snapshot'], [3802]], capture_private_rows: [['private_rows'], [3802]],
  inspect_private_row_guards: [COUNT_NAMES, [20, 20, 16, 16, 20, 20, 20, 20]] })
const FIXED_CODES = new Set(['HOST_SOURCE_DRIFT', 'HOST_SOURCE_LOCK_REFUSED', 'HOST_BUNDLE_REFUSED',
  'SOURCE_DRIFT', 'SOURCE_LOCK_REFUSED', 'CLOSED_OPTIONS_REFUSED', 'EXECUTION_WINDOW_STALE', 'AUTHORITY_REVOKED',
  'PHASE_AUTHORITY_REFUSED', 'RECOVERY_AUTHORITY_UNAVAILABLE', 'BASELINE_REFUSED', 'PRIVATE_BASELINE_REFUSED',
  'PRIMARY_BACKEND_REFUSED', 'COMMAND_TIMEOUT', 'COMMAND_ACK_INVALID', 'RESULT_SHAPE_REFUSED',
  'BOOLEAN_POSTCONDITION_REFUSED', 'COMPLETION_UNCERTAIN', 'DISCONNECTED', 'CANCEL_DRAIN_ACK_INVALID',
  'VERIFIER_CONTEXT_REFUSED', 'PRIVATE_PARAMETER_BINDING_FAILED', 'FIXTURE_SOURCE_DRIFT', 'COMMAND_FAILED'])
const safeCode = error => FIXED_CODES.has(error?.fixedCode) ? error.fixedCode
  : FIXED_CODES.has(error?.message) ? error.message : 'COMMAND_FAILED'
const fail = code => { const error = new Error(code); error.fixedCode = code; throw error }
const count = value => {
  if (!['string', 'number'].includes(typeof value) || !/^(0|[1-9][0-9]*)$/.test(String(value))
    || !Number.isSafeInteger(Number(value))) fail('RESULT_SHAPE_REFUSED')
  return Number(value)
}
const raceBudget = async (work, milliseconds) => {
  let timer
  try { return await Promise.race([work, new Promise((_, reject) => {
    timer = setTimeout(() => { const e = new Error('COMMAND_TIMEOUT'); e.fixedCode = 'COMMAND_TIMEOUT'; reject(e) }, milliseconds)
  })]) } finally { clearTimeout(timer) }
}

// Treat completion, command tag, exact typed shape, and transaction state as
// separate observations. Neither a boolean row nor a socket close is an ACK.
function validateResponse(phase, raw, afterRollback = false) {
  const result = bindInert(raw, 'COMMAND_ACK_INVALID')
  if (!exactKeys(result, RESPONSE_KEYS) || result.completed !== true
    || !Array.isArray(result.columnNames) || !Array.isArray(result.typeOids) || !Array.isArray(result.rows)
    || result.columnNames.some(v => typeof v !== 'string') || result.typeOids.some(v => !Number.isSafeInteger(v))
    || result.columnNames.length !== result.typeOids.length || result.rows.some(row => !Array.isArray(row)
      || row.length !== result.columnNames.length)) fail('COMMAND_ACK_INVALID')
  const expectedTx = phase.session.startsWith('distinct') || phase.commandId === 'rollback' || afterRollback ? 'IDLE' : 'INTRANS'
  if (result.transactionStatus !== expectedTx) fail('COMMAND_ACK_INVALID')
  const tag = TAGS[phase.commandId]
  if (tag) {
    if (result.commandTag !== tag || result.rows.length !== 0 || result.columnNames.length !== 0) fail('COMMAND_ACK_INVALID')
    return result
  }
  const shape = CAPTURES[phase.commandId]
    ?? (phase.expectedResult ? [phase.expectedResult.exactColumnNames, phase.expectedResult.exactColumnNames.map(() => 16)] : null)
  if (!shape || result.commandTag !== 'SELECT 1' || result.rows.length !== 1
    || !isDeepStrictEqual(result.columnNames, shape[0]) || !isDeepStrictEqual(result.typeOids, shape[1])) fail('RESULT_SHAPE_REFUSED')
  if (phase.expectedResult?.everyBooleanMustBeTrue && result.rows[0].some(v => v !== true)) fail('BOOLEAN_POSTCONDITION_REFUSED')
  return result
}

function validateVerifierContext(primary, verifier) {
  const required = ['connectionId', 'database', 'authenticatedUser', 'host', 'hostaddr', 'port', 'tlsVerified',
    'clientReadOnlyInventory', 'sqlIdentityObserved', 'serverReadOnlyObserved', 'observationBasis']
  if (!exactKeys(primary, required) || !exactKeys(verifier, required)
    || typeof verifier.connectionId !== 'string' || verifier.connectionId === primary.connectionId
    || verifier.clientReadOnlyInventory !== true || primary.clientReadOnlyInventory !== false
    || primary.tlsVerified !== true || verifier.tlsVerified !== true
    || primary.sqlIdentityObserved !== false || verifier.sqlIdentityObserved !== false
    || primary.serverReadOnlyObserved !== false || verifier.serverReadOnlyObserved !== false
    || !['CLOSED TEST-ONLY CONTEXT; SQL IDENTITY AND SERVER READONLY UNOBSERVED AT CONNECT',
      'NATIVE TRANSPORT TARGET AND TLS MATCH; SQL IDENTITY AND SERVER READONLY UNOBSERVED AT CONNECT'].includes(primary.observationBasis))
    fail('VERIFIER_CONTEXT_REFUSED')
  // Verifier-local deadlines are compared in SQL with the frozen 'restored'
  // phase; connection/database/identity/host/TLS context remains bound here.
  for (const name of ['database', 'authenticatedUser', 'host', 'hostaddr', 'port', 'observationBasis']) {
    if (verifier[name] !== primary[name]) fail('VERIFIER_CONTEXT_REFUSED')
  }
  if (primary.database !== 'postgres' || primary.authenticatedUser !== 'postgres') fail('VERIFIER_CONTEXT_REFUSED')
  // SQL session/current-user identity is established later by the frozen exact
  // private security comparison. No server transaction-read-only probe exists
  // in the bundle; this check establishes the client read-only inventory only.
}

// This private function is the fixed sequence, shared source for a future
// reviewed host integration. It cannot be called with caller-owned callbacks.
async function runAttempt(held, port) {
  const bundle = held.bundle, events = [], cancelDrainObservations = []
  const phaseById = id => [...bundle.successPath, ...bundle.failurePath].find(p => p.commandId === id)
  let begun = false, drained = true, rollbackAttempted = false, rollbackAcknowledged = false
  let operationAttempted = false, operationAcknowledged = false, primaryVerified = false, independentVerified = false
  let privateRows = null, privateSecurity = null, publicCatalog = null, publicCounts = null, backend = null, plan = null
  let firstCode = null, verifierAttempted = false
  const record = (commandId, status) => events.push({ commandId, status })
  const remember = error => { firstCode ??= safeCode(error) }
  const parametersFor = phase => (phase.parameters ?? []).map(name => {
    if (name === 'privateRowsBaseline') { if (privateRows === null) fail('PRIVATE_BASELINE_REFUSED'); return JSON.stringify(privateRows) }
    if (name === 'privateSecurityBaseline') { if (privateSecurity === null) fail('PRIVATE_BASELINE_REFUSED'); return JSON.stringify(privateSecurity) }
    if (name === 'approvedCaPath') return port.approvedCaPath
    if (name === 'true' || name === 'false' || name === 'rollback' || name === 'restored') return name
    if (name === 'publicCatalogBaseline.deadlines.statement_timeout') return publicCatalog?.deadlines.statement_timeout ?? fail('BASELINE_REFUSED')
    if (name === 'publicCatalogBaseline.deadlines.lock_timeout') return publicCatalog?.deadlines.lock_timeout ?? fail('BASELINE_REFUSED')
    if (name === 'primaryBackendPid') { if (backend === null) fail('PRIMARY_BACKEND_REFUSED'); return String(backend.pid) }
    if (name === 'primaryBackendStart') { if (backend === null) fail('PRIMARY_BACKEND_REFUSED'); return backend.start }
    return fail('PRIVATE_PARAMETER_BINDING_FAILED')
  })
  const command = async (id, recovery = false) => {
    const phase = phaseById(id)
    try {
      await port.authorize(phase, recovery) // Fresh phase/window/revocation guard, before submission.
      const parameters = parametersFor(phase)
      if (!phase.submission || !drained) fail('COMPLETION_UNCERTAIN')
      if (id === 'guarded_operation') {
        if (operationAttempted) fail('COMMAND_ACK_INVALID')
        operationAttempted = true
      }
      if (id === 'begin') begun = true // Uncertainty starts BEFORE awaiting BEGIN ACK.
      record(id, 'submitted')
      if (!phase.session.startsWith('distinct')) drained = false
      const budget = id === 'guarded_operation' ? port.budgets.operation : id === 'rollback' ? port.budgets.rollback
        : phase.session.startsWith('distinct') ? port.budgets.verification : port.budgets.command
      const response = await raceBudget(port.execute(phase, parameters), budget)
      const accepted = validateResponse(phase, response, rollbackAcknowledged)
      if (!phase.session.startsWith('distinct')) drained = true
      record(id, 'acknowledged')
      return accepted.rows[0] ?? null
    } catch (error) { record(id, safeCode(error)); throw error }
  }
  const recoverDrain = async () => {
    const phase = phaseById('cancel_and_drain')
    try {
      await port.authorize(phase, true)
      record('cancel_and_drain', 'submitted')
      const response = bindInert(await raceBudget(port.cancelAndDrain(), port.budgets.cancelDrain), 'CANCEL_DRAIN_ACK_INVALID')
      if (!exactKeys(response, [...RESPONSE_KEYS, 'drained', 'cancelDispatched', 'cancelCode'])
        || response.completed !== true || response.drained !== true || typeof response.cancelDispatched !== 'boolean'
        || ![null, 'CANCEL_FAILED', 'CANCEL_TIMEOUT', 'TRANSPORT_INTERRUPTED', 'TRANSPORT_FAILED',
          'SOCKET_REFUSED', 'IO_FAILED', 'CONNECTION_UNAVAILABLE'].includes(response.cancelCode)
        || (response.cancelDispatched && response.cancelCode !== null)
        || response.commandTag !== 'CANCEL_AND_DRAIN' || !['IDLE', 'INTRANS', 'INERROR'].includes(response.transactionStatus)
        || !isDeepStrictEqual(response.columnNames, []) || !isDeepStrictEqual(response.typeOids, [])
        || !isDeepStrictEqual(response.rows, [])) fail('CANCEL_DRAIN_ACK_INVALID')
      cancelDrainObservations.push({ cancelDispatched: response.cancelDispatched, cancelCode: response.cancelCode,
        originalDrained: response.drained, transactionStatus: response.transactionStatus })
      drained = true; record('cancel_and_drain', 'original_result_drained')
      record('cancel_and_drain', 'acknowledged')
    } catch (error) { drained = false; remember(error); record('cancel_and_drain', safeCode(error)) }
  }
  try {
    for (const phase of bundle.successPath) {
      const id = phase.commandId
      if (id === 'rollback') break // Recovery/completion is always handled below exactly once.
      if (phase.condition) {
        if (plan === null) fail('BASELINE_REFUSED')
        const allowed = id === 'grant_set_membership' || id === 'revoke_introduced_set_membership'
          ? plan.introducesMembership : plan.introducesColumnUpdate
        if (!allowed) { record(id, 'not_introduced'); continue }
      }
      const row = await command(id)
      if (id === 'capture_baseline') {
        publicCatalog = bindInert(row[0], 'BASELINE_REFUSED')
        if (!exactKeys(publicCatalog, ['version', 'identity', 'deadlines', 'roles', 'memberships', 'relation', 'columns',
          'policies', 'schemas', 'publications', 'effective', 'logging', 'optional_logging', 'ca_path', 'dblink'])
          || !exactKeys(publicCatalog.deadlines, ['statement_timeout', 'lock_timeout'])
          || Object.values(publicCatalog.deadlines).some(v => typeof v !== 'string')) fail('BASELINE_REFUSED')
      }
      if (id === 'capture_primary_backend') {
        if (!Number.isSafeInteger(row[0]) || row[0] < 1 || typeof row[1] !== 'string' || !Number.isFinite(Date.parse(row[1]))) fail('PRIMARY_BACKEND_REFUSED')
        backend = { pid: row[0], start: row[1] }
      }
      if (id === 'inspect_public_row_counts') {
        publicCounts = row.map(count)
        if (publicCounts[0] !== 1) fail('BASELINE_REFUSED')
      }
      if (id === 'capture_private_security') {
        privateSecurity = bindInert(row[0], 'PRIVATE_BASELINE_REFUSED')
        const { private_security_details: details, ...catalog } = privateSecurity ?? {}
        if (!isDeepStrictEqual(catalog, publicCatalog) || !exactKeys(details, ['role_configs', 'dblink_definitions'])
          || !Array.isArray(details.role_configs) || !Array.isArray(details.dblink_definitions)) fail('PRIVATE_BASELINE_REFUSED')
      }
      if (id === 'inspect_private_row_guards') {
        const guards = Object.fromEntries(COUNT_NAMES.map((name, n) => [name, row[n]]))
        if (count(guards.selected_count) !== publicCounts[0] || count(guards.unrelated_count) !== publicCounts[1]
          || guards.selected_nonnull !== true || guards.selected_source_matches !== true) fail('BASELINE_REFUSED')
        try { plan = deriveMinimalAuthorityPlan(publicCatalog, guards) } catch { fail('BASELINE_REFUSED') }
        if (plan.addsSelect !== false || plan.permission.membershipGrantor !== 'postgres'
          || plan.permission.columnGrantor !== 'mip_cutover_schema_owner_v1' || plan.permission.mandatoryEnd !== 'ROLLBACK') fail('BASELINE_REFUSED')
      }
      if (id === 'capture_private_rows') {
        privateRows = bindInert(row[0], 'PRIVATE_BASELINE_REFUSED')
        if (!Array.isArray(privateRows) || privateRows.some(r => !exactKeys(r, ['id', 'connection_string'])
          || typeof r.id !== 'boolean' || typeof r.connection_string !== 'string')
          || privateRows.filter(r => r.id === true).length !== 1 || privateRows.length !== publicCounts[0] + publicCounts[1]) fail('PRIVATE_BASELINE_REFUSED')
      }
      if (id === 'guarded_operation') operationAcknowledged = true
    }
  } catch (error) { remember(error) }
  finally {
    if (begun && port.primaryUsable() && !drained) await recoverDrain()
    if (begun && port.primaryUsable() && drained) {
      rollbackAttempted = true
      try { await command('rollback', true); rollbackAcknowledged = true }
      catch (error) {
        remember(error)
        // Fence uncertain rollback; never retry or manufacture its missing ACK.
        if (port.primaryUsable() && !drained) await recoverDrain()
      }
    }
    if (begun) {
      verifierAttempted = true
      record('verify_independently', 'distinct_verifier_attempted')
      let contextValid = false
      try {
        // Opening a separate connection is itself a dependent recovery action.
        // A stale/revoked recovery grant cannot open the verifier connection.
        await port.authorize(phaseById('verify_independently'), true)
        record('verify_independently', 'recovery_authority_acknowledged')
        const context = await raceBudget(port.openVerifier(), port.budgets.verification)
        validateVerifierContext(port.primaryContext, context); contextValid = true
        record('verify_independently', 'distinct_approved_read_only_inventory_context')
      } catch (error) { remember(error); record('verify_independently', safeCode(error)) }
      const checks = []
      // Preserve the frozen success/failure query order. In the failure path,
      // distinct row verification precedes the optional primary observation.
      const tail = firstCode ? bundle.failurePath : bundle.successPath.slice(bundle.successPath.findIndex(p => p.commandId === 'rollback') + 1)
      for (const phase of tail) {
        const id = phase.commandId
        if (['cancel_and_drain', 'rollback', 'verify_independently'].includes(id)) continue
        if (id === 'verify_primary_session_rollback') {
          // Same primary settings are never inferred from the distinct verifier.
          if (port.primaryUsable() && drained && rollbackAcknowledged) {
            try { await command(id, true); primaryVerified = true }
            catch (error) { remember(error) }
          } else record(id, 'PRIMARY_ROLLBACK_OBSERVATION_UNAVAILABLE')
          continue
        }
        // A distinct attempt happens even if primary recovery failed or private
        // baselines never arrived. Missing inputs produce UNKNOWN, not equality.
        if (!contextValid) { record(id, 'VERIFIER_CONTEXT_REFUSED'); checks.push(false); continue }
        try {
          // Outstanding PRIMARY work does not prohibit the distinct read-only
          // verifier. Its equality still cannot replace the primary rollback ACK.
          const primaryDrained = drained; drained = true
          try { await command(id, true); checks.push(true) } finally { drained = primaryDrained }
        } catch (error) { remember(error); checks.push(false) }
      }
      if (contextValid && checks.every(v => v === true)) {
        try {
          await port.authorize(phaseById('verify_independently'), true)
          independentVerified = true
        } catch (error) { remember(error); record('verify_independently', safeCode(error)) }
      }
      record('verify_independently', independentVerified ? 'all_distinct_checks_acknowledged' : 'INDEPENDENT_VERIFICATION_FAILED')
    }
    await port.finish()
    // Drop private baselines after final comparisons; only public receipt fields
    // below survive. JS GC cannot promise memory zeroization (a future host gate).
    privateRows = null; privateSecurity = null; publicCatalog = null; backend = null
  }
  const outcome = !begun ? 'REFUSED' : !rollbackAcknowledged || !drained || !primaryVerified || !independentVerified
    ? 'UNKNOWN' : firstCode ? 'ABORT_ROLLED_BACK' : 'REHEARSAL_ROLLED_BACK'
  const code = firstCode ?? (outcome === 'UNKNOWN' ? 'ROLLBACK_OR_VERIFICATION_ACK_MISSING' : null)
  return Object.freeze({ version: HOST_VERSION, qualification: port.productionAuthorized
    ? 'PRIVATE HOST ATTEMPT; QUALIFICATION MUST BE ESTABLISHED EXTERNALLY' : 'CLOSED TEST-ONLY CONTROLLER MODEL',
    networkMode: port.productionAuthorized ? 'APPROVED PRIVATE PIPE' : 'none', nativePg17Qualified: false,
    libpqQualified: false, productionAuthorized: port.productionAuthorized,
    authorityBasis: port.authorityBasis, liveReady: false, outcome, code, begun,
    operationAttempted, operationAcknowledged, rollbackAttempted, rollbackAcknowledged,
    primarySessionVerified: primaryVerified, distinctVerifierAttempted: verifierAttempted,
    independentlyVerified: independentVerified, externalRecoveryRequired: outcome === 'UNKNOWN',
    cancelDrainObservations, ...port.evidence(), events })
}

export async function runClosedHostQualification(options = {}) {
  // Bind caller-owned options before the first await; accessor/callback data is
  // refused without execution, and no arbitrary transport parameter is exposed.
  const bound = bindInert(options, 'CLOSED_OPTIONS_REFUSED')
  const held = await loadHeldSource()
  const port = createClosedFixture(held.bundle, bound)
  return runAttempt(held, port)
}

// Complete fixed production wiring in SOURCE. No operational entrypoint invokes
// this function. The factory owns its fixed verifier/transport/private handoff;
// it accepts no runtime callback, driver, claims, SQL, or connection fields.
async function runProductionHostAttempt() {
  const held = await loadHeldSource()
  const port = await createFixedProductionPort()
  return runAttempt(held, port)
}
