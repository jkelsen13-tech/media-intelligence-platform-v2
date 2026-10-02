// SOURCE QUALIFICATION ONLY. Closed in-memory adapter; no SQL/network/connect API.
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'

export const SOURCE_HASHES = Object.freeze({
  guardedOperation: '5be14204dbd68b44ccaba07222bd6a5b4f9d9f627ce4750fce596211e6d6fb46',
  preSubmitDeadlines: '2ac3ca583a82fc717cca12b9f64d40019339b3be7c2aeefb0948473a5336518d',
})
const adapters = new WeakMap()
const clone = value => structuredClone(value)
const LIVE_INPUTS = Object.freeze([
  'trustedEvidenceAuthorityBinding', 'freshManagedIdentityAndAllGrantorBaseline',
  'exactSourceValueAndUnrelatedRowsPrivateBaseline', 'preciseProviderSetAndMissingColumnUpdatePermission',
  'caPathDigestReadability', 'certificateChainHostnameAndDistinctAuditorTls',
  'dblinkDetailAndServerLogSecrecyEvidence', 'secureCaptureAndExecutorClientWindow',
  'boundedRollbackOnlyOwnerAuthorization', 'independentPostRollbackVerifier', 'exactReviewedSourceClientAndManifestHashes',
])
const IDS = Object.freeze([
  'begin', 'capture_baseline', 'grant_set_membership', 'set_owner_for_grant', 'grant_column_update',
  'reset_role_for_operation', 'set_statement_deadline', 'set_lock_deadline', 'guarded_operation',
  'set_owner_for_cleanup', 'revoke_introduced_column_update', 'reset_role_after_cleanup',
  'revoke_introduced_set_membership', 'verify_authority_restored', 'rollback', 'verify_independently', 'cancel_and_drain',
])
const FIXED_CODES = new Set(['COMMAND_FAILED', 'DISCONNECTED', 'COMMAND_TIMEOUT', 'COMMAND_ACK_INVALID',
  'CANCEL_ACK_MISSING', 'ROLLBACK_ACK_MISSING', 'INDEPENDENT_VERIFICATION_FAILED', 'AUTHORITY_RESTORATION_FAILED',
  'BASELINE_REFUSED', 'SOURCE_DRIFT', 'MANIFEST_REFUSED', 'ADAPTER_REFUSED'])

export async function loadSyntheticManifest() {
  const manifest = JSON.parse(await readFile(new URL('./required-inputs.json', import.meta.url), 'utf8'))
  for (const [name, path] of [
    ['guardedOperation', '../qik-audit-route-transform-proposal-20261002.sql'],
    ['preSubmitDeadlines', '../qik-audit-route-pre-submit-deadlines-20261002.sql'],
  ]) {
    const bytes = await readFile(new URL(path, import.meta.url))
    if (createHash('sha256').update(bytes).digest('hex') !== SOURCE_HASHES[name]) throw new Error('SOURCE_DRIFT')
  }
  return manifest
}

// Presence in a JSON object is not evidence or authorization. This package has
// no implementation of a trusted live binding, even if every field is populated.
export function assessLiveReadiness(manifest) {
  return {
    ready: false, code: 'UNBOUND_NO_LIVE_ADAPTER',
    missingInputNames: LIVE_INPUTS.filter(name => manifest?.liveRequiredInputs?.[name] == null),
    unverifiedInputNames: LIVE_INPUTS.filter(name => manifest?.liveRequiredInputs?.[name] != null),
  }
}

