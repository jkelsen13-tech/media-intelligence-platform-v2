import { createCipheriv, createDecipheriv, createHash, createPublicKey,
  diffieHellman, generateKeyPairSync, hkdfSync, randomBytes, randomUUID,
  verify } from 'node:crypto'
import { deflateRawSync, inflateRawSync } from 'node:zlib'
import { stableStringify } from './mipLegacyGraphStaging.mjs'
import { authorityKeySha256 } from './mipNieSupervisor.mjs'

const PREFIX = 'NIE_CHANNEL_V1:'
const SHA = /^[a-f0-9]{64}$/
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const HEX40 = /^[a-f0-9]{40}$/
const MAX_COMMENT = 48000
const MAX_PLAINTEXT = 2 * 1024 * 1024
const CHANNEL_KEYS = ['version','repository','repository_id','issue_number','run_id',
  'run_actor_id','worker_comment_actor_id','head_sha','operator_comment_actor_id',
  'operator_key_sha256',
  'approval_sha256','issued_at','expires_at']
function fail(code) { throw Object.assign(Error(code), { code }) }
function exact(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
}
function digest(value) { return createHash('sha256').update(stableStringify(value)).digest('hex') }
function keyDer(key) { return key.export({ type:'spki', format:'der' }).toString('base64url') }
function peerKey(der) {
  if (typeof der !== 'string' || der.length > 200) fail('channel_peer_invalid')
  const key = createPublicKey({ key:Buffer.from(der,'base64url'), type:'spki', format:'der' })
  if (key.asymmetricKeyType !== 'x25519') fail('channel_peer_invalid')
  return key
}
function seal(value, recipient, aad) {
  const { privateKey, publicKey } = generateKeyPairSync('x25519')
  const salt = randomBytes(16), iv = randomBytes(12)
  const key = hkdfSync('sha256',diffieHellman({privateKey,publicKey:recipient}),salt,
    Buffer.from('nie-issue-channel/v1'),32)
  const cipher = createCipheriv('aes-256-gcm',key,iv)
  cipher.setAAD(Buffer.from(aad))
  const compressed = deflateRawSync(Buffer.from(stableStringify(value)))
  const ciphertext = Buffer.concat([cipher.update(compressed),cipher.final()])
  return { epk:keyDer(publicKey),salt:salt.toString('base64url'),
    iv:iv.toString('base64url'),ct:ciphertext.toString('base64url'),
    tag:cipher.getAuthTag().toString('base64url') }
}
function open(envelope, recipient, aad) {
  try {
    if (!exact(envelope,['epk','salt','iv','ct','tag']) || envelope.ct.length > MAX_COMMENT) fail('channel_ciphertext_invalid')
    const salt=Buffer.from(envelope.salt,'base64url'),iv=Buffer.from(envelope.iv,'base64url')
    const tag=Buffer.from(envelope.tag,'base64url')
    if (salt.length!==16 || iv.length!==12 || tag.length!==16) fail('channel_ciphertext_invalid')
    const key=hkdfSync('sha256',diffieHellman({privateKey:recipient,publicKey:peerKey(envelope.epk)}),
      salt,Buffer.from('nie-issue-channel/v1'),32)
    const decipher=createDecipheriv('aes-256-gcm',key,iv)
    decipher.setAAD(Buffer.from(aad));decipher.setAuthTag(tag)
    const plain=inflateRawSync(Buffer.concat([decipher.update(Buffer.from(envelope.ct,'base64url')),
      decipher.final()]),{maxOutputLength:MAX_PLAINTEXT})
    return JSON.parse(plain.toString('utf8'))
  } catch { fail('channel_ciphertext_invalid') }
}
function encode(envelope) {
  const body=PREFIX+Buffer.from(stableStringify(envelope)).toString('base64url')
  if (body.length>MAX_COMMENT) fail('channel_comment_too_large')
  return body
}
function decode(body) {
  if (typeof body!=='string' || !body.startsWith(PREFIX) || body.length>MAX_COMMENT) return null
  try { return JSON.parse(Buffer.from(body.slice(PREFIX.length),'base64url').toString('utf8')) }
  catch { return null }
}
function aad(binding, requestId, phase, direction) {
  return stableStringify({binding,request_id:requestId,phase,direction})
}
function verifiedAuthorization({authorization,approval,approvalPublicKey,approvalKeySha256,
  operatorPublicKey,context,now=Date.now()}) {
  if (!exact(authorization,['body','signature']) || !exact(authorization.body,CHANNEL_KEYS)
      || typeof authorization.signature!=='string') fail('channel_authorization_invalid')
  const owner=approvalPublicKey?.type==='public' ? approvalPublicKey : createPublicKey(approvalPublicKey)
  if (owner.asymmetricKeyType!=='ed25519' || authorityKeySha256(owner)!==approvalKeySha256
      || !verify(null,Buffer.from(stableStringify(authorization.body)),owner,
        Buffer.from(authorization.signature,'base64'))) fail('channel_authorization_invalid')
  const b=authorization.body
  const operator=peerKey(operatorPublicKey)
  const issuedAt=Date.parse(b.issued_at),expiresAt=Date.parse(b.expires_at)
  if (b.version!=='nie-issue-channel/v1' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(b.repository)
      || !Number.isSafeInteger(b.repository_id) || b.repository_id<1
      || !Number.isSafeInteger(b.issue_number) || b.issue_number<1
      || !Number.isSafeInteger(b.run_id) || b.run_id<1
      || !Number.isSafeInteger(b.run_actor_id) || b.run_actor_id<1
      || !Number.isSafeInteger(b.worker_comment_actor_id) || b.worker_comment_actor_id<1
      || !Number.isSafeInteger(b.operator_comment_actor_id) || b.operator_comment_actor_id<1
      || !HEX40.test(b.head_sha) || !SHA.test(b.approval_sha256)
      || b.operator_key_sha256!==createHash('sha256').update(operator.export({type:'spki',format:'der'})).digest('hex')
      || (approval!==undefined && b.approval_sha256!==digest(approval))
      || Object.entries(context).some(([k,v])=>b[k]!==v)
      || !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)
      || issuedAt>now || expiresAt<=now
      || expiresAt>issuedAt+15*60*1000
      || (approval!==undefined && approval?.body?.host_id!==String(b.run_id))) fail('channel_scope_invalid')
  return {binding:digest(authorization),operator}
}
function validComment(comment,actorId,issueUrl,afterId=0) {
  return Number.isSafeInteger(comment?.id) && comment.id>afterId
    && comment.user?.id===actorId && comment.issue_url===issueUrl
    && typeof comment.created_at==='string' && Number.isFinite(Date.parse(comment.created_at))
}
function sameRun(run,b) {
  return run?.id===b.run_id && run?.repository?.id===b.repository_id
    && run?.head_sha===b.head_sha && run?.actor?.id===b.run_actor_id
    && ['queued','in_progress'].includes(run.status)
}

