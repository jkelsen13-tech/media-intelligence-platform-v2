import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Public source only. These are the original 18 pins, not new execution authority.
export const ORIGINAL_SOURCE_PINS = Object.freeze([
  ['guardedOperation', 'scripts/qualification/qik-audit-route-transform-proposal-20261002.sql', 7101, '5be14204dbd68b44ccaba07222bd6a5b4f9d9f627ce4750fce596211e6d6fb46'],
  ['preSubmitDeadlines', 'scripts/qualification/qik-audit-route-pre-submit-deadlines-20261002.sql', 324, '2ac3ca583a82fc717cca12b9f64d40019339b3be7c2aeefb0948473a5336518d'],
  ['inheritedContract', 'scripts/qualification/backend-client-contract/contract.mjs', 24099, '209102c3a77015ab53d34718e499d5568243d7eb6a7471c3035875b115b704f9'],
  ['inheritedInputs', 'scripts/qualification/backend-client-contract/required-inputs.json', 1136, 'f7f33a1f5a391c3ee2148ae9a4b1bd3701e04f4e0467fe00fbc6ee10d84750c6'],
  ['package', 'scripts/qualification/backend-live-rehearsal/package.mjs', 19837, '0051f2d1b2b219ced57e1590c88a64c2ac18cd2b9a2a26bb39f5394543dc40a4'],
  ['inert', 'scripts/qualification/backend-live-rehearsal/inert.mjs', 1408, 'a827785291d4e136f17c2a1e6352241213b5024ad086d8cce01e8f0b74ce825d'],
  ['cli', 'scripts/qualification/backend-live-rehearsal/inspect.mjs', 1169, 'ffc97f7f4de06f2986ee83d4b6976d63aeabad32f0beb0e13a24478cb807daa3'],
  ['inputs', 'scripts/qualification/backend-live-rehearsal/required-inputs.json', 1161, '303791820407872a7ab1296607f83afc05aea8ec0c988cb297d2202da8f72146'],
  ['clientBinding', 'scripts/qualification/backend-live-rehearsal/client-binding-contract.json', 5654, '4ba4c09a7d96281efc579e38ee5d2080ea4f0882dc274ed05a798be383d4b841'],
  ['protocol', 'scripts/qualification/backend-live-rehearsal/submission-protocol.json', 9759, '71eba36030f172fc642d52cf676eb98e8421309f191d0c31b9848e362b6e1e94'],
  ['auxiliary', 'scripts/qualification/backend-live-rehearsal/auxiliary-commands.json', 2967, 'dc656c95ad65008a80db3c1560e37ce8a515f323d6601c42518edb66032ee5aa'],
  ['sqlBoundary', 'scripts/qualification/backend-rollback-sql/boundary.mjs', 10951, 'dacff35888b623465ab406714e253c139f199150dc7afcd38bfe38b474604a0b'],
  ['sqlSnapshot', 'scripts/qualification/backend-rollback-sql/snapshot-public.sql', 7352, 'adf179a0dffbf042801e84caadea92da56165c2118a42bfe263c2ed46da76b47'],
  ['sqlRowGuards', 'scripts/qualification/backend-rollback-sql/inspect-rows-public.sql', 261, 'fcef821e4b3bf324a41880061f6d234c6561161b5fae04ab0f5d3e1c01b5e0bf'],
  ['sqlPrivateRowGuards', 'scripts/qualification/backend-rollback-sql/inspect-rows-private-booleans.sql', 2081, '90ff1fc36827dd2767b86a625d19d4ef97a7e8121936b0696201788179d7c6d6'],
  ['sqlPrivateCapture', 'scripts/qualification/backend-rollback-sql/capture-rows-private.sql', 508, '4aa06e049b12eb7edba96ce029e3e0fbb377ca60d17280200fa95c3d3278c314'],
  ['sqlPrivateCompare', 'scripts/qualification/backend-rollback-sql/compare-rows-private.sql', 3568, '1ee43c88f697d328a6c73dbbe6ff6c307da270b9a57034c230908483cf47e141'],
  ['sqlAuthority', 'scripts/qualification/backend-rollback-sql/authority-commands.json', 809, 'd26bb6504cbcdd63595d5815b337d929613436daf46699c4220bc7e77f827cbb'],
].map(([key, path, bytes, sha256]) => Object.freeze({ key, path, bytes, sha256 })));

