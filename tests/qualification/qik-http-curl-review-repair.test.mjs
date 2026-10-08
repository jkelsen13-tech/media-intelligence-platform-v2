import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const proposal = join(root, 'scripts/qualification/qik-http-source-proposal-20261007');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const forkPath = join(proposal, 'src/http-bounded-response.c');

test('curl repair keeps the immutable public preimage and MIT license pinned', async () => {
  assert.equal(hash(await readFile(join(proposal, 'src/upstream-http-v1.6.3.c'))),
    '20f27b859c1ed7bae3eb35e01db17a6855ff428dbcf1192d1c504a71e5d51d03');
  assert.equal(hash(await readFile(join(proposal, 'src/LICENSE.pgsql-http.md'))),
    '115c0f245f92e1a6a486407e9a08301c65d724209c35dcae4df2836dac9128a8');
});

test('specialized request entrypoint binds safe helpers before curl perform', async () => {
  const source = await readFile(forkPath, 'utf8');
  const request = source.slice(source.indexOf('Datum http_request(PG_FUNCTION_ARGS)\n{'),
    source.indexOf('/* URL Encode Escape Chars */'));
  const allowed = source.slice(source.indexOf('static http_curlopt settable_curlopts[]'),
    source.indexOf('/* Function signatures */'));
  assert.deepEqual([...allowed.matchAll(/\{ "(CURLOPT_[A-Z_]+)"/g)].map(match => match[1]),
    ['CURLOPT_CAINFO', 'CURLOPT_TIMEOUT', 'CURLOPT_TIMEOUT_MS',
      'CURLOPT_CONNECTTIMEOUT', 'CURLOPT_CONNECTTIMEOUT_MS']);
  assert.doesNotMatch(source, /CURLOPT_PROXY_CAINFO[^\n]*CURLOPT_PROXY_TLSAUTH_USERNAME/);
  assert.doesNotMatch(source, /http_readback|CURLOPT_UPLOAD|CURLOPT_CUSTOMREQUEST|superuser_only|CURLOPT_BLOB/);
  assert.match(request, /!http_uri_allowed\(uri\) \|\| method != HTTP_POST \|\| !settable_curlopts\[0\]\.curlopt_val/);
  assert.ok(request.indexOf('!http_uri_allowed(uri)') < request.indexOf('http_get_handle()'));
  assert.match(request, /uri = http_text_to_cstring\(DatumGetTextP\(values\[REQ_URI\]\)\)/);
  assert.match(request, /method_str = http_text_to_cstring\(DatumGetTextP\(values\[REQ_METHOD\]\)\)/);
  assert.match(request, /cstr = http_text_to_cstring\(DatumGetTextP\(values\[REQ_CONTENT_TYPE\]\)\)/);
  assert.match(request, /http_append_request_header\(headers, "Content-Type", cstr\)/);
  assert.match(request, /content_size > HTTP_REQUEST_MAX_BYTES/);
  assert.ok(request.indexOf('content_size > HTTP_REQUEST_MAX_BYTES') < request.indexOf('curl_easy_perform'));
  assert.match(request, /g_timeout_msec > HTTP_TIMEOUT_MAX_MS/);
  assert.match(source, /&g_timeout_msec,\s*0,\s*0,\s*HTTP_TIMEOUT_MAX_MS,/);
  const inputHeaders = source.slice(source.indexOf('header_array_to_slist(ArrayType *array'),
    source.indexOf('/*\n * This function is now exposed in PG16'));
  assert.match(inputHeaders, /http_optional_header_allowed\(header_fld\)/);
  assert.match(inputHeaders, /http_append_request_header\(headers, header_fld, header_val\)/);
  assert.match(inputHeaders, /http_text_to_cstring\(DatumGetTextP\(values\[HEADER_VALUE\]\)\)/);
  assert.doesNotMatch(source, /errmsg\("%s", error_buffer\)|curl_easy_strerror|method_str:|to value '%ld'|value of '%s'/);
});

test('default Node suite executes exact repaired C components with ASan and UBSan', { timeout: 120_000 }, async t => {
  const evidence = await mkdtemp(join(tmpdir(), 'qik-curl-repair-components-'));
  t.after(() => rm(evidence, { recursive: true, force: true }));
  // Missing Python, compiler, curl headers, patch, or sanitizers is a test failure.
  // This is discovered by npm test and intentionally has no skip/allow-failure path.
  const run = spawnSync('python3', [join(proposal, 'tests/test_response_component.py'), '--evidence', evidence], {
    cwd: root,
    encoding: 'utf8',
    timeout: 110_000,
    maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
  assert.equal(run.error, undefined, `required offline qualification failed: ${run.error?.message}`);
  assert.equal(run.status, 0, `required offline qualification failed:\n${run.stderr}\n${run.stdout}`);
  const result = JSON.parse(run.stdout.trim());
  assert.equal(result.writebackChecksPassed, 10);
  assert.equal(result.headerGuardCopyChecksPassed, 14);
  assert.equal(result.curlPolicyChecksPassed, 192);
  assert.equal(result.legacyProtocolApiChecksPassed, 192);
  assert.equal(result.patchAppliesExactly, true);
  assert.equal(result.forkSha256, hash(await readFile(forkPath)));
  assert.equal(result.patchSha256, hash(await readFile(join(proposal, 'src/pgsql-http-bounded-response.patch'))));
  assert.deepEqual(result.sanitizers, ['address', 'undefined']);
  for (const key of ['nativeExtensionExecuted', 'httpExecuted', 'databaseExecuted',
    'oldUnsafeCodeExecuted', 'qualifiedReplacement']) assert.equal(result[key], false);
  const policy = JSON.parse(await readFile(join(evidence, 'curl-policy-component-results.json'), 'utf8'));
  assert.equal(policy.actualLibcurlExecuted, false);
  assert.equal(policy.actualPostgreSQLExecuted, false);
  assert.equal(policy.providerPrivacyProven, false);
  assert.equal(policy.durableCommitProven, false);
  assert.ok(policy.extractedFunctions.includes('http_set_curlopt'));
  assert.ok(policy.extractedFunctions.includes('http_list_curlopt'));
  assert.ok(policy.extractedFunctions.includes('http_get_handle'));
});
