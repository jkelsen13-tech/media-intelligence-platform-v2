import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { LEGACY_ATOMIC_PROPOSAL } from '../scripts/legacyAtomicCompletionPackage.mjs'
import { ownerTransferFixture, frozenProposal, catalogFromSource, FROZEN_SOURCE_COMMIT, INSTALLER, TARGET } from './legacyOwnerTransferFixture.mjs'

const receipts = []
const record = (name, f, details = {}) => receipts.push({ name, status: 'PASS', ...f.engine, ...details })
test.after(async () => { if (process.env.MIP_LEGACY_OWNER_RECEIPT) await writeFile(process.env.MIP_LEGACY_OWNER_RECEIPT, JSON.stringify({ status:receipts.length===14?'PASS':'FAIL', expected_cases:14, source_only:true, live_operations:0, frozen_commit:FROZEN_SOURCE_COMMIT, cases:receipts, limits:['Distinct non-superuser synthetic installer; native user objects explicitly transferred, bootstrap remains superuser','Actual PGlite PostgreSQL18.3/WASM, not native PostgreSQL17 or hosted qik','Managed provider identity requires independent protected-backend preflight; no live install/grant/release'] }, null, 2) + '\n') })
const targetMembers = f => f.db.query("select pg_get_userbyid(roleid) role,pg_get_userbyid(member) member,pg_get_userbyid(grantor) grantor,grantor::text grantor_oid,admin_option,inherit_option,set_option from pg_auth_members where roleid=$1::regrole order by member,grantor",[TARGET]).then(r=>r.rows)
async function completePrivate(f) {
  const selection=await f.asRole('service_role',"select public.mip_legacy_extraction_v1('read_pending',$1::jsonb)",[JSON.stringify({run_tag:'owner-transfer-test',limit:25,extractor_version:'legacy-pure-candidates-v1'})])
  assert.equal(selection.articles.length,1);const article=selection.articles[0]
  return f.asRole('service_role',"select public.mip_legacy_extraction_v1('complete_private',$1::jsonb)",[JSON.stringify({article_id:article.id,record_version_id:article.record_version_id,source_hash:article.source_hash,extractor_version:'legacy-pure-candidates-v1',plan:{normalization:{title:article.title,summary:article.summary,body_text:article.body_text,image_url:article.image_url,image_alt:article.image_alt},claims:[],entities:[],citations:[],metadata_only:false,proposed_digest:false}})])
}
const retainedHistory=async f=>({receipts:(await f.db.query('select * from mip_private.legacy_extraction_completions order by completion_id')).rows,captures:(await f.db.query('select * from evidence_pipeline.article_captures order by id')).rows})
async function assertNarrowInstalled(f, providerName = 'postgres') {
  assert.equal(await f.scalar("select pg_get_userbyid(proowner) from pg_proc where oid='mip_private.legacy_extraction_apply_v1(text,jsonb)'::regprocedure"), TARGET)
  assert.equal(await f.scalar("select has_schema_privilege($1,'mip_private','CREATE')",[TARGET]), false)
  assert.equal(await f.scalar('select pg_has_role($1,$2,\'SET\')',[INSTALLER,TARGET]), false)
  assert.equal(await f.scalar('select pg_has_role($1,$2,\'USAGE\')',[INSTALLER,TARGET]), false)
  assert.deepEqual(await targetMembers(f), [{ role:TARGET, member:INSTALLER, grantor:providerName, grantor_oid:'10', admin_option:true, inherit_option:false, set_option:false }])
  assert.equal(await f.scalar("select count(*)::int from pg_auth_members where roleid=$1::regrole and member in ('service_role'::regrole,'anon'::regrole,'authenticated'::regrole)",[TARGET]),0)
}

