// DISPOSABLE POSTGRES ONLY. node concurrency.mjs
// Uses psql from PATH, no third-party packages or remote credentials.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const url=new URL(process.env.MARKET_TEST_DATABASE_URL||'');
assert(['localhost','127.0.0.1','postgres'].includes(url.hostname),'Loopback/CI postgres only');
assert(/^\/mip_disposable_[a-z0-9_]+$/.test(url.pathname),'Disposable database name required');
class Session{
 constructor(name){
  this.output='';this.closed=false;
  this.child=spawn('psql',['-X','--no-password','-v','ON_ERROR_STOP=1','--dbname',url.href],{env:{...process.env,PGAPPNAME:name},stdio:['pipe','pipe','pipe']});
  this.child.stdout.on('data',x=>{this.output+=x});
  this.child.stderr.on('data',x=>{this.output+=x});
  this.done=new Promise(resolve=>this.child.on('close',code=>{this.closed=true;resolve(code)}));
 }
 async send(sql){
  const marker='MARKET_DONE_'+Math.random().toString(16).slice(2);
  const start=this.output.length;
  this.child.stdin.write(sql+'\n\\echo '+marker+'\n');
  for(let n=0;n<300;n++){
   if(this.output.slice(start).includes(marker))return this.output.slice(start);
   if(this.closed)throw Error(this.output.slice(start));
   await new Promise(r=>setTimeout(r,100));
  }
  throw Error('Session deadline exceeded');
 }
 finish(sql=''){this.child.stdin.end(sql+'\n');return this.done}
}
let serial=0;
for(const endpoint of ['source','target'])for(const outcome of ['private_commit','private_abort','public_commit']){
 const n=++serial;
 const privateId='e1000000-0000-0000-0000-'+String(n*10+1).padStart(12,'0');
 const publicId='e1000000-0000-0000-0000-'+String(n*10+2).padStart(12,'0');
 const edgeId='e1000000-0000-0000-0000-'+String(n*10+3).padStart(12,'0');
 const a=new Session('market_A_'+n),b=new Session('market_B_'+n);
 try{
  await a.send("insert into public.nodes(id,slug,label,type) values('"+publicId+"','market-race-public-"+n+"','race public','actor');");
  await a.send("begin; insert into public.nodes(id,slug,label,type,private_candidate) values('"+privateId+"','market-race-held-"+n+"','race held','actor',"+(outcome!=='public_commit')+");");
  const source=endpoint==='source'?privateId:publicId,target=endpoint==='target'?privateId:publicId;
  // Start B while A's endpoint is still uncommitted.
  b.child.stdin.write("begin; insert into public.edges(id,source_id,target_id,type) values('"+edgeId+"','"+source+"','"+target+"','direct_reporting'); commit;\n");
  let blocked=false;
  for(let i=0;i<100;i++){
   const out=await a.send("select 'BLOCKED='||exists(select 1 from pg_stat_activity where application_name='market_B_"+n+"' and cardinality(pg_blocking_pids(pid))>0);");
   if(out.includes('BLOCKED=true')){blocked=true;break}
   if(b.closed)throw Error('B terminated before held-open check: '+b.output);
   await new Promise(r=>setTimeout(r,50));
  }
  assert(blocked,'B must demonstrably wait on A before release');
  await a.send(outcome==='private_abort'?'rollback;':'commit;');
  const result=await Promise.race([b.finish(),new Promise((_,reject)=>setTimeout(()=>reject(Error('B timeout')),15000))]);
  if(outcome==='public_commit') assert.equal(result,0,b.output);
  else{
   assert.notEqual(result,0,'Invalid public edge committed');
   assert.match(b.output,outcome==='private_commit'?/market_graph_public_edge_private_endpoint|market_graph_endpoint_not_visible/:/foreign key|market_graph_endpoint_not_visible/i);
  }
  const check=await a.send("select 'EDGE='||exists(select 1 from public.edges where id='"+edgeId+"');");
  assert(check.includes('EDGE='+(outcome==='public_commit')),check);
  console.log(JSON.stringify({endpoint,outcome,blocked,exit:result,passed:true}));
 }finally{a.child.kill();b.child.kill()}
}
