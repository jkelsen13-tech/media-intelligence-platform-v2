import test from 'node:test'
import assert from 'node:assert/strict'
import {execFile} from 'node:child_process'
import {promisify} from 'node:util'
import {readFile} from 'node:fs/promises'
import {installQikIngest, cleanupQikIngest} from '../supabase/qualification/qik-ingest/installQikIngest.mjs'
import {installCaptureCas, cleanupCaptureCas} from '../supabase/qualification/content-addressed-storage/installCaptureCas.mjs'

const execFileAsync = promisify(execFile)
const env = {...process.env, PGPASSWORD: 'mip-disposable-ci-only'}
const dbName = 'mip_collector_native_capture_test'
const fixtureSql = await readFile(new URL('../supabase/qualification/qik-ingest/fixture_substrate.sql', import.meta.url), 'utf8')
const pipelineSql = await readFile(new URL('../supabase/migrations/20260905082406_evidence_pipeline_reliability.sql', import.meta.url), 'utf8')

function allowedMarker() {
  const marker = process.env.MIP_DISPOSABLE_POSTGRES
  return marker === 'collector-native-capture-qualification'
    || marker === 'content-addressed-qualification'
}

async function sql(s) {
  const r = await execFileAsync('psql', [
    '-X', '-v', 'ON_ERROR_STOP=1', '-At',
    '-h', '127.0.0.1', '-U', 'postgres', '-d', dbName, '-c', s,
  ], {env, timeout: 20000, maxBuffer: 8 * 1024 * 1024})
  return r.stdout.trim().split('\n').filter(x => x && !['SET', 'RESET', 'BEGIN', 'COMMIT', 'ROLLBACK'].includes(x)).at(-1)
}

test('native PostgreSQL: session auth, external dependents, public sentinel', async t => {
  if (!allowedMarker()) {
    t.diagnostic('skip: set MIP_DISPOSABLE_POSTGRES=collector-native-capture-qualification (PGlite SET ROLE is not PostgREST auth)')
    return
  }
  await execFileAsync('createdb', ['-h', '127.0.0.1', '-U', 'postgres', dbName], {env})
  t.after(async () => {
    try {
      await execFileAsync('dropdb', ['-h', '127.0.0.1', '-U', 'postgres', '--if-exists', dbName], {env})
    } catch { /* leftover db is disposable */ }
  })
  await sql('create extension if not exists pgcrypto')
  await sql(fixtureSql)
  await sql(pipelineSql)
  await installQikIngest(sql)
  await installCaptureCas(sql)

  await sql('create view public.cas_unapproved_dep as select 1 as n from mip_cas.policy()')
  await assert.rejects(cleanupCaptureCas(sql), /mip_cas_unapproved_external_dependent/)
  assert.equal(await sql("select to_regclass('public.cas_unapproved_dep') is not null"), 't')
  await sql('drop view public.cas_unapproved_dep')

  await assert.rejects(sql("set session authorization anon; select payload from evidence_pipeline.article_captures"), /permission denied/)
  await sql('reset session authorization')
  assert.equal(await sql("select has_function_privilege('service_role','public.mip_pipeline_v1(text,jsonb)','EXECUTE')"), 't')
  assert.equal(await sql("select has_function_privilege('anon','public.mip_pipeline_v1(text,jsonb)','EXECUTE')"), 'f')

  await sql(`
    create role unrelated_reader nologin;
    grant select on public.articles to unrelated_reader;
    grant select on public.nodes to qik_ingest_runtime;
  `)
  await assert.rejects(cleanupQikIngest(sql), /qik_ingest_unrelated_privilege/)
  await sql('revoke select on public.nodes from qik_ingest_runtime')

  await cleanupCaptureCas(sql)
  await cleanupQikIngest(sql)
  assert.equal(await sql('select count(*)::int from public.articles'), '1')
  assert.equal(await sql("select has_table_privilege('unrelated_reader','public.articles','SELECT')"), 't')
  assert.equal(await sql("select count(*)::int from pg_namespace where nspname in ('mip_cas','qik_ingest','qik_ingest_operation')"), '0')
})
