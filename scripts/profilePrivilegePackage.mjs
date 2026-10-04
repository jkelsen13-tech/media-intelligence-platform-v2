// Offline source package. No database client, network transport or executor.
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

const root = new URL('../', import.meta.url)
export const PROFILE_PROPOSAL_PATH = 'supabase/source-proposals/mip_profiles_least_privilege_2026-10-02.sql'
export const PROFILE_PROPOSAL_SHA256 = '2d6f494d51b0aa97be2d74865be99befe802280f3f466fbb95333ba5ec2824f7'
export const PROFILE_CATALOG_CONTRACT = 'mip-profile-privilege-accepted-catalog-v1'
export const PROFILE_CATALOG_MAX_AGE_MS = 300_000
export const PROFILE_CATALOG_SEARCH_PATH = 'pg_catalog, pg_temp'
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
const broad = ['TRUNCATE', 'TRIGGER', 'REFERENCES', 'MAINTAIN']
const browsers = ['anon', 'authenticated']
const tablePrivileges = ['SELECT','INSERT','UPDATE','DELETE',...broad]
const columnPrivileges = ['SELECT','INSERT','UPDATE','REFERENCES']
const literal = value => "E'" + String(value).replaceAll('\\','\\\\').replaceAll("'", "''") + "'"

// JSON.parse accepts duplicate object members. Catalogs and receipts must not:
// reviewers and runtimes must see one unambiguous value for every member.
export function parseProfileJson(bytes) {
  const source = bytes.toString('utf8')
  if (!Buffer.from(source).equals(Buffer.from(bytes))) throw Error('invalid UTF-8 JSON')
  let i = 0
  const ws = () => { while (/\s/.test(source[i] ?? '') && i < source.length) i++ }
  function string() {
    const start = i++
    while (i < source.length) {
      if (source[i] === '\\') { i += 2; continue }
      if (source[i++] === '"') return JSON.parse(source.slice(start, i))
    }
    throw Error('malformed JSON string')
  }
  function value() {
    ws()
    if (source[i] === '{') {
      i++; ws(); const keys = new Set()
      if (source[i] === '}') { i++; return }
      for (;;) {
        ws(); if (source[i] !== '"') throw Error('malformed JSON object')
        const key = string()
        if (keys.has(key)) throw Error('duplicate JSON member: ' + key)
        keys.add(key); ws(); if (source[i++] !== ':') throw Error('malformed JSON object')
        value(); ws(); const end = source[i++]
        if (end === '}') return
        if (end !== ',') throw Error('malformed JSON object')
      }
    }
    if (source[i] === '[') {
      i++; ws(); if (source[i] === ']') { i++; return }
      for (;;) { value(); ws(); const end = source[i++]; if (end === ']') return; if (end !== ',') throw Error('malformed JSON array') }
    }
    if (source[i] === '"') { string(); return }
    const match = source.slice(i).match(/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/)
    if (!match) throw Error('malformed JSON value')
    i += match[0].length
  }
  value(); ws(); if (i !== source.length) throw Error('malformed JSON trailing bytes')
  return JSON.parse(source)
}

export async function profileProposal() {
  const bytes = await readFile(new URL(PROFILE_PROPOSAL_PATH, root))
  if (bytes.length !== 3870 || sha256(bytes) !== PROFILE_PROPOSAL_SHA256) throw Error('profile proposal source bytes drifted')
  return bytes.toString('utf8')
}
export async function profileBaselineQuery() {
  const source = await profileProposal()
  const parts = source.split('-- BEGIN BASELINE QUERY')
  if (parts.length !== 2 || parts[1].split('-- END BASELINE QUERY').length !== 2) throw Error('exact proposal baseline markers required')
  return parts[1].split('-- END BASELINE QUERY')[0].trim().replace(' into actual', '').replace(/;$/, '')
}
export async function profileCatalogQuery() {
  const template = await readFile(new URL('scripts/profilePrivilegeCatalog.sql', root), 'utf8')
  if (template.split('__PROFILE_PROPOSAL_BASELINE__').length !== 2) throw Error('exact profile catalog marker required')
  return template.replace('__PROFILE_PROPOSAL_BASELINE__', await profileBaselineQuery()).trim().replace(/;$/, '')
}
export async function profileCatalogCaptureSql() {
  // A separate operator may review/submit this read-only, rollback-contained
  // capture text. This module never executes it. Explicit pg_catalog first
  // controls relation lookup and decompiler context even with hostile temp views.
  return `begin isolation level repeatable read read only;\nset local lock_timeout='5s';\nset local statement_timeout='30s';\nset local idle_in_transaction_session_timeout='30s';\nset local search_path=${PROFILE_CATALOG_SEARCH_PATH};\n`+
    await profileCatalogQuery()+`;\nrollback;\n`
}