test('frozen source reproduces ownership failure under a distinct non-superuser creator; full rollback restores the catalog', async()=>{
  const f=await ownerTransferFixture();try {
    const source=frozenProposal(),before=await f.pin(source),members=await f.memberships(),acl=await f.schemaAcl()
    assert.equal(await f.scalar('select rolsuper from pg_roles where rolname=current_user'),false)
    assert.equal(await f.scalar('select rolsuper from pg_roles where oid=10'),true)
    assert.equal(await f.scalar("show createrole_self_grant"),'')
    await assert.rejects(f.db.exec(source),e=>e.code==='42501' && /must be able to SET ROLE/.test(e.message));await f.db.exec('rollback')
    assert.deepEqual(await f.scalar(catalogFromSource(source)),before);assert.deepEqual(await f.memberships(),members);assert.equal(await f.schemaAcl(),acl)
    assert.equal(await f.scalar("select exists(select 1 from pg_roles where rolname=$1)",[TARGET]),false)
    record('frozen non-super ownership denial and exact rollback',f,{ error:'42501 must be able to SET ROLE', installer:INSTALLER, bootstrap_superuser_preserved:true })
  } finally { await f.close() }
})

test('successor preserves provider/B1 membership, ACLs, policies and overload while installed private read/capture APIs work',async()=>{
  const f=await ownerTransferFixture({installerSession:true});try {
    const members=await f.memberships(),before=await f.catalog(),rows=await f.db.query('select * from public.articles order by id')
    assert.deepEqual(before.installer_context.current_user,INSTALLER);assert.deepEqual(before.installer_context.session_user,INSTALLER)
    await f.install();await assertNarrowInstalled(f)
    const targetOid=String(await f.scalar("select oid from pg_roles where rolname=$1",[TARGET]))
    assert.deepEqual((await f.memberships()).filter(m=>m.roleid!==targetOid),members)
    const after=await f.catalog();assert.deepEqual(after.installer_context,before.installer_context)
    assert.deepEqual(after.roles.filter(r=>r.name!==TARGET).map(r=>({...r,memberships:r.memberships.filter(m=>m.role!==TARGET)})),before.roles)
    assert.deepEqual(after.functions,before.functions.map(fn=>fn.signature==='evidence_pipeline.canonical_url(text)'?{...fn,acl:fn.acl.slice(0,-1)+`,${TARGET}=X/${INSTALLER}}`}:fn))
    const oldPolicies=before.relations.find(r=>r.identity==='public.articles').policies
    assert.deepEqual(after.relations.find(r=>r.identity==='public.articles').policies.filter(p=>!p.name.startsWith('mip_legacy_atomic_')),oldPolicies)
    assert.equal(await f.scalar('select public.mip_legacy_extraction_v1(7)'),7)
    const completion=await completePrivate(f)
    assert.equal(completion.publication,'withheld');assert.ok(completion.capture_id)
    assert.deepEqual((await f.db.query('select * from public.articles order by id')).rows,rows.rows)
    assert.equal(await f.scalar('select count(*)::int from mip_private.legacy_extraction_completions'),1)
    record('non-super install plus private native capture/read; unchanged public bytes',f,{ provider_membership:await targetMembers(f), installer_context:after.installer_context, native_capture_retained:true })
  } finally { await f.close() }
})

test('bootstrap role name can differ from postgres; automatic grantor identity and exact restoration remain valid',async()=>{
  const f=await ownerTransferFixture({renamedBootstrap:true,installerSession:true});try {
    assert.equal(await f.scalar('select rolname from pg_roles where oid=10'),'fixture_provider_admin')
    await f.install();await assertNarrowInstalled(f,'fixture_provider_admin')
    const readback=(await f.db.exec(await readFile(new URL('../supabase/source-proposals/legacy-atomic-pack/run-preflight.sql',import.meta.url),'utf8'))).flatMap(r=>r.rows??[])
    assert.ok(readback.some(r=>r.actor===INSTALLER&&r.session_actor===INSTALLER&&r.bootstrap_grantor_name==='fixture_provider_admin'&&r.createrole_self_grant===''))
    assert.ok(readback.some(r=>r.temporary_schema_create_removed===true&&r.temporary_installer_set_removed===true&&r.installer_grantor_edge_removed===true))
    record('renamed bootstrap and distinct installer plus packaged readback',f,{provider_membership:await targetMembers(f), installer_context:(await f.installedCatalog()).installer_context, readback_context:readback.find(r=>r.actor===INSTALLER)})
  } finally { await f.close() }
})

