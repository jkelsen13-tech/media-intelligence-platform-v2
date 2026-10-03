import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import {
  LIVE_INPUT_NAMES, inspectPackage, assessLiveReadiness, buildSubmissionBundle,
  compileMinimalSubmissionBundle, runClosedSyntheticQualification,
} from '../scripts/qualification/backend-live-rehearsal/package.mjs'
import { syntheticBaseline } from '../scripts/qualification/backend-client-contract/contract.mjs'

const packageUrl = new URL('../scripts/qualification/backend-live-rehearsal/', import.meta.url)
const manifest = async () => JSON.parse(await readFile(new URL('required-inputs.json', packageUrl), 'utf8'))
const sha = text => createHash('sha256').update(text).digest('hex')
const budgets = { command: 100, operation: 10, rollback: 100, verification: 100, cancelDrain: 100 }
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))

// Documentary shape only, never authenticated catalog evidence or live authority.
const sourcePlanningBaseline = () => ({
  version: 'qik-rollback-sql-boundary-1',
  identity: { current_user: 'postgres', session_user: 'postgres', database: 'postgres', server_version_num: '170006' },
  deadlines: { statement_timeout: '0', lock_timeout: '0' },
  roles: [
    { oid: '2001', name: 'postgres', superuser: false, bypass_rls: true, login: true, createrole: true },
    { oid: '2002', name: 'mip_cutover_schema_owner_v1', superuser: false, bypass_rls: false, login: false },
  ],
  relation: { owner: 'mip_cutover_schema_owner_v1', relowner: '2002', relkind: 'r', rls: true, force_rls: true, acl_raw: null },
  columns: [{ attnum: 1, name: 'id', type_oid: '16', not_null: true, acl_raw: null },
    { attnum: 2, name: 'connection_string', type_oid: '25', not_null: true, acl_raw: null }],
  memberships: [{ roleid: '2002', member: '2001', grantor: '2003', role: 'mip_cutover_schema_owner_v1',
    member_name: 'postgres', grantor_name: 'supabase_admin', admin: true, inherit: false, set: false }],
  effective: { select_id: true, select_connection: true, update_connection: false, update_id: false,
    table_update: false, owner_set: false, owner_usage: false, dblink_execute: true },
  schemas: [1, 2, 3, 4].map(oid => ({ oid: String(oid), postgres_usage: true })),
  policies: [], publications: [], logging: {}, optional_logging: {}, ca_path: null,
  dblink: [{ argument_type_oids: ['25', '25'], kind: 'f', strict: true,
    security_definer: false, returns_set: true, result_type_oid: '2249' }],
})
const privateGuardShape = () => ({ selected_count: '1', unrelated_count: '2', selected_nonnull: true,
  selected_source_matches: true, receipt_count: '1', bootstrap_count: '1', head_count: '1', qualification_count: '0' })

test('default CLI inspects pinned source offline and refuses every live-shaped argument without echoing it', async () => {
  const cli = fileURLToPath(new URL('inspect.mjs', packageUrl))
  const safe = spawnSync(process.execPath, [cli], { encoding: 'utf8', timeout: 10000,
    env: { ...process.env, PGHOST: 'unused.invalid', PGDATABASE: 'unused', DATABASE_URL: 'synthetic-forbidden-secret' } })
  assert.equal(safe.status, 0, safe.stderr)
  const receipt = JSON.parse(safe.stdout)
  assert.equal(receipt.networkMode, 'none')
  assert.equal(receipt.liveReady, false)
  assert.equal(receipt.readiness.missingInputNames.length, 11)
  assert.equal(receipt.sourceReviewApproval, false)
  for (const args of [['--live'], ['--execute'], ['--driver', 'synthetic-secret-module'],
    ['--inspect', 'postgresql://synthetic-secret'], ['--url=synthetic-secret']]) {
    const rejected = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 10000 })
    assert.equal(rejected.status, 2)
    assert.deepEqual(JSON.parse(rejected.stdout), { mode: 'source-only-offline', liveReady: false,
      outcome: 'REFUSED', code: 'CLI_ARGUMENTS_REFUSED' })
    assert.equal(rejected.stdout.includes('synthetic-secret'), false)
    assert.equal(rejected.stderr, '')
  }
})

