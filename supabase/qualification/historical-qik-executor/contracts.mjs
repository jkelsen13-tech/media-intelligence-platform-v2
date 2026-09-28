import { FIELD_CONTRACTS, PROJECTS, CATEGORIES } from '../../../scripts/mipHistoricalArticleTransferPlan.mjs'
import { fingerprintPayload } from '../../../scripts/mipLegacyGraphStaging.mjs'

// public only. No SELECT *, graph sweep, changed timestamps or invented provenance.
// Native PK identities are from the read-only source catalog. Eight NIE backup
// families have no unique key and retain original-snapshot physical occurrences.
const quote = value => "'" + String(value).replaceAll("'","''") + "'"
const ident = value => '"' + String(value).replaceAll('"','""') + '"'
const noUniqueKey = new Set(['arc_backup_20260726_articles',
  'article_entities_canary_sweep_backup_20260809','articles_canary_sweep_backup_20260809',
  'articles_decode_backup_20260726','articles_decode_backup_20260726_r2',
  'articles_decode_backup_20260726_r3','articles_pre_d5_backup_20260730',
  'articles_review_batch_backup_20260729'])
const nativeKeys = Object.freeze({article_entities:['article_id','entity_id'],
  event_articles:['event_id','article_id'],gdelt_staging_runs:['run_id']})
