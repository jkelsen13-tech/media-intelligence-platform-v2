// CLOSED TEST FIXTURE ONLY. This module models responses; it is not PostgreSQL,
// an authority issuer, or an injectable production transport adapter.
import { isDeepStrictEqual } from 'node:util'
import { exactKeys } from '../backend-live-rehearsal/inert.mjs'
import { bindHostInert as bindInert } from './inert.mjs'

const copy = value => structuredClone(value)
const SECRET = 'TEST_ONLY_PRIVATE_ROW_MARKER_7d6b'
const CONFIG_SECRET = 'TEST_ONLY_PRIVATE_CONFIG_MARKER_4219'
const COUNTS = ['selected_count', 'unrelated_count', 'selected_nonnull', 'selected_source_matches',
  'receipt_count', 'bootstrap_count', 'head_count', 'qualification_count']
const FAULTS = new Set(['disconnect', 'uncertain', 'timeout', 'error', 'wrong_tag', 'wrong_shape',
  'null_boolean', 'false_boolean', 'extra_boolean', 'missing_boolean', 'wrong_type_oid',
  'bad_tx', 'bad_ack', 'undrained', 'cancel_failed'])
const VARIANTS = new Set(['precise', 'preexisting_update', 'absent_select', 'wrong_provider',
  'existing_self_membership', 'wrong_private_security', 'source_guard_false', 'public_count_mismatch',
  'verifier_same_connection', 'verifier_context_mismatch', 'unrelated_row_drift'])

function baseline() {
  return {
    version: 'qik-rollback-sql-boundary-1',
    identity: { current_user: 'postgres', session_user: 'postgres', database: 'postgres' },
    deadlines: { statement_timeout: '0', lock_timeout: '0' },
    roles: [
      { oid: '10', name: 'postgres', superuser: false, bypass_rls: true, login: true },
      { oid: '20', name: 'mip_cutover_schema_owner_v1', superuser: false, bypass_rls: false, login: false },
      { oid: '30', name: 'supabase_admin', superuser: false, bypass_rls: false, login: false },
    ],
    memberships: [
      { roleid: '20', role: 'mip_cutover_schema_owner_v1', member: '10', member_name: 'postgres',
        grantor: '30', grantor_name: 'supabase_admin', admin: true, inherit: false, set: false },
      { roleid: '20', role: 'mip_cutover_schema_owner_v1', member: '10', member_name: 'postgres',
        grantor: '31', grantor_name: 'test_only_other_grantor', admin: false, inherit: false, set: false },
    ],
    relation: { owner: 'mip_cutover_schema_owner_v1', relowner: '20', rls: true, force_rls: true, relkind: 'r', acl_raw: null },
    columns: [{ name: 'id', type_oid: '16', not_null: true, acl_raw: null },
      { name: 'connection_string', type_oid: '25', not_null: true, acl_raw: ['test_only_reader=r/test_only_grantor'] }],
    policies: [], schemas: [1, 2, 3, 4].map(n => ({ name: `test_only_schema_${n}`, postgres_usage: true })),
    publications: [],
    effective: { select_id: true, select_connection: true, update_connection: false,
      update_id: false, table_update: false, owner_set: false, owner_usage: false, dblink_execute: true },
    logging: {}, optional_logging: {}, ca_path: '/TEST_ONLY/approved-ca.pem',
    dblink: [{ argument_type_oids: ['25', '25'], result_type_oid: '2249', kind: 'f',
      strict: true, security_definer: false, returns_set: true }],
  }
}
function privateSecurity(snapshot) {
  return { ...copy(snapshot), private_security_details: {
    role_configs: [{ oid: '20', config: [`test_only=${CONFIG_SECRET}`] }],
    dblink_definitions: [{ oid: '40', config: null, definition: `TEST_ONLY_DEFINITION_${CONFIG_SECRET}` }],
  } }
}
const fail = (code, disconnected = false) => {
  const error = new Error(code); error.fixedCode = code; error.disconnected = disconnected; throw error
}
const answer = (commandTag, transactionStatus, columnNames = [], typeOids = [], rows = []) =>
  ({ completed: true, commandTag, transactionStatus, columnNames, typeOids, rows })