// Complete raw ACL values intentionally preserve null versus '{}'. The member
// snapshot includes every grantor/options row, not only the provider grant.
export function syntheticBaseline({ connectionAclRaw = null, preexistingUpdate = false, bypassRls = true } = {}) {
  if (connectionAclRaw !== null && connectionAclRaw !== '{}'
    && connectionAclRaw !== '{synthetic_reader=x/synthetic_owner}') throw new Error('BASELINE_REFUSED')
  return {
    marker: 'synthetic-unbound-baseline-1',
    session: { sessionUser: 'postgres', currentUser: 'postgres', database: 'synthetic_only', settings: { statementTimeout: '0', lockTimeout: '0' } },
    roles: [{ name: 'postgres', superuser: false, bypassRls }, { name: 'synthetic_owner', superuser: false, bypassRls: false }],
    relation: { owner: 'synthetic_owner', rls: true, forceRls: true,
      aclRaw: '{synthetic_owner=arwdDxtm/synthetic_owner,synthetic_reader=r/synthetic_owner}' },
    columns: [{ name: 'id', attnum: 1, aclRaw: null }, { name: 'connection_string', attnum: 2, aclRaw: connectionAclRaw }],
    memberships: [
      { role: 'synthetic_owner', member: 'postgres', grantor: 'synthetic_provider', admin: true, inherit: false, set: false },
      { role: 'synthetic_reader', member: 'postgres', grantor: 'synthetic_bootstrap', admin: false, inherit: true, set: false },
    ],
    policies: [{ name: 'synthetic_force_policy', roles: ['synthetic_factual_owner'], command: '*', using: 'false', check: 'false', permissive: true }],
    effective: { selectId: true, selectConnection: true, updateConnection: preexistingUpdate },
    rows: [{ id: true, value: 'synthetic-before' }, { id: false, value: 'synthetic-unrelated' }],
  }
}

function validBaseline(baseline) {
  if (baseline?.marker !== 'synthetic-unbound-baseline-1' || baseline.session?.sessionUser !== 'postgres'
    || baseline.session?.currentUser !== 'postgres' || baseline.session?.database !== 'synthetic_only'
    || !Array.isArray(baseline.roles) || !Array.isArray(baseline.memberships) || !Array.isArray(baseline.columns)
    || !Array.isArray(baseline.policies) || !Array.isArray(baseline.rows)) return false
  const postgres = baseline.roles.find(r => r.name === 'postgres'), owner = baseline.roles.find(r => r.name === 'synthetic_owner')
  return postgres?.superuser === false && postgres.bypassRls === true && owner?.superuser === false && owner.bypassRls === false
    && baseline.relation?.owner === 'synthetic_owner' && baseline.relation.rls === true && baseline.relation.forceRls === true
    && (baseline.relation.aclRaw === null || typeof baseline.relation.aclRaw === 'string')
    && typeof baseline.session.settings?.statementTimeout === 'string' && typeof baseline.session.settings?.lockTimeout === 'string'
    && baseline.effective?.selectId === true && baseline.effective.selectConnection === true
    && typeof baseline.effective.updateConnection === 'boolean'
    && baseline.rows.filter(r => r.id === true).length === 1
    && baseline.rows.every(r => typeof r.id === 'boolean' && ['synthetic-before', 'synthetic-unrelated'].includes(r.value))
    && baseline.memberships.every(r => r.member === 'postgres' && typeof r.grantor === 'string'
      && typeof r.admin === 'boolean' && typeof r.inherit === 'boolean' && typeof r.set === 'boolean')
    && baseline.columns.every(c => typeof c.name === 'string' && Number.isInteger(c.attnum) && (c.aclRaw === null || typeof c.aclRaw === 'string'))
    && baseline.columns.filter(c => c.name === 'id').length === 1 && baseline.columns.filter(c => c.name === 'connection_string').length === 1
    && new Set(baseline.memberships.map(r => JSON.stringify([r.role, r.member, r.grantor]))).size === baseline.memberships.length
}

function safeError(code, aborted = false) {
  const error = new Error(code); error.fixedCode = code; error.transactionAborted = aborted; return error
}
const failureCode = error => FIXED_CODES.has(error?.fixedCode) ? error.fixedCode : 'COMMAND_FAILED'