export function validateProfileCatalog(catalog, { installed = false } = {}) {
  const fail = path => { throw Error('complete exact profile security catalog required: ' + path) }
  const object = (v,p) => { if (!v || typeof v !== 'object' || Array.isArray(v)) fail(p) }
  const fields = (v,keys,p) => { object(v,p); if (!isDeepStrictEqual(Object.keys(v).sort(), [...keys].sort())) fail(p+'.fields') }
  const text = (v,p) => { if (typeof v !== 'string' || !v.length) fail(p) }
  const nullable = (v,p) => { if (v !== null && typeof v !== 'string') fail(p) }
  const bool = (v,p) => { if (typeof v !== 'boolean') fail(p) }
  const int = (v,p) => { if (!Number.isSafeInteger(v)) fail(p) }
  const array = (v,p) => { if (!Array.isArray(v)) fail(p) }
  const unique = (rows,key,p) => { const keys = rows.map(key); if (new Set(keys).size !== keys.length) fail(p+'.duplicate') }
  fields(catalog,['identity','baseline','roles','memberships','browser_paths','acl_entries','effective','schemas','rows'],'catalog')
  const id = catalog.identity
  fields(id,['current_user','session_user','database','database_oid','server_address','server_port','server_version_num','server_version','table_oid','search_path'],'identity')
  if(id.search_path!==PROFILE_CATALOG_SEARCH_PATH)fail('controlled pg_catalog-first catalog/decompiler context')
  for (const key of ['current_user','session_user','database','server_version_num','server_version']) text(id[key],'identity.'+key)
  if (!/^\d{6}$/.test(id.server_version_num) || Number(id.server_version_num)<170000) fail('identity.server_version_num')
  for (const key of ['database_oid','table_oid']) { int(id[key],'identity.'+key); if(id[key]<=0) fail('identity.'+key) }
  nullable(id.server_address,'identity.server_address')
  if (id.server_port !== null) { int(id.server_port,'identity.server_port'); if(id.server_port<1||id.server_port>65535)fail('identity.server_port') }
  const b = catalog.baseline
  fields(b,['owner','acl','row_security','force_row_security','columns','constraints','policies','signup_trigger'],'baseline')
  text(b.owner,'baseline.owner'); nullable(b.acl,'baseline.acl'); bool(b.row_security,'baseline.row_security'); bool(b.force_row_security,'baseline.force_row_security')
  if (b.owner !== id.current_user) fail('verified current table owner')
  if (!b.row_security) fail('RLS disabled')
  array(b.columns,'baseline.columns')
  if (!isDeepStrictEqual(b.columns.map(c=>c.name),['id','display_name','created_at'])) fail('baseline.profile columns')
  for (const c of b.columns) { fields(c,['name','type','not_null','acl','default'],'column'); text(c.name,'column.name'); text(c.type,'column.type'); bool(c.not_null,'column.not_null'); nullable(c.acl,'column.acl'); nullable(c.default,'column.default') }
  if(b.columns[0].type!=='uuid'||!b.columns[0].not_null||b.columns[1].type!=='text'||b.columns[2].type!=='timestamp with time zone'||!b.columns[2].not_null)fail('baseline.profile column identity')
  for (const key of ['constraints','policies']) { array(b[key],'baseline.'+key); unique(b[key],x=>x.name,'baseline.'+key) }
  for (const c of b.constraints) { fields(c,['name','definition','validated'],'constraint'); text(c.name,'constraint.name');text(c.definition,'constraint.definition');bool(c.validated,'constraint.validated') }
  if (!b.constraints.length || !b.policies.length) fail('identity constraints/policies')
  for (const p of b.policies) { fields(p,['name','command','roles','permissive','using','check'],'policy'); for(const key of ['name','command','roles'])text(p[key],'policy.'+key);bool(p.permissive,'policy.permissive');nullable(p.using,'policy.using');nullable(p.check,'policy.check') }
  const trigger = b.signup_trigger
  fields(trigger,['enabled','definition','function','function_acl','function_owner'],'signup_trigger')
  for (const key of ['enabled','definition','function','function_owner']) text(trigger[key],'signup_trigger.'+key)
  nullable(trigger.function_acl,'signup_trigger.function_acl')
  if(trigger.enabled!=='O'||!trigger.definition.includes('on_auth_user_created_mip')||!trigger.function.includes('handle_new_mip_user')||!trigger.function.includes("'mip'")) fail('scoped signup identity')
  for(const key of ['roles','memberships','browser_paths','acl_entries','effective','schemas','rows'])array(catalog[key],key)
  unique(catalog.roles,r=>r.name,'roles'); unique(catalog.roles,r=>r.oid,'roles')
  for(const r of catalog.roles) {
    fields(r,['oid','name','superuser','inherit','create_role','create_db','login','replication','bypass_rls','connection_limit','valid_until','config'],'role')
    int(r.oid,'role.oid');text(r.name,'role.name');int(r.connection_limit,'role.connection_limit');nullable(r.valid_until,'role.valid_until')
    for(const key of ['superuser','inherit','create_role','create_db','login','replication','bypass_rls'])bool(r[key],'role.'+key)
    if(r.config!==null){array(r.config,'role.config');r.config.forEach(v=>text(v,'role.config'))}
  }
  const roleNames=new Set(catalog.roles.map(r=>r.name))
  const subjects=[...new Set([...browsers,'service_role',id.current_user,id.session_user])].sort()
  for(const name of subjects)if(!roleNames.has(name))fail('missing security role '+name)
  const ownerRole=catalog.roles.find(r=>r.name===b.owner)
  if(b.force_row_security&&!ownerRole.superuser&&!ownerRole.bypass_rls)fail('complete profile row scope unavailable for non-bypassing owner under FORCE RLS')
  for(const name of browsers) { const r=catalog.roles.find(r=>r.name===name); if(r.superuser||r.bypass_rls)fail('browser role bypasses RLS '+name) }
  unique(catalog.memberships,m=>JSON.stringify([m.role,m.member,m.grantor]),'memberships')
  for(const m of catalog.memberships){fields(m,['role','member','grantor','admin','inherit','set'],'membership');for(const key of ['role','member','grantor']){text(m[key],'membership.'+key);if(!roleNames.has(m[key]))fail('membership role closure '+m[key])}for(const key of ['admin','inherit','set'])bool(m[key],'membership.'+key)}
  unique(catalog.acl_entries,e=>JSON.stringify([e.scope,e.column,e.grantor,e.grantee,e.privilege]),'acl_entries')
  for(const e of catalog.acl_entries) {
    fields(e,['scope','column','grantor','grantee','privilege','grant_option','browser_effective'],'acl_entry')
    if(!['table','column'].includes(e.scope)||(e.scope==='table'?e.column!==null:!b.columns.some(c=>c.name===e.column)))fail('acl_entry.scope/column')
    if(!(e.scope==='table'?tablePrivileges:columnPrivileges).includes(e.privilege))fail('acl_entry.privilege')
    for(const key of ['grantor','grantee'])if(!roleNames.has(e[key])&&!(key==='grantee'&&e[key]==='PUBLIC'))fail('acl_entry.role closure')
    bool(e.grant_option,'acl_entry.grant_option');array(e.browser_effective,'acl_entry.browser_effective');unique(e.browser_effective,v=>v,'acl_entry.browser_effective')
    if(e.browser_effective.some(r=>!browsers.includes(r)))fail('acl_entry.browser_effective role')
    if(broad.includes(e.privilege)&&browsers.includes(e.grantor))fail('dependent browser grant requires separate grantor review')
    if(broad.includes(e.privilege)&&e.browser_effective.length&&(e.grantor!==b.owner||!browsers.includes(e.grantee)))fail('indirect PUBLIC/inherited or unexpected grantor broad privilege')
  }
  unique(catalog.effective,e=>JSON.stringify([e.role,e.scope,e.column,e.privilege]),'effective')
  for(const e of catalog.effective) {
    fields(e,['role','scope','column','privilege','allowed','grant_option'],'effective')
    if(!subjects.includes(e.role)||!['table','column'].includes(e.scope)||(e.scope==='table'?e.column!==null:!b.columns.some(c=>c.name===e.column)))fail('effective.scope/role/column')
    if(!(e.scope==='table'?tablePrivileges:columnPrivileges).includes(e.privilege))fail('effective.privilege')
    bool(e.allowed,'effective.allowed');bool(e.grant_option,'effective.grant_option')
    if(e.grant_option&&!e.allowed)fail('effective.grant_option without permission')
    if(installed&&browsers.includes(e.role)&&broad.includes(e.privilege)&&e.allowed)fail('installed broad privilege remains')
  }
  if(catalog.effective.length!==subjects.length*(tablePrivileges.length+b.columns.length*columnPrivileges.length))fail('effective complete matrix')
  unique(catalog.browser_paths,p=>JSON.stringify([p.browser,p.role]),'browser_paths')
  if(catalog.browser_paths.length!==browsers.length*catalog.roles.length)fail('browser_paths complete matrix')
  for(const p of catalog.browser_paths) {
    fields(p,['browser','role','usage','set','admin','owner_access','admin_targets','broad','column_references'],'browser_path')
    if(!browsers.includes(p.browser)||!roleNames.has(p.role))fail('browser_path role closure')
    for(const key of ['usage','set','admin','owner_access','column_references'])bool(p[key],'browser_path.'+key)
    for(const key of ['broad','admin_targets']){array(p[key],'browser_path.'+key);unique(p[key],v=>v,'browser_path.'+key)}
    if(p.broad.some(v=>!broad.includes(v))||p.admin_targets.some(v=>!roleNames.has(v)))fail('browser_path privilege/admin closure')
    const role=catalog.roles.find(r=>r.name===p.role)
    if(p.admin||((p.usage||p.set)&&p.admin_targets.length)||((p.usage||p.set)&&p.owner_access)||
      (p.set&&(role.superuser||role.bypass_rls||role.create_role))||
      ((p.usage||p.set)&&!browsers.includes(p.role)&&(p.broad.length||p.column_references)))fail('browser role path to broad/owner/privileged/admin role')
    if(installed&&browsers.includes(p.role)&&(p.broad.length||p.column_references))fail('installed browser role path retains broad privilege')
  }
  if(!isDeepStrictEqual(catalog.schemas.map(s=>s.name),['auth','public']))fail('schema closure')
  for(const s of catalog.schemas){fields(s,['name','owner','acl'],'schema');text(s.owner,'schema.owner');nullable(s.acl,'schema.acl');if(!roleNames.has(s.owner))fail('schema.owner closure')}
  unique(catalog.rows,r=>r.id,'rows')
  for(const r of catalog.rows){fields(r,b.columns.map(c=>c.name),'row');if(typeof r.id!=='string'||!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(r.id))fail('row.id');nullable(r.display_name,'row.display_name');text(r.created_at,'row.created_at')}
  return catalog
}

