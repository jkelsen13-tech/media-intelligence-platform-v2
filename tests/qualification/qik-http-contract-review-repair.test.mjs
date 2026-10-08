import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const proposal = new URL('../../scripts/qualification/qik-http-source-proposal-20261007/', import.meta.url);
const [sender, contracts, fixture, regressions, runner] = await Promise.all([
  '002_http_transport_proposal.sql',
  '003_ack_contract.sql',
  'tests/http_contract_fixture.sql',
  'tests/http_contract_regressions.sql',
  'tests/http_contract_native.py',
].map(path => readFile(new URL(path, proposal), 'utf8')));
const runnerPath = fileURLToPath(new URL('tests/http_contract_native.py', proposal));
const withoutComments = source => source.replace(/--[^\n]*/g, '');

// These default tests are offline source/CLI safeguards. Native SQL assertions
// run only through the runner's explicit --run-isolated-pg17 invocation, never
// npm test, an environment switch, or a database URL.
function closedCli(args = []) {
  const launcher = [
    'import runpy, subprocess, sys',
    'def refuse_process(*args, **kwargs):',
    '    raise RuntimeError("UNEXPECTED_DEFAULT_SUBPROCESS")',
    'subprocess.run = refuse_process',
    'sys.argv = sys.argv[1:]',
    'runpy.run_path(sys.argv[0], run_name="__main__")',
  ].join('\n');
  return spawnSync('python3', ['-I', '-S', '-c', launcher, runnerPath, ...args], {
    encoding: 'utf8', timeout: 5000, maxBuffer: 16384,
    env: { LANG: 'C', LC_ALL: 'C', MIP_HTTP_CONTRACT_NATIVE_PG17: '1' },
  });
}

test('prepared HTTP sender has no success return or configurable commit-proof bypass', () => {
  const body = withoutComments(sender);
  assert.doesNotMatch(body, /\bRETURN\s+(?:true|[a-z_][a-z0-9_]*)\s*;/i);
  assert.doesNotMatch(body, /cfg\.[a-z_]*(?:commit_verified|commit_proven|postcommit_verified)/i);
  assert.ok(body.indexOf('response_shape_satisfies(') < body.indexOf("refusal := 'mip_http_commit_unqualified'"));
  assert.match(body, /refusal := 'mip_http_commit_unqualified';\s*RAISE EXCEPTION USING MESSAGE=refusal,DETAIL='',HINT='';/);
  assert.equal((body.match(/RAISE EXCEPTION USING MESSAGE=refusal,DETAIL='',HINT='';/g) ?? []).length, 3);
  assert.match(sender, /Local abort does not unsend/);
  assert.match(sender, /durability remains UNKNOWN/);
});

test('response contract requires one explicit tx=commit and names shape rather than acknowledgement proof', () => {
  assert.doesNotMatch(withoutComments(sender + contracts), /\back_satisfies\b/);
  assert.match(contracts, /cardinality\(p_preferences\) IS DISTINCT FROM 1/);
  assert.match(contracts, /p_status IS DISTINCT FROM 201 OR p_body IS DISTINCT FROM ''/);
  assert.match(contracts, /tx_count<>1 OR distinct_count<>cardinality\(tokens\)/);
  assert.match(contracts, /WHERE t NOT IN \('return=minimal','tx=commit'\)/);
  assert.match(sender, /response_shape_satisfies\(cfg\.tx_end,resp\.status,applied,coalesce\(resp\.content,''\)\)/);
  assert.match(sender, /Normalization can satisfy shape only, never durable commit proof/);
});

