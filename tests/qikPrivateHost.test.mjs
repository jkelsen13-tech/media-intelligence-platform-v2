import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, cp, mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import childProcess, { execFileSync } from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { buildSubmissionBundle, LIVE_INPUT_NAMES } from '../scripts/qualification/backend-live-rehearsal/package.mjs'
import { runClosedHostQualification } from '../scripts/qualification/backend-private-host/controller.mjs'
import { inspectPrivateHost, loadHeldSource } from '../scripts/qualification/backend-private-host/source.mjs'
import { createFixedProductionPort, inspectPrivateBridgeGate } from '../scripts/qualification/backend-private-host/bridge.mjs'
import { FixedPrivatePipe, MAX_PRIVATE_FRAME } from '../scripts/qualification/backend-private-host/private-pipe.mjs'

const bundle = await buildSubmissionBundle()
const submitted = r => r.events.filter(e => e.status === 'submitted').map(e => e.commandId)
const index = (r, id, status) => r.events.findIndex(e => e.commandId === id && e.status === status)
const fault = (id, type) => ({ faults: { [id]: { type } } })
const assertUnknown = r => { assert.equal(r.outcome, 'UNKNOWN'); assert.equal(r.externalRecoveryRequired, true); assert.equal(r.liveReady, false) }
function closedChild() {
  const child = new EventEmitter(), writes = []
  child.stdin = new EventEmitter(); child.stdout = new EventEmitter()
  child.stdin.destroyed = false; child.stdout.destroyed = false; child.killed = false
  child.stdin.destroy = () => { child.stdin.destroyed = true }
  child.stdout.destroy = () => { child.stdout.destroyed = true }
  child.kill = () => { child.killed = true }
  child.stdin.write = (bytes, callback) => { writes.push(Buffer.from(bytes)); callback?.(null); return true }
  return { child, writes, pipe: new FixedPrivatePipe(child) }
}
const reply = (child, sequence, result = {}, ok = true) =>
  child.stdout.emit('data', Buffer.from(`${JSON.stringify({ sequence, ok, result })}\n`))

test('actual pipe framing accepts fragmented replies and prevents cancel or rollback queue behind pending execute', async () => {
  const { child, writes, pipe } = closedChild()
  const pending = pipe.request('execute', { commandId: 'guarded_operation', parameters: [] })
  assert.equal(pipe.hasPending, true)
  await assert.rejects(pipe.request('cancel_and_drain'), /PRIVATE_PIPE_PENDING/)
  await assert.rejects(pipe.request('execute', { commandId: 'rollback', parameters: [] }), /PRIVATE_PIPE_PENDING/)
  assert.equal(writes.length, 1)
  assert.equal(JSON.parse(writes[0]).privatePayload.commandId, 'guarded_operation')
  const frame = Buffer.from(`${JSON.stringify({ sequence: 1, ok: true, result: { completed: true, commandTag: 'DO' } })}\n`)
  child.stdout.emit('data', frame.subarray(0, 9)); assert.equal(pipe.hasPending, true)
  child.stdout.emit('data', frame.subarray(9))
  assert.deepEqual(await pending, { completed: true, commandTag: 'DO' }); assert.equal(pipe.hasPending, false)
  pipe.finish(); assert.equal(child.killed, true)
})

test('actual pipe framing terminates malformed, extra, mismatched sequence and oversized private output', async () => {
  for (const bytes of [Buffer.from('{malformed\n'), Buffer.from('{"sequence":2,"ok":true,"result":{}}\n'),
    Buffer.from('{"sequence":1,"ok":true,"result":{}}\n{"sequence":1,"ok":true,"result":{}}\n'), Buffer.alloc(MAX_PRIVATE_FRAME + 1)]) {
    const { child, pipe } = closedChild()
    const pending = pipe.request('execute', { commandId: 'begin', parameters: [] })
    const rejected = assert.rejects(pending, /PRIVATE_PIPE_PROTOCOL_REFUSED/)
    child.stdout.emit('data', bytes); await rejected
    assert.equal(pipe.closed, true); assert.equal(child.killed, true)
    assert.equal(child.stdin.destroyed, true); assert.equal(child.stdout.destroyed, true)
  }
  const { child, pipe } = closedChild(); reply(child, 1)
  assert.equal(pipe.closed, true); assert.equal(child.killed, true)
})

