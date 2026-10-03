// PROPOSAL ONLY. Reads template bytes and derives a bounded plan; no database/network API.
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'

export const SOURCE_IDENTITY = Object.freeze({
  head: '93adb523910172b53e96d2b5f5b160974c6af519', tree: '9a430b86a1a5f381eeb6168eef529ea794b6f256',
  guardedOperation: '5be14204dbd68b44ccaba07222bd6a5b4f9d9f627ce4750fce596211e6d6fb46',
  preSubmitDeadlines: '2ac3ca583a82fc717cca12b9f64d40019339b3be7c2aeefb0948473a5336518d',
})
const names = Object.freeze({ snapshotPublic: 'snapshot-public.sql', inspectRowsPublic: 'inspect-rows-public.sql',
  inspectRowsPrivateBooleans: 'inspect-rows-private-booleans.sql',
  captureRowsPrivate: 'capture-rows-private.sql', compareRowsPrivate: 'compare-rows-private.sql' })
const sha = value => createHash('sha256').update(value).digest('hex')
const refusal = () => { throw new Error('QIK_SQL_BASELINE_REFUSED') }
const oid = value => {
  const s=String(value)
  if (!/^[1-9][0-9]{0,9}$/.test(s) || !Number.isSafeInteger(Number(s)) || Number(s)>4294967295
    || (typeof value!=='number' && typeof value!=='string')) refusal()
  return s
}
const count = value => {
  if ((typeof value!=='number' && typeof value!=='string') || !/^(0|[1-9][0-9]*)$/.test(String(value))
    || !Number.isSafeInteger(Number(value))) refusal()
  return Number(value)
}
const freeze = value => {
  if (value && typeof value==='object') {for (const item of Object.values(value)) freeze(item);Object.freeze(value)}
  return value
}

// Reject accessor/function/cyclic inputs without evaluating getters. Catalog snapshots
// contain ordinary JSON data; approval and secure transport are separate caller gates.
function inertCopy(value) {
  try {
    const active = new WeakSet()
    const visit = (v, depth = 0) => {
      if (v === null || typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) return
      if (typeof v !== 'object' || depth > 64 || active.has(v)) refusal()
      const proto = Object.getPrototypeOf(v)
      if (proto !== Object.prototype && proto !== null && !(Array.isArray(v) && proto === Array.prototype)) refusal()
      active.add(v)
      for (const key of Reflect.ownKeys(v)) {
        if (Array.isArray(v) && key === 'length') continue
        const d = Object.getOwnPropertyDescriptor(v, key)
        if (typeof key !== 'string' || !d?.enumerable || !Object.hasOwn(d,'value')) refusal()
        visit(d.value, depth+1)
      }
      active.delete(v)
    }
    visit(value)
    return structuredClone(value)
  } catch { refusal() }
}