const history = table => table !== 'articles' && (table.startsWith('articles_') || table==='arc_backup_20260726_articles')
const references = Object.freeze({
  article_claims:[['article_id','articles','id'],['claim_id','claims','id']],
  article_entities:[['article_id','articles','id'],['entity_id','entities','id']],
  article_entities_canary_sweep_backup_20260809:[['article_id','articles','id'],['entity_id','entities','id']],
  article_lineage_assertions:[['child_article_id','articles','id'],['parent_article_id','articles','id'],['superseded_by','article_lineage_assertions','id']],
  article_extraction_results:[['article_id','articles','id']],
  claims:[['event_id','events','id']],
  claim_evidence_links:[['claim_id','claims','id'],['linked_from_article_id','articles','id']],
  events:[['arc_id','story_arcs','id'],['arc_event_id','arc_events','id']],
  event_articles:[['article_id','articles','id'],['event_id','events','id']],
  story_arcs:[['seed_article_id','articles','id']],
  arc_events:[['arc_id','story_arcs','id']],
  gdelt_staged_articles:[['article_id','articles','id'],['run_id','gdelt_staging_runs','run_id']],
})
const reverse = Object.freeze({
  articles:['article_claims','article_entities','article_entities_canary_sweep_backup_20260809',
    'article_lineage_assertions','article_extraction_results','event_articles','gdelt_staged_articles',
    'claim_evidence_links','story_arcs'],
  claims:['article_claims','claim_evidence_links'],
  events:['claims'],
  story_arcs:['arc_events'],
})
export function buildSourceContract(project,{max_root_pairs=250000,max_rows=100000}={}) {
  if(!Number.isSafeInteger(max_root_pairs)||max_root_pairs<1||
     !Number.isSafeInteger(max_rows)||max_rows<1) throw new Error('closure_capacity')
  const families=FIELD_CONTRACTS[project]
  if (!families) throw new Error('source_project')
  const tables=Object.keys(families).sort()
  const rows=tables.map(table=>{
    const columns=families[table].map(field=>'t.'+ident(field)+' as '+ident(field)).join(',')
    const keys=nativeKeys[table]??['id']
    const identity=noUniqueKey.has(table)
      ? "json_build_object('tableoid',t.tableoid::text,'ctid',t.ctid::text)"
      : "json_build_object("+keys.map(key=>quote(key)+",t."+ident(key)).join(',')+")"
    return "select "+quote(table)+"::text as family, t.tableoid::text||':'||t.ctid::text as occurrence,"+
      identity+"::text as native_identity_json,"+
      "json_build_object('tableoid',t.tableoid::text,'ctid',t.ctid::text,'xmin',t.xmin::text)::text as native_version_json,"+
      "(select row_to_json(p)::text from (select "+columns+") p) as payload_json "+
      "from public."+ident(table)+" t where (select allowed from budget)"
  }).join('\nunion all\n')
  const refs=[]
  for(const table of tables) {
    const list=[...(references[table]??[])]
    if(table==='articles'||history(table)) {
      // Backup id/current id is an optional association, not a source FK.
      for(const [field,target] of [['author_id','authors'],['outlet_id','outlets'],['arc_id','story_arcs']])
        if(families[table].includes(field)) list.push([field,target,'id'])
    }
    for(const [field,target,key] of list) {
      if(!families[table].includes(field)||!families[target]?.includes(key)) throw new Error('reference_contract')
      refs.push({table,field,target,key,reverse:history(table)&&target==='articles'||reverse[target]?.includes(table)===true})
    }
  }
  const refSQL=refs.map(r=>
    'select '+quote(r.table)+'::text as family,'+quote(r.field)+'::text as field,'+
    quote(r.target)+'::text as target,'+quote(r.key)+'::text as target_key,'+
    (r.reverse?'true':'false')+' as reverse').join('\nunion all\n')
  const seedTables=tables.filter(t=>t==='articles'||history(t)||t==='article_entities_canary_sweep_backup_20260809')
  const seeds=seedTables.map(quote).join(',')
  const cardinality=tables.map(table=>'select count(*) n from public.'+ident(table)).join(' union all ')
  const rootCardinality=seedTables.map(table=>'select '+ident(table==='article_entities_canary_sweep_backup_20260809'?'article_id':'id')+
    '::text as id from public.'+ident(table)).join(' union ')
  const optionalBackup=tables.filter(history).map(quote).join(',')||"''"
  const cte=String.raw`with recursive
counts as (select sum(n) n from (${cardinality}) q),
root_count as (select count(*) n from (${rootCardinality}) q),
budget as materialized (select counts.n<=${max_rows} and counts.n*root_count.n<=${max_root_pairs} as allowed from counts,root_count),
raw as materialized (${rows}),
r as materialized (select raw.*,payload_json::jsonb as p from raw),
ref as (${refSQL}),
links as materialized (
 select a.occurrence as child,b.occurrence as parent,x.reverse
 from r a join ref x on x.family=a.family
 join r b on b.family=x.target and b.p->>x.target_key=a.p->>x.field
 union
 select a.occurrence,b.occurrence,false
 from r a cross join lateral jsonb_array_elements_text(
   case when jsonb_typeof(a.p->'outlet_ids')='array' then a.p->'outlet_ids' else '[]'::jsonb end) ids(id)
 join r b on b.family='outlets' and b.p->>'id'=ids.id
 where a.family='authors'
 union
 select a.occurrence,b.occurrence,true from r a join r b
 on b.family='articles' and b.p->>'id'=a.p->>'id'
 where a.family in (${optionalBackup})
 union
 select a.occurrence,b.occurrence,false from r a join r b
 on b.family=case a.p->>'column_name' when 'author_id' then 'authors'
   when 'outlet_id' then 'outlets' when 'arc_id' then 'story_arcs' end
 and b.p->>'id'=a.p->>'old_value'
 where a.family='articles_decode_backup_20260726_r3'
),
edges as (select child as a,parent as b from links union select parent,child from links where reverse),
roots as (
 select occurrence,(case when family='article_entities_canary_sweep_backup_20260809'
   then p->>'article_id' else p->>'id' end)::uuid as root from r where family in (${seeds})
 union
 select e.b,roots.root from roots join edges e on e.a=roots.occurrence
),
selected as materialized (
 select r.*, (select json_agg(root order by root)::text from
   (select distinct root from roots where occurrence=r.occurrence) q) as roots_json
 from r where exists(select 1 from roots where occurrence=r.occurrence)
),
missing as (
 select a.family,x.field,x.target from selected a join ref x on a.family=x.family
 where a.p->>x.field is not null and not exists(
   select 1 from r b where b.family=x.target and b.p->>x.target_key=a.p->>x.field)
 union all
 select a.family,'outlet_ids','outlets' from selected a
 cross join lateral jsonb_array_elements_text(
   case when jsonb_typeof(a.p->'outlet_ids')='array' then a.p->'outlet_ids' else '[]'::jsonb end) ids(id)
 where a.family='authors' and not exists(select 1 from r b where b.family='outlets' and b.p->>'id'=ids.id)
 union all
 select family,'native_root','null_historical_root' from r where family in (${seeds})
 and (case when family='article_entities_canary_sweep_backup_20260809' then p->>'article_id' else p->>'id' end) is null
),
objects as materialized (
 select id::text,bucket_id,name,version from storage.objects
)
`
  const selectFamily=table=>cte+String.raw`
select s.payload_json,s.native_identity_json,s.native_version_json,s.roots_json,
 coalesce((select json_agg(json_build_object('table',d.family,
   'native_identity_json',d.native_identity_json,'native_version_json',d.native_version_json)
   order by d.family,d.occurrence)::text
 from links l join selected d on d.occurrence=l.parent where l.child=s.occurrence),'[]') as dependencies_json
from selected s where s.family=${quote(table)} order by s.occurrence`
  const inventory=cte+String.raw`
select json_build_object(
 'capacity',json_build_object('within_limits',(select allowed from budget),'max_root_pairs',${max_root_pairs},'max_rows',${max_rows}),
 'roots',(select coalesce(json_agg(root order by root),'[]') from (select distinct root from roots) q),
 'categories',json_build_array(${CATEGORIES.map(quote).join(',')}),
 'family_counts',(select json_object_agg(family,n) from (
   select f.family,count(s.occurrence) n from
   (values ${tables.map(t=>'('+quote(t)+')').join(',')}) f(family)
   left join selected s on s.family=f.family group by f.family) q),
 'object_inventory',(select coalesce(json_agg(row_to_json(objects)),'[]') from objects),
 'closure',json_build_object(
   'complete',(select allowed from budget) and not exists(select 1 from missing),
   'unsupported_families',(select coalesce(json_agg(distinct target),'[]') from missing),
   'contract','explicit-article-reference-closure/v1',
   'graph_boundary',json_build_array('nodes','arc_membership_candidates'),
   'unattached_counts',(select json_object_agg(family,n) from (
     select family,count(*) n from r where not exists(
       select 1 from selected s where s.occurrence=r.occurrence) group by family) q)
 ))::text`
  const body={project,namespace:'public',tables,fields:families,references:refs,inventory_sql:inventory,
    families:tables.map(table=>({table_name:table,fields:[...families[table]],select_sql:selectFamily(table)}))}
  return {...body,contract_sha256:fingerprintPayload(body)}
}
// Metadata statements only. UUIDs are Vault references, never credential values.
// Owner-only configuration; never exposed on executor HTTP/RPC surfaces.
export function sourceContractStatements(vaultIds) {
  return [PROJECTS.nie,PROJECTS.yhb].flatMap(project=>{
    if(!/^[a-f0-9-]{36}$/.test(vaultIds?.[project]??'')) throw new Error('vault_reference_required')
    const c=buildSourceContract(project)
    return [{text:'insert into mip_history.source_contract(project,vault_secret,contract_sha256,inventory_sql,expected_tables) values($1,$2,$3,$4,$5)',
      values:[project,vaultIds[project],c.contract_sha256,c.inventory_sql,c.tables]},
      ...c.families.map(f=>({text:'insert into mip_history.family_contract(project,table_name,fields,select_sql) values($1,$2,$3,$4)',
        values:[project,f.table_name,f.fields,f.select_sql]}))]
  })
}
