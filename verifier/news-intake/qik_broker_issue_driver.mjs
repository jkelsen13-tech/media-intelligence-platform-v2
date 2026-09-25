// Synthetic broker-to-native-session integration; no provider/client credentials.
import {createInterface} from 'node:readline'
import {sign,randomUUID} from 'node:crypto'
import {issueWorkloadSession} from '../../supabase/qualification/mip-cutover-authority/brokerSession.js'
if(process.env.MIP_R5_ISOLATION!=='network-none-socket-only')throw Error('isolation required')
const lines=createInterface({input:process.stdin})[Symbol.asyncIterator]()
const next=async()=>{const line=await lines.next();if(line.done)throw Error('broker closed');return JSON.parse(line.value)}
const config=await next()
const now=Math.floor(Date.now()/1000),enc=value=>Buffer.from(JSON.stringify(value)).toString('base64url')
const body=enc({alg:'RS256',typ:'JWT',kid:'synthetic'})+'.'+enc({
 iss:'https://qualification.invalid',aud:'synthetic-broker',sub:config.runtime+':'+config.principal,
 iat:now,exp:now+500,jti:randomUUID()})
const token=body+'.'+sign('RSA-SHA256',Buffer.from(body),config.privateKey).toString('base64url')
const sql=async(name,args)=>{
 process.stdout.write(JSON.stringify({broker:name,args})+'\n')
 const reply=await next()
 if(reply.error)throw Error('broker refused')
 return reply.result
}
const session=await issueWorkloadSession({sql,token,runtime:config.runtime,principal:config.principal,request:randomUUID(),now})
process.stdout.write(JSON.stringify({session})+'\n')
process.exit(0)