test('eleven populated claims and a supplied execution window remain untrusted and unexecutable', async () => {
  const supplied = await manifest()
  for (const key of LIVE_INPUT_NAMES) supplied.liveRequiredInputs[key] = { approved: true, ref: 'untrusted-synthetic-ref' }
  supplied.executionWindow = { startUtc: '2026-10-03T00:00:00Z', endUtc: '2026-10-03T01:00:00Z' }
  const readiness = assessLiveReadiness(supplied)
  assert.equal(readiness.ready, false)
  assert.equal(readiness.executionWindowVerified, false)
  assert.equal(readiness.missingInputNames.length, 0)
  assert.deepEqual(readiness.unverifiedInputNames, LIVE_INPUT_NAMES)
  assert.ok(readiness.blockers.includes('TRUSTED_AUTHORITY_VERIFIER_ABSENT'))
  assert.ok(readiness.blockers.includes('QUALIFIED_PRIVATE_PG17_CLIENT_ABSENT'))
  assert.equal(JSON.stringify(readiness).includes('untrusted-synthetic-ref'), false)
})

test('accessors, callbacks, cycles, driver options and caller-owned live adapters cannot enter the package', async () => {
  let invoked = false
  const supplied = await manifest()
  Object.defineProperty(supplied, 'executionWindow', { enumerable: true, get() { invoked = true; return null } })
  assert.throws(() => assessLiveReadiness(supplied), /MANIFEST_REFUSED/)
  assert.equal(invoked, false)
  for (const options of [{ execute() { invoked = true } }, { adapter: { execute() { invoked = true } } },
    { connectionString: 'synthetic-secret' }, { driver: 'synthetic-secret-module' }]) {
    await assert.rejects(runClosedSyntheticQualification(options), /SYNTHETIC_OPTIONS_REFUSED/)
  }
  const cyclic = {}; cyclic.self = cyclic
  await assert.rejects(runClosedSyntheticQualification(cyclic), /SYNTHETIC_OPTIONS_REFUSED/)
  assert.equal(invoked, false)
})

test('source submission inventory binds unchanged full DO, separate deadlines and exact least authority cleanup', async () => {
  const inspection = await inspectPackage(), bundle = await buildSubmissionBundle()
  assert.equal(bundle.sourceLockSha256, inspection.sourceLock.sha256)
  assert.equal(bundle.executableLivePackage, false)
  assert.equal(bundle.sqlSourceInventoryComplete, true)
  assert.equal(bundle.genuineAuthorityBindingsComplete, false)
  const phases = new Map(bundle.successPath.map(p => [p.commandId, p]))
  const statement = phases.get('set_statement_deadline').submission
  const lock = phases.get('set_lock_deadline').submission
  const operation = phases.get('guarded_operation').submission
  assert.equal(statement.text, "SET LOCAL statement_timeout = '7000ms';\n")
  assert.equal(lock.text, "SET LOCAL lock_timeout = '500ms';\n")
  assert.equal(operation.sha256, '5be14204dbd68b44ccaba07222bd6a5b4f9d9f627ce4750fce596211e6d6fb46')
  assert.equal(operation.bytes, 7101)
  const ids = bundle.successPath.map(p => p.commandId)
  assert.ok(ids.indexOf('set_statement_deadline') < ids.indexOf('set_lock_deadline'))
  assert.ok(ids.indexOf('observe_operation_context') < ids.indexOf('guarded_operation'))
  assert.ok(ids.indexOf('verify_private_logging_guard') < ids.indexOf('capture_private_rows'))
  assert.ok(ids.indexOf('verify_private_transformed_rows') < ids.indexOf('set_owner_for_cleanup'))
  assert.ok(ids.indexOf('restore_statement_deadline') < ids.indexOf('verify_authority_restored'))
  assert.ok(ids.indexOf('rollback') < ids.indexOf('verify_primary_session_rollback'))
  for (const phase of [...bundle.successPath, ...bundle.failurePath]) {
    assert.equal(phase.completedAcknowledgmentRequiredBeforeNextSubmission, true)
    if (!phase.submission) continue
    assert.equal(sha(phase.submission.text), phase.submission.sha256)
    assert.equal(Buffer.byteLength(phase.submission.text), phase.submission.bytes)
    assert.equal(/\bCOMMIT\s*;/i.test(phase.submission.text), false)
    assert.equal(/\bALTER\s+(?:ROLE|TABLE)\b/i.test(phase.submission.text), false)
  }
  assert.match(phases.get('grant_set_membership').submission.text, /ADMIN FALSE, INHERIT FALSE, SET TRUE GRANTED BY postgres/)
  assert.equal(phases.get('grant_column_update').submission.text,
    'GRANT UPDATE(connection_string) ON mip_factual.audit_connection TO postgres GRANTED BY mip_cutover_schema_owner_v1;')
  assert.match(phases.get('revoke_introduced_column_update').submission.text, /GRANTED BY mip_cutover_schema_owner_v1 RESTRICT/)
  assert.match(phases.get('revoke_introduced_set_membership').submission.text, /GRANTED BY postgres RESTRICT/)
  assert.match(phases.get('capture_private_rows').resultPolicy, /SECRET-BEARING MEMORY ONLY/)
  assert.equal(phases.get('verify_private_rollback_rows').session, 'distinct-approved-read-only-verifier')
  assert.deepEqual(phases.get('verify_primary_session_rollback').parameters, ['privateSecurityBaseline', 'rollback'])
  assert.deepEqual(phases.get('verify_security_rollback').parameters, ['privateSecurityBaseline', 'restored'])
  assert.match(phases.get('verify_primary_completion').submission.text, /backend_start=\$2::timestamptz/)
})

