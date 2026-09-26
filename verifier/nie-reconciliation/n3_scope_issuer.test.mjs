import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, randomUUID, sign, verify } from 'node:crypto'
import { createNarrowScopeIssuer } from '../../scripts/mipNieScopeIssuer.mjs'
import { authorityKeySha256, superviseNarrowParentCustody } from '../../scripts/mipNieSupervisor.mjs'
import { FIELD_ALLOWLIST, SOURCE_REF, DESTINATION_REF,
  sealParentManifest, sourceOperationScopeDigest } from '../../scripts/mipNieParentCustody.mjs'
import { fingerprintPayload, stableStringify } from '../../scripts/mipLegacyGraphStaging.mjs'

const eid='11111111-1111-4111-8111-111111111111'
const aid='22222222-2222-4222-8222-222222222222'
function signed(body,key) { return {body,signature:sign(null,Buffer.from(stableStringify(body)),key).toString('base64')} }
function fixture({sourceCommitFails=false}={}) {
  const owner=generateKeyPairSync('ed25519'),issuerKey=generateKeyPairSync('ed25519')
  const ids={events:[eid],articles:[aid]}, runPrefix=`n3.${randomUUID()}`
  const scope={version:'nie-parent-operation/v1',operation_id:randomUUID(),host_id:'synthetic-host',
    source_login:'source_worker',destination_login:'destination_worker',
    source_project_ref:SOURCE_REF,destination_project_ref:DESTINATION_REF,
    source_endpoint_host:`db.${SOURCE_REF}.supabase.co`,
    destination_endpoint_host:`db.${DESTINATION_REF}.supabase.co`,
    approved_ids:ids,field_allowlist:FIELD_ALLOWLIST,run_prefix:runPrefix,
    max_bytes:1024*1024,max_runtime_ms:60000,
    issued_at:new Date().toISOString(),
    expires_at:new Date(Date.now()+60000).toISOString(),
    scope_sha256:sourceOperationScopeDigest({approvedIds:ids,runPrefix,maxBytes:1024*1024}),
    source_group_scope_sha256:'a'.repeat(64),permission_basis_id:'synthetic',
    retention_contract_id:'synthetic',route_id:'synthetic',cost_boundary_id:'synthetic'}
  const calls=[],state={sourceConsumed:false,pagePrefix:null,sourceCommits:0,pageCommits:0,
    sourceDiscarded:false}
  function admin(projectRef,adminLogin) {
    return {expectedLogin:adminLogin,connect:async()=>({
      connectionInfo:{projectRef,tlsVerified:true},
      async query(sql,params){
        calls.push({projectRef,sql,params})
        if(sql.includes('pg_stat_ssl'))return{rows:[{session_user:adminLogin,current_user:adminLogin,ssl:true}]}
        if(sql.includes('insert into nie_parent_access.operations')){
          if(state.sourceConsumed)throw Error('duplicate source operation')
          state.sourceConsumed=true;return{rowCount:1}
        }
        if(sql.includes('insert into nie_parent_access.allowed_source_ids'))return{rowCount:params[5].length}
        if(sql.includes('from legacy_graph_staging.nie_parent_page_scope'))return{rows:[{n:state.pagePrefix?1:0}]}
        if(sql.includes('insert into legacy_graph_staging.nie_parent_page_scope')){
          state.pagePrefix=true;return{rowCount:JSON.parse(params[4]).length}
        }
        if(sql==='commit'){
          if(projectRef===SOURCE_REF && sourceCommitFails)throw Error('unknown source commit')
          if(projectRef===SOURCE_REF)state.sourceCommits++;else state.pageCommits++
        }
        return{rows:[]}
      },async release(discard){if(projectRef===SOURCE_REF)state.sourceDiscarded=Boolean(discard)} })}
  }
  const scopeIssuer=createNarrowScopeIssuer({sourceAdmin:admin(SOURCE_REF,'source_admin'),
    destinationAdmin:admin(DESTINATION_REF,'destination_admin'),signingKey:issuerKey.privateKey,
    approvalPublicKey:owner.publicKey,approvalKeySha256:authorityKeySha256(owner.publicKey)})
  const approval=signed(scope,owner.privateKey)
  const rows={events:[{id:eid,sha256:'1'.repeat(64)}],articles:[{id:aid,sha256:'2'.repeat(64)}]}
  const manifest=sealParentManifest({version:'nie-parent-custody/v1',
    source_project_ref:SOURCE_REF,destination_project_ref:DESTINATION_REF,
    destination_schema:'legacy_graph_staging',snapshot_kind:'current_at_fence',
    snapshot_id:randomUUID(),retained_versions:[],
    closure:{membership_count:1,membership_keys_sha256:'3'.repeat(64)},
    fence:{method:'repeatable_read_read_only_pinned',captured_at:new Date().toISOString()},
    schema_sha256:'4'.repeat(64),max_bytes:scope.max_bytes,run_prefix:scope.run_prefix,
    source_group_scope_sha256:scope.source_group_scope_sha256,
    tables:Object.fromEntries(Object.entries(rows).map(([table,r])=>[table,
      {fields:FIELD_ALLOWLIST[table],rows:r,rows_sha256:fingerprintPayload(r),
        keys_sha256:fingerprintPayload(r.map(x=>x.id))}]))})
  const pages=['events','articles'].map((table,i)=>({run_id:`${runPrefix}.${manifest.sha256}.${table}.0000`,
    source_table:table,page_sha256:String(i+5).repeat(64),page_size:1}))
  return {owner,issuerKey,scope,approval,scopeIssuer,manifest,pages,calls,state}
}
test('issuer verifies owner approval, consumes exact source IDs once, signs only after COMMIT',async()=>{
  const f=fixture()
  const claimDocument=await f.scopeIssuer.claimOperation({approval:f.approval,scope:f.scope})
  assert.deepEqual(Object.keys(claimDocument).sort(),['body','signature'])
  assert.equal(f.state.sourceCommits,1)
  assert.equal(verify(null,Buffer.from(stableStringify(claimDocument.body)),
    f.issuerKey.publicKey,Buffer.from(claimDocument.signature,'base64')),true)
  assert.equal(f.calls.filter(c=>c.sql.includes('insert into nie_parent_access.allowed_source_ids')).length,2)
  assert.equal(f.calls.some(c=>c.params?.includes('source_worker')&&c.projectRef===DESTINATION_REF),false)
  await assert.rejects(f.scopeIssuer.claimOperation({approval:f.approval,scope:f.scope}),/duplicate source operation/)
  assert.equal(f.state.sourceCommits,1)
})
test('tampered approval cannot provision source IDs',async()=>{
  const f=fixture()
  const wrong={...f.scope,source_group_scope_sha256:'f'.repeat(64)}
  await assert.rejects(f.scopeIssuer.claimOperation({approval:f.approval,scope:wrong}),/issuer_approval_invalid/)
  assert.equal(f.calls.length,0)
})
test('administrator SQL and both receipts use the signed absolute runtime bound',async()=>{
  const f=fixture()
  f.scope.max_runtime_ms=30000
  f.approval=signed(f.scope,f.owner.privateKey)
  const bound=Date.parse(f.scope.issued_at)+30000
  const claimDocument=await f.scopeIssuer.claimOperation({approval:f.approval,scope:f.scope})
  const sourceExpiry=f.calls.find(c=>c.sql.includes('insert into nie_parent_access.operations')).params[3]
  const idExpiries=f.calls.filter(c=>c.sql.includes('insert into nie_parent_access.allowed_source_ids'))
    .map(c=>c.params[4])
  assert.equal(Date.parse(sourceExpiry),bound)
  assert.equal(idExpiries.every(x=>x===sourceExpiry),true)
  assert.equal(claimDocument.body.expires_at,sourceExpiry)
  const grant=await f.scopeIssuer.authorizePages({approval:f.approval,scope:f.scope,
    claim:claimDocument.body,claimDocument,manifest:f.manifest,pages:f.pages})
  const qikExpiry=f.calls.find(c=>c.sql.includes('insert into legacy_graph_staging.nie_parent_page_scope')).params[2]
  assert.equal(qikExpiry,sourceExpiry)
  assert.equal(grant.body.expires_at,sourceExpiry)
  const installed=JSON.parse(f.calls.find(c=>c.sql.includes('insert into legacy_graph_staging.nie_parent_page_scope')).params[4])
  assert.deepEqual(installed[0].expected_rows,f.manifest.tables.events.rows)
  assert.deepEqual(installed[1].expected_rows,f.manifest.tables.articles.rows)
  assert.deepEqual(installed[1].expected_fields,[...FIELD_ALLOWLIST.articles].sort())
})
test('unknown source scope COMMIT discards admin connection and issues no claim',async()=>{
  const f=fixture({sourceCommitFails:true})
  await assert.rejects(f.scopeIssuer.claimOperation({approval:f.approval,scope:f.scope}),
    /unknown source commit/)
  assert.equal(f.state.sourceDiscarded,true)
  await assert.rejects(f.scopeIssuer.claimOperation({approval:f.approval,scope:f.scope}),
    /duplicate source operation/)
})
test('issuer binds exactly one manifest page set per signed run prefix',async()=>{
  const f=fixture()
  const claimDocument=await f.scopeIssuer.claimOperation({approval:f.approval,scope:f.scope})
  const request={approval:f.approval,scope:f.scope,claim:claimDocument.body,claimDocument,
    manifest:f.manifest,pages:f.pages}
  const grant=await f.scopeIssuer.authorizePages(request)
  assert.deepEqual(Object.keys(grant).sort(),['body','signature'])
  assert.equal(f.state.pageCommits,1)
  assert.deepEqual(grant.body.pages,f.pages)
  assert.equal(verify(null,Buffer.from(stableStringify(grant.body)),
    f.issuerKey.publicKey,Buffer.from(grant.signature,'base64')),true)
  await assert.rejects(f.scopeIssuer.authorizePages(request),/issuer_manifest_already_granted/)
  assert.equal(f.state.pageCommits,1)
  const changed={...request,pages:[{...f.pages[0],page_size:2},f.pages[1]]}
  await assert.rejects(f.scopeIssuer.authorizePages(changed),/issuer_page_scope_invalid/)
  const {sha256:unusedManifestSha,...manifestBody}=f.manifest
  const foreignManifest=sealParentManifest({...manifestBody,
    snapshot_id:randomUUID(),run_prefix:'foreign.run'})
  await assert.rejects(f.scopeIssuer.authorizePages({...request,manifest:foreignManifest}),
    /issuer_manifest_scope_invalid/)
  const foreignGroups=sealParentManifest({...manifestBody,
    source_group_scope_sha256:'f'.repeat(64)})
  await assert.rejects(f.scopeIssuer.authorizePages({...request,manifest:foreignGroups}),
    /issuer_manifest_scope_invalid/)
  const changedRows=structuredClone(manifestBody)
  changedRows.tables.events.rows[0].id='33333333-3333-4333-8333-333333333333'
  changedRows.tables.events.rows_sha256=fingerprintPayload(changedRows.tables.events.rows)
  changedRows.tables.events.keys_sha256=fingerprintPayload(changedRows.tables.events.rows.map(r=>r.id))
  await assert.rejects(f.scopeIssuer.authorizePages({...request,
    manifest:sealParentManifest(changedRows)}),/issuer_manifest_scope_invalid/)
})
test('supervisor and separate issuer agree on signed claim and exact page grant',async()=>{
  const f=fixture()
  const events=Object.fromEntries(FIELD_ALLOWLIST.events.map(k=>[k,k==='id'?eid:null]))
  const articles=Object.fromEntries(FIELD_ALLOWLIST.articles.map(k=>[k,k==='id'?aid:null]))
  const closure={event_count:1,article_count:1,membership_count:1,unapproved_membership_count:0,
    event_keys_sha256:fingerprintPayload([eid]),article_keys_sha256:fingerprintPayload([aid]),
    membership_keys_sha256:fingerprintPayload([[eid,aid]])}
  let sourceCommitted=false, destinationAttempts=0
  const sourceConnection={expectedLogin:'source_worker',schemaSha256:'4'.repeat(64),
    connect:Object.assign(async()=>({connectionInfo:{projectRef:SOURCE_REF,tlsVerified:true},
      async query(sql){
        if(sql.includes('pg_stat_ssl'))return{rows:[{session_user:'source_worker',current_user:'source_worker',ssl:true}]}
        if(sql.includes('pg_current_snapshot()'))return{rows:[{isolation:'repeatable read',read_only:'on',
          snapshot_state:'1:2:',backend_pid:44,captured_at:new Date().toISOString()}]}
        if(sql.includes('row_to_json'))return{rows:[{payload_json:JSON.stringify(sql.includes('public.events')?events:articles)}]}
        if(sql.includes('full_parent_inventory'))return{rows:[{value:closure}]}
        if(sql==='commit')sourceCommitted=true
        return{rows:[]}
      },async release(){} }),{endpointHost:`db.${SOURCE_REF}.supabase.co`})}
  const destination={expectedLogin:'destination_worker',endpointHost:`db.${DESTINATION_REF}.supabase.co`,
    rpc:async()=>{},readStaged:async()=>[],
    withPageTransaction:async()=>{destinationAttempts++;throw Error('synthetic writer stop')}}
  const result=await superviseNarrowParentCustody({approval:f.approval,
    approvalPublicKey:f.owner.publicKey,approvalKeySha256:authorityKeySha256(f.owner.publicKey),
    issuerPublicKey:f.issuerKey.publicKey,issuerKeySha256:authorityKeySha256(f.issuerKey.publicKey),
    hostId:'synthetic-host',sourceConnection,destination,
    claimOperation:f.scopeIssuer.claimOperation,authorizePages:f.scopeIssuer.authorizePages})
  assert.equal(sourceCommitted,true)
  assert.equal(f.state.sourceCommits,1)
  assert.equal(f.state.pageCommits,1)
  assert.equal(destinationAttempts,1)
  assert.equal(result.state,'incomplete')
  assert.equal(result.operation_id,f.scope.operation_id)
})
