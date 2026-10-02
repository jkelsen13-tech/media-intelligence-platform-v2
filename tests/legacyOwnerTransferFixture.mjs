import { PGlite } from '@electric-sql/pglite'
import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { prepareLaunchFixtureFoundation, INITIAL_STAGES, launchCatalog, installLaunchStageFixture } from '../scripts/launchInstallationSequence.mjs'
import { legacyAtomicCatalogQuery, legacyAtomicInstalledCatalogQuery, LEGACY_ATOMIC_PROPOSAL } from '../scripts/legacyAtomicCompletionPackage.mjs'

export const FROZEN_SOURCE_COMMIT = '670efb8ebd6b4d7fb09368d399fe5a2afbc03a77'
export const FROZEN_SOURCE_SHA256 = 'ee6bc75a31d6f691895387275db76ed4494a80e23f1b7f4bcd21b7232cb08066'
export const INSTALLER = 'fixture_managed_installer'
export const TARGET = 'mip_legacy_completion_owner'
const quote = value => '"' + value.replaceAll('"', '""') + '"'
// Exact historical bytes are committed for shallow CI/archive exports. Missing
// or changed fixtures fail closed; there is no Git, network or current-SQL fallback.
export const frozenProposal = () => {
  const bytes = readFileSync(new URL('./fixtures/frozenLaunchGate/legacy-atomic-completion-v1.sql', import.meta.url))
  if (createHash('sha256').update(bytes).digest('hex') !== FROZEN_SOURCE_SHA256) throw Error('Frozen Legacy proposal SHA256 mismatch')
  return bytes.toString('utf8')
}
export const catalogFromSource = source => source.split('-- BEGIN LEGACY ATOMIC BASELINE')[1].split('-- END LEGACY ATOMIC BASELINE')[0].replace('into actual;', ';').trim()

// Synthetic user-object ownership transfers only. Bootstrap OID10 remains a
// superuser; no REASSIGN OWNED, system-object reassignment, credentials or IO.
export async function ownerTransferFixture({ renamedBootstrap = false, superInstaller = false, installerSession = false } = {}) {
  const db = await PGlite.create()
  const scalar = async (sql, params = []) => Object.values((await db.query(sql, params)).rows[0])[0]
  try {
    await prepareLaunchFixtureFoundation(db)
    await installLaunchStageFixture(db, INITIAL_STAGES[0], { approvedCatalog: await launchCatalog(db) })
    if (renamedBootstrap) {
      await db.exec('create role fixture_bootstrap_delegate login superuser;set session authorization fixture_bootstrap_delegate;alter role postgres rename to fixture_provider_admin')
    }
    await db.exec(`create role ${INSTALLER} login ${superInstaller ? 'superuser' : 'nosuperuser'} createrole nocreatedb inherit noreplication bypassrls;
      create role fixture_b1_provider nologin;
      grant fixture_b1_provider to ${INSTALLER} with admin false,inherit false,set false;
      grant usage on schema mip_private to fixture_b1_provider;
      create policy fixture_provider_policy on public.articles for select to fixture_b1_provider using (false);
      create function public.mip_legacy_extraction_v1(integer) returns integer language sql as 'select $1'`)
    for (const row of (await db.query("select n.nspname,c.relname,c.relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','evidence_pipeline','mip_private','spatial') and c.relkind in ('r','p','v','m') order by c.relkind,c.relname")).rows) {
      await db.exec(`alter ${row.relkind === 'v' ? 'view' : row.relkind === 'm' ? 'materialized view' : 'table'} ${quote(row.nspname)}.${quote(row.relname)} owner to ${INSTALLER}`)
    }
    for (const row of (await db.query("select p.oid::regprocedure::text identity from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','evidence_pipeline','mip_private','spatial') and p.prokind='f'")).rows) await db.exec(`alter function ${row.identity} owner to ${INSTALLER}`)
    for (const schema of ['public','evidence_pipeline','mip_private','spatial']) await db.exec(`alter schema ${schema} owner to ${INSTALLER}`)
    const fixtureSuperSession = await scalar('select session_user')
    await db.exec(`set role ${INSTALLER};set createrole_self_grant='';set search_path=pg_catalog`)
    if (installerSession) await db.exec(`reset role;set session authorization ${INSTALLER}`)
    const pending = await scalar("insert into public.articles(feed,outlet,title,url,summary,body_text,ingestion_run_id) values('synthetic','Synthetic owner transfer','Explicit synthetic private source','https://owner.example.invalid/private','Synthetic summary','Explicit synthetic retained private source bytes.','owner-transfer-test') returning id")
    const memberships = async () => (await db.query('select to_jsonb(m) value from pg_auth_members m order by roleid,member,grantor')).rows.map(row => row.value)
    const schemaAcl = async () => scalar("select nspacl::text from pg_namespace where nspname='mip_private'")
    const schemaTuples = async () => (await db.query("select e.grantor::text,e.grantee::text,e.privilege_type,e.is_grantable from pg_namespace n cross join lateral aclexplode(n.nspacl) e where n.nspname='mip_private' order by e.grantor,e.grantee,e.privilege_type,e.is_grantable")).rows
    const catalog = async () => scalar(await legacyAtomicCatalogQuery())
    const installedCatalog = async () => scalar(await legacyAtomicInstalledCatalogQuery())
    const pin = async (source = null) => {
      const value = await scalar(source ? catalogFromSource(source) : await legacyAtomicCatalogQuery())
      await db.query("select set_config('mip.legacy_atomic_expected_catalog',$1,false)", [JSON.stringify(value)])
      return value
    }
    const install = async (source = null) => { const sql = source ?? await readFile(LEGACY_ATOMIC_PROPOSAL, 'utf8'); await pin(sql); await db.exec(sql) }
    // Role dispatch is a test adapter using the original superuser session. It
    // is not authority granted to the non-super installer by the proposal.
    const asRole = async (role, sql, params = []) => {
      if (!['service_role','anon','authenticated',INSTALLER].includes(role)) throw Error('unexpected fixture role')
      await db.exec(`reset role;${installerSession ? `set session authorization ${quote(fixtureSuperSession)};` : ''}set role ${role}`)
      try { return await scalar(sql, params) } finally { await db.exec(`reset role;${installerSession ? 'set session authorization' : 'set role'} ${INSTALLER}`) }
    }
    const bootstrapDDL = async sql => {
      const previousSession=await scalar('select session_user')
      await db.exec(`reset role;set session authorization ${quote(fixtureSuperSession)}`)
      try { await db.exec(sql) } finally { await db.exec(`reset role;set session authorization ${quote(previousSession)};set role ${INSTALLER}`) }
    }
    const engine = { engine: await scalar('select version()'), server_version: await scalar('show server_version'), runtime: process.version, scope: 'PGlite 0.5.8 PostgreSQL 18.3/WASM; not native PostgreSQL17 or qik' }
    return { db, scalar, pending, memberships, schemaAcl, schemaTuples, catalog, installedCatalog, pin, install, asRole, bootstrapDDL, engine, close: () => db.close() }
  } catch (error) { await db.close(); throw error }
}