export async function loadSqlPackage() {
  const entries = await Promise.all(Object.entries(names).map(async ([key,file]) =>
    [key, await readFile(new URL(file,import.meta.url),'utf8')]))
  const sql = Object.fromEntries(entries)
  const authority = JSON.parse(await readFile(new URL('authority-commands.json',import.meta.url),'utf8'))
  const guardedOperation = await readFile(new URL('../qik-audit-route-transform-proposal-20261002.sql',import.meta.url),'utf8')
  const preSubmitDeadlines = await readFile(new URL('../qik-audit-route-pre-submit-deadlines-20261002.sql',import.meta.url),'utf8')
  if (sha(guardedOperation)!==SOURCE_IDENTITY.guardedOperation || sha(preSubmitDeadlines)!==SOURCE_IDENTITY.preSubmitDeadlines)
    throw new Error('QIK_SQL_SOURCE_DRIFT')
  const deadlineCommands = [...preSubmitDeadlines.matchAll(/^SET LOCAL (?:statement_timeout|lock_timeout) = '\d+ms';$/gm)].map(m=>m[0])
  if (deadlineCommands.length!==2) throw new Error('QIK_SQL_SOURCE_DRIFT')
  // $1 is a nonsecret exact catalog snapshot. Restore ignores only transaction-local
  // deadlines; after ROLLBACK require every captured field, including settings.
  sql.compareSecurity = `WITH current_snapshot AS (${sql.snapshotPublic.trim().replace(/;$/,'')})
SELECT ($2::text IN ('restored','rollback')) AS phase_valid,
 CASE WHEN $2::text='restored' THEN (snapshot-'deadlines') IS NOT DISTINCT FROM ($1::jsonb-'deadlines')
 WHEN $2::text='rollback' THEN snapshot IS NOT DISTINCT FROM $1::jsonb ELSE false END AS security_matches,
 coalesce((snapshot->'effective'->>'update_connection')::boolean=false,false) AS update_denied,
 coalesce((snapshot->'relation'->>'rls')::boolean AND (snapshot->'relation'->>'force_rls')::boolean,false) AS force_rls_preserved
FROM current_snapshot;`
  // Exact configuration/definition text can itself contain secrets. This capture
  // belongs ONLY in approved private memory, never public MCP or receipts.
  sql.captureSecurityPrivate = `WITH current_snapshot AS (${sql.snapshotPublic.trim().replace(/;$/,'')})
SELECT snapshot || pg_catalog.jsonb_build_object('private_security_details',pg_catalog.jsonb_build_object(
 'role_configs',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('oid',r.oid,'config',r.rolconfig) ORDER BY r.oid),'[]'::jsonb)
 FROM pg_catalog.pg_roles r WHERE r.oid IN (SELECT (actor->>'oid')::oid FROM pg_catalog.jsonb_array_elements(snapshot->'roles') AS actor)),
 'dblink_definitions',(SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('oid',p.oid,'config',p.proconfig,
 'definition',pg_catalog.pg_get_functiondef(p.oid)) ORDER BY p.oid),'[]'::jsonb)
 FROM pg_catalog.pg_proc p WHERE p.oid IN (SELECT (fn->>'oid')::oid FROM pg_catalog.jsonb_array_elements(snapshot->'dblink') AS fn))
)) AS private_snapshot FROM current_snapshot;`
  sql.compareSecurityPrivate = `WITH current_snapshot AS (${sql.captureSecurityPrivate.trim().replace(/;$/,'')})
SELECT ($2::text IN ('restored','rollback')) AS phase_valid,
 CASE WHEN $2::text='restored' THEN (private_snapshot-'deadlines') IS NOT DISTINCT FROM ($1::jsonb-'deadlines')
 WHEN $2::text='rollback' THEN private_snapshot IS NOT DISTINCT FROM $1::jsonb ELSE false END AS security_matches,
 coalesce((private_snapshot->'effective'->>'update_connection')::boolean=false,false) AS update_denied,
 coalesce((private_snapshot->'relation'->>'rls')::boolean AND (private_snapshot->'relation'->>'force_rls')::boolean,false) AS force_rls_preserved
FROM current_snapshot;`
  return Object.freeze({ proposalOnly: true, sourceIdentity: SOURCE_IDENTITY,
    sql: Object.freeze(sql), authority: Object.freeze(authority), guardedOperation,
    deadlineCommands: Object.freeze(deadlineCommands),
    hashes: Object.freeze(Object.fromEntries([...Object.entries(sql),...Object.entries(authority),
      ['guardedOperation',guardedOperation],['preSubmitDeadlines',preSubmitDeadlines]].map(([key,value])=>[key,sha(value)]))) })
}

