import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign, randomUUID } from 'node:crypto'
import { superviseNarrowParentCustody, authorityKeySha256 } from '../../scripts/mipNieSupervisor.mjs'
import { createVerifiedPgConnect } from '../../scripts/mipNieTrustedPg.mjs'
import { FIELD_ALLOWLIST, SOURCE_REF, DESTINATION_REF, sourceOperationScopeDigest } from '../../scripts/mipNieParentCustody.mjs'
import { stableStringify, fingerprintPayload } from '../../scripts/mipLegacyGraphStaging.mjs'

const sourceId = '11111111-1111-4111-8111-111111111111'
const articleId = '22222222-2222-4222-8222-222222222222'
const ids = { events:[sourceId], articles:[articleId] }
function authority() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  return { publicKey, pin: authorityKeySha256(publicKey),
    issue: body => ({ body, signature:sign(null, Buffer.from(stableStringify(body)), privateKey).toString('base64') }) }
}
function approval() {
  const body = { version:'nie-parent-operation/v1', operation_id:randomUUID(), host_id:'synthetic-host',
    source_login:'source_login', destination_login:'destination_login',
    source_project_ref:SOURCE_REF, destination_project_ref:DESTINATION_REF,
    source_endpoint_host:`db.${SOURCE_REF}.supabase.co`,
    destination_endpoint_host:`db.${DESTINATION_REF}.supabase.co`,
    approved_ids:ids, field_allowlist:FIELD_ALLOWLIST, run_prefix:'n3.synthetic',
    max_bytes:1024*1024, max_runtime_ms:60000,
    issued_at:new Date().toISOString(),
    expires_at:new Date(Date.now()+60000).toISOString(),
    scope_sha256:sourceOperationScopeDigest({approvedIds:ids,runPrefix:'n3.synthetic',maxBytes:1024*1024}),
    source_group_scope_sha256:'a'.repeat(64), permission_basis_id:'synthetic',
    retention_contract_id:'synthetic',route_id:'synthetic',cost_boundary_id:'synthetic' }
  return body
}
function setup() {
  const owner=authority(), issuer=authority(), body=approval()
  let claims=0, connects=0
  const args={ approval:owner.issue(body), approvalPublicKey:owner.publicKey,
    approvalKeySha256:owner.pin, issuerPublicKey:issuer.publicKey, issuerKeySha256:issuer.pin,
    hostId:'synthetic-host', sourceConnection:{ expectedLogin:'source_login',schemaSha256:'b'.repeat(64),
      connect:Object.assign(async()=>{connects++;throw Error('synthetic source connection stop')},
        {endpointHost:`db.${SOURCE_REF}.supabase.co`}) },
    destination:{expectedLogin:'destination_login',endpointHost:`db.${DESTINATION_REF}.supabase.co`},
    claimOperation:async({scope})=>{claims++;return issuer.issue({version:'nie-parent-source-claim/v1',
      operation_id:scope.operation_id,attempt_id:randomUUID(),host_id:'synthetic-host',
      scope_sha256:scope.scope_sha256,source_login:'source_login',
      expires_at:new Date(Date.now()+30000).toISOString()})},
    authorizePages:async()=>{throw Error('should not authorize pages')} }
  return {args,owner,issuer,body,get claims(){return claims},get connects(){return connects}}
}
test('signed exact operation and source claim precede the first source connection',async()=>{
  const h=setup()
  await assert.rejects(superviseNarrowParentCustody(h.args),/synthetic source connection stop/)
  assert.equal(h.claims,1);assert.equal(h.connects,1)
})
test('field, ID, host, expiry, signature and key pin drift fail before claim or source read',async()=>{
  for(const change of [
    h=>{h.args.hostId='foreign-host'},
    h=>{h.body.field_allowlist={...FIELD_ALLOWLIST,articles:['id']};h.args.approval=h.owner.issue(h.body)},
    h=>{h.body.approved_ids={events:[articleId],articles:[sourceId]};h.args.approval=h.owner.issue(h.body)},
    h=>{h.body.expires_at=new Date(Date.now()-1000).toISOString();h.args.approval=h.owner.issue(h.body)},
    h=>{h.args.approval.signature=h.issuer.issue(h.body).signature},
    h=>{h.args.approvalKeySha256='0'.repeat(64)},
  ]){
    const h=setup();change(h)
    await assert.rejects(superviseNarrowParentCustody(h.args))
    assert.equal(h.claims,0);assert.equal(h.connects,0)
  }
})
test('unsigned or replay-shaped source claim cannot reach payload connection',async()=>{
  for(const bad of [
    h=>({body:{...h.args.approval.body,version:'nie-parent-source-claim/v1'},signature:'bad'}),
    h=>h.issuer.issue({version:'nie-parent-source-claim/v1',operation_id:h.body.operation_id,
      attempt_id:randomUUID(),host_id:'synthetic-host',scope_sha256:'0'.repeat(64),
      source_login:'source_login',expires_at:new Date(Date.now()+30000).toISOString()}),
    h=>h.issuer.issue({version:'nie-parent-source-claim/v1',operation_id:h.body.operation_id,
      attempt_id:randomUUID(),host_id:'synthetic-host',scope_sha256:h.body.scope_sha256,
      source_login:'source_login',expires_at:new Date(Date.now()-1000).toISOString()}),
  ]){
    const h=setup();h.args.claimOperation=async()=>bad(h)
    await assert.rejects(superviseNarrowParentCustody(h.args))
    assert.equal(h.connects,0)
  }
})
test('trusted client pins direct endpoint and rejects unverified TLS without SQL',async()=>{
  let config, ended=false, authorizeTls=false
  class FakeClient {
    constructor(value){config=value;this.connection={stream:{encrypted:true,authorized:authorizeTls,
      servername:value.host,getPeerCertificate:()=>({subjectaltname:`DNS:${value.host}`})}}}
    async connect(){}
    async end(){ended=true}
  }
  const connect=createVerifiedPgConnect({projectRef:SOURCE_REF,login:'source_login',
    password:'synthetic',transport:'direct',ClientClass:FakeClient})
  await assert.rejects(connect(),/pg_tls_endpoint_invalid/)
  assert.equal(config.host,`db.${SOURCE_REF}.supabase.co`)
  assert.equal(config.port,5432);assert.equal(config.ssl.rejectUnauthorized,true)
  assert.equal(config.ssl.servername,config.host);assert.equal(ended,true)
  authorizeTls=true
  const verified=await connect()
  assert.deepEqual(verified.connectionInfo,{projectRef:SOURCE_REF,tlsVerified:true,
    host:`db.${SOURCE_REF}.supabase.co`,port:5432,login:'source_login',transport:'direct'})
  assert.throws(()=>createVerifiedPgConnect({projectRef:'foreign',login:'source_login',password:'x',transport:'direct'}))
  const pooler=createVerifiedPgConnect({projectRef:SOURCE_REF,login:'source_login',
    password:'synthetic',transport:'session_pooler',poolerHost:'aws-0-us-east-1.pooler.supabase.com',
    ClientClass:FakeClient})
  const pooled=await pooler()
  assert.equal(pooled.connectionInfo.tlsVerified,true)
  assert.equal(pooled.connectionInfo.transport,'session_pooler')
  assert.equal(config.host,'aws-0-us-east-1.pooler.supabase.com')
  assert.equal(config.user,`source_login.${SOURCE_REF}`)
  assert.equal(config.port,5432)
  assert.throws(()=>createVerifiedPgConnect({projectRef:SOURCE_REF,login:'source_login',
    password:'synthetic',transport:'session_pooler',poolerHost:'pooler.example.com'}))
})
test('signed page grant binds the fresh manifest and exact qik pages after source commit',async()=>{
  const h=setup()
  const events=Object.fromEntries(FIELD_ALLOWLIST.events.map(k=>[k,k==='id'?sourceId:null]))
  const articles=Object.fromEntries(FIELD_ALLOWLIST.articles.map(k=>[k,k==='id'?articleId:null]))
  const closure={event_count:1,article_count:1,membership_count:1,unapproved_membership_count:0,
    event_keys_sha256:fingerprintPayload([sourceId]),article_keys_sha256:fingerprintPayload([articleId]),
    membership_keys_sha256:fingerprintPayload([[sourceId,articleId]])}
  let sourceCommitted=false, destinationWrites=0
  h.args.sourceConnection.connect=Object.assign(async()=>({connectionInfo:{projectRef:SOURCE_REF,tlsVerified:true},
    async query(sql){
      if(sql.includes('pg_stat_ssl'))return{rows:[{session_user:'source_login',current_user:'source_login',ssl:true}]}
      if(sql.includes('pg_current_snapshot()'))return{rows:[{isolation:'repeatable read',read_only:'on',
        snapshot_state:'1:2:',backend_pid:77,captured_at:new Date().toISOString()}]}
      if(sql.includes('row_to_json'))return{rows:[{payload_json:JSON.stringify(sql.includes('public.events')?events:articles)}]}
      if(sql.includes('full_parent_inventory'))return{rows:[{value:closure}]}
      if(sql==='commit')sourceCommitted=true
      return{rows:[]}
    },async release(){} }),{endpointHost:`db.${SOURCE_REF}.supabase.co`})
  h.args.destination={expectedLogin:'destination_login',endpointHost:`db.${DESTINATION_REF}.supabase.co`,
    rpc:async()=>{},readStaged:async()=>[],
    withPageTransaction:async()=>{destinationWrites++;throw Error('synthetic writer stop')}}
  h.args.authorizePages=async({scope,claim,manifest,pages})=>{
    assert.equal(sourceCommitted,true)
    assert.equal(pages.length,2)
    assert.equal(pages.every(p=>p.run_id.includes(manifest.sha256)),true)
    return h.issuer.issue({version:'nie-parent-page-grant/v1',operation_id:scope.operation_id,
      attempt_id:claim.attempt_id,scope_sha256:scope.scope_sha256,
      manifest_sha256:manifest.sha256,destination_login:'destination_login',pages,
      expires_at:new Date(Date.now()+20000).toISOString(),receipt_id:'synthetic-receipt'})
  }
  const result=await superviseNarrowParentCustody(h.args)
  assert.equal(result.state,'incomplete');assert.equal(destinationWrites,1)
  assert.equal(result.verified_pages.length,0)
})
