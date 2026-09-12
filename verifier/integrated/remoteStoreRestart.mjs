
import {spawn} from 'node:child_process'
import {guard,raw} from './transport.mjs'
export async function restartRemoteStore(){
 guard();const id=process.env.MIP_POSTGRES_SERVICE_ID
 if(!/^[a-f0-9]{12,64}$/.test(id??''))throw Error('mip_disposable_container_required')
 await new Promise((resolve,reject)=>{
  const p=spawn('docker',['restart','--time','5',id],{stdio:'ignore'})
  p.on('error',()=>reject(Error('mip_store_restart_failed')))
  p.on('exit',code=>code?reject(Error('mip_store_restart_failed')):resolve())
 })
 for(let n=0;n<40;n++){
  try{await raw('postgres','select 1');return}catch{}
  await new Promise(r=>setTimeout(r,250))
 }
 throw Error('mip_store_restart_timeout')
}
