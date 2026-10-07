import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  verifyEvidence, FROZEN_SOURCE, ORIGINAL_SOURCE_PINS, NATIVE_PUBLIC_SOURCE_PINS, DO_CLASSIFICATIONS, CLIENT_CASE_NAMES, PIPE_CASE_NAMES,
} from '../../scripts/qualification/qik-native-evidence-20261007/verify.mjs';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// Fabricated public receipts for integrity attacks, never native execution evidence.
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'qik-evidence-verifier-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const classifications = Object.entries(DO_CLASSIFICATIONS).map(([name, classification]) => ({
    case: name, classification, pass: true,
    expectedRefusal: ({ 'exact-byte-real-dblink-username-sentinel': 'qik_audit_route_probe_refused',
      'exact-byte-real-dblink-bad-password': 'qik_audit_route_probe_refused',
      'exact-byte-real-dblink-missing-login': 'qik_audit_route_probe_refused',
      'exact-byte-real-dblink-rowcount-zero': 'qik_audit_route_write_refused',
      'exact-byte-real-dblink-stale-target': 'qik_audit_route_already_applied',
      'exact-byte-real-dblink-missing-update': 'qik_audit_route_grant_missing',
      'exact-byte-real-dblink-invalid-session-identity': 'qik_audit_route_identity_refused' })[name] ?? null,
    ...(name === 'independent-stale-cas-predicate' ? { rowCount: 0 } : {}),
    ...(name.endsWith('outer-rollback-retention') ? { retainedAuditRows: 1 } : {}),
  }));
  const publicSourceHashes = Object.fromEntries(ORIGINAL_SOURCE_PINS.map(pin => [pin.key, pin.sha256]));
  publicSourceHashes.sourceLock = 'be46812c3154b58162037d93a755b544e8862d81eb26738369db6887bdf8f18c';
  const worker = { mode: 'isolated-synthetic-native-test-only', productionAuthorized: false, liveReady: false,
    passed: true, caseCount: CLIENT_CASE_NAMES.length, cases: CLIENT_CASE_NAMES.map(name => ({ case: name, passed: true })),
    libpqVersion: 170011, librarySha256: '973ef2a8b582ee8dd130168537cb1d1d5fdbc1b63bf1a5c0b7113890c6149c68',
    workerSourceSha256: '14ca37610e17670b3dae8a3a3f93f7466e9f8fa9578baf66071affd97e01b572', publicSourceHashes };
  const pipe = { mode: 'isolated-native-process-pipe-qualification', productionAuthorized: false, liveReady: false,
    passed: true, caseCount: PIPE_CASE_NAMES.length, cases: PIPE_CASE_NAMES.map(name => ({ case: name, passed: true })) };
  const receipts = { 'do.json': classifications, 'worker.json': worker, 'pipe.json': pipe };
  const manifest = { schema: 'qik-native-evidence-20261007-1', mode: 'offline-native-evidence-integrity',
    productionAuthorized: false, liveReady: false, hold: 'PROVIDER_SERVER_DBLINK_VERIFY_FULL_HOLD',
    source: FROZEN_SOURCE, originalSourcePins: structuredClone(ORIGINAL_SOURCE_PINS),
    guardedOperation: { ...ORIGINAL_SOURCE_PINS[0] }, files: [],
    receipts: { doClassifications: 'do.json', nativeClientWorker: 'worker.json', fixedPrivatePipe: 'pipe.json' } };
  async function save() {
    manifest.files = [];
    for (const [path, value] of Object.entries(receipts)) {
      const bytes = Buffer.from(JSON.stringify(value));
      await writeFile(join(root, path), bytes);
      manifest.files.push({ path, bytes: bytes.length, sha256: hash(bytes) });
    }
    return pinManifest();
  }
  async function pinManifest() {
    const bytes = Buffer.from(JSON.stringify(manifest));
    await writeFile(join(root, 'manifest.json'), bytes);
    return { evidenceRoot: root, manifestPath: 'manifest.json', manifestSha256: hash(bytes), sourceRoot };
  }
  const args = await save();
  return { root, manifest, receipts, args, save, pinManifest };
}

