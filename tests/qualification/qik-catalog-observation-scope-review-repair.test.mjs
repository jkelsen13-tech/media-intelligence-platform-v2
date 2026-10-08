import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// Static scope/disclosure checks only. This suite never connects to a database.
const packageUrl = new URL('../../scripts/qualification/qik-selected-catalog-read-20261007/', import.meta.url);
const [sqlBytes, scope] = await Promise.all([
  readFile(new URL('catalog-observation.sql', packageUrl)),
  readFile(new URL('approval-scope.md', packageUrl), 'utf8'),
]);
const sql = sqlBytes.toString('utf8');
const executableStart = sqlBytes.indexOf(Buffer.from('BEGIN READ ONLY;'));
const executableBytes = sqlBytes.subarray(executableStart);
const executable = executableBytes.toString('utf8');
const comments = sqlBytes.subarray(0, executableStart).toString('utf8');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function scopeField(name) {
  const row = scope.split('\n').find(line => line.startsWith(`| ${name} | `));
  assert.ok(row, `Missing conditional scope field: ${name}`);
  return row.split('|')[2].trim().replaceAll('`', '');
}

test('catalog repair preserves the exact reviewed executable bytes and only adds leading comments', () => {
  assert.ok(executableStart > 0);
  assert.ok(comments.split('\n').every(line => line === '' || line.startsWith('-- ')));
  assert.equal(executableBytes.length, 15_800);
  assert.equal(hash(executableBytes), '6c15e24558eba295785e82899bc5e71498fb4942139093b134fa68d63fe8c286');
  assert.ok(executable.endsWith('ORDER BY property;\nROLLBACK;\n'));
});

test('conditional manifest binds the revised whole SQL file rather than the historical fixture bytes', () => {
  assert.equal(scopeField('Exact SQL file'), 'catalog-observation.sql');
  assert.equal(Number(scopeField('Exact SQL bytes').replaceAll(',', '')), sqlBytes.length);
  assert.equal(scopeField('Exact SQL SHA256'), hash(sqlBytes));
  assert.equal(scopeField('Database and authenticated/session identity'),
    'postgres; current_user=postgres and session_user=postgres');
  assert.match(scope, /revised [\d,]+-byte file[^.]*has not been submitted to a database by this repair/);
});

test('both source header and manifest disclose every credential-adjacent definition read in session', () => {
  const typeNames = { '16': 'boolean', '25': 'text', '3802': 'jsonb' };
  const selected = [...executable.matchAll(
    /\('([a-z_]+)', '([a-z_]+)', '([a-z_]+)', '([\d ]*)'::pg_catalog\.oidvector/g,
  )];
  assert.equal(selected.length, 4);
  const definitions = selected.map(([, , schema, name, oidVector]) => {
    const argumentTypes = oidVector === '' ? [] : oidVector.split(' ').map(oid => {
      assert.ok(typeNames[oid], `Undisclosed argument OID: ${oid}`);
      return typeNames[oid];
    });
    return `${schema}.${name}(${argumentTypes.join(',')})`;
  });
  assert.match(executable, /n\.nspname='mip_factual_transport_raw' AND p\.proname='dblink_exec'\n\s+AND p\.proargtypes='25 25'::pg_catalog\.oidvector/);
  definitions.push('mip_factual_transport_raw.dblink_exec(text,text)');
  assert.equal(definitions.length, 5);
  for (const signature of definitions) {
    assert.ok(comments.includes(signature), `SQL header omits ${signature}`);
    assert.ok(scope.includes(`\`${signature}\``), `Scope manifest omits ${signature}`);
  }
  for (const disclosure of [comments, scope]) {
    assert.match(disclosure, /pg_get_functiondef/);
    assert.match(disclosure, /[Cc]redential-adjacent/);
    assert.match(disclosure, /transiently in server memory/);
    assert.match(disclosure, /privileged|[Pp]rivileged/);
    assert.match(disclosure, /proconfig/);
    assert.match(disclosure, /ACL/);
    assert.match(disclosure, /zeroization/);
  }
  assert.match(scope, /aclexplode.*ACL contents internally/);
  assert.match(scope, /full function definitions[^.]*privileged database session/);
  assert.match(scope, /not a least-privilege catalog reader/);
});

test('credential custody, memory, logging, exact review and owner authorization remain prerequisites', () => {
  assert.equal(scopeField('Scope status'), 'PREPARATION_ONLY_NOT_AN_AUTHORIZATION_REQUEST');
  for (const field of [
    'Private issuer credential source and safe native identity delivery',
    'Accepted private custody and memory/capture policy',
    'Accepted database/provider/executor log and diagnostic behavior',
    'Independent exact-file review of these revised bytes',
  ]) {
    assert.equal(scopeField(field), 'NOT_ESTABLISHED');
  }
  assert.equal(scopeField('Separate owner authorization for this exact observation'), 'NOT_REQUESTED');
  assert.match(scope, /Do not request live approval or submit the SQL while[^.]*prerequisites[^.]*remain unestablished/);
  assert.match(scope, /statement\/error\/context\/DETAIL\/NOTICE/);
  assert.match(scope, /telemetry and collectors, debug traces and crash dumps/);
  assert.match(scope, /swap\/dumps/);
  assert.match(scope, /supplies no accepted policy or provider fact/);
  assert.match(scope, /PROVIDER_SERVER_DBLINK_VERIFY_FULL_HOLD[^.]*remains in force/);
  assert.match(scope, /separate frontend `c143cddf` work/);
});

test('manifest describes the exact 49-row result and fail-closed private diagnostic contract', () => {
  const functionSuffixes = [...executable.matchAll(/SELECT f\.label\|\|'([^']+)'/g)];
  const otherIncluded = [...executable.matchAll(/SELECT '([^']+)',true,/g)]
    .filter(([, label]) => label !== 'all_selected_catalog_properties_match');
  const excluded = [...executable.matchAll(/SELECT '([^']+)',false,false/g)];
  assert.equal(functionSuffixes.length, 7);
  assert.equal(otherIncluded.length, 14);
  assert.equal(excluded.length, 6);
  assert.equal(4 * functionSuffixes.length + otherIncluded.length + excluded.length + 1, 49);
  assert.match(scope, /exactly 49 fixed public labels with `in_scoped_approval` and `matches` booleans/);
  assert.match(scope, /Actual definitions, configuration, ACL contents, newly observed hashes, stored connection URIs, credentials, payloads and error text are not emitted/);
  assert.match(scope, /six explicitly excluded rows[^.]*`in_scoped_approval=false` and `matches=false`/);
  assert.match(scope, /missing\/extra\/duplicate label, nonboolean output/);
  assert.match(scope, /fixed public code `catalog_observation_failed`/);
  assert.match(scope, /do not publish arbitrary server diagnostic text and do not retry automatically/);
  assert.match(scope, /Raw diagnostics may be retained only if[^.]*accepted private-custody policy permits it/);
  assert.match(scope, /Missing ROLLBACK acknowledgment remains a failed observation/);
});
