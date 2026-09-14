// Synthetic RS256 provider fixture, never production attestation or a real account.
import {generateKeyPairSync,sign,verify} from 'node:crypto'
export function syntheticAuthProvider(userId){
 const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048})
 const issuer='https://mip-auth.synthetic.invalid/auth/v1',audience='authenticated'
 const claims={iss:issuer,aud:audience,sub:userId,role:'authenticated',is_anonymous:false,
  session_id:'00000000-0000-4000-8000-000000000009',iat:Math.floor(Date.now()/1000)-1,exp:Math.floor(Date.now()/1000)+3600}
 const token=(changes={},key=privateKey)=>{
  const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url')
  const unsigned=encode({alg:'RS256',typ:'JWT'})+'.'+encode({...claims,...changes})
  return unsigned+'.'+sign('RSA-SHA256',Buffer.from(unsigned),key).toString('base64url')
 }
 const state={calls:[],revoked:false,userOverride:null}
 const fetchImpl=async(url,options)=>{
  state.calls.push({url,method:options.method,credentials:options.credentials,redirect:options.redirect})
  const jwt=new Headers(options.headers).get('authorization')?.slice(7),parts=jwt?.split('.')
  let valid=false
  try{valid=parts?.length===3&&verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),publicKey,Buffer.from(parts[2],'base64url'))}catch{}
  if(!valid||state.revoked)return new Response('{"code":"bad_jwt","msg":"Synthetic denial"}',{status:401,headers:{'content-type':'application/json'}})
  const p=JSON.parse(Buffer.from(parts[1],'base64url'))
  return new Response(JSON.stringify(state.userOverride??{id:p.sub,aud:p.aud,role:p.role,is_anonymous:p.is_anonymous,
   user_metadata:{synthetic_private_detail:'must not leave verifier'}}),{headers:{'content-type':'application/json'}})
 }
 return{configuration:{projectUrl:'https://mip-auth.synthetic.invalid',issuer,audience,
  publishableKey:'sb_publishable_synthetic_only',fetchImpl},token,state}
}