test('public receipt integrity yields separate honest counts and retained HOLD', async t => {
  const { args } = await fixture(t);
  const result = await verifyEvidence(args);
  assert.equal(result.status, 'EVIDENCE_INTEGRITY_VERIFIED');
  assert.equal(result.verifiedOriginalSourcePins, 18);
  assert.equal(result.counts.stubDblinkCases, 24);
  assert.equal(result.counts.realDblinkExactDoCases, 11);
  assert.equal(result.counts.instrumentedPredicateOnlyCases, 1);
  assert.equal(result.counts.nativeClientWorkerReceiptCases, 23);
  assert.equal(result.counts.clientNativeBoundaryCases, 21);
  assert.equal(result.counts.clientProductionGuardCases, 1);
  assert.equal(result.counts.fixedPrivatePipeReceiptCases, 4);
  assert.equal(result.productionAuthorized, false);
  assert.equal(result.liveReady, false);
});

test('tampered manifest or evidence bytes cannot inherit a pinned receipt', async t => {
  const f = await fixture(t);
  await writeFile(join(f.root, 'do.json'), '[]');
  await assert.rejects(verifyEvidence(f.args), /EVIDENCE_BYTES_MISMATCH/);
  await f.save();
  await writeFile(join(f.root, 'manifest.json'), '{}');
  await assert.rejects(verifyEvidence(f.args), /MANIFEST_HASH_MISMATCH/);
});

test('manifest and indexed paths reject traversal, absolute paths and symlinks', async t => {
  const f = await fixture(t);
  for (const path of ['../outside.json', '/etc/passwd', 'a/../worker.json', './worker.json', 'a\\worker.json']) {
    await assert.rejects(verifyEvidence({ ...f.args, manifestPath: path }), /PATH_REFUSED/);
    f.manifest.files[0].path = path;
    await assert.rejects(verifyEvidence(await f.pinManifest()), /PATH_REFUSED/);
  }
  await f.save();
  await symlink(join(f.root, 'do.json'), join(f.root, 'alias.json'));
  f.manifest.files[0].path = 'alias.json';
  await assert.rejects(verifyEvidence(await f.pinManifest()), /PATH_REFUSED/);
  await mkdir(join(f.root, 'real'));
  await symlink(join(f.root, 'real'), join(f.root, 'alias-directory'));
  await assert.rejects(verifyEvidence({ ...f.args, manifestPath: 'alias-directory/manifest.json' }), /PATH_REFUSED/);
  await assert.rejects(verifyEvidence({ ...f.args, evidenceRoot: join(f.root, 'alias-directory') }), /PATH_REFUSED/);
});

test('production claims fail even when a caller deliberately repins metadata', async t => {
  const f = await fixture(t);
  f.manifest.productionAuthorized = true;
  await assert.rejects(verifyEvidence(await f.pinManifest()), /PRODUCTION_CLAIM_REFUSED/);
  f.manifest.productionAuthorized = false;
  f.receipts['worker.json'].liveReady = true;
  await assert.rejects(verifyEvidence(await f.save()), /PRODUCTION_CLAIM_REFUSED/);
});

test('repinned wrong DO, original pin or frozen source metadata is refused', async t => {
  const f = await fixture(t);
  f.manifest.guardedOperation.sha256 = '0'.repeat(64);
  await assert.rejects(verifyEvidence(await f.pinManifest()), /FROZEN_DO_REFUSED/);
  f.manifest.guardedOperation = { ...ORIGINAL_SOURCE_PINS[0] };
  f.manifest.originalSourcePins[0].sha256 = '0'.repeat(64);
  await assert.rejects(verifyEvidence(await f.pinManifest()), /SOURCE_PIN_REFUSED/);
  f.manifest.originalSourcePins = structuredClone(ORIGINAL_SOURCE_PINS);
  f.manifest.source = { ...FROZEN_SOURCE, tree: '0'.repeat(40) };
  await assert.rejects(verifyEvidence(await f.pinManifest()), /SOURCE_METADATA_REFUSED/);
});

