import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { createWorkerIssueCallbacks, createOperatorIssueProcessor,
  createGitHubIssueStore } from '../../scripts/mipNieIssueChannel.mjs'
import { authorityKeySha256 } from '../../scripts/mipNieSupervisor.mjs'
import { stableStringify } from '../../scripts/mipLegacyGraphStaging.mjs'

const repository='example/private-qualification'
const issueUrl=`https://api.github.com/repos/${repository}/issues/7`
const context={repository,repository_id:12,issue_number:7,run_id:123,
  run_actor_id:40,worker_comment_actor_id:41,head_sha:'a'.repeat(40),
  operator_comment_actor_id:42}
const digest=value=>createHash('sha256').update(stableStringify(value)).digest('hex')
const signed=(body,key)=>({body,signature:sign(null,Buffer.from(stableStringify(body)),key).toString('base64')})
function fixture() {
  const owner=generateKeyPairSync('ed25519'),operator=generateKeyPairSync('x25519')
  const approval=signed({host_id:'123',operation_id:randomUUID()},owner.privateKey)
  const operatorPublicKey=operator.publicKey.export({type:'spki',format:'der'}).toString('base64url')
  const now=Date.now(),clock={value:now}
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
    calls.push({phase:'claim',request});return signed({version:'claim',
      operation_id:request.scope.operation_id},owner.privateKey)
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
  const f=fixture(),scope={operation_id:f.approval.body.operation_id}
  const claim=await f.worker.claimOperation({approval:f.approval,scope})
  assert.equal(claim.body.operation_id,scope.operation_id)
  const manifest={sha256:'b'.repeat(64),tables:{events:{rows:[{id:'private-event'}]}}}
  const grant=await f.worker.authorizePages({approval:f.approval,scope,claim:claim.body,
    claimDocument:claim,manifest,pages:[{run_id:'private-run',source_table:'events',
      page_sha256:'c'.repeat(64),page_size:1}]})
  assert.equal(grant.body.manifest_sha256,manifest.sha256)
  assert.deepEqual(f.calls.map(x=>x.phase),['claim','grant'])
  const visible=f.comments.map(x=>x.body).join('\n')
  for(const secret of ['private-event','private-run',scope.operation_id,'b'.repeat(64)])
    assert.equal(visible.includes(secret),false)
  assert.equal(f.comments.length,4)
})
test('GitHub actor, run commit and signed mailbox authorization are enforced',async()=>{
  const f=fixture(),scope={operation_id:f.approval.body.operation_id}
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
  const f=fixture(),scope={operation_id:f.approval.body.operation_id}
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
  const f=fixture(),scope={operation_id:f.approval.body.operation_id}
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
