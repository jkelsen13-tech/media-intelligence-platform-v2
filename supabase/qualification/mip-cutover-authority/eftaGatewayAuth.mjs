// Server-only, non-production gateway authorization. Never bundle this module.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH=/^[0-9a-f]{64}$/;
const SCOPE='efta-bounded-demo-v1';

export const EFTA_RPC_ALLOWLIST=Object.freeze({
 private_read:Object.freeze({principal:'mip_efta_private_reader_v1',signature:'mip_identity.efta_private_read(uuid,uuid,text,uuid)'}),
 resolve_identity:Object.freeze({principal:'mip_efta_reviewer_v1',signature:'mip_identity.efta_resolve_identity(uuid,text,uuid,uuid,text,text,uuid,text,uuid)'}),
 decide:Object.freeze({principal:'mip_efta_reviewer_v1',signature:'mip_identity.efta_decide(uuid,uuid,text,uuid,jsonb,uuid,text,uuid)'})
});

const denied=()=>{throw Error('efta_gateway_denied')};
const isUuid=x=>typeof x==='string'&&UUID.test(x);
const isTime=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));

function bearer(request){
 const value=request?.headers?.get?.('authorization');
 if(typeof value!=='string'||!/^Bearer [^\s,]+$/.test(value)) denied();
 return value.slice(7);
}

function validateToken(v,now,issuer,audience){
 if(!v||v.verified!==true||!isUuid(v.sub)||!isUuid(v.session_id)||typeof v.jti!=='string'||!v.jti
  ||!isUuid(v.authentication_revision)||!isUuid(v.mapping_revision)||!isUuid(v.key_revision)
  ||!HASH.test(v.token_binding_hash??'')
  ||v.issuer!==issuer||v.audience!==audience
  ||!Number.isFinite(v.expires_at)||v.expires_at<=now
  ||!Number.isFinite(v.not_before)||v.not_before>now) denied();
}

function validateAssignment(a,v,principal,now){
 if(!a||!isUuid(a.revision)||a.subject_id!==v.sub||a.subject_principal!==`auth_user:${v.sub}`
  ||a.database_principal!==principal||a.scope!==SCOPE||a.approval_state!=='owner_approved'
  ||a.active!==true||a.current!==true||!isUuid(a.mapping_revision)||!isUuid(a.key_revision)||!isUuid(a.credential_revision)
  ||a.mapping_revision!==v.mapping_revision||a.key_revision!==v.key_revision
  ||!HASH.test(a.owner_approval_receipt_hash??'')||!HASH.test(a.owner_approval_payload_hash??'')
  ||!isTime(a.valid_from)||!isTime(a.valid_until)
  ||Date.parse(a.valid_from)>now*1000||Date.parse(a.valid_until)<=now*1000) denied();
}

function validateBroker(b,v,a,principal,runtime){
 if(!b||!isUuid(b.session_id)||b.runtime!==runtime
  ||b.database_principal!==principal||b.subject_id!==v.sub
  ||b.assignment_revision!==a.revision||b.authentication_revision!==v.authentication_revision
  ||b.mapping_revision!==v.mapping_revision||b.key_revision!==v.key_revision
  ||b.credential_revision!==a.credential_revision||typeof b.invokeExact!=='function'||typeof b.close!=='function'
  ||Object.keys(b).some(k=>/password|secret|database_url|dsn|access_token/i.test(k))) denied();
}

export function createEftaGatewayAuthority(deps){
 const {verifyAccessToken,checkRevocation,lookupAssignment,openBrokerSession}=deps??{};
 if([verifyAccessToken,checkRevocation,lookupAssignment,openBrokerSession].some(x=>typeof x!=='function'))
  throw Error('efta_gateway_unconfigured');
 if(typeof deps.issuer!=='string'||!deps.issuer||typeof deps.audience!=='string'||!deps.audience
  ||typeof deps.runtime!=='string'||!deps.runtime) throw Error('efta_gateway_unconfigured');
 const now=typeof deps.now==='function'?deps.now:()=>Math.floor(Date.now()/1000);
 return Object.freeze({async invoke(request,operation,buildArgs){
  const spec=EFTA_RPC_ALLOWLIST[operation];
  if(!spec||typeof buildArgs!=='function') denied();
  const raw=bearer(request),verified=await verifyAccessToken(raw);
  validateToken(verified,now(),deps.issuer,deps.audience);
  const revocationInput=Object.freeze({subject_id:verified.sub,jti:verified.jti,
   auth_session_id:verified.session_id,authentication_revision:verified.authentication_revision,
   token_binding_hash:verified.token_binding_hash});
  const first=await checkRevocation(revocationInput);
  if(!first||first.revoked!==false||!isUuid(first.revision)) denied();
  const assignment=await lookupAssignment(Object.freeze({subject_id:verified.sub,
   subject_principal:`auth_user:${verified.sub}`,database_principal:spec.principal,scope:SCOPE}));
  validateAssignment(assignment,verified,spec.principal,now());
  const broker=await openBrokerSession(Object.freeze({subject_id:verified.sub,
   subject_principal:`auth_user:${verified.sub}`,database_principal:spec.principal,
   assignment_revision:assignment.revision,authentication_revision:verified.authentication_revision,
   mapping_revision:verified.mapping_revision,key_revision:verified.key_revision,
   credential_revision:assignment.credential_revision,token_binding_hash:verified.token_binding_hash,
   revocation_revision:first.revision}));
  if(!broker||typeof broker.close!=='function') denied();
  try{
   validateBroker(broker,verified,assignment,spec.principal,deps.runtime);
   const second=await checkRevocation(revocationInput);
   if(!second||second.revoked!==false||second.revision!==first.revision) denied();
   const values=buildArgs(Object.freeze({session:broker.session_id,runtime:broker.runtime,
    assignment:assignment.revision,subject_principal:`auth_user:${verified.sub}`}));
   if(!Array.isArray(values)) denied();
   return await broker.invokeExact(spec.signature,Object.freeze([...values]),Object.freeze({
    subject_principal:`auth_user:${verified.sub}`,assignment_revision:assignment.revision,
    authentication_revision:verified.authentication_revision,broker_session:broker.session_id,
    mapping_revision:verified.mapping_revision,key_revision:verified.key_revision,
    credential_revision:assignment.credential_revision,token_binding_hash:verified.token_binding_hash,
    revocation_revision:first.revision,database_principal:spec.principal
   }));
  } finally {await broker.close();}
 }});
}

export const eftaGatewayInternals=Object.freeze({scope:SCOPE});

