import { createHash, createPublicKey, verify } from 'node:crypto'
import { FIELD_ALLOWLIST, SOURCE_REF, DESTINATION_REF,
  prepareNarrowPgParentCustody, writePreparedParentCustody,
  sourceOperationScopeDigest } from './mipNieParentCustody.mjs'
import { MAX_PAGE_SIZE, fingerprintPayload, stableStringify } from './mipLegacyGraphStaging.mjs'

const SHA = /^[a-f0-9]{64}$/
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const REQUIRED_APPROVAL = ['version','operation_id','host_id','source_login',
  'destination_login','source_project_ref','destination_project_ref',
  'source_endpoint_host','destination_endpoint_host','approved_ids',
  'field_allowlist','run_prefix','max_bytes','max_runtime_ms','expires_at',
  'scope_sha256','source_group_scope_sha256','permission_basis_id',
  'retention_contract_id','route_id','cost_boundary_id']
function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
}
function keyWithPin(pem, expectedSha256) {
  if (!SHA.test(expectedSha256 ?? '')) throw Error('authority_key_unpinned')
  const key = pem?.type === 'public' ? pem : createPublicKey(pem)
  if (key.asymmetricKeyType !== 'ed25519'
      || createHash('sha256').update(key.export({ type:'spki', format:'der' })).digest('hex') !== expectedSha256) {
    throw Error('authority_key_mismatch')
  }
  return key
}
function signedBody(document, key, keys) {
  if (!exactKeys(document, ['body','signature']) || !exactKeys(document.body, keys)
      || typeof document.signature !== 'string'
      || !/^[A-Za-z0-9+/]{86}==$/.test(document.signature)) throw Error('authority_document_invalid')
  const signature = Buffer.from(document.signature, 'base64')
  if (!verify(null, Buffer.from(stableStringify(document.body)), key, signature)) {
    throw Error('authority_signature_invalid')
  }
  return document.body
}
function liveExpiry(value, now) {
  const time = Date.parse(value)
  return Number.isFinite(time) && time > now && time <= now + 30 * 60 * 1000
}
function expectedPages(preparedCustody) {
  const pages = []
  let index = 0
  for (const table of ['events','articles']) {
    const rows = preparedCustody.manifest.tables[table].rows
    for (let start = 0; start < rows.length; start += MAX_PAGE_SIZE) {
      const ordinal = Math.floor(start / MAX_PAGE_SIZE)
      pages.push({ run_id: `${preparedCustody.manifest.run_prefix}.${preparedCustody.manifest.sha256}.${table}.${String(ordinal).padStart(4,'0')}`,
        source_table: table, page_sha256: fingerprintPayload(preparedCustody.prepared[index]),
        page_size: preparedCustody.prepared[index].length })
      index++
    }
  }
  return pages
}

/** The issuer callbacks are privileged, unprovisioned dependencies. Their
 * persistent implementation must consume an operation only once and install
 * the exact source and qik SQL scopes before signing either receipt.
 */
