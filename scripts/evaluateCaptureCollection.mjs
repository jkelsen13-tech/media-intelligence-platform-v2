import {readFile,readdir,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import {PGlite} from '@electric-sql/pglite'
import {validateArticle} from './evidencePipeline.mjs'

// Offline diagnostic runner; never connects to a live database or calls a model.
const FEEDS=new Set(['fox-news','al-jazeera','the-guardian','bbc-news','the-new-york-times','cbc-news'])
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function prepareCollection(rows){
 if(!Array.isArray(rows)||rows.length<2||rows.length>100)throw Error('collection must contain 2..100 source records')
 const seen=new Set(),accepted=[],rejected=[]
 for(const row of rows){
  if(!uuid.test(row.id)||seen.has(row.id))throw Error('invalid or duplicate source identity');seen.add(row.id)
  const reason=!FEEDS.has(row.feed)?'unsupported_feed':row.source_status!=='active'?'inactive_source':
   /GDELT (structured event record|event metadata)|not publisher article text/i.test([row.title,row.summary,row.body_text].join(' '))?'metadata_not_publisher_text':
   !row.fetched_at||!Number.isFinite(Date.parse(row.fetched_at))?'missing_source_clock':null
  if(reason){rejected.push({source_id:row.id,reason});continue}
  const article=Object.fromEntries(['url','title','outlet','summary','body_text','published_at'].map(k=>[k,row[k]??null]))
  validateArticle(article)
  if((article.summary?.trim().length||0)<80&&(article.body_text?.trim().length||0)<80){rejected.push({source_id:row.id,reason:'insufficient_retained_text'});continue}
  accepted.push({source_id:row.id,source_project:'yhbwnrtlqbjtcrrlpbge',source_feed:row.feed,
   original_fetched_at:row.fetched_at,exported_at:row.exported_at??null,article,
   article_sha256:digest(article),text_extent:article.body_text===article.summary?'body_repeats_summary':'retained_text_completeness_unverified'})
 }
 accepted.sort((a,b)=>Date.parse(b.article.published_at)-Date.parse(a.article.published_at)||a.source_id.localeCompare(b.source_id))
 if(accepted.length<2)throw Error('fewer than two admissible records')
 const split=Math.ceil(accepted.length/2)
 return {contract:'capture-diagnostic-collection-1',selection:'purposive exploratory diagnostic; not held-out or representative',
  original_snapshot_sha256:digest(rows),accepted,rejected,
  first_wave:accepted.slice(0,split).map(x=>x.source_id),late_wave:accepted.slice(split).map(x=>x.source_id),
  clock_note:'Original source fetched_at is preserved separately from evaluation replay order. Replay does not reconstruct historical system knowledge.'}
}

export function removeDisplaySuffix(article){
 // Analysis copy only. Retained source and offsets must continue using raw text.
 return {...article,...Object.fromEntries(['summary','body_text'].map(k=>[k,typeof article[k]==='string'?article[k].replace(/\s*Continue reading(?:\.{3}|…)\s*$/iu,''):article[k]]))}
}

export async function evaluateCollection(collection){
 // Revalidate every article and its fingerprint before any fixture writes.
 if(collection.contract!=='capture-diagnostic-collection-1'||collection.accepted.length>100)throw Error('unsupported collection')
 for(const row of collection.accepted){validateArticle(row.article);if(digest(row.article)!==row.article_sha256)throw Error('article fingerprint mismatch')}
 const ids=collection.accepted.map(x=>x.source_id),waves=[...collection.first_wave,...collection.late_wave]
 if(new Set(ids).size!==ids.length||waves.length!==ids.length||new Set(waves).size!==ids.length||waves.some(x=>!ids.includes(x)))throw Error('invalid wave partition')
 const db=await PGlite.create()
 try{
  await db.exec(await readFile(new URL('../tests/changeQueueFixture.sql',import.meta.url),'utf8'))
  const migrationFiles=await readdir(new URL('../supabase/migrations/',import.meta.url))
  for(const suffix of ['evidence_pipeline_reliability','evidence_change_queue_v1','evidence_assessment_dependencies_v1','evidence_capture_retrieval_v1']){
   const matches=migrationFiles.filter(x=>x.endsWith('_'+suffix+'.sql'));if(matches.length!==1)throw Error('migration mismatch')
   await db.exec(await readFile(new URL('../supabase/migrations/'+matches[0],import.meta.url),'utf8'))
  }
  const rpc=name=>(action,input={})=>db.query(`select public.${name}($1,$2::jsonb) r`,[action,JSON.stringify(input)]).then(r=>r.rows[0].r)
  const intake=rpc('mip_pipeline_v1'),queue=rpc('mip_evidence_changes_v1'),search=rpc('mip_capture_retrieval_v1')
  const captures=new Map(),jobs=new Map();const pages=[]
  const ingest=async wave=>{for(const id of wave){const row=collection.accepted.find(x=>x.source_id===id)
   await intake('enqueue',{run_id:'offline-diagnostic-1',article:row.article});const j=await intake('claim')
   const r=await intake('finish',{job_id:j.id,lease_token:j.lease_token});if([...captures.values()].includes(r.capture_id))throw Error('multiple source rows resolve to one capture; deduplicate collection explicitly');captures.set(id,r.capture_id)
  }}
  const finish=async(run,token)=>{for(let n=0;n<10;n++){const p=await search('page',{run_id:run.id,lease_token:token,limit:25});if(p.coverage==='complete')return;pages.push(p)}throw Error('page budget exceeded')}
  const scan=async wave=>{for(const id of wave){await db.query("update evidence_pipeline.change_jobs set available_at=clock_timestamp()-interval '100 years' where change_position=(select position from evidence_pipeline.evidence_changes where capture_id=$1)",[captures.get(id)])
   const j=await queue('claim',{route:'new_candidate_search'});if(j.change.capture_id!==captures.get(id))throw Error('wrong source job')
   jobs.set(id,j.id);await finish(await search('start',{job_id:j.id,lease_token:j.lease_token}),j.lease_token)
  }}
  await ingest(collection.first_wave);await scan(collection.first_wave)
  const firstPairCount=(await db.query('select count(*)::int n from evidence_pipeline.retrieval_pairs')).rows[0].n
  await ingest(collection.late_wave);await scan(collection.late_wave)
  for(const id of collection.first_wave)await finish(await search('refresh',{job_id:jobs.get(id)}))
  const reverse=new Map([...captures].map(([s,c])=>[c,s]))
  const pairs=(await db.query('select left_capture_id,right_capture_id,disposition,shared_terms from evidence_pipeline.retrieval_pairs')).rows.map(p=>{
   const [left,right]=[reverse.get(p.left_capture_id),reverse.get(p.right_capture_id)].sort()
   return {left_source_id:left,right_source_id:right,disposition:p.disposition,shared_terms:p.shared_terms}
  }).sort((a,b)=>a.left_source_id.localeCompare(b.left_source_id)||a.right_source_id.localeCompare(b.right_source_id))
  const counts={};for(const p of pairs)counts[p.disposition]=(counts[p.disposition]||0)+1
  const crossWave=pairs.filter(p=>collection.first_wave.includes(p.left_source_id)!==collection.first_wave.includes(p.right_source_id))
  const filteredTerms=new Map()
  for(const row of collection.accepted){const r=await db.query('select evidence_pipeline.capture_terms($1::jsonb) terms',[JSON.stringify(removeDisplaySuffix(row.article))]);filteredTerms.set(row.source_id,r.rows[0].terms)}
  const filteredPairs=pairs.filter(p=>p.disposition==='retrieval_candidate').map(p=>{
   const right=new Set(filteredTerms.get(p.right_source_id));const terms=filteredTerms.get(p.left_source_id).filter(x=>right.has(x))
   return {...p,filtered_shared_terms:terms,retained:terms.length>=2}
  })
  const bodyRepeat=collection.accepted.filter(x=>x.text_extent==='body_repeats_summary').length
  return {contract:collection.contract,collection_sha256:digest(collection),accepted:ids.length,rejected:collection.rejected,
   body_repeats_summary:bodyRepeat,first_wave_pairs:firstPairCount,final_pairs:pairs.length,expected_pairs:ids.length*(ids.length-1)/2,
   counts,cross_wave_pairs:crossWave.length,cross_wave_candidates:crossWave.filter(x=>x.disposition==='retrieval_candidate').length,
   partial_pages:pages.length,
   display_suffix_experiment:{contract:'terminal-continue-reading-1',baseline_candidates:filteredPairs.length,
    retained_candidates:filteredPairs.filter(x=>x.retained).length,removed_candidate_pairs:filteredPairs.filter(x=>!x.retained),
    deployed:false,interpretation:'Isolated analysis-copy experiment. Removal count is not precision; retained pairs still require semantic verification.'},
   semantic_accuracy:null,precision:null,recall:null,
   interpretation:'Enumeration diagnostics on a purposive unadjudicated collection. Matches are proposals, not validated relationships or independent evidence.',pairs}
 }finally{await db.close()}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [input,output]=process.argv.slice(2)
 if(!input||!output)throw Error('Usage: node scripts/evaluateCaptureCollection.mjs private-source-snapshot.json private-result.json')
 const rows=JSON.parse(await readFile(input,'utf8'));const collection=prepareCollection(rows)
 const evaluation=await evaluateCollection(collection)
 await writeFile(output,JSON.stringify({collection,evaluation},null,2)+'\n',{mode:0o600})
 console.log(JSON.stringify({accepted:evaluation.accepted,rejected:evaluation.rejected.length,pairs:evaluation.final_pairs,counts:evaluation.counts}))
}
