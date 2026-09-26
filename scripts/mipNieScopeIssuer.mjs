import { randomUUID, sign, verify, createPublicKey, createHash } from 'node:crypto'
import { SOURCE_REF, DESTINATION_REF, FIELD_ALLOWLIST,
  sourceOperationScopeDigest, validateParentManifest } from './mipNieParentCustody.mjs'
import { stableStringify } from './mipLegacyGraphStaging.mjs'

const SHA = /^[a-f0-9]{64}$/
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
function fail(code) { throw Object.assign(Error(code), { code }) }
async function withAdminTransaction(connection, expectedProject, workerLogin, callback) {
  if (typeof connection?.connect !== 'function' || !connection.expectedLogin
      || connection.expectedLogin === workerLogin || typeof callback !== 'function') fail('issuer_connection_invalid')
  const client = await connection.connect()
  let begun=false, beginAcknowledged=false, committing=false, discard=true
  try {
    if (client?.connectionInfo?.projectRef !== expectedProject
        || client.connectionInfo.tlsVerified !== true) fail('issuer_endpoint_invalid')
    const identity=(await client.query(`select session_user as session_user,
      current_user as current_user,
      coalesce((select ssl from pg_stat_ssl where pid=pg_backend_pid()),false) as ssl`)).rows?.[0]
    if (identity?.session_user !== connection.expectedLogin
        || identity.current_user !== connection.expectedLogin || identity.ssl !== true) fail('issuer_identity_invalid')
    begun=true
    await client.query('begin')
    beginAcknowledged=true
    discard=false
    await client.query("set local lock_timeout = '5s'")
    await client.query("set local statement_timeout = '30s'")
    await client.query("set local idle_in_transaction_session_timeout = '2min'")
    const value=await callback(client)
    committing=true
    await client.query('commit')
    return value
  } catch (error) {
    discard=discard || committing || !beginAcknowledged
    if (begun) { try { await client.query('rollback') } catch { discard=true } }
    throw error
  } finally {
    if (typeof client?.release === 'function') await client.release(discard)
    else if (typeof client?.end === 'function') await client.end()
  }
}
function signBody(body, key) {
  return { body, signature: sign(null, Buffer.from(stableStringify(body)), key).toString('base64') }
}
function validExpiry(value) {
  const expiry=Date.parse(value)
  return Number.isFinite(expiry) && expiry>Date.now() && expiry<=Date.now()+30*60*1000
}
function boundedExpiry(scope) {
  const issuedAt=Date.parse(scope?.issued_at)
  const expiresAt=Date.parse(scope?.expires_at)
  const deadline=Math.min(expiresAt,issuedAt+scope.max_runtime_ms)
  if (!Number.isFinite(issuedAt) || issuedAt>Date.now()
      || issuedAt<Date.now()-30*60*1000 || !Number.isFinite(deadline)
      || deadline<=Date.now()) fail('issuer_operation_expired')
  return new Date(deadline).toISOString()
}
/** Source-free OPERATOR-SIDE provisioning contract. Never construct this
 * issuer in a GitHub worker: its signing key and administrator connections
 * belong to a separate, controlled operator context. The callback interface
 * in mipNieSupervisor is a transport seam, not in-process live wiring.
 * The administrator connections are separate from reader and writer.
 * They must be short-lived, verified transports with only reviewed scope DML.
 * The signing key must be held by a qualified operator, never the worker.
 */
