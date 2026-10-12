import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const pg = process.env.MIP_COMPOSITION_PG_PREFIX;
const api = process.env.MIP_COMPOSITION_POSTGREST_PATH;
const node = process.env.MIP_COMPOSITION_NODE_PATH;
const retainedEvidence = process.env.MIP_COMPOSITION_EVIDENCE_DIRECTORY;

for (const fixture of [
  { name: 'original publication trigger retains independent HTTPS audit across rollback',
    file: 'original_trigger_harness.py', receipt: 'original-trigger-receipt.json',
    ready: pg && api && retainedEvidence, args: ['--pg-prefix', pg, '--postgrest-path', api],
    executed: ['actualHttpExecuted', 'postgrestHttpExecuted', 'curlForkHttpExecuted', 'originalTriggerExecuted'] },
  { name: 'stock and fork HTTP transport expose qualified local TLS and failure behavior',
    file: 'transport_failure_harness.py', receipt: 'transport-failure-receipt.json',
    ready: pg && node && retainedEvidence, args: ['--pg-prefix', pg, '--node-path', node, '--sanitize'],
    executed: ['actualHttpExecuted', 'curlForkHttpExecuted', 'curlStockHttpExecuted'] },
]) {
  test(fixture.name, { skip: !fixture.ready, timeout: 600000 }, () => {
    const base = process.env.MIP_COMPOSITION_EVIDENCE_DIRECTORY || tmpdir();
    mkdirSync(base, { recursive: true });
    const evidence = mkdtempSync(join(base, 'mip-composition-test-'));
    try {
      const run = spawnSync('python3', [
        `scripts/qualification/qik-composition-20261012/${fixture.file}`,
        '--evidence', evidence, ...fixture.args,
      ], { encoding: 'utf8', timeout: 570000, env: {
        ...process.env, PYTHONDONTWRITEBYTECODE: '1',
      } });
      assert.equal(run.status, 0, run.stderr || run.stdout);
      const receipt = JSON.parse(readFileSync(join(evidence, fixture.receipt), 'utf8'));
      assert.equal(receipt.allChecksPassed, true);
      assert.equal(receipt.ownedContainerRemoved, true);
      assert.equal(receipt.privateTlsFixturesRemoved, true);
      assert.equal(receipt.hold, 'PROVIDER_SERVER_DBLINK_VERIFY_FULL_HOLD');
      assert.ok(receipt.total > 0);
      for (const field of fixture.executed) assert.equal(receipt[field], true, field);
      assert.ok(Object.values(receipt.checks).every(value => value === true));
      for (const field of ['productionAuthorized', 'providerQualified', 'durableCommitQualified', 'qikExecuted', 'liveReady']) {
        assert.equal(receipt[field], false, field);
      }
    } finally {
      // Preserve successful and failed native receipts for independent inspection.
      console.info(`qualification evidence retained: ${evidence}`);
    }
  });
}
