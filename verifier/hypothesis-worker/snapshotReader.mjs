// One imported read-only snapshot, paged by ordered UUID, in the disposable GitHub database only.
import {spawn} from 'node:child_process'
import {guard,quote as q} from '../integrated/transport.mjs'
export async function readSnapshotPages(database,snapshotId,consume){
 guard()
 if(!/^mip_integrated_[0-9a-f]{32}$/.test(database)||!/^[0-9A-F]{8}-[0-9A-F]{8}-[0-9]+$/.test(snapshotId)||typeof consume!=='function')
  throw Error('mip_snapshot_scope_denied')
 const child=spawn('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-h','127.0.0.1','-p','5432','-U','postgres','-d',database],{
  env:{PATH:process.env.PATH,PGPASSWORD:'mip-disposable-ci-only',PGCONNECT_TIMEOUT:'5'},stdio:['pipe','pipe','pipe']})
 let pending=null,buffer='',exited=false,resolveExit
 const exit=new Promise(resolve=>{resolveExit=resolve})
 const fail=()=>{if(pending){clearTimeout(pending.timer);pending.reject(Error('mip_snapshot_read_failed'));pending=null}}
 child.stdin.on('error',fail);child.stderr.on('data',()=>{})
 child.on('error',()=>{exited=true;fail();resolveExit(-1)})
 child.on('exit',code=>{exited=true;fail();resolveExit(code)})
 child.stdout.on('data',chunk=>{
  buffer+=chunk
  if(buffer.length>4194304){child.kill('SIGKILL');fail();return}
  const marker='MIP_SNAPSHOT_PAGE_DONE\n',end=buffer.indexOf(marker)
  if(end>=0){
   if(!pending){child.kill('SIGKILL');return}
   const current=pending;pending=null;clearTimeout(current.timer)
   const value=buffer.slice(0,end).trim();buffer=buffer.slice(end+marker.length);current.resolve(value)
  }
 })
 const request=sql=>new Promise((resolve,reject)=>{
  if(exited||pending){reject(Error('mip_snapshot_read_failed'));return}
  const timer=setTimeout(()=>{child.kill('SIGKILL');fail()},20000)
  pending={resolve,reject,timer};child.stdin.write(sql+'\n\\echo MIP_SNAPSHOT_PAGE_DONE\n')
 })
 let complete=false,after=null,ended=false
 try{
  await request('begin isolation level repeatable read read only;set transaction snapshot '+q(snapshotId)+';')
  await consume(async size=>{
   if(ended||!Number.isSafeInteger(size)||size<1||size>10000)throw Error('mip_snapshot_page_denied')
   const text=await request("select coalesce(jsonb_agg(x order by revision_id),'[]') from ("+
    'select r.id as revision_id,m.epoch as transaction_epoch,m.creator_xid::text as creator_xid '+
    'from mip_hypothesis.revisions r left join mip_hypothesis.revision_transactions m on m.revision_id=r.id '+
    (after?'where r.id>'+q(after)+'::uuid ':'')+'order by r.id limit '+size+') x;')
   let rows;try{rows=JSON.parse(text)}catch{throw Error('mip_snapshot_page_denied')}
   if(!Array.isArray(rows)||rows.length>size||rows.some(r=>typeof r.revision_id!=='string'||!/^[0-9a-f-]{36}$/.test(r.revision_id)))
    throw Error('mip_snapshot_page_denied')
   if(rows.length===0)ended=true
   else after=rows.at(-1).revision_id
   return rows
  })
  if(!ended)throw Error('mip_snapshot_incomplete')
  await request('commit;');complete=true
  return {snapshot_id:snapshotId,read_transaction_completed:true}
 }finally{
  if(!complete&&!exited)child.kill('SIGKILL') // rolls back the read transaction; no prefix is declared complete.
  else if(!exited)child.stdin.end('\\q\n')
  const timer=setTimeout(()=>child.kill('SIGKILL'),5000)
  await exit;clearTimeout(timer)
 }
}
