// Standalone offline compiler/readback. No DB client, target discovery, network,
// credentials or SQL submission. A byte-integrity receipt creates no authority.
import { readFile,lstat,open } from 'node:fs/promises'
import { constants } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { pathToFileURL } from 'node:url'
import { writeArtifact, launchInstallationSourceIdentities } from './compileLaunchInstallationStage.mjs'
import { acceptedProfileCatalog, compileProfileSql, compileProfileRecoveryHoldSql,
  parseProfileJson, PROFILE_PROPOSAL_PATH, PROFILE_PROPOSAL_SHA256, profileCatalogQuery, sha256 } from './profilePrivilegePackage.mjs'

const root=new URL('../',import.meta.url)
const contract='mip-profile-privilege-offline-artifact-v1'
const profileSources=['scripts/profilePrivilegePackage.mjs','scripts/compileProfilePrivilegePackage.mjs',
  'scripts/profilePrivilegeCatalog.sql',PROFILE_PROPOSAL_PATH]
async function readPrivateFile(path) {
  const stat=await lstat(path)
  if(!stat.isFile()||(stat.mode&0o077)!==0)throw Error('private regular profile input/artifact file required')
  const handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW)
  try {
    const opened=await handle.stat()
    if(!opened.isFile()||(opened.mode&0o077)!==0||opened.ino!==stat.ino||opened.dev!==stat.dev)throw Error('private profile file identity changed while reading')
    const bytes=await handle.readFile(),after=await handle.stat()
    if(bytes.length!==opened.size||after.size!==opened.size||after.mtimeMs!==opened.mtimeMs||after.ctimeMs!==opened.ctimeMs)throw Error('private profile file changed while reading')
    return bytes
  } finally {await handle.close()}
}
export async function profileSourceIdentities() {
  // The paired writer is reused unchanged. Bind its existing complete declared
  // source closure, including transitive package helpers, plus this package.
  const shared=await launchInstallationSourceIdentities()
  const own=await Promise.all(profileSources.map(async path=>({path,sha256:sha256(await readFile(new URL(path,root)))})))
  return [...shared,...own].sort((a,b)=>a.path.localeCompare(b.path))
}
async function prepare(options) {
  const {catalogPath,mode='rollback-only',originalCatalogPath,originalArtifactPath,now=Date.now()}=options
  if(!catalogPath||!['rollback-only','commit','recovery-hold'].includes(mode))throw Error('exact profile accepted catalog path/source mode required')
  const sourceArtifacts=await profileSourceIdentities()
  const catalogBytes=await readPrivateFile(catalogPath)
  const accepted=await acceptedProfileCatalog(catalogBytes,{now,installed:mode==='recovery-hold'})
  let sql,originalCatalogBytes,originalArtifactBytes,originalReceiptBytes
  if(mode==='recovery-hold') {
    if(!originalCatalogPath||!originalArtifactPath)throw Error('exact original commit artifact pair and original accepted baseline required')
    originalCatalogBytes=await readPrivateFile(originalCatalogPath)
    // The old acceptance remains provenance, not a second fresh observation.
    const originalDoc=parseProfileJson(originalCatalogBytes)
    const originalObserved=Date.parse(originalDoc?.acceptance?.accepted_at_utc)
    const original=await acceptedProfileCatalog(originalCatalogBytes,{now:originalObserved})
    originalArtifactBytes=await readPrivateFile(originalArtifactPath)
    originalReceiptBytes=await readPrivateFile(originalArtifactPath+'.sha256.json')
    const originalReceipt=parseProfileJson(originalReceiptBytes)
    if(originalReceipt.contract!==contract||originalReceipt.mode!=='commit')throw Error('original explicit commit source artifact receipt required')
    const preparedOriginal=await prepare({catalogPath:originalCatalogPath,mode:'commit',now:originalObserved})
    if(!isDeepStrictEqual(originalReceipt,preparedOriginal.identity)||!originalArtifactBytes.equals(Buffer.from(preparedOriginal.sql)))throw Error('original commit artifact/receipt/baseline/source bytes mismatch')
    if(Date.parse(accepted.observed_at_utc)<=Date.parse(original.observed_at_utc))throw Error('recovery requires independently newer accepted installed readback')
    sql=await compileProfileRecoveryHoldSql(original.catalog,accepted.catalog)
  } else {
    if(originalCatalogPath||originalArtifactPath)throw Error('original receipt inputs are only valid for recovery-hold')
    sql=await compileProfileSql(accepted.catalog,{mode})
  }
  if(!catalogBytes.equals(await readPrivateFile(catalogPath))||!isDeepStrictEqual(sourceArtifacts,await profileSourceIdentities())||
    (originalCatalogBytes&&!originalCatalogBytes.equals(await readPrivateFile(originalCatalogPath)))||
    (originalArtifactBytes&&!originalArtifactBytes.equals(await readPrivateFile(originalArtifactPath)))||
    (originalReceiptBytes&&!originalReceiptBytes.equals(await readPrivateFile(originalArtifactPath+'.sha256.json'))))throw Error('profile source/accepted/original file bytes changed during compilation')
  const identity={contract,mode,source_base:{head:'0ebf51d80179130c2b05041663c02777c427fcf4',tree:'aa2b71604f4fd782316b27bc340c88763db4eaad'},
    qualification:accepted.qualification,source_proposal:PROFILE_PROPOSAL_PATH,source_sha256:PROFILE_PROPOSAL_SHA256,
    compiled_sha256:sha256(sql),accepted_catalog_file_sha256:sha256(catalogBytes),accepted_catalog_sha256:sha256(JSON.stringify(accepted.catalog)),
    catalog_query_sha256:sha256(await profileCatalogQuery()),source_artifacts:sourceArtifacts,
    ...(originalCatalogBytes?{original_catalog_file_sha256:sha256(originalCatalogBytes),
      original_install_artifact_sha256:sha256(originalArtifactBytes),original_install_receipt_file_sha256:sha256(originalReceiptBytes)}:{}),
    authority:'offline source integrity only; no independent acceptance, rollback acknowledgment, rehearsal, COMMIT, recovery, target execution or release authority',
    recovery:mode==='recovery-hold'?'HOLD_PRESERVE_STATE_NO_REGRANT':'transaction ROLLBACK restores original state during separately authorized rehearsal; committed restoration requires separate future package and approval',
    live_operations:0}
  return {identity,sql}
}
export async function compileProfilePrivilegeArtifact(options) {
  if(!options.outputPath)throw Error('new profile output artifact path required')
  return writeArtifact(options.outputPath,await prepare(options))
}
export async function verifyProfilePrivilegeArtifact(options) {
  const receipt=parseProfileJson(await readPrivateFile(options.outputPath+'.sha256.json'))
  if(receipt.contract!==contract||!['rollback-only','commit','recovery-hold'].includes(receipt.mode))throw Error('exact profile artifact receipt contract/source mode required')
  const prepared=await prepare({...options,mode:receipt.mode})
  if(!isDeepStrictEqual(receipt,prepared.identity))throw Error('profile artifact receipt/current accepted/source/original bytes drifted')
  const bytes=await readPrivateFile(options.outputPath)
  if(sha256(bytes)!==receipt.compiled_sha256||!bytes.equals(Buffer.from(prepared.sql)))throw Error('profile artifact SQL bytes drifted or incomplete')
  return {...receipt,status:'SOURCE_ARTIFACT_BYTES_MATCH',live_operations:0}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  try {
    const [catalogPath,outputPath,mode='rollback-only',originalCatalogPath,originalArtifactPath,...extra]=process.argv.slice(2)
    if(!catalogPath||!outputPath||!['rollback-only','commit','recovery-hold','verify'].includes(mode)||extra.length)throw Error('usage: node scripts/compileProfilePrivilegePackage.mjs <accepted-private-catalog.json> <new-output.sql> [rollback-only|commit|recovery-hold|verify] [original-accepted-catalog.json original-commit-artifact.sql]')
    const options={catalogPath,outputPath,mode,originalCatalogPath,originalArtifactPath}
    const result=await (mode==='verify'?verifyProfilePrivilegeArtifact:compileProfilePrivilegeArtifact)(options)
    console.log(JSON.stringify({contract:result.contract,mode:result.mode,status:result.status??'SOURCE_ARTIFACT_COMPILED',
      qualification:result.qualification,source_sha256:result.source_sha256,compiled_sha256:result.compiled_sha256,
      accepted_catalog_file_sha256:result.accepted_catalog_file_sha256,source_artifact_count:result.source_artifacts.length,live_operations:0}))
  } catch(error) {console.error(error.message);process.exitCode=1}
}