export async function superviseNarrowParentCustody({ approval, approvalPublicKey,
  approvalKeySha256, issuerPublicKey, issuerKeySha256, hostId,
  sourceConnection, destination, claimOperation, authorizePages,
  now = () => Date.now() }) {
  const approverKey = keyWithPin(approvalPublicKey, approvalKeySha256)
  const issuerKey = keyWithPin(issuerPublicKey, issuerKeySha256)
  const scope = signedBody(approval, approverKey, REQUIRED_APPROVAL)
  const start = now()
  if (scope.version !== 'nie-parent-operation/v1' || !UUID.test(scope.operation_id ?? '')
      || scope.host_id !== hostId || scope.source_project_ref !== SOURCE_REF
      || scope.destination_project_ref !== DESTINATION_REF
      || scope.source_login !== sourceConnection?.expectedLogin
      || scope.destination_login !== destination?.expectedLogin
      || sourceConnection.requireTls === false || destination.requireTls === false
      || scope.source_endpoint_host !== sourceConnection?.connect?.endpointHost
      || scope.destination_endpoint_host !== destination?.endpointHost
      || stableStringify(scope.field_allowlist) !== stableStringify(FIELD_ALLOWLIST)
      || !SHA.test(scope.source_group_scope_sha256 ?? '')
      || !Number.isSafeInteger(scope.max_runtime_ms) || scope.max_runtime_ms < 1
      || scope.max_runtime_ms > 15 * 60 * 1000 || !liveExpiry(scope.expires_at, start)
      || !scope.permission_basis_id || !scope.retention_contract_id
      || !scope.route_id || !scope.cost_boundary_id
      || scope.scope_sha256 !== sourceOperationScopeDigest({
        approvedIds: scope.approved_ids, runPrefix: scope.run_prefix, maxBytes: scope.max_bytes })
      || typeof claimOperation !== 'function' || typeof authorizePages !== 'function') {
    throw Error('operation_approval_invalid')
  }
  const deadline = Math.min(Date.parse(scope.expires_at), start + scope.max_runtime_ms)
  const claimDocument = await claimOperation({ approval, scope })
  const claimed = signedBody(claimDocument, issuerKey,
    ['version','operation_id','attempt_id','host_id','scope_sha256','source_login','expires_at'])
  if (claimed.version !== 'nie-parent-source-claim/v1' || claimed.operation_id !== scope.operation_id
      || !UUID.test(claimed.attempt_id ?? '') || claimed.host_id !== hostId
      || claimed.scope_sha256 !== scope.scope_sha256 || claimed.source_login !== scope.source_login
      || !liveExpiry(claimed.expires_at, now()) || Date.parse(claimed.expires_at) > deadline) {
    throw Error('operation_claim_invalid')
  }
  // The issuer has installed exact source IDs before any payload connection.
  const preparedCustody = await prepareNarrowPgParentCustody({ sourceConnection,
    approvedIds: scope.approved_ids, runPrefix: scope.run_prefix, maxBytes: scope.max_bytes,
    operationAuthorization: { mode:'owner_approved', private_host:true,
      operation_id:scope.operation_id, source_login:scope.source_login,
      source_project_ref:SOURCE_REF, destination_project_ref:DESTINATION_REF,
      scope_sha256:scope.scope_sha256, host_id:hostId,
      source_group_scope_sha256:scope.source_group_scope_sha256,
      permission_basis_id:scope.permission_basis_id,
      retention_contract_id:scope.retention_contract_id,
      route_id:scope.route_id, cost_boundary_id:scope.cost_boundary_id } })
  if (now() >= deadline) throw Error('operation_expired_after_source_commit')
  const pages = expectedPages(preparedCustody)
  const grant = signedBody(await authorizePages({ approval, scope, claim: claimed, claimDocument,
    manifest: preparedCustody.manifest, pages }), issuerKey,
  ['version','operation_id','attempt_id','scope_sha256','manifest_sha256',
    'destination_login','pages','expires_at','receipt_id'])
  if (grant.version !== 'nie-parent-page-grant/v1' || grant.operation_id !== scope.operation_id
      || grant.attempt_id !== claimed.attempt_id || grant.scope_sha256 !== scope.scope_sha256
      || grant.manifest_sha256 !== preparedCustody.manifest.sha256
      || grant.destination_login !== scope.destination_login
      || !grant.receipt_id || stableStringify(grant.pages) !== stableStringify(pages)
      || !liveExpiry(grant.expires_at, now()) || Date.parse(grant.expires_at) > deadline) {
    throw Error('destination_page_grant_invalid')
  }
  // All pages must complete inside the same operation window. The writer
  // adapter handles each page atomically and never retries an uncertain page.
  const boundedDestination = {
    rpc: destination.rpc,
    withPageTransaction: callback => {
      if (now() >= deadline || now() >= Date.parse(grant.expires_at)) throw Error('operation_expired')
      return destination.withPageTransaction(callback)
    },
    readStaged: request => {
      if (now() >= deadline || now() >= Date.parse(grant.expires_at)) throw Error('operation_expired')
      return destination.readStaged(request)
    },
  }
  const result = await writePreparedParentCustody({ preparedCustody,
    destination: boundedDestination,
    authorization: { mode:'owner_approved', manifest_sha256:preparedCustody.manifest.sha256,
      private_host:true, permission_basis_id:scope.permission_basis_id,
      retention_contract_id:scope.retention_contract_id, route_id:scope.route_id,
      cost_boundary_id:scope.cost_boundary_id, operation_id:scope.operation_id,
      operation_scope_sha256:scope.scope_sha256,
      scope_provisioning_receipt_id:grant.receipt_id } })
  return { ...result, operation_id:scope.operation_id, attempt_id:claimed.attempt_id }
}

export function authorityKeySha256(publicKey) {
  const key = publicKey?.type === 'public' ? publicKey : createPublicKey(publicKey)
  return createHash('sha256').update(key.export({ type:'spki', format:'der' })).digest('hex')
}