test('offline planning validates original missing-authority shape but never turns it into trusted evidence', async () => {
  const bundle = await compileMinimalSubmissionBundle(sourcePlanningBaseline(), privateGuardShape())
  assert.equal(bundle.liveReady, false)
  assert.equal(bundle.inputBasis, 'UNAUTHENTICATED INERT SOURCE-PLANNING INPUT')
  assert.equal(bundle.introducesMembership, true)
  assert.equal(bundle.introducesColumnUpdate, true)
  assert.equal(bundle.addsSelect, false)
  assert.equal(bundle.proposedPermission.mandatoryEnd, 'ROLLBACK')
  assert.equal(Object.hasOwn(bundle, 'baseline'), false)
  for (const mutate of [
    s => { s.effective.select_connection = false },
    s => { s.effective.update_connection = true },
    s => { s.effective.owner_set = true },
    s => { s.roles[1].bypass_rls = true },
    s => { s.relation.force_rls = false },
    s => { s.memberships.push({ ...s.memberships[0], grantor: '2001', grantor_name: 'postgres', admin: false, set: true }) },
  ]) {
    const snapshot = sourcePlanningBaseline(); mutate(snapshot)
    await assert.rejects(compileMinimalSubmissionBundle(snapshot, privateGuardShape()), /OFFLINE_BASELINE_REFUSED/)
  }
  const sourceValue = privateGuardShape(); sourceValue.connection_string = 'synthetic-private-input'
  await assert.rejects(compileMinimalSubmissionBundle(sourcePlanningBaseline(), sourceValue), /OFFLINE_BASELINE_REFUSED/)
})

