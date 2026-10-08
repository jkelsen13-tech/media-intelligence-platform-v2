import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile, copyFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  verifyEvidence, FROZEN_SOURCE, ORIGINAL_SOURCE_PINS, NATIVE_PUBLIC_SOURCE_PINS, DO_CLASSIFICATIONS, DO_CASE_PROFILES,
  CLIENT_CASE_NAMES, PIPE_CASE_NAMES, DERIVED_SUMMARY_KIND, DECLARED_PRIVATE_REFERENCES,
  SUMMARY_PATHS, ORIGINAL_REQUIRED_PACKAGE_PATHS, REQUIRED_PACKAGE_PATHS,
} from '../../scripts/qualification/qik-native-evidence-20261007/verify.mjs';

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

// Fabricated public receipts for integrity attacks, never native execution evidence.
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'qik-evidence-verifier-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const classifications = Object.entries(DO_CASE_PROFILES).map(([name, profile]) => ({
    case: name, ...profile, pass: true, receiptKind: DERIVED_SUMMARY_KIND,
  }));
  const publicSourceHashes = Object.fromEntries(ORIGINAL_SOURCE_PINS.map(pin => [pin.key, pin.sha256]));
  publicSourceHashes.sourceLock = 'be46812c3154b58162037d93a755b544e8862d81eb26738369db6887bdf8f18c';
  publicSourceHashes.transport = NATIVE_PUBLIC_SOURCE_PINS[0].sha256;
  publicSourceHashes.transportInventory = NATIVE_PUBLIC_SOURCE_PINS[1].sha256;
  const worker = { mode: 'isolated-synthetic-native-test-only', productionAuthorized: false, liveReady: false,
    passed: true, caseCount: CLIENT_CASE_NAMES.length, cases: CLIENT_CASE_NAMES.map(name => ({ case: name, passed: true })),
    libpqVersion: 170011, librarySha256: '973ef2a8b582ee8dd130168537cb1d1d5fdbc1b63bf1a5c0b7113890c6149c68',
    workerSourceSha256: '14ca37610e17670b3dae8a3a3f93f7466e9f8fa9578baf66071affd97e01b572', publicSourceHashes,
    receiptKind: DERIVED_SUMMARY_KIND, originalReceiptSha256: DECLARED_PRIVATE_REFERENCES.nativeClientWorker };
  const pipe = { mode: 'isolated-native-process-pipe-qualification', productionAuthorized: false, liveReady: false,
    passed: true, caseCount: PIPE_CASE_NAMES.length, cases: PIPE_CASE_NAMES.map(name => ({ case: name, passed: true })),
    receiptKind: DERIVED_SUMMARY_KIND, originalReceiptSha256: DECLARED_PRIVATE_REFERENCES.fixedPrivatePipe };
  const receipts = { [SUMMARY_PATHS.doClassifications]: classifications,
    [SUMMARY_PATHS.nativeClientWorker]: worker, [SUMMARY_PATHS.fixedPrivatePipe]: pipe };
  const manifest = { schema: 'qik-native-evidence-20261007-1', mode: 'offline-native-evidence-integrity',
    productionAuthorized: false, liveReady: false, hold: 'PROVIDER_SERVER_DBLINK_VERIFY_FULL_HOLD',
    source: FROZEN_SOURCE, originalSourcePins: structuredClone(ORIGINAL_SOURCE_PINS),
    guardedOperation: { path: ORIGINAL_SOURCE_PINS[0].path, bytes: ORIGINAL_SOURCE_PINS[0].bytes, sha256: ORIGINAL_SOURCE_PINS[0].sha256 },
    files: [], receipts: { ...SUMMARY_PATHS }, scope: 'WHITELISTED_SOURCE_AND_DERIVED_SUMMARY_ONLY',
    summaryKind: DERIVED_SUMMARY_KIND, limitations: ['Fabricated test summaries; no native execution occurred.'] };
  async function save() {
    manifest.files = [];
    for (const [path, value] of Object.entries(receipts)) {
      const bytes = Buffer.from(JSON.stringify(value));
      await mkdir(dirname(join(root, path)), { recursive: true });
      await writeFile(join(root, path), bytes);
      manifest.files.push({ path, bytes: bytes.length, sha256: hash(bytes) });
    }
    for (const path of REQUIRED_PACKAGE_PATHS.filter(path => !Object.hasOwn(receipts, path))) {
      // Only membership/hash checks are exercised for the prepared proposals/tests.
      // Fabricated text does not prove that any proposal or native fixture ran.
      const bytes = Buffer.from('Fabricated public proposal/test bytes for integrity attacks only.\n');
      await mkdir(dirname(join(root, path)), { recursive: true });
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

test('fabricated self-consistent summaries yield only derived integrity and retained HOLD', async t => {
  const { args } = await fixture(t);
  const result = await verifyEvidence(args);
  assert.equal(result.status, 'DERIVED_SUMMARY_INTEGRITY_VERIFIED');
  assert.equal(result.qualification, 'DERIVED_SUMMARY_INTEGRITY_VERIFIED');
  for (const key of ['originalReceiptBytesVerified', 'libraryBytesVerified', 'producerAuthenticated', 'nativeExecutionVerified']) {
    assert.equal(result[key], false);
  }
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
  await writeFile(join(f.root, SUMMARY_PATHS.doClassifications), '[]');
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
  await rm(join(f.root, SUMMARY_PATHS.nativeClientWorker));
  await symlink(join(f.root, SUMMARY_PATHS.doClassifications), join(f.root, SUMMARY_PATHS.nativeClientWorker));
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
  f.receipts[SUMMARY_PATHS.nativeClientWorker].liveReady = true;
  await assert.rejects(verifyEvidence(await f.save()), /PRODUCTION_CLAIM_REFUSED/);
});

test('repinned wrong DO, original pin or frozen source metadata is refused', async t => {
  const f = await fixture(t);
  f.manifest.guardedOperation.sha256 = '0'.repeat(64);
  await assert.rejects(verifyEvidence(await f.pinManifest()), /FROZEN_DO_REFUSED/);
  f.manifest.guardedOperation.sha256 = ORIGINAL_SOURCE_PINS[0].sha256;
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
  for (const relative of paths) {
    const path = join(clone, relative);
    const original = await readFile(path);
    const tampered = Buffer.from(original);
    tampered[0] ^= 1;
    await writeFile(path, tampered);
    await assert.rejects(verifyEvidence({ ...f.args, sourceRoot: clone }), /SOURCE_BYTES_MISMATCH/, relative);
    await writeFile(path, original);
  }
  // A caller also cannot retarget the summary and manifest to changed transport bytes.
  const transport = NATIVE_PUBLIC_SOURCE_PINS[0];
  const transportBytes = await readFile(join(clone, transport.path));
  transportBytes[0] ^= 1;
  await writeFile(join(clone, transport.path), transportBytes);
  f.receipts[SUMMARY_PATHS.nativeClientWorker].publicSourceHashes.transport = hash(transportBytes);
  await assert.rejects(verifyEvidence({ ...await f.save(), sourceRoot: clone }), /SOURCE_BYTES_MISMATCH/);
});

test('stub or instrumented cases cannot be repinned as real native DO cases', async t => {
  const f = await fixture(t);
  f.receipts[SUMMARY_PATHS.doClassifications][0].classification = 'native-pg-real-dblink-standalone-exact-byte-do';
  await assert.rejects(verifyEvidence(await f.save()), /CLASSIFICATION_REFUSED/);
  f.receipts[SUMMARY_PATHS.doClassifications][0].classification = DO_CLASSIFICATIONS[f.receipts[SUMMARY_PATHS.doClassifications][0].case];
  f.receipts[SUMMARY_PATHS.doClassifications].find(item => item.case === 'independent-stale-cas-predicate').classification = 'native-pg-real-independent-lock-standalone-exact-byte-do';
  await assert.rejects(verifyEvidence(await f.save()), /CLASSIFICATION_REFUSED/);
});

test('unsupported client mode, renamed case or missing receipt cannot be accepted', async t => {
  const f = await fixture(t);
  f.receipts[SUMMARY_PATHS.nativeClientWorker].mode = 'production';
  await assert.rejects(verifyEvidence(await f.save()), /CLIENT_RECEIPT_REFUSED/);
  f.receipts[SUMMARY_PATHS.nativeClientWorker].mode = 'isolated-synthetic-native-test-only';
  f.receipts[SUMMARY_PATHS.fixedPrivatePipe].cases[0].case = 'unobserved-new-native-case';
  await assert.rejects(verifyEvidence(await f.save()), /CLIENT_RECEIPT_REFUSED/);
  f.manifest.receipts.fixedPrivatePipe = 'unindexed.json';
  await assert.rejects(verifyEvidence(await f.pinManifest()), /RECEIPT_NOT_PINNED/);
});

test('retargeting summary and manifest hashes cannot change declared receipt references or kinds', async t => {
  const f = await fixture(t);
  for (const key of ['nativeClientWorker', 'fixedPrivatePipe']) {
    const path = SUMMARY_PATHS[key];
    const summary = f.receipts[path];
    for (const [field, replacement] of [['originalReceiptSha256', '0'.repeat(64)], ['receiptKind', 'RAW_NATIVE_RECEIPT']]) {
      const original = summary[field];
      const oldFileHash = f.manifest.files.find(file => file.path === path).sha256;
      summary[field] = replacement;
      const args = await f.save();
      assert.notEqual(f.manifest.files.find(file => file.path === path).sha256, oldFileHash);
      assert.notEqual(args.manifestSha256, f.args.manifestSha256);
      await assert.rejects(verifyEvidence(args), /DECLARED_RECEIPT_REFERENCE_REFUSED/);
      summary[field] = original;
      delete summary[field];
      await assert.rejects(verifyEvidence(await f.save()), /SUMMARY_FIELDS_REFUSED/);
      summary[field] = original;
      await f.save();
    }
  }
  const row = f.receipts[SUMMARY_PATHS.doClassifications][0];
  row.receiptKind = 'RAW_NATIVE_RECEIPT';
  await assert.rejects(verifyEvidence(await f.save()), /CLASSIFICATION_REFUSED/);
  row.receiptKind = DERIVED_SUMMARY_KIND;
  // The bare DO array has no single supplied raw receipt reference to verify.
  row.originalReceiptSha256 = '0'.repeat(64);
  await assert.rejects(verifyEvidence(await f.save()), /SUMMARY_FIELDS_REFUSED/);
});

test('all declared DO outcomes including imported stub refusals are enforced after repinning', async t => {
  const f = await fixture(t);
  const rows = f.receipts[SUMMARY_PATHS.doClassifications];
  for (const row of rows) {
    const field = Object.hasOwn(row, 'expectedRefusal') ? 'expectedRefusal'
      : Object.hasOwn(row, 'rowCount') ? 'rowCount'
      : Object.hasOwn(row, 'retainedAuditRows') ? 'retainedAuditRows' : 'pass';
    const original = row[field];
    row[field] = field === 'expectedRefusal' ? (original === null ? 'probe_refused' : null)
      : field === 'pass' ? false : original + 1;
    await assert.rejects(verifyEvidence(await f.save()), /CLASSIFICATION_REFUSED/, row.case);
    row[field] = original;
  }
  const stub = rows.find(row => row.case === 'historical-query-sentinel-red');
  delete stub.expectedRefusal;
  await assert.rejects(verifyEvidence(await f.save()), /SUMMARY_FIELDS_REFUSED/);
});

test('native client and pipe outcomes cannot be repinned as passes when a case failed', async t => {
  const f = await fixture(t);
  for (const key of ['nativeClientWorker', 'fixedPrivatePipe']) {
    const summary = f.receipts[SUMMARY_PATHS[key]];
    summary.cases[0].passed = false;
    await assert.rejects(verifyEvidence(await f.save()), /CLIENT_RECEIPT_REFUSED/);
    summary.cases[0].passed = true;
    summary.cases[1].case = summary.cases[0].case;
    await assert.rejects(verifyEvidence(await f.save()), /CLIENT_RECEIPT_REFUSED/);
    summary.cases[1].case = (key === 'nativeClientWorker' ? CLIENT_CASE_NAMES : PIPE_CASE_NAMES)[1];
  }
});

test('declared transport inventory and every public client source hash bind to frozen public bytes', async t => {
  const f = await fixture(t);
  const worker = f.receipts[SUMMARY_PATHS.nativeClientWorker];
  for (const key of Object.keys(worker.publicSourceHashes)) {
    const original = worker.publicSourceHashes[key];
    worker.publicSourceHashes[key] = '0'.repeat(64);
    await assert.rejects(verifyEvidence(await f.save()), /CLIENT_SOURCE_BINDING_REFUSED/, key);
    worker.publicSourceHashes[key] = original;
    delete worker.publicSourceHashes[key];
    await assert.rejects(verifyEvidence(await f.save()), /CLIENT_SOURCE_BINDING_REFUSED/, key);
    worker.publicSourceHashes[key] = original;
  }
  worker.workerSourceSha256 = '0'.repeat(64);
  await assert.rejects(verifyEvidence(await f.save()), /CLIENT_SOURCE_BINDING_REFUSED/);
});

test('the library digest matches only a declared profile and never verifies absent library bytes', async t => {
  const f = await fixture(t);
  const worker = f.receipts[SUMMARY_PATHS.nativeClientWorker];
  worker.librarySha256 = '0'.repeat(64);
  await assert.rejects(verifyEvidence(await f.save()), /DECLARED_LIBRARY_PROFILE_REFUSED/);
  worker.librarySha256 = DECLARED_PRIVATE_REFERENCES.librarySha256;
  worker.libpqVersion = 180006;
  await assert.rejects(verifyEvidence(await f.save()), /DECLARED_LIBRARY_PROFILE_REFUSED/);
  worker.libpqVersion = 170011;
  const result = await verifyEvidence(await f.save());
  assert.equal(result.libraryBytesVerified, false);
  assert.equal(result.originalReceiptBytesVerified, false);
  assert.equal(result.declaredPrivateReferences.librarySha256, worker.librarySha256);
});

test('unprovided native bytes and producer proof cannot be asserted in a repinned manifest or summary', async t => {
  const f = await fixture(t);
  for (const field of ['originalReceiptBytesVerified', 'libraryBytesVerified', 'producerAuthenticated', 'nativeExecutionVerified', 'hostAttested']) {
    f.manifest[field] = true;
    await assert.rejects(verifyEvidence(await f.pinManifest()), /UNVERIFIED_CLAIM_REFUSED/);
    f.manifest[field] = false;
    const result = await verifyEvidence(await f.save());
    assert.equal(result.nativeExecutionVerified, false);
    delete f.manifest[field];
    for (const path of Object.values(SUMMARY_PATHS)) {
      const value = Array.isArray(f.receipts[path]) ? f.receipts[path][0] : f.receipts[path];
      value[field] = true;
      await assert.rejects(verifyEvidence(await f.save()), /UNVERIFIED_CLAIM_REFUSED/);
      delete value[field];
    }
  }
  f.manifest.authentication = { issuer: 'made-up-native-producer', verified: true };
  await assert.rejects(verifyEvidence(await f.pinManifest()), /MANIFEST_FIELDS_REFUSED/);
});

test('all three summaries reject extra fields and credential-shaped content at any nesting', async t => {
  const f = await fixture(t);
  for (const path of Object.values(SUMMARY_PATHS)) {
    const summary = Array.isArray(f.receipts[path]) ? f.receipts[path][0] : f.receipts[path];
    summary.credential = { value: 'synthetic-secret-placeholder' };
    await assert.rejects(verifyEvidence(await f.save()), /SUMMARY_FIELDS_REFUSED/);
    delete summary.credential;
    for (const secret of ['postgresql://synthetic.invalid/never-connect', 'postgres://synthetic.invalid/never-connect',
      '-----BEGIN RSA PRIVATE KEY-----', 'password=synthetic-placeholder', 'Bearer synthetic-placeholder']) {
      summary.unknownField = { nested: secret };
      await assert.rejects(verifyEvidence(await f.save()), /SUMMARY_SECRET_REFUSED/);
      delete summary.unknownField;
    }
    if (Object.hasOwn(summary, 'cases')) {
      summary.cases[0].connectionString = 'not-a-real-connection';
      await assert.rejects(verifyEvidence(await f.save()), /SUMMARY_FIELDS_REFUSED/);
      delete summary.cases[0].connectionString;
    }
  }
});

test('fixed package coverage refuses every omitted proposal or summary even after caller repinning', async t => {
  const f = await fixture(t);
  assert.equal(ORIGINAL_REQUIRED_PACKAGE_PATHS.length, 13);
  assert.equal(new Set(REQUIRED_PACKAGE_PATHS).size, REQUIRED_PACKAGE_PATHS.length);
  assert.ok(ORIGINAL_REQUIRED_PACKAGE_PATHS.every(path => REQUIRED_PACKAGE_PATHS.includes(path)));
  const files = structuredClone(f.manifest.files);
  for (const path of REQUIRED_PACKAGE_PATHS) {
    f.manifest.files = files.filter(file => file.path !== path);
    await assert.rejects(verifyEvidence(await f.pinManifest()), /PACKAGE_COVERAGE_REFUSED/, path);
  }
  f.manifest.files = files;
  const proposal = REQUIRED_PACKAGE_PATHS.find(path => path.endsWith('/003_ack_contract.sql'));
  await rm(join(f.root, proposal));
  await assert.rejects(verifyEvidence(await f.pinManifest()), /EVIDENCE_READ_REFUSED/);
  f.manifest.files = files.filter(file => file.path !== proposal);
  await assert.rejects(verifyEvidence(await f.pinManifest()), /PACKAGE_COVERAGE_REFUSED/);
});

test('a manifest cannot index an unapproved raw receipt or substitute summary paths', async t => {
  const f = await fixture(t);
  // Rejected before opening this unprovided file.
  f.manifest.files.push({ path: 'unprovided-raw-receipt.json', bytes: 0, sha256: hash('') });
  await assert.rejects(verifyEvidence(await f.pinManifest()), /PACKAGE_PATH_REFUSED/);
  f.manifest.files.pop();
  f.manifest.receipts.fixedPrivatePipe = SUMMARY_PATHS.nativeClientWorker;
  await assert.rejects(verifyEvidence(await f.pinManifest()), /RECEIPT_NOT_PINNED/);
});

test('whitelisted source summaries remain pinned without raw fixture material or production authority', async () => {
  const manifestPath = 'docs/qualification/qik-native-source-summary-20261007/source-summary-manifest.json';
  const manifestBytes = await readFile(join(sourceRoot, manifestPath));
  const result = await verifyEvidence({
    evidenceRoot: sourceRoot,
    manifestPath, manifestSha256: hash(manifestBytes),
  });
  assert.equal(result.verifiedEvidenceFiles, REQUIRED_PACKAGE_PATHS.length);
  assert.equal(result.verifiedOriginalSourcePins, 18);
  assert.equal(result.verifiedNativePublicSourcePins, 4);
  assert.equal(result.productionAuthorized, false);
  assert.equal(result.liveReady, false);
  assert.equal(result.hold, 'PROVIDER_SERVER_DBLINK_VERIFY_FULL_HOLD');
  assert.equal(result.status, 'DERIVED_SUMMARY_INTEGRITY_VERIFIED');
  for (const key of ['originalReceiptBytesVerified', 'libraryBytesVerified', 'producerAuthenticated', 'nativeExecutionVerified']) {
    assert.equal(result[key], false);
  }
  for (const name of ['client-summary.json', 'pipe-summary.json', 'do-classification-summary.json']) {
    const bytes = await readFile(join(sourceRoot, 'docs/qualification/qik-native-source-summary-20261007', name));
    const value = JSON.parse(bytes);
    for (const summary of Array.isArray(value) ? value : [value]) {
      assert.equal(summary.receiptKind, DERIVED_SUMMARY_KIND);
      assert.equal(Object.hasOwn(summary, 'connectionString'), false);
      assert.equal(Object.hasOwn(summary, 'credential'), false);
    }
    assert.doesNotMatch(bytes.toString(), /postgres(?:ql)?:\/\/|-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/i);
  }
});