test('actual pipe error replies suppress diagnostics and permit explicit drain only after original reply', async () => {
  const { child, writes, pipe } = closedChild()
  const pending = pipe.request('execute', { commandId: 'guarded_operation', parameters: [] })
  const rejected = assert.rejects(pending, error => error.message === 'PRIVATE_PIPE_COMMAND_REFUSED'
    && !String(error).includes('TEST_ONLY_PIPE_SECRET'))
  reply(child, 1, { code: 'TEST_ONLY_PIPE_SECRET_RAW_ERROR' }, false); await rejected
  assert.equal(pipe.closed, false); assert.equal(pipe.hasPending, false)
  const drain = pipe.request('cancel_and_drain')
  assert.equal(writes.length, 2); assert.equal(JSON.parse(writes[1]).operation, 'cancel_and_drain')
  reply(child, 2, { originalDrained: true, cancelDispatched: false, cancelCode: 'CANCEL_FAILED' })
  assert.deepEqual(await drain, { originalDrained: true, cancelDispatched: false, cancelCode: 'CANCEL_FAILED' })
  pipe.finish()
})

test('actual pipe disconnect and write exceptions close resources with fixed error text', async () => {
  for (const event of ['exit', 'error', 'write']) {
    const { child, pipe } = closedChild()
    if (event === 'write') child.stdin.write = () => { throw new Error('TEST_ONLY_PIPE_SECRET') }
    const pending = pipe.request('execute', { commandId: 'begin', parameters: [] })
    const rejected = assert.rejects(pending, error => error.message === 'PRIVATE_PIPE_UNAVAILABLE'
      && !String(error).includes('TEST_ONLY_PIPE_SECRET'))
    if (event !== 'write') child.emit(event, new Error('TEST_ONLY_PIPE_SECRET'))
    await rejected; assert.equal(pipe.closed, true); assert.equal(child.killed, true)
  }
})

test('pending primary pipe termination never supplies rollback ACK and leaves a separate verifier pipe usable', async () => {
  const primary = closedChild(), verifier = closedChild()
  const execute = primary.pipe.request('execute', { commandId: 'guarded_operation', parameters: [] })
  const rejected = assert.rejects(execute, /PRIVATE_PIPE_UNAVAILABLE/)
  // Host observation-budget expiry cannot dispatch cancel through this pending
  // serial pipe. The production port closes it and never queues ROLLBACK.
  await assert.rejects(primary.pipe.request('cancel_and_drain'), /PRIVATE_PIPE_PENDING/)
  primary.pipe.finish(); await rejected
  assert.equal(primary.writes.length, 1)
  const independent = verifier.pipe.request('execute', { commandId: 'verify_primary_completion', parameters: ['71', 'TEST_ONLY_START'] })
  assert.equal(verifier.writes.length, 1); reply(verifier.child, 1, { completed: true })
  assert.deepEqual(await independent, { completed: true })
  assert.equal(primary.pipe.closed, true); assert.equal(verifier.pipe.closed, false)
  verifier.pipe.finish()
})