test('changed actual frozen source bytes are refused independently of manifest claims', async t => {
  const f = await fixture(t);
  const clone = join(f.root, 'source');
  const paths = [...ORIGINAL_SOURCE_PINS.map(pin => pin.path), ...NATIVE_PUBLIC_SOURCE_PINS.map(pin => pin.path),
    'scripts/qualification/backend-live-rehearsal/source-lock.json'];
  for (const path of paths) {
    await mkdir(dirname(join(clone, path)), { recursive: true });
    await copyFile(join(sourceRoot, path), join(clone, path));
  }
  const path = join(clone, ORIGINAL_SOURCE_PINS[0].path);
  const bytes = await readFile(path);
  bytes[0] ^= 1;
  await writeFile(path, bytes);
  await assert.rejects(verifyEvidence({ ...f.args, sourceRoot: clone }), /SOURCE_BYTES_MISMATCH/);
});

test('stub or instrumented cases cannot be repinned as real native DO cases', async t => {
  const f = await fixture(t);
  f.receipts['do.json'][0].classification = 'native-pg-real-dblink-standalone-exact-byte-do';
  await assert.rejects(verifyEvidence(await f.save()), /CLASSIFICATION_REFUSED/);
  f.receipts['do.json'][0].classification = DO_CLASSIFICATIONS[f.receipts['do.json'][0].case];
  f.receipts['do.json'].find(item => item.case === 'independent-stale-cas-predicate').classification = 'native-pg-real-independent-lock-standalone-exact-byte-do';
  await assert.rejects(verifyEvidence(await f.save()), /CLASSIFICATION_REFUSED/);
});

test('unsupported client mode, renamed case or missing receipt cannot be accepted', async t => {
  const f = await fixture(t);
  f.receipts['worker.json'].mode = 'production';
  await assert.rejects(verifyEvidence(await f.save()), /CLIENT_RECEIPT_REFUSED/);
  f.receipts['worker.json'].mode = 'isolated-synthetic-native-test-only';
  f.receipts['pipe.json'].cases[0].case = 'unobserved-new-native-case';
  await assert.rejects(verifyEvidence(await f.save()), /CLIENT_RECEIPT_REFUSED/);
  f.manifest.receipts.fixedPrivatePipe = 'unindexed.json';
  await assert.rejects(verifyEvidence(await f.pinManifest()), /RECEIPT_NOT_PINNED/);
});

test('whitelisted source summaries remain pinned without raw fixture material or production authority', async () => {
  const result = await verifyEvidence({
    evidenceRoot: sourceRoot,
    manifestPath: 'docs/qualification/qik-native-source-summary-20261007/source-summary-manifest.json',
    manifestSha256: 'e642407ec028fed6511f10da72f401e8a5aef2bfa31b567bb26487ee12e6139e',
  });
  assert.equal(result.verifiedEvidenceFiles, 13);
  assert.equal(result.verifiedOriginalSourcePins, 18);
  assert.equal(result.verifiedNativePublicSourcePins, 4);
  assert.equal(result.productionAuthorized, false);
  assert.equal(result.liveReady, false);
  assert.equal(result.hold, 'PROVIDER_SERVER_DBLINK_VERIFY_FULL_HOLD');
  for (const name of ['client-summary.json', 'pipe-summary.json']) {
    const bytes = await readFile(join(sourceRoot, 'docs/qualification/qik-native-source-summary-20261007', name));
    const value = JSON.parse(bytes);
    assert.equal(value.receiptKind, 'WHITELISTED_DERIVED_SUMMARY_NOT_RAW_NATIVE_RECEIPT');
    assert.equal(bytes.toString().includes('postgresql://'), false);
    assert.equal(bytes.toString().includes('-----BEGIN PRIVATE KEY-----'), false);
    assert.equal(Object.hasOwn(value, 'connectionString'), false);
    assert.equal(Object.hasOwn(value, 'credential'), false);
  }
});
