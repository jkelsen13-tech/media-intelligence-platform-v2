
// Runs the frozen deployed-equivalent handler in isolation. No network client exists.
import {readFile} from 'node:fs/promises'
import {stripTypeScriptTypes} from 'node:module'
import {randomUUID} from 'node:crypto'
export async function runner(){
 const url=new URL('../../supabase/runtime-snapshots/source-comparison-run-v16/index.ts',import.meta.url)
 let source=await readFile(url,'utf8')
 source=source.replace("import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.0'","let fixtureClient;const createClient=()=>fixtureClient;export const setClient=c=>{fixtureClient=c};let handler;const Deno={env:{get:()=> 'synthetic-fixture'},serve:h=>{handler=h}};export const invoke=req=>handler(req)")
 source=source.replace(/from '(\.\/[^']+)'/g,(_,path)=>'from '+JSON.stringify(new URL(path,url).href))
 source+='\nexport {buildEventInputs,rebuildProjection,dedupeArticleClaims,dedupeProjectionExplanations};'
 return import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'))
}
export function fakeDatabase(tables,{failInsert,afterRead}={}){
 const log=[];let tick=0
 function from(table){
  let op='select',body,filters=[],lo=0,hi=Infinity,count=false,one=false
  const chain={
   select(_columns,options={}){count=options.count==='exact';return this},
   eq(k,v){filters.push(r=>r[k]===v);return this},neq(k,v){filters.push(r=>r[k]!==v);return this},
   in(k,vs){filters.push(r=>vs.includes(r[k]));return this},
   like(k,pattern){filters.push(r=>String(r[k]??'').startsWith(pattern.replace(/%$/,'')));return this},
   order(){return this},range(a,b){lo=a;hi=b;return this},single(){one=true;return this},maybeSingle(){one=true;return this},
   delete(){op='delete';return this},insert(v){op='insert';body=v;return this},
   update(v){op='update';body=v;return this},
   async then(resolve,reject){try{
    const rows=tables[table]??=[],selected=rows.filter(r=>filters.every(f=>f(r)))
    log.push({table,op,count:selected.length,ids:selected.map(r=>r.id).filter(Boolean)})
    if(op==='select'){afterRead?.(table,tables,tick++);return resolve({data:one?(selected[0]??null):selected.slice(lo,hi+1),count:count?selected.length:null,error:null})}
    if(op==='delete'){tables[table]=rows.filter(r=>!selected.includes(r));return resolve({data:null,error:null})}
    if(op==='update'){selected.forEach(r=>Object.assign(r,body));return resolve({data:null,error:null})}
    if(table===failInsert)return resolve({data:null,error:{message:'synthetic write failure'}})
    const inserted=(Array.isArray(body)?body:[body]).map(r=>({id:randomUUID(),...r}))
    tables[table]=[...rows,...inserted]
    return resolve({data:one?inserted[0]:inserted,error:null})
   }catch(e){return reject(e)}}
  };return chain
 }
 return {from,tables,log}
}
