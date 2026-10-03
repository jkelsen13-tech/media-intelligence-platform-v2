// SOURCE-only, independent post-eight-stage artifact. No database client, target
// discovery or SQL execution. Accepted input files/receipts confer no authority.
import { readFile } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { pathToFileURL } from 'node:url'
import { writeArtifact,launchInstallationSourceIdentities } from './compileLaunchInstallationStage.mjs'
import { compileStageSql,compileRecoveryStageSql,validateLaunchCatalog,launchCatalogQuery,sha256 } from './launchInstallationSequence.mjs'
import { selectiveExecutionInstalledCatalogQuery } from './selectiveExecutionPackage.mjs'

const root=new URL('../',import.meta.url)
const contract='mip-selective-completion-artifact-20261003-v1'
const id='selective-completion-followon-20261003'
const proposal='supabase/source-proposals/selective_intake_completion_v1.sql'
const restore='supabase/source-proposals/selective_intake_completion_restore_v1.sql'
const proposalHash='498a90a5d193d4140c97be965120294617e8adbf634381a2af00f5b814e209b1'
const restoreHash='f11b0c40cc968324dfd0b04ae955b9a7350614a176d18d448f1bc693c4d93077'
export const SELECTIVE_COMPLETION_RUNNER_SHA256='8c29dc703566c50bc1ff18637db72a8cc1d1fe754bcda0362271e42f440e322a'
const queryHash='beb3d02d14c2a2f82a5de6c8b98114f98e9bee0ec653c36063f4c70ffca29ecc'
const literal=value=>"'"+String(value).replaceAll("'","''")+"'"
const pinnedQuery=catalog=>async()=>`select ${literal(JSON.stringify(catalog))}::jsonb`
const descriptor=catalog=>({id,proposal,rollback:restore,setting:'mip.selective_completion_expected_catalog',query:pinnedQuery(catalog),
  rollbackSetting:'mip.selective_completion_rollback_expected_catalog',installedQuery:pinnedQuery(catalog),originalSetting:'mip.selective_completion_original_catalog'})