test('closed host follows frozen success order with exact separate deadline ACKs and one DO', async () => {
  const r = await runClosedHostQualification()
  assert.equal(r.outcome, 'REHEARSAL_ROLLED_BACK')
  assert.equal(r.productionAuthorized, false); assert.equal(r.nativePg17Qualified, false); assert.equal(r.libpqQualified, false)
  assert.deepEqual(submitted(r), bundle.successPath.filter(p => p.submission).map(p => p.commandId))
  for (const [a, b] of [['set_statement_deadline', 'set_lock_deadline'], ['set_lock_deadline', 'observe_operation_context'],
    ['observe_operation_context', 'guarded_operation'], ['verify_private_transformed_rows', 'set_owner_for_cleanup']]) {
    assert.ok(index(r, a, 'acknowledged') < index(r, b, 'submitted'))
  }
  assert.equal(submitted(r).filter(id => id === 'guarded_operation').length, 1)
  assert.equal(r.rollbackAcknowledged, true); assert.equal(r.primarySessionVerified, true)
  assert.equal(r.independentlyVerified, true); assert.equal(r.introducedGrantorsPreserved, true)
  assert.ok(index(r, 'verify_independently', 'recovery_authority_acknowledged')
    < index(r, 'verify_independently', 'distinct_approved_read_only_inventory_context'))
})

test('in-memory source bundle is deeply frozen and preserves original DO and deadlines', async () => {
  const held = await loadHeldSource()
  assert.equal(Object.isFrozen(held.bundle.successPath[0].submission), true)
  assert.throws(() => { held.bundle.successPath[0].submission.text = 'COMMIT;' }, TypeError)
  assert.equal(held.bundle.successPath.find(p => p.commandId === 'guarded_operation').submission.sha256,
    '5be14204dbd68b44ccaba07222bd6a5b4f9d9f627ce4750fce596211e6d6fb46')
  assert.equal(held.bundle.successPath.find(p => p.commandId === 'set_statement_deadline').submission.text,
    "SET LOCAL statement_timeout = '7000ms';\n")
  assert.equal(held.bundle.successPath.find(p => p.commandId === 'set_lock_deadline').submission.text,
    "SET LOCAL lock_timeout = '500ms';\n")
})

test('every required boolean rejects false/NULL independently; exact shape rejects missing/extra columns, wrong OID and extra rows', async () => {
  for (const phase of bundle.successPath.filter(p => p.expectedResult?.everyBooleanMustBeTrue)) {
    const id = phase.commandId
    const cases = phase.expectedResult.exactColumnNames.flatMap(column =>
      ['false_boolean', 'null_boolean'].map(type => ({ type, column })))
    cases.push(...['extra_boolean', 'missing_boolean', 'wrong_type_oid', 'wrong_shape'].map(type => ({ type })))
    for (const alteration of cases) {
      const r = await runClosedHostQualification({ faults: { [id]: alteration } }), type = alteration.type
      assert.notEqual(r.outcome, 'REHEARSAL_ROLLED_BACK', `${id}/${type}`)
      assert.ok(['BOOLEAN_POSTCONDITION_REFUSED', 'RESULT_SHAPE_REFUSED', 'COMMAND_ACK_INVALID'].includes(r.code), `${id}/${type}: ${r.code}`)
      if (id === 'observe_operation_context') assert.equal(r.operationAttempted, false)
      if (id === 'verify_private_transformed_rows') assert.equal(submitted(r).includes('set_owner_for_cleanup'), false)
    }
  }
})

test('wrong tag, noncompleted ACK and wrong transaction state cannot authorize cleanup', async () => {
  for (const type of ['wrong_tag', 'bad_ack', 'bad_tx', 'wrong_shape']) {
    const r = await runClosedHostQualification(fault('guarded_operation', type))
    assert.equal(r.operationAcknowledged, false)
    assert.equal(r.code, 'COMMAND_ACK_INVALID')
    assert.equal(submitted(r).includes('set_owner_for_cleanup'), false)
    assert.ok(index(r, 'cancel_and_drain', 'acknowledged') < index(r, 'rollback', 'submitted'))
  }
})

