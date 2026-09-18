// Server-only strict Supabase access-token verifier for the EFTA gateway.
// It deliberately does not accept legacy HS256 tokens or Supabase API keys.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH=/^[0-9a-f]{64}$/;
const denied=()=>{throw Error('efta_authentication_denied')};

function decode(segment){
 if(typeof segment!=='string'||!segment||!/^[A-Za-z0-9_-]+$/.test(segment)) denied();
 const padded=segment.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((segment.length+3)%4);
 let raw;try{raw=atob(padded)}catch{denied()}
 return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
function json(segment){
 try{return JSON.parse(new TextDecoder().decode(decode(segment)))}catch{denied()}
}
function hex(bytes){return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function exactAudience(value,expected){return typeof value==='string'&&value===expected}
function canonical(value){
 if(Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
 if(value&&typeof value==='object') return `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
 return JSON.stringify(value);
}

export function createStrictEftaJwtVerifier(config){
 const {issuer,audience,authenticationRevision,keyRevision,kid,jwks,jwksSha256}=config??{};
 const jwk=Array.isArray(jwks?.keys)&&jwks.keys.length===1?jwks.keys[0]:null;
 if(typeof issuer!=='string'||!issuer||audience!=='authenticated'||!UUID.test(authenticationRevision??'')
  ||!UUID.test(keyRevision??'')||typeof kid!=='string'||!kid||!HASH.test(jwksSha256??'')
  ||!jwk||jwk.kty!=='EC'||jwk.crv!=='P-256'||jwk.alg!=='ES256'||jwk.use!=='sig'||jwk.kid!==kid)
  throw Error('efta_authentication_unconfigured');
 const now=typeof config.now==='function'?config.now:()=>Math.floor(Date.now()/1000);
 const cryptoApi=config.crypto??globalThis.crypto;
 if(!cryptoApi?.subtle) throw Error('efta_authentication_unconfigured');
 let keyPromise;
 const key=()=>keyPromise??=(async()=>{
  const digest=hex(await cryptoApi.subtle.digest('SHA-256',new TextEncoder().encode(canonical(jwks))));
  if(digest!==jwksSha256) denied();
  return cryptoApi.subtle.importKey('jwk',jwk,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
 })().catch(()=>denied());
 return Object.freeze(async raw=>{
  if(typeof raw!=='string'||raw.length>16384) denied();
  const parts=raw.split('.');if(parts.length!==3) denied();
  const header=json(parts[0]),claims=json(parts[1]),signature=decode(parts[2]);
  if(header?.alg!=='ES256'||header?.kid!==kid||header?.crit!==undefined
   ||header?.jwk!==undefined||header?.jku!==undefined||header?.x5u!==undefined
   ||signature.length!==64) denied();
  const input=new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  if(!await cryptoApi.subtle.verify({name:'ECDSA',hash:'SHA-256'},await key(),signature,input)) denied();
  const observed=now();
  if(claims?.iss!==issuer||!exactAudience(claims?.aud,audience)||claims?.role!=='authenticated'||claims?.is_anonymous!==false
   ||!UUID.test(claims?.sub??'')
   ||!UUID.test(claims?.session_id??'')||!Number.isFinite(claims?.exp)||claims.exp<=observed
   ||!Number.isFinite(claims?.iat)||claims.iat>observed
   ||(claims.nbf!==undefined&&(!Number.isFinite(claims.nbf)||claims.nbf>observed))) denied();
  const digest=hex(await cryptoApi.subtle.digest('SHA-256',new TextEncoder().encode(raw)));
  if(!HASH.test(digest)) denied();
  return Object.freeze({verified:true,sub:claims.sub,session_id:claims.session_id,
   issuer:claims.iss,audience:claims.aud,expires_at:claims.exp,issued_at:claims.iat,
   not_before:claims.nbf??claims.iat,algorithm:'ES256',kid,key_revision:keyRevision,
   authentication_revision:authenticationRevision,jwks_sha256:jwksSha256,token_binding_hash:digest});
 });
}

export const eftaJwtCanonicalize=canonical;