export const FROZEN_SOURCE = Object.freeze({
  localCommit: 'e91436f9982a9038e30d9858956ee808b22bc727',
  remoteCommit: '6b55a05d25f5a6d1bf3ea8573268eeedf641207a',
  tree: '95a185b70ef5611a2cfd387a06ceeff26a170e16',
});
const LOCK = { path: 'scripts/qualification/backend-live-rehearsal/source-lock.json', bytes: 3572, sha256: 'be46812c3154b58162037d93a755b544e8862d81eb26738369db6887bdf8f18c' };
export const NATIVE_PUBLIC_SOURCE_PINS = Object.freeze([
  { path: 'scripts/qualification/backend-private-client/libpq17.py', bytes: 33152, sha256: '9c64efae9d5532a8dc3b50a9099545f9727703873b2bf11f3317231196d23733' },
  { path: 'scripts/qualification/backend-private-client/frozen-inventory.json', bytes: 118721, sha256: '09b6e70225313ae00428219ba86cc945c82dccdce29b8b84681caef0aebf959f' },
  { path: 'scripts/qualification/backend-private-host/private_worker.py', bytes: 8808, sha256: '14ca37610e17670b3dae8a3a3f93f7466e9f8fa9578baf66071affd97e01b572' },
  { path: 'scripts/qualification/backend-private-host/private-pipe.mjs', bytes: 3633, sha256: '1926b44f4952f2076a4d8e528373cbb12a83a5b2a6c607aad2fa0b4daa7f9bd8' },
].map(Object.freeze));
const SHA256 = /^[a-f0-9]{64}$/;
const HOLD = 'PROVIDER_SERVER_DBLINK_VERIFY_FULL_HOLD';
export const DERIVED_SUMMARY_KIND = 'WHITELISTED_DERIVED_SUMMARY_NOT_RAW_NATIVE_RECEIPT';
const SUMMARY_DIR = 'docs/qualification/qik-native-source-summary-20261007';
export const SUMMARY_PATHS = Object.freeze({
  doClassifications: `${SUMMARY_DIR}/do-classification-summary.json`,
  nativeClientWorker: `${SUMMARY_DIR}/client-summary.json`,
  fixedPrivatePipe: `${SUMMARY_DIR}/pipe-summary.json`,
});
// Required membership is fixed by the verifier, never selected by the manifest.
// Proposal bytes remain caller-pinned and confer no execution qualification.
export const ORIGINAL_REQUIRED_PACKAGE_PATHS = Object.freeze([
  `${SUMMARY_DIR}/client-summary.json`, `${SUMMARY_DIR}/do-classification-summary.json`, `${SUMMARY_DIR}/pipe-summary.json`,
  'scripts/qualification/qik-http-source-proposal-20261007/002_http_transport_proposal.sql',
  'scripts/qualification/qik-http-source-proposal-20261007/003_ack_contract.sql',
  'scripts/qualification/qik-http-source-proposal-20261007/src/LICENSE.pgsql-http.md',
  'scripts/qualification/qik-http-source-proposal-20261007/src/http-bounded-response.c',
  'scripts/qualification/qik-http-source-proposal-20261007/src/pgsql-http-bounded-response.patch',
  'scripts/qualification/qik-http-source-proposal-20261007/src/upstream-http-v1.6.3.c',
  'scripts/qualification/qik-http-source-proposal-20261007/tests/response_component.c',
  'scripts/qualification/qik-http-source-proposal-20261007/tests/test_response_component.py',
  'scripts/qualification/qik-selected-catalog-read-20261007/approval-scope.md',
  'scripts/qualification/qik-selected-catalog-read-20261007/catalog-observation.sql',
]);
export const REQUIRED_PACKAGE_PATHS = Object.freeze([
  ...ORIGINAL_REQUIRED_PACKAGE_PATHS,
  'scripts/qualification/qik-http-source-proposal-20261007/tests/http_contract_fixture.sql',
  'scripts/qualification/qik-http-source-proposal-20261007/tests/http_contract_regressions.sql',
  'scripts/qualification/qik-http-source-proposal-20261007/tests/http_contract_native.py',
  'tests/qualification/qik-http-contract-review-repair.test.mjs',
  'tests/qualification/qik-catalog-observation-scope-review-repair.test.mjs',
  'scripts/qualification/qik-http-source-proposal-20261007/tests/header_component.c',
  'scripts/qualification/qik-http-source-proposal-20261007/tests/curl_policy_component.c',
  'scripts/qualification/qik-http-source-proposal-20261007/tests/component_support.py',
  'tests/qualification/qik-http-curl-review-repair.test.mjs',
  'scripts/qualification/qik-native-evidence-20261007/verify.mjs',
  'scripts/qualification/qik-native-evidence-20261007/README.md',
  'tests/qualification/qik-native-evidence-20261007.test.mjs',
  'docs/qualification/qik-native-source-summary-20261007.md',
  'docs/qualification/qik-provider-revision-and-next-gates-20261007.md',
  'docs/qualification/qik-review-repairs-20261008.md',
  'scripts/qualification/qik-native-evidence-20261007/build-source-summary-manifest.mjs',
]);
// These are declared private receipt references and a declared library profile.
// Their preimages are absent from this public package; no byte verification is possible.
export const DECLARED_PRIVATE_REFERENCES = Object.freeze({
  nativeClientWorker: '2a16a07c23db12ab0b6d873712b839711e3a995bd979c60f87ee7b9f8712ef60',
  fixedPrivatePipe: '55d6f27aa4650e8bd2d5e66c799042ce0501e471c471d62999d8211401034f15',
  librarySha256: '973ef2a8b582ee8dd130168537cb1d1d5fdbc1b63bf1a5c0b7113890c6149c68',
});
const defaultSourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const refuse = code => { throw new Error(code); };
const requireValue = (condition, code) => { if (!condition) refuse(code); };