test('BEGIN uncertainty starts before missing acknowledgment and always attempts distinct verification', async () => {
  for (const type of ['bad_ack', 'uncertain', 'disconnect']) {
    const r = await runClosedHostQualification(fault('begin', type))
    assert.equal(r.begun, true); assert.equal(r.distinctVerifierAttempted, true)
    assert.equal(r.operationAttempted, false); assertUnknown(r)
    assert.ok(r.events.some(e => e.commandId === 'verify_private_rollback_rows' && e.status === 'PRIVATE_BASELINE_REFUSED'))
  }
})

test('phase expiry/revocation is checked before submission; bounded recovery remains separate', async () => {
  for (const key of ['staleBeforePhase', 'revokedBeforePhase']) {
    const r = await runClosedHostQualification({ [key]: 'set_lock_deadline' })
    assert.equal(r.operationAttempted, false); assert.equal(submitted(r).includes('set_lock_deadline'), false)
    assert.equal(r.outcome, 'ABORT_ROLLED_BACK'); assert.equal(r.rollbackAcknowledged, true)
  }
  const r = await runClosedHostQualification({ staleBeforePhase: 'begin' })
  assert.equal(r.outcome, 'REFUSED'); assert.equal(r.begun, false)
  assert.equal(r.distinctVerifierAttempted, false); assert.deepEqual(submitted(r), [])
})

test('logging proof must complete all true before any private capture', async () => {
  const r = await runClosedHostQualification(fault('verify_private_logging_guard', 'false_boolean'))
  for (const id of ['capture_private_security', 'inspect_private_row_guards', 'capture_private_rows', 'grant_set_membership', 'guarded_operation'])
    assert.equal(submitted(r).includes(id), false)
  assert.equal(r.distinctVerifierAttempted, true); assertUnknown(r)
})

test('minimal authority planner rejects ambiguous/broader baseline before any temporary authority', async () => {
  for (const baselineVariant of ['preexisting_update', 'absent_select', 'wrong_provider', 'existing_self_membership',
    'wrong_private_security', 'source_guard_false', 'public_count_mismatch']) {
    const r = await runClosedHostQualification({ baselineVariant })
    assert.equal(submitted(r).includes('grant_set_membership'), false, baselineVariant)
    assert.equal(r.operationAttempted, false, baselineVariant)
    assert.equal(r.distinctVerifierAttempted, true, baselineVariant)
  }
})

test('private security and row baselines survive rollback, bind all parameters, and never enter receipts or errors', async () => {
  for (const options of [{}, fault('guarded_operation', 'error')]) {
    const r = await runClosedHostQualification(options), output = JSON.stringify(r)
    assert.equal(r.independentlyVerified, true)
    assert.ok(r.privateBaselineBindingChecks >= 3)
    assert.ok(r.parameterBindingsChecked >= 20)
    for (const marker of ['TEST_ONLY_PRIVATE_ROW_MARKER_7d6b', 'TEST_ONLY_PRIVATE_CONFIG_MARKER_4219']) {
      assert.equal(output.includes(marker), false)
      assert.equal(output.includes(createHash('sha256').update(marker).digest('hex')), false)
    }
    assert.doesNotMatch(output, /"private_rows":|"private_snapshot":|connection_string|parameterValues|stack|traceback/)
    if (options.faults) assert.equal(r.code, 'COMMAND_FAILED')
  }
})

test('uncertain operation drains before rollback and follows exact frozen failure query order', async () => {
  const r = await runClosedHostQualification(fault('guarded_operation', 'uncertain'))
  assert.equal(r.outcome, 'ABORT_ROLLED_BACK')
  const start = submitted(r).indexOf('cancel_and_drain')
  assert.deepEqual(submitted(r).slice(start), bundle.failurePath.filter(p => p.submission || p.commandId === 'cancel_and_drain').map(p => p.commandId))
  assert.ok(index(r, 'cancel_and_drain', 'acknowledged') < index(r, 'rollback', 'submitted'))
})

