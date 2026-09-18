import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createStrictEftaJwtVerifier,eftaJwtCanonicalize} from '../supabase/qualification/mip-cutover-authority/eftaStrictJwt.mjs';

const ids={subject:'f576f162-b6c6-46b7-9aaf-96b1ea90e194',session:'11111111-1111-4111-8111-111111111111',
 auth:'22222222-2222-4222-8222-222222222222',key:'44444444-4444-4444-8444-444444444444'};
const issuer='https://qikvmopbtijoebdqosyq.supabase.co/auth/v1',kid='f11c0b62-e0f6-44fc-8663-75543b5a6f3d',now=2_000_000_000;
const b64=x=>Buffer.from(typeof x==='string'?x:JSON.stringify(x)).toString('base64url');

async function fixture(){
 const pair=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const jwk=await webcrypto.subtle.exportKey('jwk',pair.publicKey);Object.assign(jwk,{alg:'ES256',use:'sig',kid});
 const jwks={keys:[jwk]};
 const jwksSha256=Buffer.from(await webcrypto.subtle.digest('SHA-256',Buffer.from(eftaJwtCanonicalize(jwks)))).toString('hex');
 const verifier=createStrictEftaJwtVerifier({issuer,audience:'authenticated',authenticationRevision:ids.auth,
  keyRevision:ids.key,kid,jwks,jwksSha256,now:()=>now,crypto:webcrypto});
 async function token(claims={},header={}){
  const h=b64({alg:'ES256',typ:'JWT',kid,...header});
  const p=b64({iss:issuer,aud:'authenticated',role:'authenticated',is_anonymous:false,
   sub:ids.subject,session_id:ids.session,iat:now-60,exp:now+600,...claims});
  const sig=await webcrypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,Buffer.from(`${h}.${p}`));
  return `${h}.${p}.${Buffer.from(sig).toString('base64url')}`;
 }
 return {verifier,token,jwks,jwksSha256};
}

test('strict verifier derives governed revisions and binding from an exact ES256 token',async()=>{
 const f=await fixture(),raw=await f.token(),v=await f.verifier(raw);
 assert.equal(v.issuer,issuer);assert.equal(v.audience,'authenticated');assert.equal(v.sub,ids.subject);
 assert.equal(v.session_id,ids.session);assert.equal(v.algorithm,'ES256');assert.equal(v.kid,kid);
 assert.equal(v.authentication_revision,ids.auth);assert.equal(v.key_revision,ids.key);
 assert.match(v.token_binding_hash,/^[0-9a-f]{64}$/);
 assert.equal(JSON.stringify(v).includes(raw),false);
});

test('wrong issuer, audience, kid, malformed and expired tokens fail closed',async()=>{
 const f=await fixture();
 for(const raw of [await f.token({iss:'https://wrong.invalid'}),await f.token({aud:'anon'}),await f.token({exp:now}),
  await f.token({}, {kid:'legacy'}),'not.a.jwt','a.b']) await assert.rejects(f.verifier(raw),/efta_authentication_denied/);
});

test('HS256 and attacker-supplied key locations are rejected before signature acceptance',async()=>{
 const f=await fixture();
 for(const header of [{alg:'HS256'},{crit:['exp']},{jku:'https://attacker.invalid/jwks'},{jwk:{kty:'oct',k:'x'}},{x5u:'https://attacker.invalid/cert'}])
  await assert.rejects(f.verifier(await f.token({},header)),/efta_authentication_denied/);
});

test('unexpected JWKS lifecycle state, array audience and anonymous claims fail closed',async()=>{
 const f=await fixture();
 const changed={keys:[...f.jwks.keys,{...f.jwks.keys[0],kid:'unexpected'}]};
 assert.throws(()=>createStrictEftaJwtVerifier({issuer,audience:'authenticated',authenticationRevision:ids.auth,
  keyRevision:ids.key,kid,jwks:changed,jwksSha256:f.jwksSha256,now:()=>now,crypto:webcrypto}),/unconfigured/);
 for(const claims of [{aud:['authenticated']},{role:'anon'},{is_anonymous:true},{is_anonymous:undefined}])
  await assert.rejects(f.verifier(await f.token(claims)),/efta_authentication_denied/);
});
