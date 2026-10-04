import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('bounded EPT adversarial controls and honest surface semantics', () => {
  const cwd = fileURLToPath(new URL('../scripts/point-cloud-experiment/', import.meta.url));
  const result = spawnSync('python3', ['-m', 'unittest', '-v', 'test_bounded_ept.py'], {
    cwd, encoding: 'utf8', timeout: 30000,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('CLI refuses unqualified point acquisition before creating an acquisition ledger', () => {
  const output = mkdtempSync(join(tmpdir(), 'mip-point-cloud-refusal-'));
  try {
    const script = fileURLToPath(new URL('../scripts/point-cloud-experiment/bounded_ept.py', import.meta.url));
    const result = spawnSync('python3', [script, '--output', output, '--acquire-points'], {
      encoding: 'utf8', timeout: 30000,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.equal(existsSync(join(output, 'acquisition.json')), false);
    const report = JSON.parse(readFileSync(join(output, 'experiment.json'), 'utf8'));
    assert.equal(report.status, 'STOPPED');
    assert.match(report.error, /qualification unavailable/);
    assert.equal(report.decoder.usable, false);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
});