// Fault data is inert. No callback, client URL, credential, SQL driver or injected
// executor is accepted. The returned object is privately branded in this module.
export function createSyntheticAdapter(options = {}) {
  if (options === null || typeof options !== 'object' || Object.keys(options).some(key => !['baseline', 'faults'].includes(key))) throw new Error('ADAPTER_REFUSED')
  const { baseline = syntheticBaseline(), faults = {} } = options
  if (!validBaseline(baseline) || faults === null || typeof faults !== 'object' || Object.keys(faults).some(id => !IDS.includes(id))) throw new Error('BASELINE_REFUSED')
  if (Object.values(faults).some(f => !f || !['disconnect', 'timeout', 'late', 'abort', 'secret_error', 'bad_ack', 'negative_verify'].includes(f.type)
    || (f.delayMs !== undefined && (!Number.isInteger(f.delayMs) || f.delayMs < 1 || f.delayMs > 30000)))) throw new Error('ADAPTER_REFUSED')
  const state = { original: clone(baseline), current: clone(baseline), transaction: false, aborted: false, connected: true,
    generation: 0, pending: null, introducedMembership: false, introducedUpdate: false, commands: [], history: [] }
  const adapter = Object.freeze({ inspect: () => clone({ snapshot: state.current, commands: state.commands, history: state.history,
    transaction: state.transaction, aborted: state.aborted, connected: state.connected }) })
  const mutation = id => {
    if (!state.connected) throw safeError('DISCONNECTED')
    if (state.aborted && !['rollback', 'cancel_and_drain', 'verify_independently'].includes(id)) throw safeError('COMMAND_FAILED', true)
    const acknowledge = detail => ({ commandId: id, acknowledged: true, ...detail })
    const ownerActive = () => state.current.session.currentUser === 'synthetic_owner'
    switch (id) {
      case 'begin': state.transaction = true; return acknowledge({ transactionState: 'open' })
      case 'capture_baseline': return acknowledge({ snapshot: clone(state.original) })
      case 'grant_set_membership':
        state.current.memberships.push({ role: 'synthetic_owner', member: 'postgres', grantor: 'postgres', admin: false, inherit: false, set: true })
        state.introducedMembership = true; break
      case 'set_owner_for_grant': case 'set_owner_for_cleanup': state.current.session.currentUser = 'synthetic_owner'; break
      case 'grant_column_update':
        if (!ownerActive()) throw safeError('COMMAND_FAILED', true)
        state.current.columns.find(c => c.name === 'connection_string').aclRaw = '{synthetic-temporary-update}'
        state.current.effective.updateConnection = true; state.introducedUpdate = true; break
      case 'reset_role_for_operation': case 'reset_role_after_cleanup':
        state.current.session.currentUser = state.current.session.sessionUser
        return acknowledge({ currentUser: state.current.session.currentUser, superuser: false,
          bypassRls: state.current.roles.find(r => r.name === 'postgres').bypassRls })
      case 'set_statement_deadline': state.current.session.settings.statementTimeout = '7000ms'; break
      case 'set_lock_deadline': state.current.session.settings.lockTimeout = '500ms'; break
      case 'guarded_operation':
        if (state.current.session.currentUser !== 'postgres' || !state.current.effective.updateConnection
          || state.current.session.settings.statementTimeout !== '7000ms' || state.current.session.settings.lockTimeout !== '500ms') throw safeError('COMMAND_FAILED', true)
        state.current.rows.find(r => r.id === true).value = 'synthetic-after'
        return acknowledge({ selectedCount: 1, updateCount: 1, unrelatedRowsPreserved: true, syntheticOnly: true })
      case 'revoke_introduced_column_update':
        if (!ownerActive() || !state.introducedUpdate) throw safeError('COMMAND_FAILED', true)
        state.current.columns.find(c => c.name === 'connection_string').aclRaw = state.original.columns.find(c => c.name === 'connection_string').aclRaw
        state.current.effective.updateConnection = state.original.effective.updateConnection
        state.introducedUpdate = false; break
      case 'revoke_introduced_set_membership':
        if (state.current.session.currentUser !== 'postgres' || !state.introducedMembership) throw safeError('COMMAND_FAILED', true)
        state.current.memberships = state.current.memberships.filter(r => !(r.role === 'synthetic_owner' && r.member === 'postgres' && r.grantor === 'postgres'))
        state.introducedMembership = false; break
      case 'verify_authority_restored': {
        const authority = b => ({ ...b, rows: null, session: { ...b.session, settings: null } })
        return acknowledge({ restored: isDeepStrictEqual(authority(state.current), authority(state.original)) })
      }
      case 'rollback':
        state.current = clone(state.original); state.transaction = false; state.aborted = false
        state.introducedMembership = false; state.introducedUpdate = false
        return acknowledge({ transactionState: 'idle', rolledBack: true })
      case 'verify_independently':
        return acknowledge({ independent: true, baselineMatches: !state.transaction && isDeepStrictEqual(state.current, state.original) })
      case 'cancel_and_drain':
        state.generation++; state.pending = null; state.aborted = state.transaction
        return acknowledge({ drained: true, transactionState: state.aborted ? 'aborted' : 'idle' })
      default: throw safeError('COMMAND_FAILED')
    }
    return acknowledge({ transactionState: state.transaction ? 'open' : 'idle' })
  }
  adapters.set(adapter, {
    used: false,
    async execute(id) {
      state.commands.push(id)
      const fault = faults[id], generation = state.generation
      if (fault?.type === 'disconnect') { state.connected = false; throw safeError('DISCONNECTED') }
      if (fault?.type === 'timeout' || fault?.type === 'late') {
        state.pending = id
        await new Promise(resolve => setTimeout(resolve, fault.delayMs ?? 40))
        if (generation !== state.generation) { state.history.push({ commandId: id, discarded: true }); throw safeError('COMMAND_FAILED', state.aborted) }
        state.pending = null
      }
      const result = mutation(id)
      state.history.push({ commandId: id, snapshot: clone(state.current) })
      if (fault?.type === 'abort') { state.aborted = state.transaction; throw safeError('COMMAND_FAILED', state.aborted) }
      if (fault?.type === 'secret_error') { state.aborted = state.transaction; throw new Error(fault.message ?? 'synthetic-secret') }
      if (fault?.type === 'bad_ack') return { commandId: 'wrong', acknowledged: false }
      if (fault?.type === 'negative_verify') return { ...result, restored: false, baselineMatches: false }
      return result
    },
  })
  return adapter
}

