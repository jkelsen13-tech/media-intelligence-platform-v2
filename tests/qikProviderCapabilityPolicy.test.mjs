import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, cp, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { inspectPrivateBridgeGate, createFixedProductionPort } from '../scripts/qualification/backend-private-host/bridge.mjs'
import { loadHeldSource } from '../scripts/qualification/backend-private-host/source.mjs'
import { loadProductionAuthorityVerifier } from '../scripts/qualification/backend-private-authority/production.mjs'
import { runClosedHostQualification } from '../scripts/qualification/backend-private-host/controller.mjs'

const HOLD = 'PROVIDER_SERVER_DBLINK_VERIFY_FULL_HOLD'
const base = new URL('../scripts/qualification/', import.meta.url)
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const pin = bytes => ({ bytes: bytes.length, sha256: sha(bytes) })
const assertFrozen = value => {
  if (value && typeof value === 'object') {
    assert.equal(Object.isFrozen(value), true)
    for (const item of Object.values(value)) assertFrozen(item)
  }
}

test('public immutable provider evidence separates external libpq support from the managed server dblink HOLD', async () => {
  const gate = await inspectPrivateBridgeGate()
  assert.equal(gate.code, HOLD)
  assert.equal(gate.liveAuthorized, false)
  assert.equal(gate.childSpawned, false)
  assertFrozen(gate)
  const policy = gate.providerCapability
  assert.equal(policy.status, 'HOLD')
  assert.equal(policy.inspectionOnly, true)
  assert.equal(policy.mode, 'source-only-offline-inspection')
  assert.equal(policy.networkMode, 'none')
  assert.equal(policy.productionActivationAvailable, false)
  assert.equal(policy.provider, 'Supabase')
  assert.deepEqual(policy.scope, {
    projectRef: 'qikvmopbtijoebdqosyq', host: 'db.qikvmopbtijoebdqosyq.supabase.co',
    port: 5432, database: 'postgres', serverConnectionMechanism: 'PostgreSQL server-side dblink using libpq',
    authentication: 'password; sslrootcert verifies server trust, not sslcert client authentication',
  })
  assert.deepEqual(policy.evidence, {
    ticketId: 'SU-495218', threadId: '1a10bb76d10d2ea8',
    initialTechnicalReply: { messageId: '1a115364f2345ce3', date: 'Wed, 07 Oct 2026 07:14:01 +0000 (UTC)', dateUtc: '2026-10-07T07:14:01Z' },
    customerScopeClarification: { messageId: '1a11546d42c12d7f', date: 'Wed, 7 Oct 2026 02:32:05 -0500', dateUtc: '2026-10-07T07:32:05Z' },
    finalTechnicalReply: { messageId: '1a11571c51facd28', date: 'Wed, 07 Oct 2026 08:18:59 +0000 (UTC)', dateUtc: '2026-10-07T08:18:59Z' },
  })
  assert.deepEqual(policy.capabilities.externalLibpq, {
    sslmode: 'verify-full', downloadedSupabaseCaThroughSslrootcert: 'SUPPORTED',
    certificateChainVerification: 'SUPPORTED', hostnameVerification: 'SUPPORTED',
  })
  assert.deepEqual(policy.capabilities.managedServerDblink, {
    customerAccessibleTrustFile: 'NOT_SUPPORTED', stableManagedHostSystemTrustInterface: 'NOT_GUARANTEED',
    endpointVerifyFullConfiguration: 'NOT_CONFIRMED_SUPPORTED', encryptionAloneSatisfiesChainAndHostnameRequirement: false,
  })
  assert.equal(policy.capabilities.credentialAndLoggingPrivacy.documentedDblinkExposureMatrixProvided, false)
  assert.equal(policy.capabilities.credentialAndLoggingPrivacy.unobservedProviderSystemsOrAllFailurePathsAbsenceEstablished, false)
  assert.equal(policy.externalReplacement.actualConsumerSourceRequirementsMapping, 'HISTORICAL_SOURCE_MAPPED_LIVE_BINDING_UNQUALIFIED')
  assert.equal(policy.externalReplacement.mappedHistoricalSourceCommit, '948f83d050ec6b15badd9aa96d867e2840e54840')
  assert.equal(policy.externalReplacement.equivalenceEstablished, false)
  assert.equal(policy.externalReplacement.activationAuthorized, false)
  assert.throws(() => { policy.capabilities.managedServerDblink.endpointVerifyFullConfiguration = 'SUPPORTED' }, TypeError)
  assert.throws(() => { policy.status = 'READY' }, TypeError)
})