export function createNarrowScopeIssuer({ sourceAdmin, destinationAdmin, signingKey,
  approvalPublicKey, approvalKeySha256 }) {
  if (!signingKey || typeof sourceAdmin?.connect !== 'function'
      || typeof destinationAdmin?.connect !== 'function'
      || !SHA.test(approvalKeySha256 ?? '')) fail('issuer_configuration_invalid')
  const approverKey=approvalPublicKey?.type==='public' ? approvalPublicKey : createPublicKey(approvalPublicKey)
  if (approverKey.asymmetricKeyType!=='ed25519'
      || createHash('sha256').update(approverKey.export({type:'spki',format:'der'})).digest('hex')!==approvalKeySha256) fail('issuer_approval_key_invalid')
  const issuerPublicKey=createPublicKey(signingKey)
  if (issuerPublicKey.asymmetricKeyType!=='ed25519') fail('issuer_signing_key_invalid')
  function verifyApproval(document, scope) {
    if (!document?.body || typeof document.signature!=='string'
        || stableStringify(document.body)!==stableStringify(scope)
        || !verify(null,Buffer.from(stableStringify(scope)),approverKey,
          Buffer.from(document.signature,'base64'))
        || stableStringify(scope.field_allowlist)!==stableStringify(FIELD_ALLOWLIST)
        || scope.scope_sha256!==sourceOperationScopeDigest({approvedIds:scope.approved_ids,
          runPrefix:scope.run_prefix,maxBytes:scope.max_bytes})
        || !Number.isSafeInteger(scope.max_runtime_ms) || scope.max_runtime_ms<1
        || scope.max_runtime_ms>15*60*1000) fail('issuer_approval_invalid')
    boundedExpiry(scope)
  }
  return {
    async claimOperation({ approval, scope }) {
      verifyApproval(approval,scope)
      if (scope?.source_project_ref !== SOURCE_REF || scope.destination_project_ref !== DESTINATION_REF
          || !UUID.test(scope.operation_id ?? '') || !SHA.test(scope.scope_sha256 ?? '')
          || !validExpiry(scope.expires_at)
          || !Array.isArray(scope.approved_ids?.events) || !Array.isArray(scope.approved_ids?.articles)
          || scope.approved_ids.events.length < 1 || scope.approved_ids.articles.length < 1
          || scope.approved_ids.events.length + scope.approved_ids.articles.length > 10000) fail('issuer_source_scope_invalid')
      const attemptId=randomUUID()
      const expiry=boundedExpiry(scope)
      await withAdminTransaction(sourceAdmin,SOURCE_REF,scope.source_login,async client=>{
        // Both primary keys make an operation one-use across processes. A lost
        // COMMIT acknowledgment never signs a claim; a retry must use a new UUID.
        const operation=await client.query(`insert into nie_parent_access.operations
          (login_name,operation_id,source_project_ref,expires_at)
          values ($1,$2::uuid,$3,$4::timestamptz)`,
        [scope.source_login,scope.operation_id,SOURCE_REF,expiry])
        if (operation.rowCount !== 1) fail('issuer_operation_not_unique')
        for (const table of ['events','articles']) {
          const ids=scope.approved_ids[table]
          const inserted=await client.query(`insert into nie_parent_access.allowed_source_ids
            (login_name,operation_id,source_project_ref,source_table,source_id,expires_at)
            select $1,$2::uuid,$3,$4,id,$5::timestamptz from unnest($6::uuid[]) as id`,
          [scope.source_login,scope.operation_id,SOURCE_REF,table,expiry,ids])
          if (inserted.rowCount !== ids.length) fail('issuer_source_ids_incomplete')
        }
      })
      return signBody({ version:'nie-parent-source-claim/v1',operation_id:scope.operation_id,
        attempt_id:attemptId,host_id:scope.host_id,scope_sha256:scope.scope_sha256,
        source_login:scope.source_login,expires_at:expiry },signingKey)
    },
    async authorizePages({ approval, scope, claim, claimDocument, manifest, pages }) {
      verifyApproval(approval,scope)
      validateParentManifest(manifest)
      if (manifest.run_prefix!==scope.run_prefix || manifest.max_bytes!==scope.max_bytes
          || manifest.source_group_scope_sha256!==scope.source_group_scope_sha256
          || ['events','articles'].some(table=>stableStringify(manifest.tables[table].rows.map(r=>r.id))
            !==stableStringify(scope.approved_ids[table]))) fail('issuer_manifest_scope_invalid')
      if (stableStringify(claimDocument?.body)!==stableStringify(claim)
          || !verify(null,Buffer.from(stableStringify(claim)),issuerPublicKey,
            Buffer.from(claimDocument?.signature ?? '','base64'))) fail('issuer_claim_invalid')
      if (scope?.destination_project_ref !== DESTINATION_REF
          || claim?.operation_id !== scope.operation_id || !UUID.test(claim?.attempt_id ?? '')
          || !SHA.test(scope.scope_sha256 ?? '') || !validExpiry(scope.expires_at)
          || claim.scope_sha256!==scope.scope_sha256 || !validExpiry(claim.expires_at)
          || !Array.isArray(pages) || pages.length < 2 || pages.length > 100
          || pages.some(p=>typeof p.run_id !== 'string' || p.run_id.length > 120
            || !['events','articles'].includes(p.source_table)
            || !SHA.test(p.page_sha256 ?? '')
            || !Number.isSafeInteger(p.page_size) || p.page_size < 1 || p.page_size > 100)
          || new Set(pages.map(p=>p.run_id)).size !== pages.length) fail('issuer_page_scope_invalid')
      // The supervisor derives these run IDs from the just-committed manifest.
      // The issuer independently checks the exact page count, table, size and
      // run IDs; page hashes are provided by the prepared payload digest.
      let i=0
      const installedPages=[]
      for (const table of ['events','articles']) {
        const rows=manifest.tables[table].rows
        for (let start=0;start<rows.length;start+=100) {
          const p=pages[i++], ordinal=Math.floor(start/100)
          if (p?.source_table!==table || p.page_size!==Math.min(100,rows.length-start)
              || p.run_id!==`${manifest.run_prefix}.${manifest.sha256}.${table}.${String(ordinal).padStart(4,'0')}`) fail('issuer_page_scope_invalid')
          installedPages.push({...p, expected_rows:rows.slice(start,start+100),
            expected_fields:[...FIELD_ALLOWLIST[table]].sort()})
        }
      }
      if (i!==pages.length) fail('issuer_page_scope_invalid')
      const expiry=new Date(Math.min(Date.parse(boundedExpiry(scope)),Date.parse(claim.expires_at))).toISOString()
      await withAdminTransaction(destinationAdmin,DESTINATION_REF,scope.destination_login,async client=>{
        // Serialize issuers for this signed run prefix. Any prior page, even
        // expired, means this operation already chose a manifest.
        const prefix=`${manifest.run_prefix}.`
        await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[prefix])
        const existing=(await client.query(`select count(*)::int as n
          from legacy_graph_staging.nie_parent_page_scope
          where left(run_id,length($1))=$1`,[prefix])).rows?.[0]?.n
        if (Number(existing)!==0) fail('issuer_manifest_already_granted')
        const inserted=await client.query(`insert into legacy_graph_staging.nie_parent_page_scope
          (login_name,run_id,source_project_ref,source_table,page_sha256,page_size,
            expires_at,approved_manifest_sha256,expected_rows,expected_fields)
          select $1,p.run_id,$2,p.source_table,p.page_sha256,p.page_size,$3::timestamptz,$4,
            p.expected_rows,p.expected_fields
          from jsonb_to_recordset($5::jsonb)
            as p(run_id text,source_table text,page_sha256 text,page_size integer,
              expected_rows jsonb,expected_fields jsonb)`,
        [scope.destination_login,SOURCE_REF,expiry,manifest.sha256,JSON.stringify(installedPages)])
        if (inserted.rowCount!==pages.length) fail('issuer_pages_incomplete')
      })
      return signBody({version:'nie-parent-page-grant/v1',operation_id:scope.operation_id,
        attempt_id:claim.attempt_id,scope_sha256:scope.scope_sha256,
        manifest_sha256:manifest.sha256,destination_login:scope.destination_login,
        pages,expires_at:expiry,receipt_id:randomUUID()},signingKey)
    },
  }
}
