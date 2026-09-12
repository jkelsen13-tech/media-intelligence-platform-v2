import {spawn} from 'node:child_process'
export function guard(){
 if(process.env.GITHUB_ACTIONS!=='true'||process.env.MIP_DISPOSABLE_POSTGRES!=='comparison-qualification')
  throw Error('mip_disposable_environment_required')
}
export const quote=v=>v===null?'null':"'"+String(typeof v==='object'?JSON.stringify(v):v).replaceAll("'","''")+"'"
export function raw(database,sql){
 guard()
 return new Promise((resolve,reject)=>{
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('PG')))
  Object.assign(env,{PGPASSWORD:'mip-disposable-ci-only',PGOPTIONS:'-c statement_timeout=20000 -c lock_timeout=15000',PGCONNECT_TIMEOUT:'5'})
  const child=spawn('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','5432','-U','postgres','-d',database],{env,stdio:['pipe','pipe','pipe']})
  let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x)
  child.on('error',()=>reject(Error('mip_database_unavailable')))
  child.on('exit',code=>{
   if(code)reject(Error(err.match(/ERROR:\s+(mip_[a-z_]+)/)?.[1]??'mip_database_denied'))
   else resolve(out.trim())
  })
  child.stdin.end(sql)
 })
}
const names=new Set(['configuration','issue','journal_runtime','journal_put','journal_get','worker_claim','worker_complete','worker_fail','producer_enqueue'])
export function transport(database,role){
 if(!/^[a-z_0-9]+$/.test(role))throw Error('mip_role_invalid')
 return async(name,args)=>{
  if(!names.has(name))throw Error('mip_rpc_invalid')
  const result=await raw(database,'set session authorization '+role+';select to_jsonb(mip_identity.'+name+'('+args.map(quote).join(',')+'));')
  return result?JSON.parse(result):null
 }
}