test('auxiliary SQL observes deadlines, refuses unsafe logging, restores settings, and binds original backend identity in PGlite only', async () => {
  const auxiliary = JSON.parse(await readFile(new URL('auxiliary-commands.json', packageUrl), 'utf8'))
  const db = new PGlite()
  const executed = []
  const record = (sql, values, method) => { executed.push({ sql, values, method }) }
  const q = async (sql, values = []) => { record(sql, values, 'query'); return (await db.query(sql, values)).rows[0] }
  const exec = async sql => { record(sql, [], 'exec'); return db.exec(sql) }
  let version
  try {
    version = (await q('SELECT version() AS version')).version
    assert.match(version, /PostgreSQL 18\.3 \(PGlite 0\.5\.8\)/)
    await exec('CREATE SCHEMA mip_factual; CREATE TABLE mip_factual.audit_connection(id boolean PRIMARY KEY,connection_string text NOT NULL); SET log_parameter_max_length_on_error=0;')
    assert.equal((await q(auxiliary.verify_private_logging_guard)).source_logging_guard_matches, true)
    await exec("SET pgaudit.log='all';")
    assert.equal((await q(auxiliary.verify_private_logging_guard)).source_logging_guard_matches, false)
    await exec("SET pgaudit.log='none'; BEGIN;")
    const original = await q("SELECT current_setting('statement_timeout') AS statement_timeout,current_setting('lock_timeout') AS lock_timeout")
    await q("SET LOCAL statement_timeout='7000ms';")
    await q("SET LOCAL lock_timeout='500ms';")
    const observed = await q(auxiliary.observe_operation_context)
    assert.equal(observed.statement_deadline_observed, true)
    assert.equal(observed.lock_deadline_observed, true)
    assert.equal(observed.installer_flags_match, false, 'PGlite bootstrap superuser is refused as managed installer')
    assert.equal((await q(auxiliary.restore_statement_deadline, [original.statement_timeout])).statement_deadline_restored, true)
    assert.equal((await q(auxiliary.restore_lock_deadline, [original.lock_timeout])).lock_deadline_restored, true)
    await q('ROLLBACK;')
    const completion = await q(auxiliary.verify_primary_completion, [2147483647, '2000-01-01T00:00:00Z'])
    assert.equal(completion.verifier_input_valid, true)
    assert.equal(completion.primary_transaction_ended, true)
    assert.equal(completion.operation_lock_released, true)
    assert.equal((await q(auxiliary.verify_primary_completion, [2147483647, null])).verifier_input_valid, false)
    const identity = await q(auxiliary.capture_primary_backend)
    assert.ok(identity.primary_backend_pid > 0)
  } finally {
    await exec('ROLLBACK;'); await db.close()
    const destination = process.env.QIK_CLIENT_PACKAGE_EVIDENCE_DIR
    if (destination) {
      await mkdir(destination, { recursive: true })
      const manifest = { scope: 'DISPOSABLE PGLITE18.3 AUXILIARY SQL ONLY; NO NATIVE PG17/LIBPQ/TLS/DBLINK/PROVIDER LOGS',
        version, testSha256: sha(await readFile(fileURLToPath(import.meta.url))), executed: [] }
      for (const [index, statement] of executed.entries()) {
        const filename = `auxiliary-${String(index + 1).padStart(3, '0')}.sql`
        await writeFile(resolve(destination, filename), statement.sql)
        manifest.executed.push({ filename, method: statement.method, bytes: Buffer.byteLength(statement.sql),
          sha256: sha(statement.sql), syntheticNonsecretParameters: statement.values })
      }
      await writeFile(resolve(destination, 'executed-sql-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
    }
  }
})

test('closed synthetic success proves only modeled command order/restoration and preserves unrelated ACLs', async () => {
  const baseline = syntheticBaseline({ connectionAclRaw: '{synthetic_reader=x/synthetic_owner}' })
  baseline.columns[0].aclRaw = '{synthetic_reader=x/synthetic_owner}'
  const receipt = await runClosedSyntheticQualification({ baseline })
  assert.equal(receipt.outcome, 'REHEARSAL_ROLLED_BACK')
  assert.equal(receipt.independentlyVerified, true)
  assert.equal(receipt.rollbackAcknowledged, true)
  assert.equal(receipt.nativePg17Qualified, false)
  assert.equal(receipt.distinctLiveVerifierQualified, false)
  assert.equal(receipt.liveReady, false)
  assert.equal(receipt.externalRecoveryRequired, false)
  assert.equal(Object.hasOwn(receipt, 'snapshot'), false)
  const events = receipt.events
  for (const id of ['set_statement_deadline', 'set_lock_deadline']) {
    assert.ok(events.findIndex(e => e.commandId === id && e.status === 'acknowledged')
      < events.findIndex(e => e.commandId === 'guarded_operation' && e.status === 'submitted'))
  }
})

test('lost BEGIN/operation acknowledgments recover, while lost rollback acknowledgment stays UNKNOWN', async () => {
  for (const commandId of ['begin', 'guarded_operation']) {
    const receipt = await runClosedSyntheticQualification({ faults: { [commandId]: { type: 'bad_ack' } } })
    assert.equal(receipt.outcome, 'ABORT_ROLLED_BACK')
    assert.equal(receipt.code, 'COMMAND_ACK_INVALID')
    assert.equal(receipt.rollbackAcknowledged, true)
    assert.equal(receipt.independentlyVerified, true)
  }
  const receipt = await runClosedSyntheticQualification({ faults: { rollback: { type: 'bad_ack' } } })
  assert.equal(receipt.outcome, 'UNKNOWN')
  assert.equal(receipt.independentlyVerified, true)
  assert.equal(receipt.rollbackAcknowledged, false)
  assert.equal(receipt.externalRecoveryRequired, true)
  assert.equal(receipt.events.filter(e => e.commandId === 'rollback' && e.status === 'submitted').length, 1)
})

test('failed cancel/drain and disconnect require independent external recovery without queuing behind uncertainty', async () => {
  const late = await runClosedSyntheticQualification({ clientDeadlinesMs: budgets,
    faults: { guarded_operation: { type: 'late', delayMs: 50 }, cancel_and_drain: { type: 'bad_ack' } } })
  assert.equal(late.outcome, 'UNKNOWN')
  assert.equal(late.code, 'CANCEL_ACK_MISSING')
  assert.equal(late.independentVerificationRequired, true)
  assert.equal(late.externalRecoveryRequired, true)
  assert.equal(late.events.some(e => e.commandId === 'rollback'), false)
  const disconnected = await runClosedSyntheticQualification({ faults: { guarded_operation: { type: 'disconnect' } } })
  assert.equal(disconnected.outcome, 'UNKNOWN')
  assert.equal(disconnected.independentVerificationRequired, true)
  assert.equal(disconnected.externalRecoveryRequired, true)
  await wait(60)
})

test('aborted cleanup, timed-out rollback and independent verifier refusal cannot claim completed restoration', async () => {
  const aborted = await runClosedSyntheticQualification({ faults: { revoke_introduced_column_update: { type: 'abort' } } })
  assert.equal(aborted.outcome, 'ABORT_ROLLED_BACK')
  assert.equal(aborted.events.some(e => e.commandId === 'verify_authority_restored'), false)
  const timedOut = await runClosedSyntheticQualification({ clientDeadlinesMs: { ...budgets, operation: 100, rollback: 10 },
    faults: { rollback: { type: 'late', delayMs: 50 } } })
  assert.equal(timedOut.outcome, 'UNKNOWN')
  assert.equal(timedOut.rollbackAcknowledged, false)
  assert.equal(timedOut.events.filter(e => e.commandId === 'rollback' && e.status === 'submitted').length, 1)
  const refused = await runClosedSyntheticQualification({ faults: { verify_independently: { type: 'negative_verify' } } })
  assert.equal(refused.outcome, 'UNKNOWN')
  assert.equal(refused.independentVerificationRequired, true)
  await wait(60)
})

test('raw synthetic errors never enter general receipts, and configuration binds before source inspection awaits', async () => {
  const options = { faults: { guarded_operation: { type: 'secret_error', message: 'synthetic-private-error-marker' } } }
  const pending = runClosedSyntheticQualification(options)
  options.faults.guarded_operation = { type: 'disconnect' }
  const receipt = await pending
  assert.equal(receipt.code, 'COMMAND_FAILED')
  assert.equal(receipt.outcome, 'ABORT_ROLLED_BACK')
  assert.equal(JSON.stringify(receipt).includes('synthetic-private-error-marker'), false)
})

test('source drift refuses before loading inherited or SQL modules, preserving held bytes and suppressing poison errors', async () => {
  const lock = JSON.parse(await readFile(new URL('source-lock.json', packageUrl), 'utf8'))
  for (const name of ['guardedOperation', 'inheritedContract', 'sqlBoundary']) {
    const root = await mkdtemp(resolve(tmpdir(), 'qik-client-drift-'))
    try {
      const copiedPackage = resolve(root, 'scripts/qualification/backend-live-rehearsal')
      await mkdir(copiedPackage, { recursive: true })
      await writeFile(resolve(copiedPackage, 'source-lock.json'), `${JSON.stringify(lock, null, 2)}\n`)
      for (const pin of Object.values(lock.sources)) {
        const destination = resolve(copiedPackage, pin.path)
        await mkdir(dirname(destination), { recursive: true })
        await writeFile(destination, await readFile(new URL(pin.path, packageUrl)))
      }
      const target = resolve(copiedPackage, lock.sources[name].path)
      await writeFile(target, `${await readFile(target, 'utf8')}\nthrow new Error('synthetic-poison-private-marker')\n`)
      for (const mode of ['--inspect', '--synthetic', '--bundle']) {
        const run = spawnSync(process.execPath, [resolve(copiedPackage, 'inspect.mjs'), mode], { encoding: 'utf8', timeout: 10000 })
        assert.equal(run.status, 1, name)
        assert.equal(JSON.parse(run.stdout).code, 'SOURCE_DRIFT', name)
        assert.equal(run.stdout.includes('synthetic-poison-private-marker'), false)
        assert.equal(run.stderr, '')
      }
    } finally { await rm(root, { recursive: true, force: true }) }
  }
})