export async function acceptedProfileCatalog(bytes, { now = Date.now(), installed = false } = {}) {
  if(!Number.isFinite(now))throw Error('finite source freshness clock required')
  if(bytes.length>16*1024*1024)throw Error('accepted profile catalog exceeds 16MiB offline file bound')
  const doc=parseProfileJson(bytes)
  if(!doc||doc.contract!==PROFILE_CATALOG_CONTRACT||!['SYNTHETIC_PGLITE_ONLY','INDEPENDENT_NATIVE_CATALOG'].includes(doc.qualification))throw Error('exact accepted profile catalog contract/qualification required')
  const queryHash=sha256(await profileCatalogQuery())
  const a=doc.acceptance
  if(!a||a.status!=='INDEPENDENTLY_ACCEPTED'||typeof a.accepted_by!=='string'||!a.accepted_by.trim()||
    a.query_sha256!==queryHash||a.proposal_sha256!==PROFILE_PROPOSAL_SHA256||a.catalog_sha256!==sha256(JSON.stringify(doc.catalog)))throw Error('independently accepted exact query/proposal/catalog binding required')
  const observed=Date.parse(doc.observed_at_utc),accepted=Date.parse(a.accepted_at_utc)
  if(!Number.isFinite(observed)||!Number.isFinite(accepted)||observed>accepted||accepted>now||now-observed>PROFILE_CATALOG_MAX_AGE_MS)throw Error('fresh accepted profile catalog required (five-minute source freshness bound)')
  validateProfileCatalog(doc.catalog,{installed})
  if(doc.qualification==='INDEPENDENT_NATIVE_CATALOG'&&(!doc.catalog.identity.server_address||doc.catalog.identity.server_port===null))throw Error('native catalog server identity required')
  return doc
}

