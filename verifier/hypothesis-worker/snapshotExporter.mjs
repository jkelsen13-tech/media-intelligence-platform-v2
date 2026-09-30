// Native replication-protocol snapshot export; disposable GitHub service only.
import {spawn} from 'node:child_process'
import {guard} from '../integrated/transport.mjs'
export async function exportSnapshot(database,slot){
 guard()
 if(!/^mip_integrated_[0-9a-f]{32}$/.test(database)||!/^synthetic_bootstrap_[0-9a-f]{32}$/.test(slot))throw Error('mip_snapshot_scope_denied')
 const child=spawn('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','5432','-U','postgres',
  '-d','dbname='+database+' replication=database'],{
  env:{PATH:process.env.PATH,PGPASSWORD:'mip-disposable-ci-only',PGCONNECT_TIMEOUT:'5'},stdio:['pipe','pipe','pipe']})
 let buffer='',settled=false,exitResolve
 const exited=new Promise(resolve=>{exitResolve=resolve})
 child.on('exit',code=>exitResolve(code))
 child.stdin.on('error',()=>{})
 // No raw stderr or connection data enters CI output.
 child.stderr.on('data',()=>{})
 const exported=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('mip_snapshot_export_timeout'))},20000)
  const fail=()=>{if(!settled){settled=true;clearTimeout(timer);reject(Error('mip_snapshot_export_failed'))}}
  child.on('error',fail);child.on('exit',fail)
  child.stdout.on('data',chunk=>{
   buffer+=chunk
   const end=buffer.indexOf('\n');if(end<0)return
   const parts=buffer.slice(0,end).trim().split('|')
   if(parts.length!==4||parts[0]!==slot||parts[3]!=='pgoutput'||
    !/^[0-9A-F]+\/[0-9A-F]+$/.test(parts[1])||!/^[0-9A-F]{8}-[0-9A-F]{8}-[0-9]+$/.test(parts[2])){
    child.kill('SIGKILL');fail();return
   }
   if(!settled){settled=true;clearTimeout(timer);resolve({consistent_lsn:parts[1],snapshot_id:parts[2]})}
  })
  child.stdin.write('CREATE_REPLICATION_SLOT '+slot+' LOGICAL pgoutput EXPORT_SNAPSHOT;\n')
 })
 let closed=false
 return {...exported,close:async()=>{
  if(closed)return;closed=true
  // Closing is the first action after export; no intervening command invalidates the snapshot.
  child.stdin.end('\\q\n')
  const timer=setTimeout(()=>child.kill('SIGKILL'),5000)
  const code=await exited;clearTimeout(timer)
  if(code!==0)throw Error('mip_snapshot_close_failed')
 }}
}
