import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const pg = process.env.MIP_ADAPTER_PG_PREFIX;
const api = process.env.MIP_ADAPTER_POSTGREST_PATH;
test('isolated native adapter preserves sender shape and default-deny commit gate',
  { skip: !pg || !api, timeout: 120000 }, () => {
    const evidence = mkdtempSync(join(tmpdir(), 'mip-adapter-test-'));
    try {
      const run = spawnSync('python3', [
        'scripts/qualification/qik-architecture-20261012/native_parser.py',
        '--pg-prefix', pg, '--evidence', evidence, '--strict-candidate',
        '--sanitize', '--postgrest-path', api,
      ], { encoding: 'utf8', timeout: 100000,
        env: { PATH: process.env.PATH, LANG: 'C', LC_ALL: 'C', PYTHONDONTWRITEBYTECODE: '1' } });
      assert.equal(run.status, 0, run.stderr);
      const receipt = JSON.parse(run.stdout);
      assert.equal(receipt.total, 39);
      assert.equal(receipt.adapter.total, 43);
      assert.equal(receipt.adapter.postgrestHttpExecuted, true);
      assert.equal(receipt.adapter.curlForkHttpExecuted, false);
      assert.equal(receipt.adapter.postgrestProcessesRemoved, true);
      assert.equal(receipt.localClusterRemoved, true);
      for (const field of ['productionAuthorized', 'providerQualified',
        'durableCommitQualified', 'qikExecuted', 'liveReady']) {
        assert.equal(receipt[field], false, field);
      }
      assert.equal(receipt.adapter.checks.unchangedSenderStillRefusesMockedValidShape, true);
      assert.equal(receipt.adapter.checks.adapterReturnThenRollbackNotProof, true);
      assert.equal(receipt.adapter.checks.rollbackMissingAppliedCommitRefused, true);
    } finally { rmSync(evidence, { recursive: true, force: true }); }
  });
