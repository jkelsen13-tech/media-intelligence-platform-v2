// SOURCE compiler only: reads local accepted-catalog JSON and writes local SQL.
// Does not discover a target, contact a database, approve a catalog or execute SQL.
import { readFile,writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { INITIAL_STAGES,compileStageSql,compileRollbackOnlyStageSql,sha256 } from './launchInstallationSequence.mjs'
export async function compileLaunchInstallationStage(stageId,catalogPath,outputPath,{rollbackOnly=false}={}){
  const stage=INITIAL_STAGES.find(s=>s.id===stageId)
  if(!stage)throw Error('exact installation stage required')
  const baseline=JSON.parse(await readFile(catalogPath,'utf8'))
  for(const key of ['schemas','relations','functions','roles','default_privileges']){
    if(!Array.isArray(baseline[key])||baseline[key].some(r=>typeof r?.identity!=='string'))throw Error('complete named catalogue required')
  }
  const compiled=await (rollbackOnly?compileRollbackOnlyStageSql:compileStageSql)(stage,baseline)
  await writeFile(outputPath,compiled.sql,{flag:'wx'})
  const identity={stage:stage.id,mode:rollbackOnly?'separately-authorized-B-rollback-only-artifact':'separately-authorized-D-install-artifact',source_proposal:stage.proposal,source_sha256:compiled.sourceHash,compiled_sha256:compiled.compiledHash,
    accepted_catalog_sha256:sha256(JSON.stringify(baseline)),authority:'source compiler; catalog acceptance and target execution require separate D',live_operations:0}
  await writeFile(outputPath+'.sha256.json',JSON.stringify(identity,null,2)+'\n',{flag:'wx'})
  return identity
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const [stage,catalog,output,mode,...extra]=process.argv.slice(2)
    if(!stage||!catalog||!output||extra.length||(mode&&mode!=='--rollback-only'))throw Error('usage: node scripts/compileLaunchInstallationStage.mjs <exact-stage> <accepted-catalog.json> <new-output.sql> [--rollback-only]')
    console.log(JSON.stringify(await compileLaunchInstallationStage(stage,catalog,output,{rollbackOnly:mode==='--rollback-only'})))
  }catch(e){console.error(e.message);process.exitCode=1}
}