// Only inert test fault data enters. No supplied callback, URL, SQL or policy
// becomes an adapter or authority. The controller creates this internally.
export function createClosedFixture(bundle, input = {}) {
  const options = bindInert(input, 'CLOSED_OPTIONS_REFUSED')
  if (!options || Array.isArray(options) || Object.keys(options).some(k => !['faults', 'baselineVariant',
    'staleBeforePhase', 'revokedBeforePhase', 'recoveryUnavailable', 'recoveryExpiresBeforeFinal'].includes(k))) fail('CLOSED_OPTIONS_REFUSED')
  const ids = new Set([...bundle.successPath, ...bundle.failurePath].map(p => p.commandId))
  const faults = options.faults ?? {}
  if (!faults || Array.isArray(faults) || Object.keys(faults).some(id => !ids.has(id))
    || Object.entries(faults).some(([id, f]) => (!exactKeys(f, ['type']) && !exactKeys(f, ['type', 'column'])) || !FAULTS.has(f.type)
      || (f.column !== undefined && (!['null_boolean', 'false_boolean'].includes(f.type)
        || !bundle.successPath.find(p => p.commandId === id)?.expectedResult?.exactColumnNames?.includes(f.column))))
    || !VARIANTS.has(options.baselineVariant ?? 'precise')
    || ['staleBeforePhase', 'revokedBeforePhase'].some(k => options[k] !== undefined && !ids.has(options[k]))
    || ['recoveryUnavailable', 'recoveryExpiresBeforeFinal'].some(k => options[k] !== undefined && typeof options[k] !== 'boolean')) fail('CLOSED_OPTIONS_REFUSED')
  const original = baseline(), variant = options.baselineVariant ?? 'precise'
  if (variant === 'preexisting_update') original.effective.update_connection = true
  if (variant === 'absent_select') original.effective.select_connection = false
  if (variant === 'wrong_provider') original.memberships[0].set = true
  if (variant === 'existing_self_membership') original.memberships.push({ ...copy(original.memberships[0]),
    grantor: '10', grantor_name: 'postgres', admin: false, inherit: false, set: true })
  const originalSecurity = privateSecurity(original)
  const originalRows = [{ id: true, connection_string: SECRET }, { id: false, connection_string: 'TEST_ONLY_UNRELATED' }]
  const state = { current: copy(original), rows: copy(originalRows), connected: true, tx: 'IDLE',
    pending: null, membership: false, update: false, logged: false, verifierOpened: false,
    introducedThenRemoved: false, parameterBindingsChecked: 0, baselineUses: 0, sequence: [], verificationAuthorizationCount: 0 }
  const primaryContext = Object.freeze({ connectionId: 'TEST_ONLY_PRIMARY', database: 'postgres',
    authenticatedUser: 'postgres', host: 'TEST_ONLY_APPROVED_HOST', hostaddr: '192.0.2.1', port: '5432',
    tlsVerified: true, clientReadOnlyInventory: false, sqlIdentityObserved: false, serverReadOnlyObserved: false,
    observationBasis: 'CLOSED TEST-ONLY CONTEXT; SQL IDENTITY AND SERVER READONLY UNOBSERVED AT CONNECT' })
  const verifierContext = Object.freeze({ ...primaryContext, connectionId: variant === 'verifier_same_connection'
    ? primaryContext.connectionId : 'TEST_ONLY_DISTINCT_VERIFIER', clientReadOnlyInventory: true,
    ...(variant === 'verifier_context_mismatch' ? { host: 'TEST_ONLY_WRONG_HOST' } : {}) })
  const expectedParams = id => {
    if (['verify_private_transformed_rows', 'verify_private_rollback_rows'].includes(id)) {
      state.baselineUses++
      return [JSON.stringify(originalRows), original.ca_path, id === 'verify_private_transformed_rows' ? 'true' : 'false']
    }
    if (['verify_authority_restored', 'verify_primary_session_rollback', 'verify_security_rollback'].includes(id)) {
      state.baselineUses++
      return [JSON.stringify(originalSecurity), id === 'verify_security_rollback' ? 'restored' : 'rollback']
    }
    if (id === 'restore_statement_deadline') return [original.deadlines.statement_timeout]
    if (id === 'restore_lock_deadline') return [original.deadlines.lock_timeout]
    if (id === 'verify_primary_completion') return ['71', '2026-10-03 00:00:00+00']
    return []
  }
  const boolAnswer = (phase, values) => answer('SELECT 1', phase.session.startsWith('distinct') ? 'IDLE' : state.tx,
    [...phase.expectedResult.exactColumnNames], phase.expectedResult.exactColumnNames.map(() => 16),
    [values ?? phase.expectedResult.exactColumnNames.map(() => true)])
  const complete = (phase, parameters) => {
    const id = phase.commandId, independent = phase.session.startsWith('distinct')
    if (independent && !state.verifierOpened) fail('VERIFIER_NOT_OPEN')
    if (!independent && !state.connected) fail('DISCONNECTED', true)
    if (!isDeepStrictEqual(parameters, expectedParams(id))) fail('PRIVATE_PARAMETER_BINDING_FAILED')
    state.parameterBindingsChecked++
    if (['capture_private_security', 'inspect_private_row_guards', 'capture_private_rows'].includes(id) && !state.logged) fail('PRIVATE_READ_BEFORE_LOGGING_GATE')
    switch (id) {
      case 'begin': state.tx = 'INTRANS'; return answer('BEGIN', state.tx)
      case 'capture_baseline': return answer('SELECT 1', state.tx, ['snapshot'], [3802], [[copy(original)]])
      case 'capture_primary_backend': return answer('SELECT 1', state.tx,
        ['primary_backend_pid', 'primary_backend_start'], [23, 25], [[71, '2026-10-03 00:00:00+00']])
      case 'inspect_public_row_counts': return answer('SELECT 1', state.tx, ['selected_count', 'unrelated_count'], [20, 20],
        [[variant === 'public_count_mismatch' ? 2 : 1, 1]])
      case 'verify_private_logging_guard': state.logged = true; return boolAnswer(phase)
      case 'capture_private_security': {
        const value = copy(originalSecurity)
        if (variant === 'wrong_private_security') value.relation.force_rls = false
        return answer('SELECT 1', state.tx, ['private_snapshot'], [3802], [[value]])
      }
      case 'inspect_private_row_guards': return answer('SELECT 1', state.tx, COUNTS,
        [20, 20, 16, 16, 20, 20, 20, 20], [[1, 1, true, variant !== 'source_guard_false', 1, 1, 1, 0]])
      case 'capture_private_rows': return answer('SELECT 1', state.tx, ['private_rows'], [3802], [[copy(originalRows)]])
      case 'grant_set_membership':
        if (state.membership) fail('DUPLICATE_GRANT')
        state.current.memberships.push({ roleid: '20', role: 'mip_cutover_schema_owner_v1', member: '10', member_name: 'postgres',
          grantor: '10', grantor_name: 'postgres', admin: false, inherit: false, set: true })
        state.membership = true; return answer('GRANT ROLE', state.tx)
      case 'set_owner_for_grant': case 'set_owner_for_cleanup':
        state.current.identity.current_user = 'mip_cutover_schema_owner_v1'; return answer('SET', state.tx)
      case 'grant_column_update':
        if (!state.membership || state.current.identity.current_user !== 'mip_cutover_schema_owner_v1') fail('WRONG_GRANTOR')
        state.current.columns[1].acl_raw.push('postgres=w/mip_cutover_schema_owner_v1')
        state.current.effective.update_connection = true; state.update = true; return answer('GRANT', state.tx)
      case 'reset_role_for_operation': case 'reset_role_after_cleanup':
        state.current.identity.current_user = 'postgres'; return answer('RESET', state.tx)
      case 'set_statement_deadline': state.current.deadlines.statement_timeout = '7s'; return answer('SET', state.tx)
      case 'set_lock_deadline': state.current.deadlines.lock_timeout = '500ms'; return answer('SET', state.tx)
      case 'observe_operation_context':
        return boolAnswer(phase, [state.current.identity.current_user === 'postgres', true, state.update,
          state.current.deadlines.statement_timeout === '7s', state.current.deadlines.lock_timeout === '500ms'])
      case 'guarded_operation':
        if (!state.update || state.current.deadlines.statement_timeout !== '7s' || state.current.deadlines.lock_timeout !== '500ms') fail('OPERATION_CONTEXT_INVALID')
        state.rows[0].connection_string = `${SECRET}_TEST_ONLY_TRANSFORMED`; return answer('DO', state.tx)
      case 'verify_private_transformed_rows':
        return boolAnswer(phase, [true, true, true, true,
          state.rows[0].connection_string === `${SECRET}_TEST_ONLY_TRANSFORMED`, true, true])
      case 'revoke_introduced_column_update':
        if (!state.update || state.current.identity.current_user !== 'mip_cutover_schema_owner_v1') fail('WRONG_CLEANUP_GRANTOR')
        state.current.columns[1].acl_raw = state.current.columns[1].acl_raw.filter(a => a !== 'postgres=w/mip_cutover_schema_owner_v1')
        state.current.effective.update_connection = original.effective.update_connection; state.update = false; return answer('REVOKE', state.tx)
      case 'revoke_introduced_set_membership':
        if (!state.membership || state.current.identity.current_user !== 'postgres') fail('WRONG_CLEANUP_GRANTOR')
        state.current.memberships = state.current.memberships.filter(m => !(m.roleid === '20' && m.member === '10' && m.grantor === '10'))
        state.membership = false; state.introducedThenRemoved = isDeepStrictEqual(state.current.memberships, original.memberships)
          && isDeepStrictEqual(state.current.columns, original.columns)
        return answer('REVOKE ROLE', state.tx)
      case 'restore_statement_deadline': state.current.deadlines.statement_timeout = parameters[0]; return boolAnswer(phase)
      case 'restore_lock_deadline': state.current.deadlines.lock_timeout = parameters[0]; return boolAnswer(phase)
      case 'verify_authority_restored': case 'verify_primary_session_rollback': case 'verify_security_rollback': {
        const current = privateSecurity(state.current), before = copy(originalSecurity)
        if (id === 'verify_security_rollback') { delete current.deadlines; delete before.deadlines }
        return boolAnswer(phase, [true, isDeepStrictEqual(current, before), !state.current.effective.update_connection,
          state.current.relation.rls && state.current.relation.force_rls])
      }
      case 'rollback':
        state.current = copy(original); state.rows = copy(originalRows); state.tx = 'IDLE'
        state.membership = false; state.update = false; return answer('ROLLBACK', 'IDLE')
      case 'verify_private_rollback_rows': {
        const good = isDeepStrictEqual(state.rows, originalRows) && variant !== 'unrelated_row_drift'
        return boolAnswer(phase, [true, true, true, true, good, good, good])
      }
      case 'verify_primary_completion': return boolAnswer(phase, [true, true, state.tx === 'IDLE', state.tx === 'IDLE'])
      default: fail('FIXTURE_COMMAND_REFUSED')
    }
  }
  return Object.freeze({
    budgets: Object.freeze({ command: 40, operation: 80, rollback: 40, verification: 40, cancelDrain: 40 }),
    approvedCaPath: original.ca_path, primaryContext, verifierContext,
    productionAuthorized: false, authorityBasis: 'CLOSED TEST-ONLY FIXTURE; NO PRODUCTION ROOT',
    authorize(phase, recovery = false) {
      if (recovery && options.recoveryUnavailable) fail('RECOVERY_AUTHORITY_UNAVAILABLE')
      if (recovery && phase.commandId === 'verify_independently') {
        state.verificationAuthorizationCount++
        if (options.recoveryExpiresBeforeFinal && state.verificationAuthorizationCount > 1) fail('RECOVERY_AUTHORITY_UNAVAILABLE')
      }
      if (!recovery && options.staleBeforePhase === phase.commandId) fail('EXECUTION_WINDOW_STALE')
      if (!recovery && options.revokedBeforePhase === phase.commandId) fail('AUTHORITY_REVOKED')
      if (!ids.has(phase.commandId)) fail('PHASE_AUTHORITY_REFUSED')
      return true
    },
    primaryUsable: () => state.connected,
    async execute(phase, parameters) {
      if (state.pending) fail('OUTSTANDING_COMMAND_NOT_DRAINED')
      const originalPhase = [...bundle.successPath, ...bundle.failurePath].find(p => p.commandId === phase.commandId)
      if (!isDeepStrictEqual(phase.submission, originalPhase?.submission)) fail('FIXTURE_SOURCE_DRIFT')
      state.sequence.push(phase.commandId)
      const fault = faults[phase.commandId]
      if (fault?.type === 'disconnect') {
        state.connected = false; state.current = copy(original); state.rows = copy(originalRows); state.tx = 'IDLE'
        fail('DISCONNECTED', true)
      }
      if (fault?.type === 'timeout' || fault?.type === 'uncertain') {
        state.pending = phase.commandId
        if (fault.type === 'timeout') return new Promise(() => {})
        fail('COMPLETION_UNCERTAIN')
      }
      if (fault?.type === 'error') { state.tx = 'INERROR'; fail(CONFIG_SECRET) }
      let result = complete(phase, parameters)
      if (fault?.type === 'wrong_tag') result.commandTag = 'COMMIT'
      if (fault?.type === 'wrong_shape') result.rows.push([])
      if (fault?.type === 'bad_tx') result.transactionStatus = 'ACTIVE'
      if (fault?.type === 'bad_ack') result.completed = false
      const changedColumn = fault?.column === undefined ? 0 : result.columnNames.indexOf(fault.column)
      if (fault?.type === 'null_boolean') result.rows[0][changedColumn] = null
      if (fault?.type === 'false_boolean') result.rows[0][changedColumn] = false
      if (fault?.type === 'missing_boolean') { result.columnNames.pop(); result.typeOids.pop(); result.rows[0].pop() }
      if (fault?.type === 'wrong_type_oid') result.typeOids[0] = 25
      if (fault?.type === 'extra_boolean') {
        result.columnNames.push('unexpected'); result.typeOids.push(16); result.rows[0].push(true)
      }
      return result
    },
    async cancelAndDrain() {
      state.sequence.push('cancel_and_drain')
      if (!state.connected) fail('DISCONNECTED', true)
      if (faults.cancel_and_drain?.type === 'undrained') return { ...answer('CANCEL_AND_DRAIN', state.tx),
        drained: false, cancelDispatched: false, cancelCode: 'CANCEL_FAILED' }
      if (faults.cancel_and_drain?.type === 'error') fail(CONFIG_SECRET)
      const dispatched = state.pending !== null && faults.cancel_and_drain?.type !== 'cancel_failed'
      state.pending = null
      if (state.tx === 'INTRANS') state.tx = 'INERROR'
      return { ...answer('CANCEL_AND_DRAIN', state.tx), drained: true, cancelDispatched: dispatched,
        cancelCode: faults.cancel_and_drain?.type === 'cancel_failed' ? 'CANCEL_FAILED' : null }
    },
    async openVerifier() { state.verifierOpened = true; return verifierContext },
    async finish() { state.pending = null; state.connected = false },
    evidence: () => ({ introducedGrantorsPreserved: state.introducedThenRemoved,
      privateBaselineBindingChecks: state.baselineUses, parameterBindingsChecked: state.parameterBindingsChecked }),
  })
}