test('client timeout fences outstanding operation and never retries DO', async () => {
  const r = await runClosedHostQualification(fault('guarded_operation', 'timeout'))
  assert.equal(r.code, 'COMMAND_TIMEOUT'); assert.equal(r.outcome, 'ABORT_ROLLED_BACK')
  assert.equal(submitted(r).filter(id => id === 'guarded_operation').length, 1)
  assert.ok(index(r, 'cancel_and_drain', 'acknowledged') < index(r, 'rollback', 'submitted'))
})

test('failed drain never queues rollback; distinct verifier remains required', async () => {
  const r = await runClosedHostQualification({ faults: {
    guarded_operation: { type: 'uncertain' }, cancel_and_drain: { type: 'undrained' },
  } })
  assertUnknown(r); assert.equal(r.rollbackAttempted, false); assert.equal(submitted(r).includes('rollback'), false)
  assert.equal(r.distinctVerifierAttempted, true)
  for (const id of ['verify_private_rollback_rows', 'verify_security_rollback', 'verify_primary_completion'])
    assert.equal(submitted(r).includes(id), true)
})

test('primary disconnect still verifies separately; equality never replaces rollback ACK', async () => {
  const r = await runClosedHostQualification(fault('guarded_operation', 'disconnect'))
  assertUnknown(r); assert.equal(r.rollbackAcknowledged, false); assert.equal(r.independentlyVerified, true)
  assert.equal(r.primarySessionVerified, false); assert.equal(r.distinctVerifierAttempted, true)
  for (const id of ['verify_private_rollback_rows', 'verify_security_rollback', 'verify_primary_completion'])
    assert.equal(submitted(r).includes(id), true)
})

test('missing rollback acknowledgment remains UNKNOWN despite independent equality, with no retry', async () => {
  const r = await runClosedHostQualification(fault('rollback', 'bad_ack'))
  assertUnknown(r); assert.equal(r.rollbackAcknowledged, false); assert.equal(r.independentlyVerified, true)
  assert.equal(submitted(r).filter(id => id === 'rollback').length, 1)
  assert.equal(r.primarySessionVerified, false)
})

test('primary settings, distinct context and unrelated rows each have independent refusal gates', async () => {
  const primary = await runClosedHostQualification(fault('verify_primary_session_rollback', 'false_boolean'))
  assertUnknown(primary); assert.equal(primary.primarySessionVerified, false); assert.equal(primary.independentlyVerified, true)
  for (const baselineVariant of ['verifier_same_connection', 'verifier_context_mismatch']) {
    const r = await runClosedHostQualification({ baselineVariant })
    assertUnknown(r); assert.equal(r.code, 'VERIFIER_CONTEXT_REFUSED')
    assert.equal(submitted(r).includes('verify_private_rollback_rows'), false)
  }
  const rows = await runClosedHostQualification({ baselineVariant: 'unrelated_row_drift' })
  assertUnknown(rows); assert.equal(rows.independentlyVerified, false)
})

test('unavailable/expired recovery scope refuses verifier connect before opening and requires external recovery', async () => {
  const r = await runClosedHostQualification({ recoveryUnavailable: true })
  assertUnknown(r); assert.equal(r.code, 'RECOVERY_AUTHORITY_UNAVAILABLE')
  assert.equal(r.distinctVerifierAttempted, true)
  assert.equal(index(r, 'verify_independently', 'distinct_approved_read_only_inventory_context'), -1)
  assert.equal(index(r, 'verify_independently', 'recovery_authority_acknowledged'), -1)
  assert.equal(submitted(r).includes('verify_private_rollback_rows'), false)
})

test('expiry before final verified decision cannot confer independent verification', async () => {
  const r = await runClosedHostQualification({ recoveryExpiresBeforeFinal: true })
  assertUnknown(r); assert.equal(r.code, 'RECOVERY_AUTHORITY_UNAVAILABLE')
  assert.equal(r.rollbackAcknowledged, true); assert.equal(r.independentlyVerified, false)
  assert.ok(index(r, 'verify_independently', 'distinct_approved_read_only_inventory_context') >= 0)
  assert.ok(index(r, 'verify_primary_completion', 'acknowledged') >= 0)
})