export function deriveMinimalAuthorityPlan(snapshotInput, rowInspectionInput) {
  const snapshot = inertCopy(snapshotInput), rows = inertCopy(rowInspectionInput)
  const { identity,relation,roles,memberships,columns,effective,schemas } = snapshot ?? {}
  if (snapshot?.version!=='qik-rollback-sql-boundary-1' || identity?.current_user!=='postgres'
    || identity.session_user!=='postgres' || identity.database!=='postgres'
    || !Array.isArray(roles) || !Array.isArray(memberships) || !Array.isArray(columns) || !Array.isArray(schemas)
    || !Array.isArray(snapshot.policies) || !Array.isArray(snapshot.publications) || !Array.isArray(snapshot.dblink)) refusal()
  const postgres=roles.filter(r=>r.name==='postgres'), owner=roles.filter(r=>r.name==='mip_cutover_schema_owner_v1')
  if (postgres.length!==1 || owner.length!==1 || postgres[0].superuser!==false || postgres[0].bypass_rls!==true
    || owner[0].superuser!==false || owner[0].bypass_rls!==false || owner[0].login!==false
    || relation?.owner!=='mip_cutover_schema_owner_v1' || relation.rls!==true || relation.force_rls!==true
    || relation.relkind!=='r' || oid(relation.relowner)!==oid(owner[0].oid)
    || columns.length!==2 || columns.filter(c=>c.name==='id'&&oid(c.type_oid)==='16'&&c.not_null===true).length!==1
    || columns.filter(c=>c.name==='connection_string'&&oid(c.type_oid)==='25'&&c.not_null===true).length!==1
    || columns.some(c=>c.acl_raw!==null && (!Array.isArray(c.acl_raw) || c.acl_raw.some(a=>typeof a!=='string')))
    || (relation.acl_raw!==null && (!Array.isArray(relation.acl_raw) || relation.acl_raw.some(a=>typeof a!=='string')))
    || effective?.select_id!==true || effective.select_connection!==true
    || effective.update_connection!==false || effective.update_id!==false || effective.table_update!==false
    || effective.owner_set!==false || effective.owner_usage!==false
    || effective.dblink_execute!==true
    || schemas.length!==4 || schemas.some(s=>s.postgres_usage!==true)) refusal()
  const options = m=>typeof m.admin==='boolean' && typeof m.inherit==='boolean' && typeof m.set==='boolean'
  if (memberships.some(m=>!options(m))
    || new Set(memberships.map(m=>`${oid(m.roleid)}:${oid(m.member)}:${oid(m.grantor)}`)).size!==memberships.length) refusal()
  const provider=memberships.filter(m=>m.role==='mip_cutover_schema_owner_v1'
    && m.member_name==='postgres' && m.grantor_name==='supabase_admin')
  if (provider.length!==1 || provider[0].admin!==true || provider[0].inherit!==false || provider[0].set!==false
    || oid(provider[0].roleid)!==oid(owner[0].oid) || oid(provider[0].member)!==oid(postgres[0].oid)
    || memberships.some(m=>oid(m.roleid)===oid(owner[0].oid) && oid(m.member)===oid(postgres[0].oid) && oid(m.grantor)===oid(postgres[0].oid))) refusal()
  if (rows==null || count(rows.selected_count)!==1 || rows.selected_nonnull!==true || rows.selected_source_matches!==true
    || count(rows.receipt_count)!==1 || count(rows.bootstrap_count)!==1 || count(rows.head_count)!==1 || count(rows.qualification_count)!==0
    || count(rows.unrelated_count)<0) refusal()
  const dblink=snapshot.dblink.filter(fn=>Array.isArray(fn.argument_type_oids)
    && fn.argument_type_oids.map(oid).join(',')==='25,25')
  if (dblink.length!==1 || dblink[0].kind!=='f' || dblink[0].strict!==true
    || dblink[0].security_definer!==false || dblink[0].returns_set!==true || oid(dblink[0].result_type_oid)!=='2249') refusal()
  return Object.freeze({ proposalOnly: true, baseline: freeze(snapshot), rowInspection: freeze(rows),
    introducesMembership: true, introducesColumnUpdate: true, addsSelect: false,
    permission: Object.freeze({ membershipRole:'mip_cutover_schema_owner_v1',member:'postgres',
      membershipGrantor:'postgres',admin:false,inherit:false,set:true,
      table:'mip_factual.audit_connection',column:'connection_string',privilege:'UPDATE',
      columnGrantor:'mip_cutover_schema_owner_v1',grantOption:false,transactional:true,mandatoryEnd:'ROLLBACK' }),
    commandIds: Object.freeze(['grant_set_membership','set_owner_for_grant','grant_column_update',
      'reset_role_for_operation','set_statement_deadline','set_lock_deadline','guarded_operation',
      'set_owner_for_cleanup','revoke_introduced_column_update','reset_role_after_cleanup',
      'revoke_introduced_set_membership','verify_authority_restored','rollback','verify_independently']),
    liveReady:false,
  })
}
