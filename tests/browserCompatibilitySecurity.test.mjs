import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import browserslist from 'browserslist';

test('browser compatibility library errors remain recoverable without terminating its caller', () => {
  // A subprocess detects the former process.exit behavior without overriding it.
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { getCompatibleVersions } from 'baseline-browser-mapping';
    assert.throws(() => getCompatibleVersions({
      targetYear: 2020, widelyAvailableOnDate: '2023-04-05'
    }), /cannot use targetYear and widelyAvailableOnDate/);
    assert.throws(() => getCompatibleVersions({
      targetYear: 2020, includeKaiOS: true, includeDownstreamBrowsers: false
    }), /KaiOS is a downstream browser/);
    const result = getCompatibleVersions({ targetYear: 2020 });
    assert.ok(result.some(row => row.browser === 'chrome' && row.version));
    console.log('MIP_BASELINE_CALLER_SURVIVED');
  `], { encoding: 'utf8', timeout: 10000 });
  assert.ifError(child.error);
  assert.equal(child.signal, null);
  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /MIP_BASELINE_CALLER_SURVIVED/);
});

test('custom browser statistics accept JSON prototype-named keys without corrupting callers', () => {
  const stats = JSON.parse('{"chrome":{"120":50},"constructor":{"1":0},"__proto__":{"1":0}}');
  const before = JSON.stringify(stats);
  const prototypeBefore = Object.getOwnPropertyDescriptors(Object.prototype);
  assert.deepEqual(browserslist('> 1% in my stats', { stats }), ['chrome 120']);
  assert.equal(JSON.stringify(stats), before);
  assert.deepEqual(Object.getOwnPropertyDescriptors(Object.prototype), prototypeBefore);
  assert.deepEqual(browserslist('chrome 120'), ['chrome 120']);
});

test('browser query result cache evicts old entries after bounded query churn', () => {
  // Check observable eviction, not a flaky process-memory threshold.
  const query = 'chrome 100';
  const original = browserslist(query, { env: 'mip-cache-probe-original' });
  assert.strictEqual(browserslist(query, { env: 'mip-cache-probe-original' }), original);
  for (let index = 0; index < 520; index += 1) {
    assert.deepEqual(browserslist(query, { env: 'mip-cache-probe-' + index }), ['chrome 100']);
  }
  const revisited = browserslist(query, { env: 'mip-cache-probe-original' });
  assert.deepEqual(revisited, original);
  assert.notStrictEqual(revisited, original);
});