test('failed cancel with genuine quiescent original drain can rollback but never claims cancel success', async () => {
  const r = await runClosedHostQualification({ faults: {
    guarded_operation: { type: 'uncertain' }, cancel_and_drain: { type: 'cancel_failed' },
  } })
  assert.equal(r.outcome, 'ABORT_ROLLED_BACK'); assert.equal(r.rollbackAcknowledged, true)
  assert.deepEqual(r.cancelDrainObservations, [{ cancelDispatched: false, cancelCode: 'CANCEL_FAILED',
    originalDrained: true, transactionStatus: 'INERROR' }])
})

test('operational production gate refuses populated claims, callbacks and roots before any spawn', async () => {
  const originalSpawn = childProcess.spawn; let spawns = 0
  childProcess.spawn = () => { spawns++; throw new Error('SPAWN_MUST_NOT_HAPPEN') }; syncBuiltinESMExports()
  try {
    const claims = Object.fromEntries(LIVE_INPUT_NAMES.map(name => [name, { claimed: true }]))
    const inspected = await inspectPrivateHost({ claims }), gate = await inspectPrivateBridgeGate({ claims })
    assert.equal(inspected.liveReady, false); assert.equal(inspected.productionActivationAvailable, false)
    assert.equal(inspected.claimsCanAuthorize, false); assert.equal(gate.liveAuthorized, false)
    await assert.rejects(createFixedProductionPort(), /TRUST_ROOT_UNBOUND|AUTHORITY_SOURCE_UNAVAILABLE/)
    await assert.rejects(createFixedProductionPort({ ready: true, authorizePhase: () => true }), /PRIVATE_BRIDGE_INPUT_REFUSED/)
    await assert.rejects(inspectPrivateBridgeGate({ claims: { trusted: true, authorizePhase: () => true } }), /PRIVATE_BRIDGE_INPUT_REFUSED/)
    await assert.rejects(inspectPrivateHost({ roots: ['caller-root'] }), /HOST_INSPECTION_REFUSED/)
    assert.equal(spawns, 0)
  } finally { childProcess.spawn = originalSpawn; syncBuiltinESMExports() }
})

test('closed factory refuses callbacks/accessors/unknown options before first await without evaluating them', async () => {
  let evaluated = false
  const options = {}; Object.defineProperty(options, 'faults', { enumerable: true, get() { evaluated = true; return {} } })
  await assert.rejects(runClosedHostQualification(options), /CLOSED_OPTIONS_REFUSED/)
  await assert.rejects(runClosedHostQualification({ adapter: () => { evaluated = true } }), /CLOSED_OPTIONS_REFUSED/)
  await assert.rejects(runClosedHostQualification({ sql: 'COMMIT;' }), /CLOSED_OPTIONS_REFUSED/)
  assert.equal(evaluated, false)
})

test('new host public input boundaries reject top and nested proxies with zero trap calls', async () => {
  let calls = 0
  const handler = { getPrototypeOf() { calls++; return Object.prototype }, ownKeys() { calls++; return [] },
    getOwnPropertyDescriptor() { calls++; return undefined }, get() { calls++; return undefined } }
  const top = new Proxy({}, handler), nested = new Proxy({}, handler)
  for (const input of [top, { faults: nested }]) await assert.rejects(runClosedHostQualification(input), /CLOSED_OPTIONS_REFUSED/)
  for (const input of [top, { claims: nested }]) {
    await assert.rejects(inspectPrivateHost(input), /HOST_INSPECTION_REFUSED/)
    await assert.rejects(inspectPrivateBridgeGate(input), /PRIVATE_BRIDGE_INPUT_REFUSED/)
  }
  await assert.rejects(createFixedProductionPort(top), /PRIVATE_BRIDGE_INPUT_REFUSED/)
  assert.equal(calls, 0)
})

