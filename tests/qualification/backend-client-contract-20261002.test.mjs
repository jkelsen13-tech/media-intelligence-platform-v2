import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import {
  SOURCE_HASHES, SOURCE_DEADLINES, loadSyntheticManifest, assessLiveReadiness, syntheticBaseline,
  createSyntheticAdapter, runSyntheticRollbackRehearsal,
} from '../../scripts/qualification/backend-client-contract/contract.mjs'

const run = async (options = {}, mutateManifest) => {
  const manifest = await loadSyntheticManifest()
  mutateManifest?.(manifest)
  const adapter = createSyntheticAdapter(options)
  return { receipt: await runSyntheticRollbackRehearsal(manifest, adapter), adapter, manifest }
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const phase = (adapter, id) => adapter.inspect().history.find(h => h.commandId === id).snapshot

test('held guarded DO and pre-submit fragment retain exact predecessor bytes', async () => {
  for (const [key, path] of [['guardedOperation', '../../scripts/qualification/qik-audit-route-transform-proposal-20261002.sql'],
    ['preSubmitDeadlines', '../../scripts/qualification/qik-audit-route-pre-submit-deadlines-20261002.sql']]) {
    const bytes = await readFile(new URL(path, import.meta.url))
    assert.equal(createHash('sha256').update(bytes).digest('hex'), SOURCE_HASHES[key])
  }
})

test('modeled statement and lock deadlines are pinned to the unchanged pre-submit fragment', async () => {
  const fragment = await readFile(new URL('../../scripts/qualification/qik-audit-route-pre-submit-deadlines-20261002.sql', import.meta.url), 'utf8')
  assert.equal(SOURCE_DEADLINES.statementTimeout, fragment.match(/^SET LOCAL statement_timeout = '(\d+ms)';$/m)?.[1])
  assert.equal(SOURCE_DEADLINES.lockTimeout, fragment.match(/^SET LOCAL lock_timeout = '(\d+ms)';$/m)?.[1])
  const { adapter } = await run()
  assert.equal(phase(adapter, 'set_statement_deadline').session.settings.statementTimeout, SOURCE_DEADLINES.statementTimeout)
  assert.equal(phase(adapter, 'set_lock_deadline').session.settings.lockTimeout, SOURCE_DEADLINES.lockTimeout)
})

test('required manifest records missing genuine inputs and self-attestations cannot qualify live execution', async () => {
  const manifest = await loadSyntheticManifest(), readiness = assessLiveReadiness(manifest)
  assert.equal(readiness.ready, false); assert.equal(readiness.code, 'UNBOUND_NO_LIVE_ADAPTER')
  assert.equal(readiness.missingInputNames.length, 11)
  for (const key of Object.keys(manifest.liveRequiredInputs)) manifest.liveRequiredInputs[key] = { approved: true, evidenceRef: 'self-asserted' }
  const claimed = assessLiveReadiness(manifest)
  assert.equal(claimed.ready, false); assert.equal(claimed.unverifiedInputNames.length, 11)
  const adapter = createSyntheticAdapter(), receipt = await runSyntheticRollbackRehearsal(manifest, adapter)
  assert.equal(receipt.outcome, 'REFUSED'); assert.equal(receipt.code, 'MANIFEST_REFUSED')
  assert.deepEqual(adapter.inspect().commands, [])
})

test('closed synthetic adapter rejects arbitrary live-shaped adapters and route options', async () => {
  const manifest = await loadSyntheticManifest()
  let called = false
  const impostor = { networkMode: 'none', synthetic: true, execute: () => { called = true } }
  assert.equal((await runSyntheticRollbackRehearsal(manifest, impostor)).code, 'ADAPTER_REFUSED')
  assert.equal(called, false)
  for (const options of [{ url: 'forbidden' }, { connectionString: 'forbidden' }, { execute: () => {} }, { credentials: {} }]) {
    assert.throws(() => createSyntheticAdapter(options), /ADAPTER_REFUSED/)
  }
  manifest.mode = 'live'
  assert.equal((await runSyntheticRollbackRehearsal(manifest, createSyntheticAdapter())).outcome, 'REFUSED')
})

test('one-shot adapter rejects concurrent or repeated client attempts without replaying commands', async () => {
  const manifest = await loadSyntheticManifest(), adapter = createSyntheticAdapter()
  const receipts = await Promise.all([runSyntheticRollbackRehearsal(manifest, adapter), runSyntheticRollbackRehearsal(manifest, adapter)])
  assert.equal(receipts.filter(r => r.outcome === 'REHEARSAL_ROLLED_BACK').length, 1)
  assert.equal(receipts.filter(r => r.outcome === 'REFUSED' && r.code === 'ADAPTER_REFUSED').length, 1)
  const before = adapter.inspect().commands
  assert.equal((await runSyntheticRollbackRehearsal(manifest, adapter)).outcome, 'REFUSED')
  assert.deepEqual(adapter.inspect().commands, before)
})

for (const aclRaw of [null, '{}', '{synthetic_reader=x/synthetic_owner}']) {
  test(`success preserves exact raw ACL ${String(aclRaw)}, all grantors, flags and unrelated rows`, async () => {
    const baseline = syntheticBaseline({ connectionAclRaw: aclRaw })
    baseline.columns[0].aclRaw = '{synthetic_reader=x/synthetic_owner}'
    const { receipt, adapter } = await run({ baseline })
    assert.equal(receipt.outcome, 'REHEARSAL_ROLLED_BACK')
    assert.equal(receipt.liveReady, false); assert.equal(receipt.operationAcknowledged, true)
    assert.equal(receipt.rollbackAcknowledged, true); assert.equal(receipt.independentlyVerified, true)
    assert.deepEqual(adapter.inspect().snapshot, baseline)
    const temporary = phase(adapter, 'grant_set_membership')
    assert.deepEqual(temporary.memberships.slice(0, baseline.memberships.length), baseline.memberships)
    assert.deepEqual(temporary.memberships.at(-1), { role: 'synthetic_owner', member: 'postgres', grantor: 'postgres', admin: false, inherit: false, set: true })
    assert.deepEqual(temporary.roles, baseline.roles); assert.deepEqual(temporary.relation, baseline.relation)
    const operation = phase(adapter, 'guarded_operation')
    assert.equal(operation.session.currentUser, 'postgres')
    assert.deepEqual(operation.roles, baseline.roles)
    assert.equal(operation.rows.find(r => r.id === false).value, 'synthetic-unrelated')
    const cleaned = phase(adapter, 'verify_authority_restored')
    assert.deepEqual(cleaned.columns, baseline.columns); assert.deepEqual(cleaned.memberships, baseline.memberships)
    assert.equal(cleaned.effective.updateConnection, false)
    for (const { commandId, snapshot } of adapter.inspect().history) {
      if (!snapshot) continue
      assert.deepEqual(snapshot.columns.find(c => c.name === 'id'), baseline.columns[0], commandId)
      if (aclRaw !== null && aclRaw !== '{}') {
        assert.ok(snapshot.columns.find(c => c.name === 'connection_string').aclRaw.includes('synthetic_reader=x/synthetic_owner'),
          `unrelated connection_string grant must survive ${commandId}`)
      }
    }
    const duringGrant = phase(adapter, 'grant_column_update').columns.find(c => c.name === 'connection_string').aclRaw
    assert.ok(duringGrant.includes('postgres=w/synthetic_owner'), 'temporary grant is the exact postgres UPDATE from the owner')
    const commands = adapter.inspect().commands
    assert.ok(commands.indexOf('verify_authority_restored') < commands.indexOf('rollback'))
    assert.ok(commands.indexOf('rollback') < commands.indexOf('verify_independently'))
    assert.equal(commands.some(c => /commit/i.test(c)), false)
    for (const id of ['set_statement_deadline', 'set_lock_deadline']) {
      assert.ok(receipt.events.findIndex(e => e.commandId === id && e.status === 'acknowledged')
        < receipt.events.findIndex(e => e.commandId === 'guarded_operation' && e.status === 'submitted'))
    }
  })
}

test('pre-existing UPDATE or exact SET-only membership is preserved without unnecessary authority changes', async () => {
  for (const connectionAclRaw of ['{}', '{synthetic_reader=x/synthetic_owner}']) {
    const withUpdate = syntheticBaseline({ preexistingUpdate: true, connectionAclRaw })
    const first = await run({ baseline: withUpdate })
    assert.equal(first.receipt.outcome, 'REHEARSAL_ROLLED_BACK')
    for (const id of ['grant_set_membership', 'grant_column_update', 'revoke_introduced_column_update', 'revoke_introduced_set_membership']) {
      assert.equal(first.adapter.inspect().commands.includes(id), false)
    }
    for (const { commandId, snapshot } of first.adapter.inspect().history) {
      if (snapshot) assert.deepEqual(snapshot.columns, withUpdate.columns, commandId)
    }
    assert.deepEqual(first.adapter.inspect().snapshot, withUpdate)
  }
  const baseline = syntheticBaseline()
  baseline.memberships.push({ role: 'synthetic_owner', member: 'postgres', grantor: 'postgres', admin: false, inherit: false, set: true })
  const second = await run({ baseline })
  assert.equal(second.receipt.outcome, 'REHEARSAL_ROLLED_BACK')
  assert.equal(second.adapter.inspect().commands.includes('grant_set_membership'), false)
  assert.equal(second.adapter.inspect().commands.includes('revoke_introduced_set_membership'), false)
  assert.deepEqual(second.adapter.inspect().snapshot.memberships, baseline.memberships)
})

test('unrelated connection_string ACL survives abort, cleanup failure and late-operation recovery phases', async () => {
  const baseline = syntheticBaseline({ connectionAclRaw: '{synthetic_reader=x/synthetic_owner}' })
  for (const [commandId, fault] of [
    ['grant_column_update', { type: 'abort' }],
    ['guarded_operation', { type: 'abort' }],
    ['revoke_introduced_column_update', { type: 'abort' }],
    ['guarded_operation', { type: 'late', delayMs: 40 }],
  ]) {
    const { receipt, adapter } = await run({ baseline, faults: { [commandId]: fault } },
      m => { if (fault.type === 'late') m.clientDeadlinesMs.operation = 10 })
    assert.equal(receipt.outcome, 'ABORT_ROLLED_BACK', commandId)
    if (fault.type === 'late') await wait(50)
    for (const phase of adapter.inspect().history) {
      if (!phase.snapshot) continue
      const raw = phase.snapshot.columns.find(c => c.name === 'connection_string').aclRaw
      assert.ok(raw.includes('synthetic_reader=x/synthetic_owner'), `${commandId}: preserve unrelated grant during ${phase.commandId}`)
    }
    assert.deepEqual(adapter.inspect().snapshot, baseline, `${commandId}: exact post-rollback baseline`)
  }
})

test('unknown or inapplicable fault-plan fields are refused rather than claiming their typo was exercised', () => {
  for (const fault of [
    { type: 'late', delayMS: 1 }, { type: 'late', delayMs: 40, typo: 'ignored' },
    { type: 'secret_error', mesage: 'ignored' }, { type: 'abort', delayMs: 1 },
    { type: 'abort', message: 'ignored' },
  ]) {
    assert.throws(() => createSyntheticAdapter({ faults: { guarded_operation: fault } }), /ADAPTER_REFUSED/)
  }
  assert.throws(() => createSyntheticAdapter({ faults: { guarded_operaton: { type: 'abort' } } }), /BASELINE_REFUSED/)
  const baseline = syntheticBaseline()
  baseline.columns.find(c => c.name === 'connection_string').aclRaw = '{unsupported_column_acl}'
  assert.throws(() => createSyntheticAdapter({ baseline }), /BASELINE_REFUSED/)
})

test('multiple original grantors/options for the owner role remain exact through temporary self-grant cleanup', async () => {
  const baseline = syntheticBaseline()
  baseline.memberships.push({ role: 'synthetic_owner', member: 'postgres', grantor: 'synthetic_other_grantor', admin: false, inherit: false, set: false })
  const { receipt, adapter } = await run({ baseline })
  assert.equal(receipt.outcome, 'REHEARSAL_ROLLED_BACK')
  assert.deepEqual(phase(adapter, 'verify_authority_restored').memberships, baseline.memberships)
  assert.deepEqual(adapter.inspect().snapshot, baseline)
  const duplicate = structuredClone(baseline); duplicate.memberships.push(structuredClone(duplicate.memberships[0]))
  assert.throws(() => createSyntheticAdapter({ baseline: duplicate }), /BASELINE_REFUSED/)
})

test('missing SELECT, missing ACL representation and wrong postgres BYPASS flags fail closed', () => {
  const noSelect = syntheticBaseline(); noSelect.effective.selectConnection = false
  const noAcl = syntheticBaseline(); delete noAcl.columns[1].aclRaw
  for (const baseline of [noSelect, noAcl, syntheticBaseline({ bypassRls: false })]) {
    assert.throws(() => createSyntheticAdapter({ baseline }), /BASELINE_REFUSED/)
  }
})

test('missing ADMIN or conflicting self-grant baseline cannot manufacture least authority', async () => {
  for (const conflict of ['admin', 'self']) {
    const baseline = syntheticBaseline()
    if (conflict === 'admin') baseline.memberships[0].admin = false
    else baseline.memberships.push({ role: 'synthetic_owner', member: 'postgres', grantor: 'postgres', admin: true, inherit: false, set: false })
    const { receipt, adapter } = await run({ baseline })
    assert.equal(receipt.outcome, 'ABORT_ROLLED_BACK'); assert.equal(receipt.code, 'BASELINE_REFUSED')
    assert.equal(adapter.inspect().commands.includes('grant_set_membership'), false)
    assert.equal(adapter.inspect().commands.includes('guarded_operation'), false)
    assert.deepEqual(adapter.inspect().snapshot, baseline)
  }
})

for (const id of ['grant_set_membership', 'set_owner_for_grant', 'grant_column_update', 'guarded_operation']) {
  test(`abort during ${id} explicitly rolls back and independently verifies`, async () => {
    const { receipt, adapter } = await run({ faults: { [id]: { type: 'abort' } } })
    assert.equal(receipt.outcome, 'ABORT_ROLLED_BACK'); assert.equal(receipt.code, 'COMMAND_FAILED')
    assert.equal(receipt.rollbackAcknowledged, true); assert.equal(receipt.independentlyVerified, true)
    const commands = adapter.inspect().commands
    assert.deepEqual(commands.slice(commands.indexOf(id) + 1), ['rollback', 'verify_independently'])
    assert.deepEqual(adapter.inspect().snapshot, syntheticBaseline())
  })
}

test('cleanup failure goes directly to unconditional rollback without claiming in-transaction restoration', async () => {
  const { receipt, adapter } = await run({ faults: { revoke_introduced_column_update: { type: 'abort' } } })
  assert.equal(receipt.outcome, 'ABORT_ROLLED_BACK'); assert.equal(receipt.operationAcknowledged, true)
  assert.equal(adapter.inspect().commands.includes('verify_authority_restored'), false)
  assert.deepEqual(adapter.inspect().commands.slice(-2), ['rollback', 'verify_independently'])
  assert.deepEqual(adapter.inspect().snapshot, syntheticBaseline())
})

test('pre-submit command timeout fences late response and never submits guarded operation', async () => {
  const { receipt, adapter } = await run({ faults: { set_statement_deadline: { type: 'late', delayMs: 40 } } }, m => { m.clientDeadlinesMs.command = 10 })
  assert.equal(receipt.outcome, 'ABORT_ROLLED_BACK'); assert.equal(receipt.code, 'COMMAND_TIMEOUT')
  assert.equal(adapter.inspect().commands.includes('guarded_operation'), false)
  assert.deepEqual(adapter.inspect().commands.slice(-3), ['cancel_and_drain', 'rollback', 'verify_independently'])
  await wait(50)
  assert.ok(adapter.inspect().history.some(h => h.commandId === 'set_statement_deadline' && h.discarded))
  assert.deepEqual(adapter.inspect().snapshot, syntheticBaseline())
})

test('late operation acknowledgment cannot become success or mutate state after acknowledged cancel/rollback', async () => {
  const { receipt, adapter } = await run({ faults: { guarded_operation: { type: 'late', delayMs: 40 } } }, m => { m.clientDeadlinesMs.operation = 10 })
  assert.equal(receipt.outcome, 'ABORT_ROLLED_BACK'); assert.equal(receipt.operationAcknowledged, false)
  await wait(50)
  assert.deepEqual(adapter.inspect().snapshot, syntheticBaseline())
  assert.ok(adapter.inspect().history.some(h => h.commandId === 'guarded_operation' && h.discarded))
})

test('missing cancel/drain acknowledgment stays UNKNOWN and does not pipeline rollback behind uncertain work', async () => {
  const { receipt, adapter } = await run({ faults: { guarded_operation: { type: 'late', delayMs: 40 }, cancel_and_drain: { type: 'bad_ack' } } }, m => { m.clientDeadlinesMs.operation = 10 })
  assert.equal(receipt.outcome, 'UNKNOWN'); assert.equal(receipt.code, 'CANCEL_ACK_MISSING')
  assert.equal(receipt.rollbackAcknowledged, false)
  assert.equal(adapter.inspect().commands.includes('rollback'), false)
  await wait(50)
})

test('missing rollback acknowledgment remains UNKNOWN even when independent snapshot matches', async () => {
  const { receipt, adapter } = await run({ faults: { rollback: { type: 'bad_ack' } } })
  assert.equal(receipt.outcome, 'UNKNOWN'); assert.equal(receipt.code, 'ROLLBACK_ACK_MISSING')
  assert.equal(receipt.rollbackAcknowledged, false); assert.equal(receipt.independentlyVerified, true)
  assert.equal(adapter.inspect().commands.filter(id => id === 'rollback').length, 1)
})

test('timed-out rollback is fenced before verification and never retried', async () => {
  const { receipt, adapter } = await run({ faults: { rollback: { type: 'late', delayMs: 40 } } }, m => { m.clientDeadlinesMs.rollback = 10 })
  assert.equal(receipt.outcome, 'UNKNOWN'); assert.equal(receipt.rollbackAcknowledged, false)
  assert.equal(adapter.inspect().commands.filter(id => id === 'rollback').length, 1)
  assert.deepEqual(adapter.inspect().commands.slice(-3), ['rollback', 'cancel_and_drain', 'verify_independently'])
  await wait(50)
  assert.ok(adapter.inspect().history.some(h => h.commandId === 'rollback' && h.discarded))
})

test('disconnect leaves UNKNOWN without retry or fabricated restoration acknowledgment', async () => {
  const { receipt, adapter } = await run({ faults: { guarded_operation: { type: 'disconnect' } } })
  assert.equal(receipt.outcome, 'UNKNOWN'); assert.equal(receipt.code, 'DISCONNECTED')
  assert.equal(receipt.rollbackAcknowledged, false); assert.equal(receipt.independentlyVerified, false)
  assert.equal(adapter.inspect().commands.at(-1), 'guarded_operation')
})

test('secret-bearing mock exceptions produce fixed receipt codes and no raw error output', async () => {
  const secret = 'postgresql://secret-user:NEVER-EMIT-THIS@secret-host/private'
  const { receipt } = await run({ faults: { grant_column_update: { type: 'secret_error', message: secret } } })
  assert.equal(receipt.outcome, 'ABORT_ROLLED_BACK'); assert.equal(receipt.code, 'COMMAND_FAILED')
  assert.equal(JSON.stringify(receipt).includes(secret), false)
  assert.equal(JSON.stringify(receipt).includes('NEVER-EMIT-THIS'), false)
  assert.equal(Object.hasOwn(receipt, 'error'), false)
})

test('a lost BEGIN acknowledgment still attempts rollback and independent verification', async () => {
  const { receipt, adapter } = await run({ faults: { begin: { type: 'bad_ack' } } })
  assert.equal(receipt.outcome, 'ABORT_ROLLED_BACK'); assert.equal(receipt.code, 'COMMAND_ACK_INVALID')
  assert.deepEqual(adapter.inspect().commands, ['begin', 'rollback', 'verify_independently'])
})

test('failed independent restoration cannot qualify an acknowledged rollback', async () => {
  const { receipt } = await run({ faults: { verify_independently: { type: 'negative_verify' } } })
  assert.equal(receipt.outcome, 'UNKNOWN'); assert.equal(receipt.code, 'INDEPENDENT_VERIFICATION_FAILED')
  assert.equal(receipt.rollbackAcknowledged, true); assert.equal(receipt.independentlyVerified, false)
})

test('invalid deadlines, source hashes and network modes are refused before BEGIN', async () => {
  for (const mutate of [m => { m.clientDeadlinesMs.command = 0 }, m => { m.clientDeadlinesMs.rollback = 30001 },
    m => { m.sourceHashes.guardedOperation = 'changed' }, m => { m.networkMode = 'enabled' },
    m => { m.targetUrl = 'forbidden' }, m => { m.frozenPredecessor = 'other' }]) {
    const { receipt, adapter } = await run({}, mutate)
    assert.equal(receipt.outcome, 'REFUSED'); assert.deepEqual(adapter.inspect().commands, [])
  }
})

test('caller mutation cannot extend the validated operation deadline after execution starts', async () => {
  const manifest = await loadSyntheticManifest()
  manifest.clientDeadlinesMs.operation = 1
  const adapter = createSyntheticAdapter({ faults: { guarded_operation: { type: 'late', delayMs: 40 } } })
  const pending = runSyntheticRollbackRehearsal(manifest, adapter)
  manifest.clientDeadlinesMs.operation = 500
  const receipt = await pending
  assert.equal(receipt.outcome, 'ABORT_ROLLED_BACK')
  assert.equal(receipt.code, 'COMMAND_TIMEOUT'); assert.equal(receipt.operationAcknowledged, false)
  await wait(50)
  assert.deepEqual(adapter.inspect().snapshot, syntheticBaseline())
  assert.ok(adapter.inspect().history.some(h => h.commandId === 'guarded_operation' && h.discarded))
})

test('caller mutation cannot replace the validated adapter fault plan during execution', async () => {
  const manifest = await loadSyntheticManifest(), faults = { guarded_operation: { type: 'abort' } }
  const adapter = createSyntheticAdapter({ faults })
  const pending = runSyntheticRollbackRehearsal(manifest, adapter)
  faults.guarded_operation.type = 'late'; faults.guarded_operation.delayMs = 1
  faults.rollback = { type: 'bad_ack' }
  const receipt = await pending
  assert.equal(receipt.outcome, 'ABORT_ROLLED_BACK')
  assert.equal(receipt.code, 'COMMAND_FAILED'); assert.equal(receipt.operationAcknowledged, false)
  assert.equal(receipt.rollbackAcknowledged, true); assert.equal(receipt.independentlyVerified, true)
})

test('non-inert or uncloneable caller inputs fail with fixed codes before any command', async () => {
  const secret = 'NEVER-EMIT-CLONE-FAILURE'
  let getterCalls = 0
  const getterManifest = await loadSyntheticManifest()
  Object.defineProperty(getterManifest.clientDeadlinesMs, 'operation', { enumerable: true, get: () => { getterCalls++; throw new Error(secret) } })
  const cyclicManifest = await loadSyntheticManifest(); cyclicManifest.loop = cyclicManifest
  const functionManifest = await loadSyntheticManifest(); functionManifest.callback = () => secret
  const hostileManifest = new Proxy({}, { ownKeys: () => { throw new Error(secret) } })
  for (const manifest of [getterManifest, cyclicManifest, functionManifest, hostileManifest]) {
    const adapter = createSyntheticAdapter(), receipt = await runSyntheticRollbackRehearsal(manifest, adapter)
    assert.equal(receipt.outcome, 'REFUSED'); assert.equal(receipt.code, 'MANIFEST_REFUSED')
    assert.deepEqual(adapter.inspect().commands, [])
    assert.equal(JSON.stringify(receipt).includes(secret), false)
  }
  assert.equal(getterCalls, 0)
  const accessorFault = {}
  Object.defineProperty(accessorFault, 'type', { enumerable: true, get: () => { getterCalls++; throw new Error(secret) } })
  for (const options of [{ faults: { guarded_operation: accessorFault } }, { faults: { guarded_operation: { type: 'abort', callback: () => secret } } },
    new Proxy({}, { ownKeys: () => { throw new Error(secret) } })]) {
    assert.throws(() => createSyntheticAdapter(options), error => error.message === 'ADAPTER_REFUSED')
  }
  assert.equal(getterCalls, 0)
})
