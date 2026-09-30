import {randomUUID,createHash} from 'node:crypto'
import {runDurableGenerationWorker,recoverGenerationRequest} from '../../supabase/functions/source-comparison-generation-candidate/durableWorker.js'
import {createInterface} from 'node:readline'
import {access} from 'node:fs/promises'
const forbidden=['/var/run/docker.sock','/work/verifier/integrated/transport.mjs','/root/.aws/credentials','/work/.git/config']
for(const path of forbidden){try{await access(path);throw Error('mip_boundary_exposed')}catch(e){if(e.message==='mip_boundary_exposed')throw e}}
if(process.getuid()!==65534||Object.keys(process.env).some(k=>/SERVICE_ROLE|PGPASSWORD|SUPABASE|GITHUB_TOKEN|AWS_SECRET|AZURE|GOOGLE_APPLICATION_CREDENTIALS/.test(k)))throw Error('mip_boundary_exposed')
process.send=value=>process.stdout.write(JSON.stringify(value)+'\n')
const lines=createInterface({input:process.stdin})
let next=0;const pending=new Map()
const send=(kind,name,args)=>new Promise((resolve,reject)=>{
 const id=++next;pending.set(id,{resolve,reject});process.send({id,kind,name,args})
})
lines.on('line',line=>{
 const message=JSON.parse(line)
 if(message.reply){const p=pending.get(message.id);pending.delete(message.id);if(message.error)p.reject(Error(message.error));else p.resolve(message.result);return}
 if(message.start){
  const {session,runtime,key}=message
  const rpc=(name,args)=>send('rpc',name,args)
  const journal={putOnce:(k,v)=>send('journal','putOnce',[k,v]),get:k=>send('journal','get',[k])}
  const options={rpc,journal,session,runtime,implementation:'isolated-event-projection-candidate',requestId:()=>randomUUID(),sha256:s=>createHash('sha256').update(s).digest('hex')}
  const work=key?recoverGenerationRequest({...options,key}):runDurableGenerationWorker(options)
  work.then(result=>process.send({done:true,state:typeof result==='string'?result:result.state}))
   .catch(()=>process.send({done:true,state:'denied'}))
 }
})