test('superuser installer introduces no role-membership edge and removes temporary schema CREATE',async()=>{
  const f=await ownerTransferFixture({superInstaller:true});try {
    const before=await f.memberships();await f.install();assert.deepEqual(await f.memberships(),before)
    assert.equal(await f.scalar("select has_schema_privilege($1,'mip_private','CREATE')",[TARGET]),false)
    record('superuser compatibility without introduced membership',f,{ target_memberships:await targetMembers(f) })
  } finally { await f.close() }
})

test('observed temporary SET window preserves provider edge and exact raw schema ACL after restoration',async()=>{
  const f=await ownerTransferFixture();try {
    await f.db.exec('create temp table fixture_authority_observations(phase text,memberships jsonb,schema_acl text,schema_tuples jsonb)')
    const observe=phase=>`insert into fixture_authority_observations select '${phase}',(select coalesce(jsonb_agg(to_jsonb(m) order by m.roleid,m.member,m.grantor),'[]') from pg_auth_members m where m.roleid=target),(select nspacl::text from pg_namespace where nspname='mip_private'),(select jsonb_agg(to_jsonb(e) order by e.grantor,e.grantee,e.privilege_type) from pg_namespace n cross join lateral aclexplode(n.nspacl) e where n.nspname='mip_private');\n`
    let source=await readFile(LEGACY_ATOMIC_PROPOSAL,'utf8')
    source=source.replace(' if not super then\n',observe('before')+' if not super then\n').replace(' alter function mip_private.legacy_extraction_apply_v1(text,jsonb) owner',observe('during')+' alter function mip_private.legacy_extraction_apply_v1(text,jsonb) owner').replace('end $owner_transfer$;',observe('after')+'end $owner_transfer$;')
    await f.install(source)
    const observations=(await f.db.query('select * from fixture_authority_observations')).rows,byPhase=Object.fromEntries(observations.map(r=>[r.phase,r]))
    assert.deepEqual(byPhase.after.memberships,byPhase.before.memberships);assert.equal(byPhase.after.schema_acl,byPhase.before.schema_acl);assert.deepEqual(byPhase.after.schema_tuples,byPhase.before.schema_tuples)
    assert.equal(byPhase.during.memberships.length,2)
    const added=byPhase.during.memberships.find(m=>m.grantor!=='10')
    assert.deepEqual([added.admin_option,added.inherit_option,added.set_option],[false,false,true])
    assert.deepEqual(byPhase.during.memberships.find(m=>m.grantor==='10'),byPhase.before.memberships[0])
    assert.ok(byPhase.during.schema_tuples.some(e=>e.grantee===added.roleid&&e.privilege_type==='CREATE'))
    await assertNarrowInstalled(f);record('observed bounded window and byte-exact provider/schema restoration',f,{ observations })
  } finally { await f.close() }
})

test('failure after granting both temporary privileges rolls back ownership, ACLs and every membership',async()=>{
  const f=await ownerTransferFixture();try {
    const source=(await readFile(LEGACY_ATOMIC_PROPOSAL,'utf8')).replace(' revoke create on schema mip_private from mip_legacy_completion_owner;'," raise exception 'synthetic failure after owner transfer';\n revoke create on schema mip_private from mip_legacy_completion_owner;")
    const before=await f.pin(source),members=await f.memberships(),acl=await f.schemaAcl(),tuples=await f.schemaTuples()
    await assert.rejects(f.db.exec(source),/synthetic failure after owner transfer/);await f.db.exec('rollback')
    assert.deepEqual(await f.catalog(),before);assert.deepEqual(await f.memberships(),members);assert.equal(await f.schemaAcl(),acl);assert.deepEqual(await f.schemaTuples(),tuples)
    assert.equal(await f.scalar("select exists(select 1 from pg_roles where rolname=$1)",[TARGET]),false)
    record('failure inside owner transfer restores full predecessor',f,{ introduced_memberships:0, broader_authority:0 })
  } finally { await f.close() }
})