export function profileExpectedInstalledCatalog(before) {
  validateProfileCatalog(before)
  const after=structuredClone(before)
  after.acl_entries=after.acl_entries.filter(e=>!(e.grantor===before.baseline.owner&&browsers.includes(e.grantee)&&broad.includes(e.privilege)))
  for(const e of after.effective)if(browsers.includes(e.role)&&broad.includes(e.privilege)){e.allowed=false;e.grant_option=false}
  for(const p of after.browser_paths)if(browsers.includes(p.role)){p.broad=[];p.column_references=false}
  return after
}

// The owner REVOKE changes raw table ACL spelling and only column ACLs which
// contained removed owner-granted REFERENCES. Exploded entries bind every
// surviving privilege, grantor and grant option; other raw ACLs stay exact.
export function profileInvariantCatalog(catalog, original) {
  const normalized=structuredClone(catalog)
  normalized.baseline.acl=null
  for(const c of normalized.baseline.columns)if(original.acl_entries.some(e=>e.scope==='column'&&e.column===c.name&&e.grantor===original.baseline.owner&&browsers.includes(e.grantee)&&e.privilege==='REFERENCES'))c.acl=null
  return normalized
}
export function validateProfileInstalledReadback(original, installed) {
  validateProfileCatalog(installed,{installed:true})
  if(!isDeepStrictEqual(profileInvariantCatalog(installed,original),profileInvariantCatalog(profileExpectedInstalledCatalog(original),original)))throw Error('profile installed readback has unexpected catalog/row/ACL/grantor/options delta')
  return {status:'EXACT_PROFILE_INSTALLED_FIXTURE_OR_ACCEPTED_READBACK',removed_acl_entries:original.acl_entries.filter(e=>!installed.acl_entries.some(a=>isDeepStrictEqual(a,e))).length}
}