test('empty roots and accepted-looking caller claims cannot activate or configure the fixed original package', async () => {
  const authority = await loadProductionAuthorityVerifier()
  assert.equal(authority.ready, false)
  assert.equal(authority.acceptedRootCount, 0)
  assert.equal(authority.code, 'TRUST_ROOT_UNBOUND')
  for (const claims of [{}, {
    trusted: true, liveAuthorized: true, ready: true, immutableArtifactBound: true,
    trustedClockBound: true, privateRuntimeBound: true, providerTlsReady: true,
    acceptedRoots: ['synthetic-future-root'], providerCapability: 'SUPPORTED',
    approvedCaPath: '/TEST_ONLY/downloaded-external-ca.pem', sslrootcert: 'system',
  }]) {
    const gate = await inspectPrivateBridgeGate({ claims })
    assert.equal(gate.code, HOLD)
    assert.equal(gate.liveAuthorized, false)
    assert.equal(gate.providerCapability.authorization.callerClaimsCanAuthorize, false)
    assert.equal(gate.providerCapability.authorization.futureAcceptedRootsCanRemoveThisHold, false)
  }
  await assert.rejects(createFixedProductionPort(), error => error.message === HOLD)
  for (const options of [{ roots: ['synthetic-future-root'] }, { providerPolicy: { status: 'READY' } },
    { claims: {}, sslrootcert: '/TEST_ONLY/downloaded-external-ca.pem' }, { runtime: { ready: true } }]) {
    await assert.rejects(inspectPrivateBridgeGate(options), /PRIVATE_BRIDGE_INPUT_REFUSED/)
    await assert.rejects(createFixedProductionPort(options), /PRIVATE_BRIDGE_INPUT_REFUSED/)
  }
  let evaluated = false
  const accessor = {}; Object.defineProperty(accessor, 'claims', { enumerable: true, get() { evaluated = true; return {} } })
  await assert.rejects(inspectPrivateBridgeGate(accessor), /PRIVATE_BRIDGE_INPUT_REFUSED/)
  await assert.rejects(inspectPrivateBridgeGate({ claims: { authorizePhase() { evaluated = true } } }), /PRIVATE_BRIDGE_INPUT_REFUSED/)
  assert.equal(evaluated, false)
})

test('supported external CA does not qualify the frozen ssl_ca_file and pre-write server dblink dependency', async () => {
  const policy = (await inspectPrivateBridgeGate()).providerCapability
  const originalDo = await readFile(new URL('qik-audit-route-transform-proposal-20261002.sql', base))
  const originalLock = await readFile(new URL('backend-live-rehearsal/source-lock.json', base))
  assert.equal(sha(originalDo), '5be14204dbd68b44ccaba07222bd6a5b4f9d9f627ce4750fce596211e6d6fb46')
  assert.equal(sha(originalDo), policy.originalFrozenPackage.guardedDoSha256)
  assert.equal(sha(originalLock), 'be46812c3154b58162037d93a755b544e8862d81eb26738369db6887bdf8f18c')
  assert.equal(sha(originalLock), policy.originalFrozenPackage.sourceLockSha256)
  assert.equal((await loadHeldSource()).artifact.frozenSourcePins.length, 18)
  const sql = originalDo.toString('utf8')
  const trust = sql.indexOf("ca_path := pg_catalog.current_setting('ssl_ca_file',true)")
  const dblink = sql.indexOf('from mip_factual_transport_raw.dblink(')
  const write = sql.indexOf('update mip_factual.audit_connection')
  assert.ok(trust >= 0 && dblink > trust && write > dblink)
  assert.match(sql, /where id and connection_string=old_uri/)
  assert.equal(policy.originalFrozenPackage.serverTrustPathSetting, 'ssl_ca_file')
  assert.equal(policy.originalFrozenPackage.serverDblinkVerificationPrecedesOneRowCompareAndSwap, true)
  assert.equal(policy.originalFrozenPackage.serverSslCaFileEqualsExternalDownloadedCaEstablished, false)
})