function validateManifest(manifest) {
  if (manifest === null || typeof manifest !== 'object' || Object.keys(manifest).some(key => ![
    'contractVersion', 'mode', 'networkMode', 'frozenPredecessor', 'sourceHashes', 'clientDeadlinesMs', 'liveRequiredInputs',
  ].includes(key))) throw safeError('MANIFEST_REFUSED')
  if (manifest?.contractVersion !== 'audit-route-client-source-1' || manifest.mode !== 'synthetic-unbound'
    || manifest.networkMode !== 'none' || manifest.frozenPredecessor !== '1021d5c8dd6114907981994ce15d38a1daac1f4a'
    || !isDeepStrictEqual(manifest.sourceHashes, SOURCE_HASHES)
    || !isDeepStrictEqual(Object.keys(manifest.liveRequiredInputs ?? {}).sort(), [...LIVE_INPUTS].sort())) throw safeError('MANIFEST_REFUSED')
  for (const name of ['command', 'operation', 'rollback', 'verification', 'cancelDrain']) {
    const ms = manifest.clientDeadlinesMs?.[name]
    if (!Number.isInteger(ms) || ms < 1 || ms > 30000) throw safeError('MANIFEST_REFUSED')
  }
  if (Object.keys(manifest.clientDeadlinesMs).some(name => !['command', 'operation', 'rollback', 'verification', 'cancelDrain'].includes(name))) throw safeError('MANIFEST_REFUSED')
  // Self-attested input claims cannot be promoted through simulation.
  if (LIVE_INPUTS.some(name => manifest.liveRequiredInputs[name] !== null)) throw safeError('MANIFEST_REFUSED')
}