function relativePath(path) {
  requireValue(typeof path === 'string' && /^[A-Za-z0-9_./-]+$/.test(path) && !isAbsolute(path)
    && path.split('/').every(part => part && part !== '.' && part !== '..'), 'PATH_REFUSED');
  return path;
}

async function checkedRoot(root) {
  requireValue(typeof root === 'string' && isAbsolute(root)
    && root.split(sep).every(part => part !== '.' && part !== '..'), 'ROOT_REFUSED');
  const absolute = resolve(root);
  let current = sep;
  for (const part of absolute.split(sep).filter(Boolean)) {
    current = join(current, part);
    const stat = await lstat(current);
    requireValue(stat.isDirectory() && !stat.isSymbolicLink(), 'PATH_REFUSED');
  }
  return absolute;
}

async function readPublicFile(root, path) {
  relativePath(path);
  let current = root;
  const parts = path.split('/');
  for (const [index, part] of parts.entries()) {
    current = join(current, part);
    const stat = await lstat(current);
    requireValue(!stat.isSymbolicLink() && (index === parts.length - 1 ? stat.isFile() : stat.isDirectory()), 'PATH_REFUSED');
  }
  const file = await open(current, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    requireValue(stat.isFile() && stat.size <= 100 * 1024 * 1024, 'FILE_REFUSED');
    return await file.readFile();
  } finally { await file.close(); }
}

function parseJson(bytes) {
  requireValue(bytes.length <= 5 * 1024 * 1024, 'JSON_REFUSED');
  try { return JSON.parse(bytes.toString('utf8')); } catch { refuse('JSON_REFUSED'); }
}

function falseProductionClaims(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (['productionAuthorized', 'liveReady', 'productionRuntimeBound', 'providerHoldChanged',
      'productionAuthorityRegistryChanged', 'vendorCertificateQualification'].includes(key)) {
      requireValue(child === false, 'PRODUCTION_CLAIM_REFUSED');
    }
    if (['originalReceiptBytesVerified', 'libraryBytesVerified', 'producerAuthenticated',
      'nativeExecutionVerified', 'hostAttested'].includes(key)) {
      requireValue(child === false, 'UNVERIFIED_CLAIM_REFUSED');
    }
    falseProductionClaims(child);
  }
}

function exactKeys(value, required, code, optional = []) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value)
    && required.every(key => Object.hasOwn(value, key))
    && Object.keys(value).every(key => required.includes(key) || optional.includes(key)), code);
}