test('host and original frozen SQL drift are refused from isolated source copies', async () => {
  for (const file of ['backend-private-host/controller.mjs', 'qik-audit-route-transform-proposal-20261002.sql']) {
    const directory = await mkdtemp(join(tmpdir(), 'qik-private-host-drift-'))
    try {
      const target = join(directory, 'qualification')
      await cp(new URL('../scripts/qualification/', import.meta.url), target, { recursive: true })
      const path = join(target, file)
      await writeFile(path, `${await readFile(path, 'utf8')}\n-- drift\n`)
      // Host controller drift need not be imported: held source bytes detect it.
      const inspected = await import(pathToFileURL(join(target, 'backend-private-host/source.mjs')).href)
      await assert.rejects(inspected.inspectPrivateHost(), /HOST_SOURCE_DRIFT|SOURCE_DRIFT/)
    } finally { await rm(directory, { recursive: true, force: true }) }
  }
})

test('caller replacement production module is never imported when its exact integration pins fail', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qik-private-host-untrusted-peer-'))
  try {
    const target = join(directory, 'qualification')
    await cp(new URL('../scripts/qualification/', import.meta.url), target, { recursive: true })
    const authority = join(target, 'backend-private-authority')
    await mkdir(authority, { recursive: true })
    const lock = JSON.parse(await readFile(join(target, 'backend-private-host/integration-lock.json'), 'utf8'))
    for (const path of Object.keys(lock.sources).filter(p => p.includes('backend-private-authority'))) {
      await writeFile(join(target, path.slice(3)), "globalThis.__untrustedAuthorityImported=true; export const loadProductionAuthorityVerifier=()=>({ready:true,authorizePhase:()=>({trusted:true,liveAuthorized:true})});\n")
    }
    const source = await import(pathToFileURL(join(target, 'backend-private-host/source.mjs')).href)
    assert.equal((await source.inspectPrivateHost()).authorityCode, 'AUTHORITY_SOURCE_UNAVAILABLE')
    assert.equal(globalThis.__untrustedAuthorityImported, undefined)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('CLI accepts inspection only; worker guard refuses before libpq import or credential reads', async () => {
  const cli = new URL('../scripts/qualification/backend-private-host/inspect.mjs', import.meta.url).pathname
  const inspected = JSON.parse(execFileSync(process.execPath, [cli], { encoding: 'utf8' }))
  assert.equal(inspected.childSpawned, false); assert.equal(inspected.networkMode, 'none')
  for (const argument of ['--run', '--connect', '--activate']) {
    assert.throws(() => execFileSync(process.execPath, [cli, argument], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
      error => error.status === 2 && JSON.parse(error.stdout).code === 'HOST_CLI_ARGUMENTS_REFUSED')
  }
  const worker = new URL('../scripts/qualification/backend-private-host/private_worker.py', import.meta.url).pathname
  const script = `import importlib.util,io,json,sys\nsys.dont_write_bytecode=True\nspec=importlib.util.spec_from_file_location('worker',${JSON.stringify(worker)})\nmodule=importlib.util.module_from_spec(spec)\nspec.loader.exec_module(module)\nwriter=io.BytesIO()\nmodule.serve_private_pipe(io.BytesIO(b'credential must not be read'),writer)\nframe=json.loads(writer.getvalue())\nprint(json.dumps({'code':frame['result']['code'],'nativeImported':'qik_fixed_libpq17' in sys.modules}))\n`
  const refusal = JSON.parse(execFileSync('/usr/bin/python3', ['-I', '-S', '-c', script], { encoding: 'utf8' }))
  assert.deepEqual(refusal, { code: 'APPROVED_PRIVATE_HOST_RUNTIME_UNBOUND', nativeImported: false })
})