/** GitHub is a durable encrypted metadata copy, not a payload store. The caller
 * must provision a dedicated private issue and narrowly reviewed Issues write
 * tokens. Neither this factory nor its callers create issues or tokens.
 */
export function createGitHubIssueStore({repository,issueNumber,token,fetchImpl=fetch}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)
      || !Number.isSafeInteger(issueNumber) || issueNumber<1 || !token) fail('channel_store_invalid')
  const root=`https://api.github.com/repos/${repository}`
  const issueUrl=`${root}/issues/${issueNumber}`
  async function request(path,method='GET',body) {
    const response=await fetchImpl(`${root}${path}`,{method,
      headers:{Accept:'application/vnd.github+json',Authorization:`Bearer ${token}`,
        'X-GitHub-Api-Version':'2022-11-28',...(body?{'Content-Type':'application/json'}:{})},
      body:body?JSON.stringify(body):undefined,redirect:'error'})
    if (!response.ok) fail('channel_github_unavailable')
    return response.json()
  }
  return {issueUrl,
    async list() {
      const comments=[]
      for(let page=1;page<=10;page++) {
        const batch=await request(`/issues/${issueNumber}/comments?per_page=100&page=${page}`)
        if (!Array.isArray(batch)) fail('channel_github_invalid')
        comments.push(...batch)
        if (batch.length<100) return comments
      }
      fail('channel_mailbox_overflow')
    },
    post:body=>request(`/issues/${issueNumber}/comments`,'POST',{body}),
    getRun:runId=>request(`/actions/runs/${runId}`),
  }
}

/** Worker callbacks used directly by superviseNarrowParentCustody. No operator
 * key, administrator connection, payload or plaintext selected ID enters GitHub.
 */
