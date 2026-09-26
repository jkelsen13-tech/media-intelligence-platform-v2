// Existing remote host only. No deployment, administrator credential or install.
import {createInterface} from 'node:readline/promises'
import {Writable} from 'node:stream'
import {runNativeHost} from './nativeHost.mjs'
async function hidden(label){
 if(!process.stdin.isTTY)throw Error('native_host_prompt_requires_tty')
 const muted=new Writable({write(_chunk,_encoding,done){done()}})
 const prompt=createInterface({input:process.stdin,output:muted,terminal:true})
 process.stderr.write(label+' (input hidden): ')
 try{return await prompt.question('')}finally{prompt.close();muted.end();process.stderr.write('\n')}
}
try{
 if(process.argv[2]!=='--execute'||process.env.MIP_QIK_NATIVE_HOST_AUTHORIZATION!=='owner-authorized-one-shot')
   throw Error('native_host_authorization_required')
 const prompt=process.argv.includes('--prompt-secrets')
 const receipt=await runNativeHost({
   connectionString:prompt?await hidden('Runtime database URL'):process.env.MIP_QIK_NATIVE_DATABASE_URL,
   token:prompt?await hidden('Collector token'):process.env.MIP_QIK_INGEST_RUN_KEY,
   expectedLogin:process.env.MIP_QIK_NATIVE_LOGIN,runId:process.env.MIP_QIK_NATIVE_RUN_ID,
   allowedFeedUrls:JSON.parse(process.env.MIP_QIK_NATIVE_ALLOWED_FEEDS??'null'),
   sessionPoolerHost:process.env.MIP_QIK_NATIVE_SESSION_POOLER_HOST||null,
   disposable:process.argv.includes('--disposable'),
 })
 process.stdout.write(JSON.stringify(receipt)+'\n')
 if(receipt.state!=='completed'||receipt.needs_reconciliation||!receipt.connection_closed)process.exitCode=1
}catch{
 process.stderr.write(JSON.stringify({state:'native_host_configuration_refused'})+'\n')
 process.exitCode=1
}