test('endpoint, opaque bearer, and future trust path are validated before curl options or POST', () => {
  const body = withoutComments(sender);
  const validation = body.indexOf('inputs_satisfy(cfg.endpoint,cfg.qualified_endpoint,cfg.bearer_token,cfg.ca_path)');
  assert.ok(validation >= 0);
  // The grant above the function is not a call; check body after BEGIN.
  const functionBody = body.slice(body.indexOf(' BEGIN'));
  assert.ok(functionBody.indexOf('inputs_satisfy(') < functionBody.indexOf('IF mip_http_raw.http_set_curlopt('));
  assert.ok(functionBody.indexOf('inputs_satisfy(') < functionBody.indexOf('SELECT * INTO STRICT resp'));
  assert.match(contracts, /p_endpoint IS DISTINCT FROM p_qualified_endpoint/);
  assert.match(contracts, /octet_length\(p_endpoint\)>2048/);
  assert.ok(contracts.includes("^https://"));
  assert.ok(contracts.includes("^[A-Za-z0-9._~+/-]+=*$"));
  assert.match(contracts, /octet_length\(p_token\) NOT BETWEEN 1 AND 4096/);
  assert.ok(contracts.includes("^/mip/trust/[a-f0-9]{64}\\.pem$"));
  assert.match(contracts, /authority LIKE '%\.localhost'/);
  assert.match(contracts, /authority LIKE '%\.local'/);
  assert.doesNotMatch(body, /http_set_curlopt\('CURLOPT_(?:PROXY|PRE_PROXY|SSL_VERIFYPEER|SSL_VERIFYHOST)'/);
  assert.match(body, /http_set_curlopt\('CURLOPT_CAINFO',cfg\.ca_path\) IS DISTINCT FROM true/);
  assert.equal((body.match(/IF mip_http_raw\.http_reset_curlopt\(\) IS DISTINCT FROM true/g) ?? []).length, 2);
  assert.match(sender, /cfg\.qualified_no_redirect_build IS DISTINCT FROM true/);
  assert.match(sender, /cfg\.provider_admitted IS DISTINCT FROM true/);
});

test('native runner does no process or database work by default even with a native-looking environment switch', () => {
  const result = closedCli();
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.status, 'NOT_RUN');
  assert.equal(receipt.code, 'NATIVE_OPT_IN_REQUIRED');
  assert.equal(receipt.scope, 'NEW_SYNTHETIC_SQL_REGRESSIONS_NOT_PRIVATE_HISTORY');
  for (const key of ['productionAuthorized', 'liveReady', 'qikExecuted', 'actualHttpExecuted',
    'tlsQualified', 'providerQualified', 'durableCommitQualified', 'privateHistoricalRunsAuthenticated']) {
    assert.equal(receipt[key], false);
  }
  assert.equal(receipt.hold, 'PROVIDER_SERVER_DBLINK_VERIFY_FULL_HOLD');
  assert.equal('counts' in receipt, false);
});

test('native CLI refuses arbitrary arguments without relaying private argument text or spawning', () => {
  const marker = 'SYNTHETIC_PRIVATE_ARGUMENT';
  const result = closedCli(['--database', marker]);
  assert.equal(result.status, 2);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout.includes(marker), false);
  assert.equal(JSON.parse(result.stdout).code, 'NATIVE_ARGUMENTS_REFUSED');
});

test('explicit native runner is pinned, isolated, bounded, and removes its task container in finally', () => {
  assert.match(runner, /postgres@sha256:3645570cccdfa447589da9f57dd740faa29b30938e861289a5574b6ca6b03826/);
  for (const option of ['"--pull=never"', '"--network=none"', '"--read-only"', '"1000:1000"',
    '"--cap-drop=ALL"', '"--security-opt=no-new-privileges"', '"--cpus=1"', '"--memory=384m"',
    '"--memory-swap=384m"', '"--pids-limit=64"', '"--tmpfs"', '"-c listen_addresses=']) {
    assert.ok(runner.includes(option), 'missing isolated runner policy');
  }
  assert.doesNotMatch(runner, /"--(?:privileged|publish|mount|volume|env|env-file)"/);
  assert.match(runner, /finally:[\s\S]*"docker", "rm", "--force", name/);
  assert.match(runner, /"taskContainerRemoved"\] = True/);
  assert.match(runner, /ISOLATED_PG17_CLEANUP_FAILED/);
  assert.match(runner, /sourceSha256=\{path: hashlib\.sha256\(content\)\.hexdigest\(\)/);
});

test('new SQL matrix covers six ABI errors, six records, refusal, preflight, reset, and actual prepared ACLs', () => {
  assert.match(regressions, /not replay\/authentication/);
  for (const name of ['http-query-canceled', 'http-assert-failure', 'http-other-error',
    'post-response-reset-query-canceled', 'post-response-reset-assert-failure', 'post-response-reset-other-error',
    'empty-content', 'zero-length-sql-null', 'null-content-type', 'case-insensitive-field',
    'unrelated-header-before', 'unrelated-header-after']) {
    assert.equal(regressions.split("'" + name + "'").length - 1, 1, 'missing/duplicated named regression');
  }
  for (const category of ['responseShape', 'inputBoundary', 'recordCompatibility', 'syntheticAbiErrors',
    'senderResponseRefusals', 'senderPreflightRefusals', 'senderResetErrors', 'senderBooleanRefusals', 'preparedAcl']) {
    assert.ok(regressions.includes("'" + category + "'"));
    assert.ok(runner.includes('"' + category + '":'));
  }
  assert.match(fixture, /PERFORM mip_http_transport\.send\(p_event\)/);
  assert.match(fixture, /IF NOT seen THEN RAISE EXCEPTION 'http_contract_sender_returned'/);
  assert.match(fixture, /GET STACKED DIAGNOSTICS m=MESSAGE_TEXT,d=PG_EXCEPTION_DETAIL,h=PG_EXCEPTION_HINT,state=RETURNED_SQLSTATE/);
  assert.match(fixture, /nextval\('http_contract_test\.reset_calls'\)/);
  assert.match(regressions, /a\.grantee=0 AND a\.privilege_type='EXECUTE'/);
});
