// Server-only transaction adapter. The client implementation must use one exclusive
// connection, BEGIN/COMMIT with guaranteed rollback, TLS, max=1 and prepare=false.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH=/^[0-9a-f]{64}$/;
const AUTHENTICATOR='mip_efta_authenticator_v1';
const ASSERT='mip_identity.efta_assert_live_auth_session(uuid,uuid,uuid,uuid,uuid,text,uuid,text,text,text,text,text,uuid,text)';
const TARGETS=new Map([
 ['mip_identity.efta_private_read(uuid,uuid,text,uuid)','mip_efta_private_reader_v1'],
 ['mip_identity.efta_resolve_identity(uuid,text,uuid,uuid,text,text,uuid,text,uuid)','mip_efta_reviewer_v1'],
 ['mip_identity.efta_decide(uuid,uuid,text,uuid,jsonb,uuid,text,uuid)','mip_efta_reviewer_v1']
]);
const denied=()=>{throw Error('efta_broker_transaction_denied')};

export function createEftaAtomicBrokerSession({client,context,randomUUID=()=>crypto.randomUUID()}){
 if(!client||typeof client.transaction!=='function'||!context||!UUID.test(context.session_id??'')
  ||!UUID.test(context.auth_session_id??'')||!UUID.test(context.subject_id??'')
  ||!UUID.test(context.live_session_revision??'')
  ||!UUID.test(context.assignment_revision??'')||!UUID.test(context.authentication_revision??'')
  ||!UUID.test(context.mapping_revision??'')||!UUID.test(context.key_revision??'')
  ||!UUID.test(context.credential_revision??'')||!HASH.test(context.token_binding_hash??'')
  ||!HASH.test(context.jwks_sha256??'')||typeof context.issuer!=='string'||!context.issuer
  ||context.audience!=='authenticated'||context.algorithm!=='ES256'||typeof context.kid!=='string'||!context.kid
  ||typeof context.runtime!=='string'||!context.runtime||!TARGETS.has([...TARGETS].find(([,r])=>r===context.database_principal)?.[0]??''))
  throw Error('efta_broker_transaction_unconfigured');
 let closed=false;
 return Object.freeze({
  ...context,
  async invokeExact(signature,values,attribution){
   if(closed||TARGETS.get(signature)!==context.database_principal||!Array.isArray(values)
    ||attribution?.subject_principal!==`auth_user:${context.subject_id}`
    ||attribution?.authentication_revision!==context.authentication_revision
    ||attribution?.auth_session_id!==context.auth_session_id
    ||attribution?.live_session_revision!==context.live_session_revision
    ||attribution?.assignment_revision!==context.assignment_revision
    ||attribution?.mapping_revision!==context.mapping_revision||attribution?.key_revision!==context.key_revision
    ||attribution?.credential_revision!==context.credential_revision
    ||attribution?.token_binding_hash!==context.token_binding_hash
    ||attribution?.issuer!==context.issuer||attribution?.audience!==context.audience
    ||attribution?.algorithm!==context.algorithm||attribution?.kid!==context.kid
    ||attribution?.jwks_sha256!==context.jwks_sha256) denied();
   const receipt=randomUUID();if(!UUID.test(receipt)) denied();
   return client.transaction(async tx=>{
    if(!tx||typeof tx.setLocalRole!=='function'||typeof tx.invokeExact!=='function') denied();
    await tx.setLocalRole(AUTHENTICATOR);
    await tx.invokeExact(ASSERT,Object.freeze([receipt,context.auth_session_id,context.subject_id,
     context.authentication_revision,context.session_id,context.runtime,context.assignment_revision,
     context.token_binding_hash,context.issuer,context.audience,context.algorithm,context.kid,
     context.key_revision,context.jwks_sha256]));
    await tx.setLocalRole(context.database_principal);
    return tx.invokeExact(signature,Object.freeze([...values]));
   });
  },
  async close(){closed=true;if(typeof client.close==='function') await client.close()}
 });
}

export const eftaBrokerTransactionInternals=Object.freeze({authenticator:AUTHENTICATOR,assertionSignature:ASSERT});