test('synthetic future accepted authority is not imported and no runtime read, handoff, spawn or network occurs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qik-provider-future-authority-'))
  try {
    const target = join(directory, 'qualification')
    await cp(base, target, { recursive: true })
    await writeFile(join(target, 'backend-provider-policy/policy.mjs'), 'globalThis.__providerPolicyScriptImported = true; throw new Error("POLICY_SCRIPT_MUST_NOT_BE_IMPORTED");\n')
    // These repinned files exist only in a disposable synthetic source fixture.
    // The actual production registry, authority sources and frozen18 never change.
    const authorityPath = join(target, 'backend-private-authority/production.mjs')
    await writeFile(authorityPath, `globalThis.__futureAuthorityImported = true\nexport const loadProductionAuthorityVerifier = () => ({ ready: true, acceptedRootCount: 1, authorizePhase: () => ({ trusted: true, liveAuthorized: true, immutableArtifactBound: true, trustedClockBound: true, privateRuntimeBound: true }) })\n`)
    const registryPath = join(target, 'backend-private-authority/trust-registry.json')
    await writeFile(registryPath, '{"acceptedRoots":["TEST_ONLY_FUTURE_ROOT"],"status":"TEST_ONLY_READY"}\n')
    const integrationPath = join(target, 'backend-private-host/integration-lock.json')
    const integration = JSON.parse(await readFile(integrationPath, 'utf8'))
    integration.sources['../backend-private-authority/production.mjs'] = pin(await readFile(authorityPath))
    integration.sources['../backend-private-authority/trust-registry.json'] = pin(await readFile(registryPath))
    await writeFile(integrationPath, `${JSON.stringify(integration, null, 2)}\n`)
    const hostLockPath = join(target, 'backend-private-host/artifact-lock.json')
    const hostLock = JSON.parse(await readFile(hostLockPath, 'utf8'))
    hostLock.sources['integration-lock.json'] = pin(await readFile(integrationPath))
    await writeFile(hostLockPath, `${JSON.stringify(hostLock, null, 2)}\n`)
    const bridgeUrl = pathToFileURL(join(target, 'backend-private-host/bridge.mjs')).href
    // Separate Node harness instruments builtins BEFORE importing the bridge.
    // Its own process launch is test supervision; the bridge launches no child.
    const script = `
      import assert from 'node:assert/strict';
      import fs from 'node:fs/promises';
      import child from 'node:child_process';
      import net from 'node:net';
      import tls from 'node:tls';
      import dns from 'node:dns';
      import http from 'node:http';
      import https from 'node:https';
      import { syncBuiltinESMExports } from 'node:module';
      const attempts = { spawn: 0, network: 0, runtimeRead: 0 };
      const refuseNetwork = () => { attempts.network++; throw new Error('NETWORK_FORBIDDEN'); };
      for (const key of ['spawn','exec','execFile','fork','spawnSync','execSync','execFileSync']) child[key] = () => { attempts.spawn++; throw new Error('SPAWN_FORBIDDEN'); };
      net.connect = refuseNetwork; net.createConnection = refuseNetwork; net.Socket.prototype.connect = refuseNetwork;
      tls.connect = refuseNetwork; dns.lookup = refuseNetwork; dns.resolve = refuseNetwork;
      http.request = refuseNetwork; http.get = refuseNetwork; https.request = refuseNetwork; https.get = refuseNetwork;
      globalThis.fetch = refuseNetwork;
      const originalRead = fs.readFile;
      fs.readFile = async (path, ...args) => {
        const name = String(path);
        if (name === process.execPath || name === '/usr/bin/python3' || name.includes('/usr/lib/') || /credential|handoff|downloaded-external-ca/.test(name)) {
          attempts.runtimeRead++; throw new Error('RUNTIME_OR_PRIVATE_READ_FORBIDDEN');
        }
        return originalRead(path, ...args);
      };
      syncBuiltinESMExports();
      const bridge = await import(${JSON.stringify(bridgeUrl)});
      const gate = await bridge.inspectPrivateBridgeGate({ claims: { ready: true, trusted: true, liveAuthorized: true, acceptedRoots: ['TEST_ONLY_FUTURE_ROOT'] } });
      assert.equal(gate.code, ${JSON.stringify(HOLD)});
      await assert.rejects(bridge.createFixedProductionPort(), error => error.message === ${JSON.stringify(HOLD)});
      assert.equal(globalThis.__futureAuthorityImported, undefined);
      assert.equal(globalThis.__providerPolicyScriptImported, undefined);
      assert.deepEqual(attempts, { spawn: 0, network: 0, runtimeRead: 0 });
      process.stdout.write(JSON.stringify({ code: gate.code, authorityImported: false, ...attempts }));
    `
    const receipt = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' }))
    assert.deepEqual(receipt, { code: HOLD, authorityImported: false, spawn: 0, network: 0, runtimeRead: 0 })
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('provider contract, lock, bridge and frozen-source drift fail closed without importing policy scripts', async () => {
  for (const file of ['backend-provider-policy/evidence-contract.json', 'backend-provider-policy/source-lock.json',
    'backend-private-host/bridge.mjs', 'qik-audit-route-transform-proposal-20261002.sql']) {
    const directory = await mkdtemp(join(tmpdir(), 'qik-provider-source-drift-'))
    try {
      const target = join(directory, 'qualification')
      await cp(base, target, { recursive: true })
      const path = join(target, file)
      // Valid JS/JSON whitespace drift isolates byte checking from parse errors.
      await writeFile(path, `${await readFile(path, 'utf8')}\n`)
      const bridge = await import(pathToFileURL(join(target, 'backend-private-host/bridge.mjs')).href)
      const expected = file.startsWith('backend-provider-policy/') ? /PROVIDER_POLICY_SOURCE_DRIFT/ : /HOST_SOURCE_DRIFT|SOURCE_DRIFT/
      await assert.rejects(bridge.inspectPrivateBridgeGate(), expected)
      await assert.rejects(bridge.createFixedProductionPort(), expected)
    } finally { await rm(directory, { recursive: true, force: true }) }
  }
})

test('repinning a caller-modified provider contract cannot replace the bridge-pinned HOLD evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'qik-provider-repinned-policy-'))
  try {
    const target = join(directory, 'qualification')
    await cp(base, target, { recursive: true })
    const contractPath = join(target, 'backend-provider-policy/evidence-contract.json')
    const contract = JSON.parse(await readFile(contractPath, 'utf8'))
    contract.status = 'READY'
    contract.liveAuthorized = true
    contract.capabilities.managedServerDblink.endpointVerifyFullConfiguration = 'SUPPORTED'
    await writeFile(contractPath, `${JSON.stringify(contract, null, 2)}\n`)
    const lockPath = join(target, 'backend-provider-policy/source-lock.json')
    const lock = JSON.parse(await readFile(lockPath, 'utf8'))
    lock.sources['evidence-contract.json'] = pin(await readFile(contractPath))
    await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`)
    const bridge = await import(pathToFileURL(join(target, 'backend-private-host/bridge.mjs')).href)
    await assert.rejects(bridge.inspectPrivateBridgeGate(), /PROVIDER_POLICY_SOURCE_DRIFT/)
    await assert.rejects(bridge.createFixedProductionPort(), /PROVIDER_POLICY_SOURCE_DRIFT/)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('historical closed source and synthetic response qualification stays runnable and confers no readiness', async () => {
  const result = await runClosedHostQualification()
  assert.equal(result.qualification, 'CLOSED TEST-ONLY CONTROLLER MODEL')
  assert.equal(result.networkMode, 'none')
  assert.equal(result.productionAuthorized, false)
  assert.equal(result.nativePg17Qualified, false)
  assert.equal(result.libpqQualified, false)
  assert.equal(result.liveReady, false)
  assert.equal(result.outcome, 'REHEARSAL_ROLLED_BACK')
  assert.equal((await inspectPrivateBridgeGate()).providerCapability.closedQualification.managedProviderReadinessEstablished, false)
})