export function validateSelectiveCompletionCatalog(catalog){
  const fail=path=>{throw Error('complete native Selective catalogue required: '+path)}
  const object=(v,p)=>{if(!v||typeof v!=='object'||Array.isArray(v))fail(p)}
  const fields=(v,keys,p)=>{object(v,p);for(const key of keys)if(!Object.hasOwn(v,key))fail(p+'.'+key)}
  const text=(v,p)=>{if(typeof v!=='string'||!v.length)fail(p)}
  const bool=(v,p)=>{if(typeof v!=='boolean')fail(p)}
  const nullable=(v,p)=>{if(v!==null&&typeof v!=='string')fail(p)}
  const strings=(v,p)=>{if(v!==null){if(!Array.isArray(v))fail(p);v.forEach((x,i)=>text(x,p+'.'+i))}}
  const list=(v,p,key,check)=>{if(!Array.isArray(v))fail(p);const seen=new Set();v.forEach((row,i)=>{object(row,p);const k=key(row);text(k,p);if(seen.has(k))fail(p+' duplicate');seen.add(k);check(row,p+'.'+i)})}
  const acl=(v,p)=>list(v,p,r=>JSON.stringify([r.grantor,r.grantee,r.privilege,r.grantable]),(r,q)=>{fields(r,['grantor','grantee','privilege','grantable'],q);for(const k of ['grantor','grantee','privilege'])text(r[k],q+'.'+k);bool(r.grantable,q+'.grantable')})
  const owned=(r,p)=>{text(r.owner,p+'.owner');acl(r.acl,p+'.acl')}
  const keys=['database','server_version_num','installer','schemas','default_acls','relations','functions','roles','target_relations','target_types','target_signatures']
  fields(catalog,keys,'catalog');if(Object.keys(catalog).some(k=>!keys.includes(k)))fail('wrong catalogue schema')
  for(const key of ['database','server_version_num','installer'])text(catalog[key],key)
  if(!/^\d+$/.test(catalog.server_version_num)||['anon','authenticated','service_role'].includes(catalog.installer))fail('native installer/version')
  list(catalog.schemas,'schemas',r=>r.name,(r,p)=>{fields(r,['name','owner','acl'],p);owned(r,p)})
  list(catalog.default_acls,'default_acls',r=>JSON.stringify([r.owner,r.schema,r.kind]),(r,p)=>{fields(r,['owner','schema','kind','acl'],p);for(const k of ['owner','schema','kind'])text(r[k],p+'.'+k);acl(r.acl,p+'.acl')})
  list(catalog.relations,'relations',r=>r.identity,(r,p)=>{
    fields(r,['identity','owner','kind','acl','rls','force_rls','options','definition','columns','constraints','policies','triggers','sequence'],p);owned(r,p);text(r.kind,p+'.kind');bool(r.rls,p+'.rls');bool(r.force_rls,p+'.force_rls');strings(r.options,p+'.options');nullable(r.definition,p+'.definition')
    list(r.columns,p+'.columns',c=>c.name,(c,q)=>{fields(c,['name','type','not_null','identity','generated','default','acl'],q);text(c.type,q+'.type');bool(c.not_null,q+'.not_null');for(const k of ['identity','generated'])if(typeof c[k]!=='string')fail(q+'.'+k);nullable(c.default,q+'.default');acl(c.acl,q+'.acl')})
    list(r.constraints,p+'.constraints',c=>c.name,(c,q)=>{fields(c,['name','definition'],q);text(c.definition,q+'.definition')})
    list(r.policies,p+'.policies',c=>c.name,(c,q)=>{fields(c,['name','cmd','permissive','roles','using','check'],q);text(c.cmd,q+'.cmd');bool(c.permissive,q+'.permissive');if(!Array.isArray(c.roles)||!c.roles.length)fail(q+'.roles');strings(c.roles,q+'.roles');nullable(c.using,q+'.using');nullable(c.check,q+'.check')})
    list(r.triggers,p+'.triggers',c=>c.name,(c,q)=>{fields(c,['name','enabled','definition','function'],q);for(const k of ['enabled','definition','function'])text(c[k],q+'.'+k)})
    if(r.sequence!==null){fields(r.sequence,['type','start','increment','min','max','cache','cycle'],p+'.sequence');for(const k of ['type','start','increment','min','max','cache'])text(r.sequence[k],p+'.sequence.'+k);bool(r.sequence.cycle,p+'.sequence.cycle')}
  })
  list(catalog.functions,'functions',r=>r.signature,(r,p)=>{fields(r,['signature','schema','owner','acl','definition'],p);owned(r,p);text(r.schema,p+'.schema');text(r.definition,p+'.definition')})
  list(catalog.roles,'roles',r=>r.name,(r,p)=>{const flags=['login','inherit','superuser','bypass_rls','create_role','create_db','replication'];fields(r,['name',...flags,'connection_limit','valid_until_epoch','config','memberships'],p);flags.forEach(k=>bool(r[k],p+'.'+k));if(!Number.isInteger(r.connection_limit))fail(p+'.connection_limit');nullable(r.valid_until_epoch,p+'.valid_until_epoch');strings(r.config,p+'.config');list(r.memberships,p+'.memberships',m=>JSON.stringify([m.role,m.grantor]),(m,q)=>{fields(m,['role','grantor','admin','inherit','set'],q);text(m.role,q+'.role');text(m.grantor,q+'.grantor');for(const k of ['admin','inherit','set'])bool(m[k],q+'.'+k)})})
  for(const key of ['target_relations','target_types'])list(catalog[key],key,r=>r.name,(r,p)=>{fields(r,['name','kind','owner'],p);text(r.kind,p+'.kind');text(r.owner,p+'.owner')})
  if(!isDeepStrictEqual(catalog.target_signatures,['evidence_pipeline.selective_metadata_decision(jsonb,jsonb)','public.mip_selective_execution_v1(text,jsonb)']))fail('exact existing target signatures')
  const owner=catalog.schemas.find(s=>s.name==='evidence_pipeline')?.owner,fn=catalog.functions.find(f=>f.signature===catalog.target_signatures[1])
  if(owner!==catalog.installer||fn?.owner!==owner)fail('exact existing native schema/function owner')
  return catalog
}
function consistentCatalogs(whole,native){
  const normalize=acl=>acl.map(a=>[a.grantor,a.grantee,a.privilege??a.privilege_type,a.grantable??a.is_grantable]).map(JSON.stringify).sort()
  const fn=native.functions.find(f=>f.signature===native.target_signatures[1]),full=whole.functions.find(f=>f.identity===fn.signature)
  if(!full||full.owner!==fn.owner||full.definition!==fn.definition||!isDeepStrictEqual(normalize(full.acl),normalize(fn.acl))||whole.schemas.find(s=>s.identity==='evidence_pipeline')?.owner!==native.installer)
    throw Error('distinct accepted whole/native catalogues disagree on existing Selective owner/function/ACL')
}
export async function selectiveCompletionArtifactSources(){
  const paths=new Set((await launchInstallationSourceIdentities()).map(s=>s.path))
  for(const p of [proposal,restore,'scripts/compileSelectiveIntakeCompletionStage20261003.mjs','scripts/selectiveIntakeCompletionPackage.mjs','scripts/selectiveIntakeExecution.mjs','package.json','package-lock.json'])paths.add(p)
  const queue=[...paths]
  for(let i=0;i<queue.length;i++){
    const path=queue[i];if(!/\.(mjs|js)$/.test(path))continue
    const source=await readFile(new URL(path,root),'utf8')
    for(const match of source.matchAll(/(?:from\s*|import\s*\(?\s*)['"](\.{1,2}\/[^'"]+)['"]/g)){
      const url=new URL(match[1],new URL(path,root));if(!url.href.startsWith(root.href))throw Error('source import outside bounded repository')
      const relative=url.href.slice(root.href.length);if(!paths.has(relative)){paths.add(relative);queue.push(relative)}
    }
  }
  return Promise.all([...paths].sort().map(async path=>({path,sha256:sha256(await readFile(new URL(path,root)))})))
}
async function compile(whole,native,mode,original){
  const stage=descriptor(native)
  let result=mode==='restore'?await compileRecoveryStageSql(stage,{nativeOriginal:original.accepted_catalogs.native},whole):await compileStageSql(stage,whole)
  if(mode==='restore'){
    const body=`declare actual jsonb; begin select catalog into actual from (${await launchCatalogQuery()}) c; if actual is distinct from ${literal(JSON.stringify(original.accepted_catalogs.whole))}::jsonb then raise exception 'completion original whole catalogue not restored'; end if; end;`
    let delimiter='$completion_restore_'+sha256(body).slice(0,20)+'$'
    while(body.includes(delimiter))delimiter=delimiter.slice(0,-1)+'x$'
    result.sql=result.sql.replace(/^commit;\s*$/m,()=>`do ${delimiter}${body}${delimiter};\ncommit;\n`)
  }else if(mode==='rollback-only')result.sql=result.sql.replace(/^commit;\s*$/m,'rollback;\n')
  if((result.sql.match(/^begin;\s*$/gm)||[]).length!==1||(result.sql.match(/^(?:commit|rollback);\s*$/gm)||[]).length!==1)throw Error('one exact own transaction/footer required')
  return {...result,compiledHash:sha256(result.sql)}
}
async function verifyOriginal(path,sources){
  const bytes=await readFile(path+'.sha256.json'),receipt=JSON.parse(bytes),sql=await readFile(path)
  if(receipt?.contract!==contract||receipt.stage!==id||receipt.mode!=='install'||receipt.source_sql!==proposal||receipt.source_sha256!==proposalHash||receipt.live_operations!==0||receipt.paired_runner_sha256!==SELECTIVE_COMPLETION_RUNNER_SHA256||!isDeepStrictEqual(receipt.source_artifacts,sources))throw Error('exact original install artifact receipt/source binding required')
  const whole=validateLaunchCatalog(receipt.accepted_catalogs?.whole),native=validateSelectiveCompletionCatalog(receipt.accepted_catalogs?.native);consistentCatalogs(whole,native)
  if(receipt.whole_catalog_parsed_sha256!==sha256(JSON.stringify(whole))||receipt.native_catalog_parsed_sha256!==sha256(JSON.stringify(native)))throw Error('original accepted capture digest drifted')
  const expected=await compile(whole,native,'install')
  if(receipt.compiled_sha256!==sha256(sql)||!sql.equals(Buffer.from(expected.sql)))throw Error('original install artifact SQL bytes drifted')
  return {receipt,receiptHash:sha256(bytes),sqlHash:sha256(sql)}
}
async function prepare({wholeCatalogPath,nativeCatalogPath,mode='install',expectedRunnerSha256,originalArtifactPath}){
  if(!['install','restore','rollback-only'].includes(mode))throw Error('exact completion artifact mode required')
  const wholeBytes=await readFile(wholeCatalogPath),nativeBytes=await readFile(nativeCatalogPath)
  const whole=validateLaunchCatalog(JSON.parse(wholeBytes)),native=validateSelectiveCompletionCatalog(JSON.parse(nativeBytes));consistentCatalogs(whole,native)
  const sources=await selectiveCompletionArtifactSources()
  for(const [path,expected] of [[proposal,proposalHash],[restore,restoreHash],['scripts/selectiveIntakeExecution.mjs',SELECTIVE_COMPLETION_RUNNER_SHA256]])if(sources.find(s=>s.path===path)?.sha256!==expected)throw Error('qualified completion proposal/restore/paired runner source drifted')
  if(expectedRunnerSha256!==SELECTIVE_COMPLETION_RUNNER_SHA256)throw Error('exact qualified paired runner binding required')
  if(sha256(await selectiveExecutionInstalledCatalogQuery())!==queryHash)throw Error('qualified native catalogue query drifted')
  if(mode!=='restore'&&originalArtifactPath)throw Error('original install artifact applies only to restoration')
  if(mode==='restore'&&!originalArtifactPath)throw Error('separate exact original install artifact/capture required')
  const original=mode==='restore'?await verifyOriginal(originalArtifactPath,sources):null
  if(original&&['database','server_version_num','installer'].some(k=>native[k]!==original.receipt.accepted_catalogs.native[k]))throw Error('original native installer/version/database changed; exact restoration needs a separately reviewed successor')
  const result=await compile(whole,native,mode,original?.receipt)
  if(!isDeepStrictEqual(sources,await selectiveCompletionArtifactSources()))throw Error('source closure changed during compilation')
  return {sql:result.sql,identity:{contract,stage:id,mode,source_sql:mode==='restore'?restore:proposal,source_sha256:result.sourceHash,compiled_sha256:result.compiledHash,
    whole_catalog_file_sha256:sha256(wholeBytes),whole_catalog_parsed_sha256:sha256(JSON.stringify(whole)),native_catalog_file_sha256:sha256(nativeBytes),native_catalog_parsed_sha256:sha256(JSON.stringify(native)),
    accepted_catalogs:{whole,native},source_artifacts:sources,paired_runner_sha256:expectedRunnerSha256,
    ...(original?{original_install_receipt_file_sha256:original.receiptHash,original_install_sql_sha256:original.sqlHash}:{}),
    target_input:{database:native.database,server_version_num:native.server_version_num,installer:native.installer},
    authority:'source artifact integrity only; supplied accepted captures/original artifact prove no genuine acceptance, installation, custody, rehearsal, recovery or operation authority',live_operations:0}}
}
export async function compileSelectiveCompletionArtifact(options){return writeArtifact(options.outputPath,await prepare(options))}
export async function verifySelectiveCompletionArtifact(options){
  const receipt=JSON.parse(await readFile(options.outputPath+'.sha256.json','utf8'))
  if(receipt?.contract!==contract||receipt.stage!==id||!['install','restore','rollback-only'].includes(receipt.mode))throw Error('exact follow-on receipt required')
  const prepared=await prepare({...options,mode:receipt.mode})
  if(!isDeepStrictEqual(receipt,prepared.identity))throw Error('follow-on receipt/catalog/source/original bytes drifted')
  const bytes=await readFile(options.outputPath)
  if(sha256(bytes)!==receipt.compiled_sha256||!bytes.equals(Buffer.from(prepared.sql)))throw Error('follow-on SQL bytes drifted or incomplete')
  return {...receipt,status:'SOURCE_ARTIFACT_BYTES_MATCH',live_operations:0}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const [mode,wholeCatalogPath,nativeCatalogPath,outputPath,expectedRunnerSha256,originalArtifactPath,...extra]=process.argv.slice(2)
    if(!['install','restore','rollback-only','verify'].includes(mode)||!wholeCatalogPath||!nativeCatalogPath||!outputPath||!expectedRunnerSha256||extra.length)throw Error('usage: node scripts/compileSelectiveIntakeCompletionStage20261003.mjs <install|restore|rollback-only|verify> <accepted-whole.json> <accepted-native.json> <artifact.sql> <expected-paired-runner-sha256> [original-install-artifact.sql]')
    const options={mode,wholeCatalogPath,nativeCatalogPath,outputPath,expectedRunnerSha256,originalArtifactPath}
    const receipt=await (mode==='verify'?verifySelectiveCompletionArtifact:compileSelectiveCompletionArtifact)(options)
    console.log(JSON.stringify({contract:receipt.contract,status:receipt.status??'SOURCE_ARTIFACT_COMPILED',mode:receipt.mode,source_sha256:receipt.source_sha256,compiled_sha256:receipt.compiled_sha256,
      whole_catalog_file_sha256:receipt.whole_catalog_file_sha256,native_catalog_file_sha256:receipt.native_catalog_file_sha256,paired_runner_sha256:receipt.paired_runner_sha256,
      original_install_receipt_file_sha256:receipt.original_install_receipt_file_sha256??null,source_artifact_count:receipt.source_artifacts.length,live_operations:0}))
  }catch(error){console.error(error.message);process.exitCode=1}
}
