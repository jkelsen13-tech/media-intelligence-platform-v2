import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { createWorkerIssueCallbacks, createOperatorIssueProcessor,
  createGitHubIssueStore } from '../../scripts/mipNieIssueChannel.mjs'
import { authorityKeySha256 } from '../../scripts/mipNieSupervisor.mjs'
import { stableStringify } from '../../scripts/mipLegacyGraphStaging.mjs'
import { FIELD_ALLOWLIST, SOURCE_REF, DESTINATION_REF,
  sealParentManifest, sourceOperationScopeDigest } from '../../scripts/mipNieParentCustody.mjs'

const repository='example/private-qualification'
const issueUrl=`https://api.github.com/repos/${repository}/issues/7`
const context={repository,repository_id:12,issue_number:7,run_id:123,
  run_actor_id:40,worker_comment_actor_id:41,head_sha:'a'.repeat(40),
  operator_comment_actor_id:42}
const digest=value=>createHash('sha256').update(stableStringify(value)).digest('hex')
const signed=(body,key)=>({body,signature:sign(null,Buffer.from(stableStringify(body)),key).toString('base64')})
const eventId='11111111-1111-4111-8111-111111111111'
const articleId='22222222-2222-4222-8222-222222222222'
function manifestFor(scope) {
  const rows={events:[{id:eventId,sha256:'a'.repeat(64)}],
    articles:[{id:articleId,sha256:'b'.repeat(64)}]}
  return sealParentManifest({version:'nie-parent-custody/v1',
    source_project_ref:SOURCE_REF,destination_project_ref:DESTINATION_REF,
    destination_schema:'legacy_graph_staging',snapshot_kind:'current_at_fence',
    snapshot_id:randomUUID(),retained_versions:[],
    closure:{membership_count:1,membership_keys_sha256:'c'.repeat(64)},
    fence:{method:'repeatable_read_read_only_pinned',captured_at:new Date().toISOString()},
    schema_sha256:'d'.repeat(64),max_bytes:scope.max_bytes,
    run_prefix:scope.run_prefix,source_group_scope_sha256:scope.source_group_scope_sha256,
    tables:Object.fromEntries(['events','articles'].map(table=>[table,{
      fields:FIELD_ALLOWLIST[table],rows:rows[table],rows_sha256:digest(rows[table]),
      keys_sha256:digest(rows[table].map(r=>r.id))}]))})
}
function fixture() {
  const owner=generateKeyPairSync('ed25519'),operator=generateKeyPairSync('x25519')
  const operatorPublicKey=operator.publicKey.export({type:'spki',format:'der'}).toString('base64url')
  const now=Date.now(),clock={value:now}
  const approved_ids={events:[eventId],articles:[articleId]}
  const approvalBody={version:'nie-parent-operation/v1',operation_id:randomUUID(),
    host_id:'123',source_login:'synthetic_source',destination_login:'synthetic_destination',
    source_project_ref:SOURCE_REF,destination_project_ref:DESTINATION_REF,
    source_endpoint_host:'source.example',destination_endpoint_host:'destination.example',
    approved_ids,field_allowlist:FIELD_ALLOWLIST,run_prefix:'synthetic-run',max_bytes:1048576,
    max_runtime_ms:60000,issued_at:new Date(now-1000).toISOString(),
    expires_at:new Date(now+60000).toISOString(),
    scope_sha256:sourceOperationScopeDigest({approvedIds:approved_ids,
      runPrefix:'synthetic-run',maxBytes:1048576}),
    source_group_scope_sha256:'e'.repeat(64),permission_basis_id:'synthetic-permission',
    retention_contract_id:'synthetic-retention',route_id:'synthetic-route',
    cost_boundary_id:'synthetic-cost'}
  const approval=signed(approvalBody,owner.privateKey)
  const body={version:'nie-issue-channel/v1',...context,
    operator_key_sha256:createHash('sha256').update(operator.publicKey.export({type:'spki',format:'der'})).digest('hex'),
    approval_sha256:digest(approval),issued_at:new Date(now-1000).toISOString(),
    expires_at:new Date(now+60000).toISOString()}
  const authorization=signed(body,owner.privateKey)
  const comments=[],calls=[],run={id:123,repository:{id:12},head_sha:'a'.repeat(40),
    actor:{id:40},status:'in_progress'}
  function store(actor) {
    return {issueUrl,list:async()=>comments,getRun:async()=>run,
      post:async text=>{
        const row={id:comments.length+1,user:{id:actor},issue_url:issueUrl,
          created_at:new Date(clock.value).toISOString(),body:text}
        comments.push(row);return row
      }}
  }
  const issuer={claimOperation:async request=>{
    calls.push({phase:'claim',request});return signed({version:'nie-parent-source-claim/v1',
      operation_id:request.scope.operation_id,attempt_id:randomUUID(),
      host_id:request.scope.host_id,scope_sha256:request.scope.scope_sha256,
      source_login:request.scope.source_login,expires_at:request.scope.expires_at},owner.privateKey)
  },authorizePages:async request=>{
    calls.push({phase:'grant',request});return signed({version:'grant',
      manifest_sha256:request.manifest.sha256},owner.privateKey)
  }}
  const common={authorization,approvalPublicKey:owner.publicKey,
    approvalKeySha256:authorityKeySha256(owner.publicKey),context,
    now:()=>clock.value}
  const operatorProcess=createOperatorIssueProcessor({...common,store:store(42),
    operatorPrivateKey:operator.privateKey,issuer})
  const worker=createWorkerIssueCallbacks({...common,store:store(41),
    operatorPublicKey,pause:async()=>{const handled=await operatorProcess.processOnce();
      if(!handled) throw Error('operator_no_request')},pollMs:1})
  return {owner,operator,approval,authorization,operatorPublicKey,common,
    operatorProcess,worker,comments,calls,clock,run,store,issuer}
}
test('worker and separate operator exchange encrypted claim and post-fence page metadata',async()=>{
  const f=fixture(),scope=f.approval.body
  const claim=await f.worker.claimOperation({approval:f.approval,scope})
  assert.equal(claim.body.operation_id,scope.operation_id)
  const manifest=manifestFor(scope)
  const grant=await f.worker.authorizePages({approval:f.approval,scope,claim:claim.body,
    claimDocument:claim,manifest,pages:[{run_id:'private-run',source_table:'events',
      page_sha256:'c'.repeat(64),page_size:1}]})
  assert.equal(grant.body.manifest_sha256,manifest.sha256)
  assert.deepEqual(f.calls.map(x=>x.phase),['claim','grant'])
  const visible=f.comments.map(x=>x.body).join('\n')
  for(const secret of [eventId,'private-run',scope.operation_id,manifest.sha256])
    assert.equal(visible.includes(secret),false)
  assert.equal(f.comments.length,4)
})
test('GitHub actor, run commit and signed mailbox authorization are enforced',async()=>{
  const f=fixture(),scope=f.approval.body
  f.run.head_sha='f'.repeat(40)
  await assert.rejects(f.worker.claimOperation({approval:f.approval,scope}),/channel_run_invalid/)
  assert.equal(f.comments.length,0)
  f.run.head_sha=context.head_sha
  f.comments.push({id:1,user:{id:999},issue_url:issueUrl,
    created_at:new Date(f.clock.value).toISOString(),body:'NIE_CHANNEL_V1:bogus'})
  assert.equal(await f.operatorProcess.processOnce(),null)
  assert.equal(f.calls.length,0)
  const changed={...f.authorization,body:{...f.authorization.body,issue_number:8}}
  const worker=createWorkerIssueCallbacks({...f.common,authorization:changed,
    store:f.store(41),operatorPublicKey:f.operatorPublicKey})
  await assert.rejects(worker.claimOperation({approval:f.approval,scope}),/channel_authorization_invalid/)
})
test('cross-run, stale and forged responses cannot satisfy worker callback',async()=>{
  const f=fixture(),scope=f.approval.body
  f.clock.value=Date.parse(f.authorization.body.expires_at)+1
  await assert.rejects(f.worker.claimOperation({approval:f.approval,scope}),/channel_scope_invalid/)
  assert.equal(f.comments.length,0)
  f.clock.value=Date.parse(f.authorization.body.issued_at)+1000
  const wrongContext={...context,run_id:124}
  const worker=createWorkerIssueCallbacks({...f.common,context:wrongContext,
    store:f.store(41),operatorPublicKey:f.operatorPublicKey})
  await assert.rejects(worker.claimOperation({approval:f.approval,scope}),/channel_scope_invalid/)
  f.comments.push({id:1,user:{id:42},issue_url:issueUrl,
    created_at:new Date(f.clock.value).toISOString(),body:'NIE_CHANNEL_V1:Zm9yZ2Vk'})
  assert.equal(await f.operatorProcess.processOnce(),null)
})
test('malformed matching ciphertext and payload-shaped requests fail closed',async()=>{
  const f=fixture(),scope=f.approval.body
  await assert.rejects(f.worker.claimOperation({approval:f.approval,scope,
    payload:'synthetic-disallowed'}),/channel_request_shape_invalid/)
  const worker=createWorkerIssueCallbacks({...f.common,store:f.store(41),
    operatorPublicKey:f.operatorPublicKey,pause:async()=>{
      const request=JSON.parse(Buffer.from(f.comments[0].body.slice('NIE_CHANNEL_V1:'.length),
        'base64url'))
      const forged={...request,direction:'response'}
      await f.store(42).post('NIE_CHANNEL_V1:'+Buffer.from(stableStringify(forged)).toString('base64url'))
    },pollMs:1})
  await assert.rejects(worker.claimOperation({approval:f.approval,scope}),/channel_ciphertext_invalid/)
  assert.equal(f.calls.length,0)
})
test('GitHub store uses bounded issue-comment API without exposing token in body',async()=>{
  const calls=[]
  const fetchImpl=async(url,options)=>{
    calls.push({url,options})
    return {ok:true,json:async()=>url.includes('/actions/runs/')?{id:123}:
      options.method==='POST'?{id:1}:[]}
  }
  const store=createGitHubIssueStore({repository,issueNumber:7,token:'synthetic-token',fetchImpl})
  await store.list();await store.post('ciphertext-only');await store.getRun(123)
  assert.equal(calls.length,3)
  assert.equal(calls[1].options.body,'{"body":"ciphertext-only"}')
  assert.equal(calls.every(c=>c.options.headers.Authorization==='Bearer synthetic-token'),true)
  assert.equal(calls.every(c=>!c.url.includes('synthetic-token')),true)
})
test('signed issue and repository bind both endpoints before mailbox access',async()=>{
  const f=fixture(),wrongIssue={...f.store(41),
    issueUrl:'https://api.github.com/repos/example/private-qualification/issues/8'}
  const worker=createWorkerIssueCallbacks({...f.common,store:wrongIssue,
    operatorPublicKey:f.operatorPublicKey})
  await assert.rejects(worker.claimOperation({approval:f.approval,scope:f.approval.body}),
    /channel_store_binding_invalid/)
  const operator=createOperatorIssueProcessor({...f.common,store:wrongIssue,
    operatorPrivateKey:f.operator.privateKey,issuer:f.issuer})
  await assert.rejects(operator.processOnce(),/channel_store_binding_invalid/)
  assert.equal(f.comments.length,0)
  assert.equal(f.calls.length,0)
})
test('nested payload-shaped metadata is refused before posting',async()=>{
  const f=fixture(),scope=f.approval.body
  await assert.rejects(f.worker.claimOperation({approval:f.approval,
    scope:{...scope,payload:'private-body'}}),/channel_request_shape_invalid/)
  const claim=await f.worker.claimOperation({approval:f.approval,scope})
  const before=f.comments.length
  const manifest={...manifestFor(scope),payload:'private-body'}
  await assert.rejects(f.worker.authorizePages({approval:f.approval,scope,
    claim:claim.body,claimDocument:claim,manifest,pages:[]}),
    /channel_request_shape_invalid/)
  for(const malformed of [
    {...manifestFor(scope),tables:{...manifestFor(scope).tables,
      events:{...manifestFor(scope).tables.events,fields:{payload:'private-body'}}}},
    {...manifestFor(scope),fence:{method:'repeatable_read_read_only_pinned',
      captured_at:{dsn:'private-dsn'}}},
  ]) {
    await assert.rejects(f.worker.authorizePages({approval:f.approval,scope,
      claim:claim.body,claimDocument:claim,manifest:malformed,pages:[]}),
      /channel_request_shape_invalid/)
  }
  const invalidClaim={...claim.body,source_login:{payload:'private-body'}}
  await assert.rejects(f.worker.authorizePages({approval:f.approval,scope,
    claim:invalidClaim,claimDocument:{body:invalidClaim,signature:claim.signature},
    manifest:manifestFor(scope),pages:[]}),/channel_request_shape_invalid/)
  await assert.rejects(f.worker.authorizePages({approval:f.approval,scope,
    claim:claim.body,claimDocument:{body:claim.body,signature:{payload:'private-body'}},
    manifest:manifestFor(scope),pages:[]}),/channel_request_shape_invalid/)
  assert.equal(f.comments.length,before)
})
test('late worker response and late operator provisioning response fail closed',async()=>{
  const f=fixture(),scope=f.approval.body,base=f.store(41)
  let lists=0
  const delayed={...base,list:async()=>{
    const rows=await base.list()
    if (++lists===2) f.clock.value=Date.parse(f.authorization.body.expires_at)+1
    return rows
  }}
  const worker=createWorkerIssueCallbacks({...f.common,store:delayed,
    operatorPublicKey:f.operatorPublicKey,pollMs:1,
    pause:async()=>{await f.operatorProcess.processOnce()}})
  await assert.rejects(worker.claimOperation({approval:f.approval,scope}),
    /channel_response_expired/)
  const g=fixture(),original=g.issuer.claimOperation
  g.issuer.claimOperation=async request=>{
    const document=await original(request)
    g.clock.value=Date.parse(g.authorization.body.expires_at)+1
    return document
  }
  await assert.rejects(g.worker.claimOperation({approval:g.approval,scope:g.approval.body}),
    /channel_response_ineligible/)
  assert.equal(g.comments.length,1)
})
test('initial run lookup cannot publish after signed channel expiry',async()=>{
  const f=fixture(),base=f.store(41)
  const delayed={...base,getRun:async id=>{
    const run=await base.getRun(id)
    f.clock.value=Date.parse(f.authorization.body.expires_at)+1
    return run
  }}
  const worker=createWorkerIssueCallbacks({...f.common,store:delayed,
    operatorPublicKey:f.operatorPublicKey})
  await assert.rejects(worker.claimOperation({approval:f.approval,
    scope:f.approval.body}),/channel_response_expired/)
  assert.equal(f.comments.length,0)
})