function publicSummaryOnly(bytes) {
  // Exact structural allowlists below also reject secret-bearing fields at every level.
  requireValue(!/(?:postgres(?:ql)?:\/\/|-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----|\b(?:password|passfile|sslkey|connection_string)\s*=|\bBearer\s+[^\s"]+)/i.test(bytes.toString('utf8')),
    'SUMMARY_SECRET_REFUSED');
}

const importedStubCases = 'preexisting-column-privilege-success opaque-ampersand-password-success ordinary-success query-sentinel-success username-sentinel-success historical-query-sentinel-red historical-username-sentinel-red missing-selected-true-row false-id-only unrelated-false-id-row-success unsafe-logging-guard missing-update missing-operation wrong-operation duplicate-singleton malformed-source duplicate-parameter already-applied bad-auditor bad-tls rowcount-zero independent-session-lock-contention'.split(' ');
const realDoCases = 'ordinary query-sentinel username-sentinel percent-encoded ampersand bad-password missing-login rowcount-zero stale-target missing-update invalid-session-identity'.split(' ').map(name => `exact-byte-real-dblink-${name}`);
const realDoOutcomes = Object.freeze({
  ordinary: null, 'query-sentinel': null, 'percent-encoded': null, ampersand: null,
  'username-sentinel': 'qik_audit_route_probe_refused', 'bad-password': 'qik_audit_route_probe_refused',
  'missing-login': 'qik_audit_route_probe_refused', 'rowcount-zero': 'qik_audit_route_write_refused',
  'stale-target': 'qik_audit_route_already_applied', 'missing-update': 'qik_audit_route_grant_missing',
  'invalid-session-identity': 'qik_audit_route_identity_refused',
});
const importedStubOutcomes = Object.freeze({
  'preexisting-column-privilege-success': null, 'opaque-ampersand-password-success': null,
  'ordinary-success': null, 'query-sentinel-success': null, 'username-sentinel-success': null,
  'historical-query-sentinel-red': 'probe_refused', 'historical-username-sentinel-red': 'probe_refused',
  'missing-selected-true-row': 'missing-row', 'false-id-only': 'missing-row',
  'unrelated-false-id-row-success': null, 'unsafe-logging-guard': 'logging_refused',
  'missing-update': 'grant_missing', 'missing-operation': 'state_refused', 'wrong-operation': 'state_refused',
  'duplicate-singleton': 'state_refused', 'malformed-source': 'source_refused', 'duplicate-parameter': 'source_refused',
  'already-applied': 'already_applied', 'bad-auditor': 'probe_refused', 'bad-tls': 'probe_refused',
  'rowcount-zero': 'write_refused', 'independent-session-lock-contention': 'inflight',
});
export const CLIENT_CASE_NAMES = Object.freeze('actual-tls-scram-fixed-inventory-begin-results-rollback-finish wrong-scram-password worker-wrong-scram-password hostname-mismatch worker-hostname-mismatch untrusted-ca worker-untrusted-ca missing-ca worker-missing-ca rejected-role worker-rejected-role rejected-database worker-rejected-database actual-native-connect-deadline-local-stalled-socket actual-native-lock-command-deadline-cancel-success actual-native-lock-command-deadline-drain-timeout actual-native-lock-command-deadline-cancel-timeout actual-native-result-error-final-null-rollback actual-native-pqfinish-pending-uncertainty production-worker-guard-remains-unbound actual-native-worker-process-private-pipe-success worker-private-uri-input-refusal actual-native-distinct-readonly-verifier'.split(' '));
export const PIPE_CASE_NAMES = Object.freeze('fixed-private-pipe-native-success fixed-private-pipe-native-scram-refusal fixed-private-pipe-native-distinct-verifier-inventory fixed-private-pipe-native-parent-close-releases-session-without-rollback-ack'.split(' '));
export const DO_CLASSIFICATIONS = Object.freeze(Object.fromEntries([
  ...importedStubCases.map(name => [name, 'native-pg-stub-dblink-imported-do']),
  ...['inside-do-timeout-red', 'pre-submission-timeout-green'].map(name => [name, 'native-pg-stub-dblink-standalone-exact-byte-do']),
  ...realDoCases.map(name => [name, 'native-pg-real-dblink-standalone-exact-byte-do']),
  ['independent-row-lock-timeout', 'native-pg-real-independent-lock-standalone-exact-byte-do'],
  ['independent-stale-cas-predicate', 'native-pg-instrumented-isolated-source-predicate-only'],
  ['autonomous-audit-probe-outer-rollback-retention', 'native-pg-real-dblink-exact-historical-consumer'],
  ['attached-publication-guard-autonomous-rejection-outer-rollback-retention', 'native-pg-real-dblink-exact-historical-consumer-and-guard'],
]));
export const DO_CASE_PROFILES = Object.freeze(Object.fromEntries(Object.entries(DO_CLASSIFICATIONS).map(([name, classification]) => [
  name, Object.freeze({ classification,
    ...(Object.hasOwn(importedStubOutcomes, name) ? { expectedRefusal: importedStubOutcomes[name] } : {}),
    ...(realDoCases.includes(name) ? { expectedRefusal: realDoOutcomes[name.slice('exact-byte-real-dblink-'.length)] } : {}),
    ...(name === 'independent-stale-cas-predicate' ? { rowCount: 0 } : {}),
    ...(name.endsWith('outer-rollback-retention') ? { retainedAuditRows: 1 } : {}),
  }),
])));
const publicSourceHashes = Object.freeze({
  ...Object.fromEntries(ORIGINAL_SOURCE_PINS.map(pin => [pin.key, pin.sha256])),
  sourceLock: LOCK.sha256,
  transport: NATIVE_PUBLIC_SOURCE_PINS[0].sha256,
  transportInventory: NATIVE_PUBLIC_SOURCE_PINS[1].sha256,
});

function classifyDo(cases) {
  requireValue(Array.isArray(cases) && cases.length === Object.keys(DO_CLASSIFICATIONS).length, 'CLASSIFICATION_REFUSED');
  const seen = new Set();
  for (const item of cases) {
    const profile = DO_CASE_PROFILES[item?.case];
    requireValue(profile, 'CLASSIFICATION_REFUSED');
    exactKeys(item, ['case', 'pass', 'receiptKind', ...Object.keys(profile)], 'SUMMARY_FIELDS_REFUSED');
    requireValue(item && !seen.has(item.case) && Object.hasOwn(DO_CLASSIFICATIONS, item.case)
      && item.receiptKind === DERIVED_SUMMARY_KIND && item.pass === true
      && Object.entries(profile).every(([key, value]) => item[key] === value), 'CLASSIFICATION_REFUSED');
    seen.add(item.case);
  }
  return { stubDblinkCases: 24, realDblinkExactDoCases: 11, realDblinkSuccesses: 4,
    realDblinkExpectedRefusals: 7, independentExactDoRowLockCases: 1,
    instrumentedPredicateOnlyCases: 1, autonomousAuditCases: 2, retainedFixtureAuditRows: 2 };
}

function clientReceipt(receipt, mode, expectedNames, referenceKey) {
  const expectedCount = expectedNames.length;
  exactKeys(receipt, ['mode', 'productionAuthorized', 'liveReady', 'passed', 'caseCount', 'cases', 'receiptKind', 'originalReceiptSha256',
    ...(referenceKey === 'nativeClientWorker' ? ['libpqVersion', 'librarySha256', 'workerSourceSha256', 'publicSourceHashes'] : [])], 'SUMMARY_FIELDS_REFUSED');
  requireValue(receipt.receiptKind === DERIVED_SUMMARY_KIND
    && receipt.originalReceiptSha256 === DECLARED_PRIVATE_REFERENCES[referenceKey], 'DECLARED_RECEIPT_REFERENCE_REFUSED');
  requireValue(receipt && receipt.mode === mode && receipt.productionAuthorized === false
    && receipt.liveReady === false && receipt.passed === true && receipt.caseCount === expectedCount
    && Array.isArray(receipt.cases) && receipt.cases.length === expectedCount, 'CLIENT_RECEIPT_REFUSED');
  const names = new Set();
  for (const item of receipt.cases) {
    exactKeys(item, ['case', 'passed'], 'SUMMARY_FIELDS_REFUSED');
    requireValue(expectedNames.includes(item.case) && !names.has(item.case) && item.passed === true, 'CLIENT_RECEIPT_REFUSED');
    names.add(item.case);
  }
  return names;
}

/** Read only caller-selected, sanitized public evidence. Never execute evidence. */
export async function verifyEvidence({ evidenceRoot, manifestPath, manifestSha256, sourceRoot = defaultSourceRoot }) {
  try {
    requireValue(SHA256.test(manifestSha256 ?? ''), 'MANIFEST_PIN_REQUIRED');
    const root = await checkedRoot(evidenceRoot);
    const source = await checkedRoot(sourceRoot);
    const manifestBytes = await readPublicFile(root, manifestPath);
    requireValue(hash(manifestBytes) === manifestSha256, 'MANIFEST_HASH_MISMATCH');
    const manifest = parseJson(manifestBytes);
    falseProductionClaims(manifest);
    exactKeys(manifest, ['schema', 'mode', 'productionAuthorized', 'liveReady', 'hold', 'source', 'originalSourcePins',
      'guardedOperation', 'receipts', 'files', 'scope', 'limitations', 'summaryKind'], 'MANIFEST_FIELDS_REFUSED',
    ['originalReceiptBytesVerified', 'libraryBytesVerified', 'producerAuthenticated', 'nativeExecutionVerified', 'hostAttested']);
    requireValue(manifest.schema === 'qik-native-evidence-20261007-1'
      && manifest.mode === 'offline-native-evidence-integrity'
      && manifest.productionAuthorized === false && manifest.liveReady === false
      && manifest.hold === HOLD && manifest.scope === 'WHITELISTED_SOURCE_AND_DERIVED_SUMMARY_ONLY'
      && manifest.summaryKind === DERIVED_SUMMARY_KIND
      && Array.isArray(manifest.limitations) && manifest.limitations.every(value => typeof value === 'string'), 'MANIFEST_SCOPE_REFUSED');
    exactKeys(manifest.source, Object.keys(FROZEN_SOURCE), 'SOURCE_METADATA_REFUSED');
    requireValue(Object.keys(FROZEN_SOURCE).every(key => manifest.source?.[key] === FROZEN_SOURCE[key]), 'SOURCE_METADATA_REFUSED');
    requireValue(Array.isArray(manifest.originalSourcePins) && manifest.originalSourcePins.length === 18, 'SOURCE_PIN_REFUSED');
    const pinKeys = new Set();
    for (const pin of manifest.originalSourcePins) {
      exactKeys(pin, ['key', 'path', 'bytes', 'sha256'], 'SOURCE_PIN_REFUSED');
      const expected = ORIGINAL_SOURCE_PINS.find(item => item.key === pin.key);
      requireValue(expected && !pinKeys.has(pin.key) && ['path', 'bytes', 'sha256'].every(key => pin[key] === expected[key]), 'SOURCE_PIN_REFUSED');
      pinKeys.add(pin.key);
    }
    exactKeys(manifest.guardedOperation, ['path', 'bytes', 'sha256'], 'FROZEN_DO_REFUSED');
    requireValue(['path', 'bytes', 'sha256'].every(key => manifest.guardedOperation?.[key] === ORIGINAL_SOURCE_PINS[0][key]), 'FROZEN_DO_REFUSED');
    for (const pin of [...ORIGINAL_SOURCE_PINS, LOCK, ...NATIVE_PUBLIC_SOURCE_PINS]) {
      const bytes = await readPublicFile(source, pin.path);
      requireValue(bytes.length === pin.bytes && hash(bytes) === pin.sha256, 'SOURCE_BYTES_MISMATCH');
    }
    requireValue(Array.isArray(manifest.files) && manifest.files.length <= 10000, 'FILE_LIST_REFUSED');
    // Validate all paths before opening any package entry, including omitted/extra paths.
    for (const file of manifest.files) {
      exactKeys(file, ['path', 'bytes', 'sha256'], 'FILE_LIST_REFUSED');
      relativePath(file.path);
    }
    requireValue(REQUIRED_PACKAGE_PATHS.every(path => manifest.files.some(file => file.path === path)), 'PACKAGE_COVERAGE_REFUSED');
    requireValue(manifest.files.every(file => REQUIRED_PACKAGE_PATHS.includes(file.path)), 'PACKAGE_PATH_REFUSED');
    const jsonFiles = new Map();
    const paths = new Set();
    for (const file of manifest.files) {
      relativePath(file.path);
      requireValue(!paths.has(file.path) && file.path !== manifestPath && Number.isSafeInteger(file.bytes)
        && file.bytes >= 0 && SHA256.test(file.sha256 ?? ''), 'FILE_LIST_REFUSED');
      paths.add(file.path);
      const bytes = await readPublicFile(root, file.path);
      requireValue(bytes.length === file.bytes && hash(bytes) === file.sha256, 'EVIDENCE_BYTES_MISMATCH');
      if (file.path.endsWith('.json')) {
        publicSummaryOnly(bytes);
        const value = parseJson(bytes);
        falseProductionClaims(value);
        jsonFiles.set(file.path, value);
      }
    }
    exactKeys(manifest.receipts, Object.keys(SUMMARY_PATHS), 'RECEIPT_NOT_PINNED');
    const receipt = key => {
      const path = relativePath(manifest.receipts?.[key]);
      requireValue(path === SUMMARY_PATHS[key] && jsonFiles.has(path), 'RECEIPT_NOT_PINNED');
      return jsonFiles.get(path);
    };
    const doCounts = classifyDo(receipt('doClassifications'));
    const worker = receipt('nativeClientWorker');
    const workerNames = clientReceipt(worker, 'isolated-synthetic-native-test-only', CLIENT_CASE_NAMES, 'nativeClientWorker');
    const pipeNames = clientReceipt(receipt('fixedPrivatePipe'), 'isolated-native-process-pipe-qualification', PIPE_CASE_NAMES, 'fixedPrivatePipe');
    exactKeys(worker.publicSourceHashes, Object.keys(publicSourceHashes), 'CLIENT_SOURCE_BINDING_REFUSED');
    requireValue(worker.libpqVersion === 170011
      && worker.librarySha256 === DECLARED_PRIVATE_REFERENCES.librarySha256, 'DECLARED_LIBRARY_PROFILE_REFUSED');
    requireValue(worker.workerSourceSha256 === NATIVE_PUBLIC_SOURCE_PINS[2].sha256
      && Object.entries(publicSourceHashes).every(([key, value]) => worker.publicSourceHashes[key] === value)
      && workerNames.has('production-worker-guard-remains-unbound')
      && workerNames.has('worker-private-uri-input-refusal')
      && workerNames.has('actual-native-distinct-readonly-verifier')
      && pipeNames.has('fixed-private-pipe-native-parent-close-releases-session-without-rollback-ack'), 'CLIENT_SOURCE_BINDING_REFUSED');
    return { status: 'DERIVED_SUMMARY_INTEGRITY_VERIFIED', manifestSha256, frozenSource: FROZEN_SOURCE,
      verifiedOriginalSourcePins: 18, verifiedNativePublicSourcePins: 4, verifiedEvidenceFiles: paths.size,
      counts: { ...doCounts, nativeClientWorkerReceiptCases: workerNames.size,
        clientNativeBoundaryCases: 21, clientProductionGuardCases: 1,
        clientInputValidationCases: 1, fixedPrivatePipeReceiptCases: pipeNames.size },
      productionAuthorized: false, liveReady: false, hold: HOLD,
      originalReceiptBytesVerified: false, libraryBytesVerified: false,
      producerAuthenticated: false, nativeExecutionVerified: false,
      declaredPrivateReferences: DECLARED_PRIVATE_REFERENCES,
      qualification: 'DERIVED_SUMMARY_INTEGRITY_VERIFIED',
      limitations: ['Caller-pinned public package bytes and declared summary profiles agree; a caller pin is not producer authentication.',
        'Original receipt and library preimages are absent; their SHA256 values are declared references, not verified bytes.',
        'DO rows have no single supplied original receipt preimage. No native execution, host attestation or execution authority is verified.'] };
  } catch (error) {
    if (error instanceof Error && /^[A-Z_]+$/.test(error.message)) throw error;
    refuse('EVIDENCE_READ_REFUSED');
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    requireValue(args.length === 6 && args[0] === '--root' && args[2] === '--manifest' && args[4] === '--manifest-sha256', 'CLI_ARGUMENTS_REFUSED');
    const result = await verifyEvidence({ evidenceRoot: args[1], manifestPath: args[3], manifestSha256: args[5] });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