test('nonempty creator self-grant is refused even with a freshly pinned matching catalog',async()=>{
  const f=await ownerTransferFixture();try {
    await f.db.exec("set createrole_self_grant='set'")
    const before=await f.pin();await assert.rejects(f.db.exec(await readFile(LEGACY_ATOMIC_PROPOSAL,'utf8')),/requires empty createrole_self_grant/);await f.db.exec('rollback')
    assert.deepEqual(await f.catalog(),before);record('self-grant setting fails closed',f)
  } finally { await f.close() }
})

test('pinned provider membership option and installer-context drift fail before package authority changes',async()=>{
  const f=await ownerTransferFixture();try {
    const before=await f.pin()
    await f.db.exec(`reset role;grant fixture_b1_provider to ${INSTALLER} with set true;set role ${INSTALLER}`)
    await assert.rejects(f.db.exec(await readFile(LEGACY_ATOMIC_PROPOSAL,'utf8')),/catalog.*drift|catalog.*mismatch|catalog.*missing/);await f.db.exec('rollback')
    assert.notDeepEqual(await f.catalog(),before)
    assert.equal(await f.scalar("select exists(select 1 from pg_roles where rolname=$1)",[TARGET]),false)
    record('predecessor membership option drift fails closed',f)
  } finally { await f.close() }
})

test('malformed automatic creator edge is refused without replacing or broadening provider authority',async()=>{
  const f=await ownerTransferFixture();try {
    // Synthetic bootstrap intervention between CREATE ROLE and the transfer;
    // absent from shipped source. Deliberately remove only SET=false provider
    // membership to prove the source refuses a missing exact creator edge.
    const source=(await readFile(LEGACY_ATOMIC_PROPOSAL,'utf8')).replace('do $owner_transfer$',`reset role;revoke ${TARGET} from ${INSTALLER} granted by postgres restrict;set role ${INSTALLER};\ndo $owner_transfer$`)
    const before=await f.pin(source),members=await f.memberships()
    await assert.rejects(f.db.exec(source),/unexpected bootstrap\/provider creator grant/);await f.db.exec('rollback')
    assert.deepEqual(await f.catalog(),before);assert.deepEqual(await f.memberships(),members)
    record('missing exact provider creator edge fails closed',f)
  } finally { await f.close() }
})

test('a catalog approved in another session identity cannot be replayed under the same article-owner role',async()=>{
  const f=await ownerTransferFixture();try {
    const before=await f.pin();assert.notEqual(before.installer_context.session_user,INSTALLER)
    await f.db.exec(`set session authorization ${INSTALLER}`)
    await assert.rejects(f.db.exec(await readFile(LEGACY_ATOMIC_PROPOSAL,'utf8')),/catalog baseline missing or drifted/);await f.db.exec('rollback')
    assert.equal(await f.scalar("select exists(select 1 from pg_roles where rolname=$1)",[TARGET]),false)
    assert.equal(await f.scalar('select current_user'),INSTALLER);assert.equal(await f.scalar('select session_user'),INSTALLER)
    record('installer session context replay refused',f,{approved_context:before.installer_context,actual_context:(await f.catalog()).installer_context})
  } finally { await f.close() }
})

test('revoke-only stop pins installed membership and preserves all roles, provider grants and retained ledgers',async()=>{
  const f=await ownerTransferFixture({installerSession:true});try {
    await f.install();await completePrivate(f);const before=await f.installedCatalog(),members=await f.memberships(),acl=await f.schemaAcl(),history=await retainedHistory(f)
    await f.db.query("select set_config('mip.legacy_atomic_rollback_expected_catalog',$1,false)",[JSON.stringify(before)])
    await f.db.exec(await readFile(new URL('../supabase/source-proposals/legacy-atomic-pack/rollback.sql',import.meta.url),'utf8'))
    assert.deepEqual(await f.memberships(),members);assert.equal(await f.schemaAcl(),acl)
    assert.deepEqual((await f.installedCatalog()).installer_context,before.installer_context)
    assert.equal(await f.scalar("select has_function_privilege('service_role','public.mip_legacy_extraction_v1(text,jsonb)','EXECUTE')"),false)
    assert.equal(await f.scalar("select has_function_privilege('service_role','mip_private.legacy_extraction_apply_v1(text,jsonb)','EXECUTE')"),false)
    assert.equal(await f.scalar("select to_regclass('mip_private.legacy_extraction_completions') is not null"),true)
    assert.equal(history.receipts.length,1);assert.deepEqual(await retainedHistory(f),history)
    record('exact revoke-only stop preserves provider/roles/ledgers',f,{ provider_membership:await targetMembers(f), installer_context:before.installer_context })
  } finally { await f.close() }
})