export async function runSyntheticRollbackRehearsal(manifest, adapter) {
  const events = [], api = adapters.get(adapter)
  let begun = false, code = null, rollbackAcknowledged = false, verified = false, operationAcknowledged = false
  let connected = true, drained = true, baseline = null
  const record = (commandId, status) => events.push({ commandId, status })
  const command = async (id, budget) => {
    record(id, 'submitted')
    let timer
    try {
      const response = await Promise.race([api.execute(id), new Promise((_, reject) => {
        timer = setTimeout(() => reject(safeError('COMMAND_TIMEOUT')), budget)
      })])
      if (response?.commandId !== id || response.acknowledged !== true) throw safeError('COMMAND_ACK_INVALID')
      record(id, 'acknowledged'); return response
    } catch (error) {
      const failure = failureCode(error); record(id, failure)
      if (failure === 'DISCONNECTED') connected = false
      if (failure === 'COMMAND_TIMEOUT') drained = false
      throw safeError(failure)
    } finally { clearTimeout(timer) }
  }
  const cancelPending = async () => {
    try { drained = (await command('cancel_and_drain', manifest.clientDeadlinesMs.cancelDrain)).drained === true }
    catch { drained = false }
  }
  try {
    if (!api) throw safeError('ADAPTER_REFUSED')
    validateManifest(manifest)
    if (api.used) throw safeError('ADAPTER_REFUSED')
    api.used = true // One session/attempt: never replay a lost or unknown outcome.
    const deadlines = manifest.clientDeadlinesMs
    // Mark attempted BEGIN before awaiting it: lost acknowledgment cannot prove
    // the transaction never opened, so recovery must still attempt rollback.
    begun = true
    await command('begin', deadlines.command)
    baseline = (await command('capture_baseline', deadlines.command)).snapshot
    if (!validBaseline(baseline)) throw safeError('BASELINE_REFUSED')
    const needsUpdate = !baseline.effective.updateConnection
    const existingSelf = baseline.memberships.filter(r => r.role === 'synthetic_owner' && r.grantor === 'postgres')
    let addMembership = false
    if (needsUpdate) {
      if (existingSelf.length > 1 || existingSelf.some(r => r.admin || r.inherit || !r.set)) throw safeError('BASELINE_REFUSED')
      addMembership = existingSelf.length === 0
      if (addMembership && !baseline.memberships.some(r => r.role === 'synthetic_owner' && r.admin)) throw safeError('BASELINE_REFUSED')
      if (addMembership) await command('grant_set_membership', deadlines.command)
      await command('set_owner_for_grant', deadlines.command)
      await command('grant_column_update', deadlines.command)
    }
    const reset = await command('reset_role_for_operation', deadlines.command)
    if (reset.currentUser !== 'postgres' || reset.superuser !== false || reset.bypassRls !== true) throw safeError('BASELINE_REFUSED')
    // Each completed SET is a separate command before operation submission.
    await command('set_statement_deadline', deadlines.command)
    await command('set_lock_deadline', deadlines.command)
    const operation = await command('guarded_operation', deadlines.operation)
    if (operation.selectedCount !== 1 || operation.updateCount !== 1 || operation.unrelatedRowsPreserved !== true || operation.syntheticOnly !== true) throw safeError('COMMAND_ACK_INVALID')
    operationAcknowledged = true
    if (needsUpdate) {
      await command('set_owner_for_cleanup', deadlines.command)
      await command('revoke_introduced_column_update', deadlines.command)
      await command('reset_role_after_cleanup', deadlines.command)
      if (addMembership) await command('revoke_introduced_set_membership', deadlines.command)
    }
    if ((await command('verify_authority_restored', deadlines.verification)).restored !== true) throw safeError('AUTHORITY_RESTORATION_FAILED')
  } catch (error) {
    code = failureCode(error)
    if (begun && connected && code === 'COMMAND_TIMEOUT') {
      await cancelPending()
      if (!drained) code = 'CANCEL_ACK_MISSING'
    }
  } finally {
    // There is deliberately no commit branch. Aborted transactions skip success
    // cleanup and go to rollback; missing/drifting acknowledgments stay UNKNOWN.
    if (begun && connected && drained) {
      try {
        const r = await command('rollback', manifest.clientDeadlinesMs.rollback)
        rollbackAcknowledged = r.rolledBack === true && r.transactionState === 'idle'
      } catch {
        // Fence/drain a timed-out rollback before verification. Its missing
        // acknowledgment still forces UNKNOWN; rollback is never retried here.
        if (!drained && connected) await cancelPending()
      }
    }
    if (begun && connected && drained && api) {
      try {
        const v = await command('verify_independently', manifest.clientDeadlinesMs.verification)
        verified = v.independent === true && v.baselineMatches === true
      } catch { /* Verification cannot manufacture an acknowledgment. */ }
    }
  }
  const outcome = !begun ? 'REFUSED' : !connected || !drained || !rollbackAcknowledged || !verified ? 'UNKNOWN'
    : code ? 'ABORT_ROLLED_BACK' : 'REHEARSAL_ROLLED_BACK'
  if (outcome === 'UNKNOWN' && !code) code = !rollbackAcknowledged ? 'ROLLBACK_ACK_MISSING' : 'INDEPENDENT_VERIFICATION_FAILED'
  return Object.freeze({ contractVersion: 'audit-route-client-source-1', mode: 'synthetic-unbound', networkMode: 'none',
    liveReady: false, outcome, code, operationAcknowledged, rollbackAcknowledged, independentlyVerified: verified, events })
}