function comparisonGuard(query, expected, message, original = null) {
  const normalize=original?`\n  actual:=jsonb_set(actual,'{baseline,acl}','null'::jsonb);\n`+
    original.baseline.columns.filter(c=>original.acl_entries.some(e=>e.scope==='column'&&e.column===c.name&&e.grantor===original.baseline.owner&&browsers.includes(e.grantee)&&e.privilege==='REFERENCES')).map(c=>
      `  actual:=jsonb_set(actual,array['baseline','columns',${literal(String(original.baseline.columns.findIndex(x=>x.name===c.name)))},'acl'],'null'::jsonb);\n`).join(''):''
  const body=`\ndeclare actual jsonb;\nbegin\n  select catalog into actual from (${query}) snapshot;${normalize}\n  if actual is distinct from ${literal(JSON.stringify(expected))}::jsonb then\n    raise exception ${literal(message)};\n  end if;\nend\n`
  let suffix=0,tag='$profile_guard$'
  while(body.includes(tag))tag=`$profile_guard_${++suffix}$`
  return `do ${tag}${body}${tag};\n`
}
export async function compileProfileSql(catalog,{mode='rollback-only'}={}) {
  validateProfileCatalog(catalog)
  if(!['rollback-only','commit'].includes(mode))throw Error('exact profile rollback-only or explicit commit source mode required')
  const proposal=await profileProposal(),query=await profileCatalogQuery()
  if((proposal.match(/^begin;$/gm)||[]).length!==1||(proposal.match(/^commit;$/gm)||[]).length!==1)throw Error('exact profile proposal transaction boundary required')
  const before=`begin;\nset local lock_timeout='5s';\nset local statement_timeout='30s';\nset local idle_in_transaction_session_timeout='30s';\nset local search_path=${PROFILE_CATALOG_SEARCH_PATH};\nlock table public.mip_profiles in access exclusive mode;\n`+
    comparisonGuard(query,catalog,'profile package accepted security/session/catalog/row baseline drift')+
    `select set_config('mip.profile_acl_expected_catalog',${literal(JSON.stringify(catalog.baseline))},true);`
  const after=comparisonGuard(query,profileInvariantCatalog(profileExpectedInstalledCatalog(catalog),catalog),'profile package unexpected installed catalog/row/ACL/grantor/options delta',catalog)+
    `-- Mandatory independently fresh installed readback remains an operator step.\n${mode==='commit'?'commit':'rollback'};\n`
  return `-- OFFLINE SOURCE ARTIFACT ONLY; no acceptance, approval or execution authority.\n`+
    `-- Timeouts are per-lock/per-statement/idle controls, not a total transaction deadline.\n`+
    `-- Profile relation lock narrows row/catalog races. Native role/session/function concurrency is unqualified.\n`+
    proposal.replace(/^begin;$/m,before).replace(/^commit;$/m,after)
}
export async function compileProfileRecoveryHoldSql(original,installed) {
  validateProfileInstalledReadback(original,installed)
  return `-- RECOVERY HOLD: preserve state. No restoration GRANT or privilege mutation.\n`+
    `-- Broad privilege restoration requires separate exact future security approval.\n`+
    `-- A file receipt is not original-channel ROLLBACK acknowledgment.\n`+
    `begin;\nset local lock_timeout='5s';\nset local statement_timeout='30s';\nset local idle_in_transaction_session_timeout='30s';\nset local search_path=${PROFILE_CATALOG_SEARCH_PATH};\nlock table public.mip_profiles in access exclusive mode;\n`+
    comparisonGuard(await profileCatalogQuery(),installed,'profile recovery HOLD fresh installed state drift')+
    `rollback;\n`
}
