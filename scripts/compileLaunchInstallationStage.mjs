// SOURCE compiler and readback only. No target discovery, credentials, database
// client or SQL execution. A receipt binds bytes; it cannot approve any action.
import { readFile,open,unlink } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { pathToFileURL } from 'node:url'
import { INITIAL_STAGES,compileStageSql,compileRollbackOnlyStageSql,compileRecoveryStageSql,validateLaunchCatalog,fileIdentity,sha256 } from './launchInstallationSequence.mjs'

const modes = Object.freeze({
  install:'separately-authorized-D-install-artifact',
  rehearsal:'separately-authorized-B-rollback-only-artifact',
  recovery:'separately-authorized-D-empty-recovery-artifact',
  containment:'separately-authorized-D-preserve-and-revoke-artifact',
})
const contract='mip-launch-installation-artifact-v2'
const compilerPaths=[
  'scripts/compileLaunchInstallationStage.mjs','scripts/launchInstallationSequence.mjs','scripts/launchInstallSequenceCatalog.sql',
  'scripts/mipConsolidationRestore.mjs','scripts/reviewedPublicVersionPackage.mjs','scripts/storyFollowingPackage.mjs',
  'scripts/marketsDirectoryPackage.mjs','scripts/legacyAtomicCompletionPackage.mjs','scripts/comparisonReviewedVersionPackage.mjs','scripts/selectiveExecutionPackage.mjs',
  'scripts/mipIdentityReconciliation.mjs','scripts/mipSourceRegisters.mjs','scripts/algorithmEvidenceAdapter.mjs',
  'verifier/recovered-functions/2026-09-05/yhbwnrtlqbjtcrrlpbge/arc-membership-run/lib.js',
  'verifier/recovered-functions/2026-09-05/yhbwnrtlqbjtcrrlpbge/source-comparison-run/lib.js',
  'supabase/source-proposals/public-reviewed-versions-v1.installed-catalog.sql',
  'supabase/source-proposals/legacy-atomic-pack/installed-catalog.sql','supabase/source-proposals/selective-intake-pack/installed-catalog.sql',
]
export async function launchInstallationSourceIdentities(){
  return Promise.all([...new Set([...compilerPaths,...INITIAL_STAGES.flatMap(s=>[s.proposal,s.rollback,s.containment,s.catalogHelper].filter(Boolean))])].sort().map(fileIdentity))
}
async function prepareArtifact(stageId,catalogPath,mode,originalReceiptPath){
  const stage=INITIAL_STAGES.find(s=>s.id===stageId)
  if(!stage)throw Error('exact installation stage required')
  if(!Object.hasOwn(modes,mode))throw Error('exact source artifact mode required')
  const catalogBytes=await readFile(catalogPath),baseline=validateLaunchCatalog(JSON.parse(catalogBytes.toString('utf8')))
  const sourceArtifacts=await launchInstallationSourceIdentities()
  let compiled,originalBytes
  if(mode==='recovery'||mode==='containment'){
    if(!originalReceiptPath)throw Error('exact original installation receipt file required')
    originalBytes=await readFile(originalReceiptPath)
    const original=JSON.parse(originalBytes.toString('utf8'))
    if(original?.id!==stage.id||original.proposal!==stage.proposal||original.sourceHash!==(await fileIdentity(stage.proposal)).sha256||
      (stage.originalSetting&&(!original.nativeOriginal||typeof original.nativeOriginal!=='object'||Array.isArray(original.nativeOriginal))))
      throw Error('original installation receipt stage/source/native snapshot mismatch')
    compiled=await compileRecoveryStageSql(stage,original,baseline,{containment:mode==='containment'})
  }else compiled=await (mode==='rehearsal'?compileRollbackOnlyStageSql:compileStageSql)(stage,baseline)
  if(!isDeepStrictEqual(sourceArtifacts,await launchInstallationSourceIdentities()))throw Error('source inputs changed during compilation')
  const identity={contract,stage:stage.id,mode:modes[mode],
    source_proposal:stage.proposal,source_sql:mode==='recovery'?stage.rollback:mode==='containment'?stage.containment:stage.proposal,
    source_sha256:compiled.sourceHash,compiled_sha256:compiled.compiledHash,
    accepted_catalog_sha256:sha256(JSON.stringify(baseline)),accepted_catalog_file_sha256:sha256(catalogBytes),
    source_artifacts:sourceArtifacts,
    ...(originalBytes?{original_installation_receipt_file_sha256:sha256(originalBytes)}:{}),
    authority:'source compiler; receipt integrity grants no catalog acceptance, recovery, rehearsal or target execution authority',live_operations:0}
  return {identity,sql:compiled.sql}
}
// Reserve both names exclusively before writing. On an ordinary failure remove
// only files opened by this call. A process/storage interruption may leave an
// incomplete pair: mandatory read-only verification rejects it before review.
async function writeArtifact(outputPath,{identity,sql}){
  const owned=[]
  try{
    const receipt=await open(outputPath+'.sha256.json','wx',0o600);owned.push({path:outputPath+'.sha256.json',handle:receipt})
    const output=await open(outputPath,'wx',0o600);owned.push({path:outputPath,handle:output})
    await receipt.writeFile(JSON.stringify(identity,null,2)+'\n');await receipt.sync()
    await output.writeFile(sql);await output.sync()
    for(const file of owned)await file.handle.close()
    return identity
  }catch(error){
    for(const file of owned){await file.handle.close().catch(()=>{});await unlink(file.path).catch(()=>{})}
    throw error
  }
}
export async function compileLaunchInstallationStage(stageId,catalogPath,outputPath,{rollbackOnly=false}={}){
  return writeArtifact(outputPath,await prepareArtifact(stageId,catalogPath,rollbackOnly?'rehearsal':'install'))
}
export async function compileLaunchRecoveryStage(stageId,catalogPath,originalReceiptPath,outputPath,{containment=false}={}){
  return writeArtifact(outputPath,await prepareArtifact(stageId,catalogPath,containment?'containment':'recovery',originalReceiptPath))
}
export async function verifyLaunchInstallationArtifact(stageId,catalogPath,outputPath,{originalReceiptPath}={}){
  const receipt=JSON.parse(await readFile(outputPath+'.sha256.json','utf8'))
  const mode=Object.keys(modes).find(key=>modes[key]===receipt?.mode)
  if(receipt?.contract!==contract||receipt.stage!==stageId||!mode)throw Error('exact artifact receipt contract/stage/mode required')
  const prepared=await prepareArtifact(stageId,catalogPath,mode,originalReceiptPath)
  if(!isDeepStrictEqual(receipt,prepared.identity))throw Error('artifact receipt or current source/catalog/original bytes drifted')
  const sql=await readFile(outputPath)
  if(sha256(sql)!==receipt.compiled_sha256||!sql.equals(Buffer.from(prepared.sql)))throw Error('compiled artifact bytes drifted or incomplete')
  return {...receipt,status:'SOURCE_ARTIFACT_BYTES_MATCH',live_operations:0}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const [stage,catalog,output,mode,original,...extra]=process.argv.slice(2)
    if(!stage||!catalog||!output||extra.length||!['--rollback-only','--recovery','--containment','--verify',undefined].includes(mode)||
      (['--recovery','--containment'].includes(mode)?!original:mode!=='--verify'&&original))
      throw Error('usage: node scripts/compileLaunchInstallationStage.mjs <exact-stage> <accepted-catalog.json> <new-output.sql> [--rollback-only | --recovery <original-install-receipt.json> | --containment <original-install-receipt.json> | --verify [original-install-receipt.json]]')
    const result=mode==='--verify'?await verifyLaunchInstallationArtifact(stage,catalog,output,{originalReceiptPath:original}):
      mode==='--recovery'||mode==='--containment'?await compileLaunchRecoveryStage(stage,catalog,original,output,{containment:mode==='--containment'}):
      await compileLaunchInstallationStage(stage,catalog,output,{rollbackOnly:mode==='--rollback-only'})
    console.log(JSON.stringify(result))
  }catch(e){console.error(e.message);process.exitCode=1}
}