export function createWorkerIssueCallbacks({store,authorization,approvalPublicKey,
  approvalKeySha256,operatorPublicKey,context,now=()=>Date.now(),
  pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),pollMs=1000}) {
  async function exchange(phase,request,approval) {
    if (!exact(request,phase==='claim'?['approval','scope']:
      ['approval','scope','claim','claimDocument','manifest','pages'])
        || (phase==='grant' && (!Array.isArray(request.pages)
          || request.pages.some(p=>!exact(p,['run_id','source_table','page_sha256','page_size']))))) {
      fail('channel_request_shape_invalid')
    }
    const {binding,operator}=verifiedAuthorization({authorization,approval,
      approvalPublicKey,approvalKeySha256,operatorPublicKey,context,now:now()})
    const b=authorization.body, run=await store.getRun(b.run_id)
    if (!sameRun(run,b)) fail('channel_run_invalid')
    const requestId=randomUUID(),reply=generateKeyPairSync('x25519')
    const payload={version:'nie-issue-request/v1',binding,request_id:requestId,
      phase,reply_key:keyDer(reply.publicKey),authorization,request}
    const posted=await store.post(encode({version:'nie-issue-envelope/v1',binding,
      request_id:requestId,phase,direction:'request',
      sealed:seal(payload,operator,aad(binding,requestId,phase,'request'))}))
    if (!validComment(posted,b.worker_comment_actor_id,store.issueUrl)) fail('channel_request_post_invalid')
    while(now()<Date.parse(b.expires_at)) {
      for(const comment of await store.list()) {
        if (!validComment(comment,b.operator_comment_actor_id,store.issueUrl,posted.id)
            || Date.parse(comment.created_at)>Date.parse(b.expires_at)) continue
        const envelope=decode(comment.body)
        if (!envelope || !exact(envelope,['version','binding','request_id','phase','direction','sealed'])
            || envelope.version!=='nie-issue-envelope/v1' || envelope.binding!==binding
            || envelope.request_id!==requestId || envelope.phase!==phase
            || envelope.direction!=='response') continue
        const result=open(envelope.sealed,reply.privateKey,aad(binding,requestId,phase,'response'))
        if (!exact(result,['version','binding','request_id','phase','document'])
            || result.version!=='nie-issue-response/v1' || result.binding!==binding
            || result.request_id!==requestId || result.phase!==phase) fail('channel_response_invalid')
        return result.document
      }
      await pause(Math.min(pollMs,Math.max(0,Date.parse(b.expires_at)-now())))
    }
    fail('channel_response_expired')
  }
  return {
    claimOperation:request=>exchange('claim',request,request.approval),
    authorizePages:request=>exchange('grant',request,request.approval),
  }
}

/** Run off the worker host. issuer is createNarrowScopeIssuer with local admin
 * transports and local Ed25519 key. processOnce handles one authenticated
 * comment; the operator controls polling, review and process lifetime.
 */
export function createOperatorIssueProcessor({store,authorization,approvalPublicKey,
  approvalKeySha256,operatorPrivateKey,issuer,context,now=()=>Date.now()}) {
  const operatorPublicKey=keyDer(createPublicKey(operatorPrivateKey))
  const handled=new Set()
  async function processOnce() {
    const b=authorization.body
    for(const comment of await store.list()) {
      if (handled.has(comment.id) || !validComment(comment,b.worker_comment_actor_id,store.issueUrl)) continue
      const envelope=decode(comment.body)
      if (!envelope || !exact(envelope,['version','binding','request_id','phase','direction','sealed'])
          || envelope.version!=='nie-issue-envelope/v1' || envelope.direction!=='request'
          || !UUID.test(envelope.request_id ?? '') || !['claim','grant'].includes(envelope.phase)) continue
      handled.add(comment.id)
      const {binding}=verifiedAuthorization({authorization,
        approval:undefined,approvalPublicKey,approvalKeySha256,
        operatorPublicKey,context,now:now()})
      // The approval hash is checked after decryption. No untrusted request can
      // provision an ID or page merely by impersonating a GitHub comment actor.
      if (envelope.binding!==binding) continue
      const run=await store.getRun(b.run_id)
      if (!sameRun(run,b) || Date.parse(comment.created_at)<Date.parse(b.issued_at)
          || Date.parse(comment.created_at)>Date.parse(b.expires_at)) fail('channel_run_invalid')
      const decoded=open(envelope.sealed,operatorPrivateKey,
        aad(binding,envelope.request_id,envelope.phase,'request'))
      if (!exact(decoded,['version','binding','request_id','phase','reply_key','authorization','request'])
          || decoded.version!=='nie-issue-request/v1' || decoded.binding!==binding
          || decoded.request_id!==envelope.request_id || decoded.phase!==envelope.phase
          || stableStringify(decoded.authorization)!==stableStringify(authorization)
          || !exact(decoded.request,envelope.phase==='claim'?['approval','scope']:
            ['approval','scope','claim','claimDocument','manifest','pages'])
          || (envelope.phase==='grant' && (!Array.isArray(decoded.request.pages)
            || decoded.request.pages.some(p=>!exact(p,['run_id','source_table','page_sha256','page_size']))))) {
        fail('channel_request_invalid')
      }
      verifiedAuthorization({authorization,approval:decoded.request.approval,
        approvalPublicKey,approvalKeySha256,operatorPublicKey,context,now:now()})
      const replyKey=peerKey(decoded.reply_key)
      const document=envelope.phase==='claim'
        ? await issuer.claimOperation(decoded.request)
        : await issuer.authorizePages(decoded.request)
      const response={version:'nie-issue-response/v1',binding,
        request_id:envelope.request_id,phase:envelope.phase,document}
      const posted=await store.post(encode({version:'nie-issue-envelope/v1',binding,
        request_id:envelope.request_id,phase:envelope.phase,direction:'response',
        sealed:seal(response,replyKey,aad(binding,envelope.request_id,envelope.phase,'response'))}))
      if (!validComment(posted,b.operator_comment_actor_id,store.issueUrl,comment.id)) fail('channel_response_post_invalid')
      return {phase:envelope.phase,requestCommentId:comment.id,responseCommentId:posted.id}
    }
    return null
  }
  return {processOnce}
}
