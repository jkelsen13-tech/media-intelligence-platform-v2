// Synthetic source fixtures and an explicit unit-test transport. Never runtime inputs.
import {regressionCoherentArcContinuationFixture} from '../../../verifier/recovered-functions/2026-09-05/yhbwnrtlqbjtcrrlpbge/arc-membership-run/lib.js'
export const id = n => '00000000-0000-4000-8000-'+String(n).padStart(12,'0')
export function fixture() {
  const sample=regressionCoherentArcContinuationFixture()
  const arc={id:id(201),title:sample.arc.title,summary:sample.arc.summary,
    started_at:sample.arc.started_at,last_update_at:sample.arc.last_update_at}
  const project=(value,n)=>({id:id(n),title:value.title,summary:value.summary,
    published_at:value.published_at,outlet:value.outlet,arc_id:null})
  const candidate=project(sample.candidate,101)
  const members=sample.members.map((row,i)=>({...project(row,102+i),arc_id:arc.id}))
  const candidates=[{id:id(1),article_id:candidate.id,arc_id:arc.id,
    state:'pending',updated_at:'2026-01-14 12:00:00+00'}]
  const entities=[candidate,...members].flatMap(row=>[301,302,303].map(n=>({
    article_id:row.id,entity_id:id(n),confidence:'0.9',
  })))
  return {candidates,arcs:[arc],articles:[candidate,...members],entities,
    floor:[{value:'0.70'}],
    release:[{fixture_passed:true,auto_approval_enabled:false,auto_approval_threshold:null}]}
}
export function requests(data) {
  return data.candidates.map(row=>({candidate_id:row.id,candidate_updated_at:row.updated_at,
    article_id:row.article_id,arc_id:row.arc_id}))
}
const fields={
  candidates:['id','article_id','arc_id','state','updated_at'],
  arcs:['id','title','summary','started_at','last_update_at'],
  articles:['id','title','summary','published_at','outlet','arc_id'],
  members:['id','title','summary','published_at','outlet','arc_id'],
  entities:['article_id','entity_id','confidence'],
}
export function fakeClient(data,{override,before,failCommit=false,failRollback=false,failClose=false}={}) {
  const log=[]
  class Client {
    async connect(){log.push('connect')}
    async end(){log.push('end');if(failClose)throw Error('private close sentinel')}
    async query(sql,args=[]) {
      log.push(sql)
      if(before) await before(sql,args)
      if(sql==='COMMIT'&&failCommit)throw Error('private commit sentinel')
      if(sql==='ROLLBACK'&&failRollback)throw Error('private rollback sentinel')
      const name=/arc-prepared:([a-z]+)/.exec(sql)?.[1]
      if(override){const result=await override(name,sql,args);if(result!==undefined)return result}
      if(!name)return {rows:[]}
      if(name==='snapshot')return {rows:[{isolation:'repeatable read',read_only:'on'}]}
      if(name==='floor'||name==='release')return {rows:structuredClone(data[name])}
      const keys=name==='members'?['arc_id','id']:name==='entities'?['article_id','entity_id']:['id']
      const source=name==='members'?data.articles:data[name]
      const filter=name==='members'?'arc_id':name==='entities'?'article_id':'id'
      const tuple=row=>keys.map(key=>row[key]).join('|')
      const cursor=args.slice(1,1+keys.length)
      const limit=args[1+keys.length],maxBytes=args[2+keys.length]
      const rows=source.filter(row=>args[0].includes(row[filter]))
        .filter(row=>cursor[0]===null||tuple(row)>cursor.join('|'))
        .sort((a,b)=>tuple(a)<tuple(b)?-1:tuple(a)>tuple(b)?1:0).slice(0,limit)
        .map(row=>Object.fromEntries(fields[name].map(key=>[key,row[key]])))
        .map(row=>{const bytes=Buffer.byteLength(JSON.stringify(row));return {row_bytes:bytes,data:bytes<=maxBytes?row:null}})
      return {rows}
    }
  }
  return {Client,log}
}
