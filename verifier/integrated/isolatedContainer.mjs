
import {spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import {fileURLToPath} from 'node:url'
import {EventEmitter} from 'node:events'
import {guard} from './transport.mjs'
export function isolatedWorker(){
 guard();const name='mip-worker-'+randomUUID(),events=new EventEmitter()
 const mounts=[
 ['../../supabase/functions/source-comparison-generation-candidate/','/work/supabase/functions/source-comparison-generation-candidate'],
 ['../../supabase/runtime-snapshots/source-comparison-run-v16/','/work/supabase/runtime-snapshots/source-comparison-run-v16'],
 ['./workerIsolated.mjs','/work/verifier/integrated/workerIsolated.mjs']]
 const args=['run','--name',name,'--rm','--interactive','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user','65534:65534','--pids-limit','64','--memory','256m']
 for(const [src,dst] of mounts)args.push('--mount','type=bind,source='+fileURLToPath(new URL(src,import.meta.url))+',target='+dst+',readonly')
 args.push('node:24-alpine','node','/work/verifier/integrated/workerIsolated.mjs')
 const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']})
 let buffer='';events.connected=true;events.stdout=child.stdout;events.stderr=child.stderr
 child.stdout.on('data',bytes=>{
  buffer+=bytes
  for(let end;(end=buffer.indexOf('\n'))>=0;){
   const line=buffer.slice(0,end);buffer=buffer.slice(end+1)
   try{events.emit('message',JSON.parse(line))}catch{events.emit('message',{done:true,state:'isolated_protocol_error'})}
  }
 })
 child.on('error',()=>events.emit('exit',1))
 child.on('exit',code=>{events.connected=false;events.emit('exit',code)})
 events.send=message=>{if(!child.stdin.destroyed)child.stdin.write(JSON.stringify(message)+'\n')}
 child.stdin.on('error',()=>{})
 events.kill=()=>{const killer=spawn('docker',['kill','--signal','KILL',name],{stdio:'ignore'});killer.on('error',()=>child.kill('SIGKILL'))}
 return events
}