test('failure after private stop revoke restores exact installed ACLs, memberships, histories and installer session',async()=>{
  const f=await ownerTransferFixture({installerSession:true});try {
    await f.install();await completePrivate(f);const before=await f.installedCatalog(),members=await f.memberships(),acl=await f.schemaAcl(),history=await retainedHistory(f)
    await f.db.query("select set_config('mip.legacy_atomic_rollback_expected_catalog',$1,false)",[JSON.stringify(before)])
    const source=(await readFile(new URL('../supabase/source-proposals/legacy-atomic-pack/rollback.sql',import.meta.url),'utf8')).replace(' if not super then\n   execute format(\'set local role'," raise exception 'synthetic stop failure after private revoke';\n if not super then\n   execute format('set local role")
    assert.ok(source.includes('synthetic stop failure after private revoke'))
    await assert.rejects(f.db.exec(source),/synthetic stop failure after private revoke/);await f.db.exec('rollback')
    assert.deepEqual(await f.installedCatalog(),before);assert.deepEqual(await f.memberships(),members);assert.equal(await f.schemaAcl(),acl)
    assert.equal(await f.scalar('select session_user'),INSTALLER);assert.equal(await f.scalar('select current_user'),INSTALLER)
    assert.deepEqual(await retainedHistory(f),history)
    record('failed stop restores exact installed authority/context',f,{installer_context:before.installer_context})
  } finally { await f.close() }
})

test('stop with renamed bootstrap under non-super session restores context; installed membership drift refuses stop',async()=>{
  const f=await ownerTransferFixture({renamedBootstrap:true,installerSession:true});try {
    await f.install();const before=await f.installedCatalog()
    await f.db.query("select set_config('mip.legacy_atomic_rollback_expected_catalog',$1,false)",[JSON.stringify(before)])
    await f.bootstrapDDL(`grant fixture_b1_provider to ${INSTALLER} with set true`)
    const stop=await readFile(new URL('../supabase/source-proposals/legacy-atomic-pack/rollback.sql',import.meta.url),'utf8')
    await assert.rejects(f.db.exec(stop),/rollback catalog missing or drifted/);await f.db.exec('rollback')
    assert.equal(await f.scalar("select has_function_privilege('service_role','public.mip_legacy_extraction_v1(text,jsonb)','EXECUTE')"),true)
    const accepted=await f.installedCatalog(),members=await f.memberships()
    await f.db.query("select set_config('mip.legacy_atomic_rollback_expected_catalog',$1,false)",[JSON.stringify(accepted)]);await f.db.exec(stop)
    assert.deepEqual(await f.memberships(),members);assert.deepEqual((await f.installedCatalog()).installer_context,accepted.installer_context)
    assert.equal(await f.scalar("select has_function_privilege('service_role','mip_private.legacy_extraction_apply_v1(text,jsonb)','EXECUTE')"),false)
    record('renamed provider stop and drift refusal',f,{provider_membership:await targetMembers(f),installer_context:accepted.installer_context})
  } finally { await f.close() }
})

test('superuser stop preserves memberships and schemas without a role switch or membership grant',async()=>{
  const f=await ownerTransferFixture({superInstaller:true,installerSession:true});try {
    await f.install();const before=await f.installedCatalog(),members=await f.memberships(),acl=await f.schemaAcl()
    await f.db.query("select set_config('mip.legacy_atomic_rollback_expected_catalog',$1,false)",[JSON.stringify(before)])
    await f.db.exec(await readFile(new URL('../supabase/source-proposals/legacy-atomic-pack/rollback.sql',import.meta.url),'utf8'))
    assert.deepEqual(await f.memberships(),members);assert.equal(await f.schemaAcl(),acl);assert.deepEqual((await f.installedCatalog()).installer_context,before.installer_context)
    record('superuser stop compatibility',f)
  } finally { await f.close() }
})
