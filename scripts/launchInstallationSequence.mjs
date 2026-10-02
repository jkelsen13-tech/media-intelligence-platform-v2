import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { applyFoundation } from './mipConsolidationRestore.mjs'
import { reviewedVersionCatalogQuery, reviewedVersionInstalledCatalogQuery } from './reviewedPublicVersionPackage.mjs'
import { storyFollowingCatalogQuery } from './storyFollowingPackage.mjs'
import { marketsCatalogQuery } from './marketsDirectoryPackage.mjs'
import { legacyAtomicCatalogQuery, legacyAtomicInstalledCatalogQuery } from './legacyAtomicCompletionPackage.mjs'
import { comparisonVersionCatalogQuery } from './comparisonReviewedVersionPackage.mjs'
import { selectiveExecutionCatalogQuery,selectiveExecutionInstalledCatalogQuery } from './selectiveExecutionPackage.mjs'

const root = new URL('../', import.meta.url)
const read = path => readFile(new URL(path, root), 'utf8')
export const sha256 = value => createHash('sha256').update(value).digest('hex')
const literal = value => "'" + String(value).replaceAll("'", "''") + "'"
export const NATIVE_PRIVATE_PREREQUISITES = Object.freeze([
  '20260906042413_evidence_change_queue_v1.sql',
  '20260906051224_evidence_assessment_dependencies_v1.sql',
  '20260906071525_investigation_change_briefings_v1.sql',
  '20260906075718_investigation_workspace_batch_v1.sql',
])
export const INITIAL_STAGES = Object.freeze([
  { id:'reviewed-public-versions', proposal:'supabase/source-proposals/public-reviewed-versions-v1.sql', rollback:'supabase/source-proposals/public-reviewed-versions-v1.rollback.sql',
    setting:'mip.public_reviewed_versions_expected_catalog', query:reviewedVersionCatalogQuery,
    installedQuery:reviewedVersionInstalledCatalogQuery, originalSetting:'mip.public_reviewed_versions_original_catalog', rollbackSetting:'mip.public_reviewed_versions_rollback_expected_catalog' },
  { id:'public-story-following', proposal:'supabase/source-proposals/story_following_v1.sql', rollback:'supabase/source-proposals/story_following_v1.rollback.sql',
    catalogHelper:'supabase/source-proposals/story_following_v1.catalog.sql', setting:'mip.story_following_expected_catalog', query:storyFollowingCatalogQuery,
    installedQuery:storyFollowingCatalogQuery, originalSetting:'mip.story_following_expected_catalog', rollbackSetting:'mip.story_following_expected_installed_catalog' },
  { id:'private-relevant-inputs', proposal:'supabase/source-proposals/assessment_relevant_inputs_v1.sql', prerequisite:true },
  { id:'private-postcapture-receipts', proposal:'supabase/source-proposals/investigation_selective_intake_v1.sql', prerequisite:true },
  { id:'selective-execution', proposal:'supabase/source-proposals/selective_intake_execution_v1.sql', rollback:'supabase/source-proposals/selective-intake-pack/remove-empty-extension.sql',
    containment:'supabase/source-proposals/selective-intake-pack/rollback.sql',query:selectiveExecutionCatalogQuery,
    installedQuery:selectiveExecutionInstalledCatalogQuery,setting:'mip.selective_execution_expected_catalog',
    originalSetting:'mip.selective_execution_original_catalog',rollbackSetting:'mip.selective_execution_rollback_expected_catalog' },
  { id:'legacy-atomic-completion', proposal:'supabase/source-proposals/legacy-atomic-completion-v1.sql',
    containment:'supabase/source-proposals/legacy-atomic-pack/rollback.sql', setting:'mip.legacy_atomic_expected_catalog', query:legacyAtomicCatalogQuery,
    installedQuery:legacyAtomicInstalledCatalogQuery, rollbackSetting:'mip.legacy_atomic_rollback_expected_catalog' },
  { id:'markets-directory', proposal:'supabase/source-proposals/markets-directory-v2.sql', rollback:'supabase/source-proposals/markets-directory-v2-rollback.sql',
    setting:'mip.markets_expected_catalog', query:marketsCatalogQuery },
  { id:'reviewed-comparison', proposal:'supabase/source-proposals/comparison-reviewed-versions-v1.sql', rollback:'supabase/source-proposals/comparison-reviewed-versions-v1.rollback.sql',
    setting:'mip.comparison_expected_catalog', query:comparisonVersionCatalogQuery, installedQuery:comparisonVersionCatalogQuery,
    originalSetting:'mip.comparison_original_catalog', rollbackSetting:'mip.comparison_rollback_expected_catalog' },
])

// Explicitly disposable fixture foundation. No env, endpoint, keys or network.
// Native prerequisite migrations are NOT a protected-backend replay plan.
export async function prepareLaunchFixtureFoundation(db) {
  await applyFoundation(db)
  await db.exec('create table public.mip_profiles(id uuid primary key)')
  // Restored deployed-native schema representation required by Legacy. This is
  // fixture foundation, never a proposed live alteration or migration replay.
  await db.exec(`alter table public.articles add column image_url text,add column image_alt text,add column entities_extracted_at timestamptz;
    create table public.article_entities(article_id uuid not null references public.articles(id),entity_id uuid not null references public.entities(id),confidence numeric not null default 0.5,extraction_method text not null default 'heuristic',role text,primary key(article_id,entity_id))`)
  for (const file of NATIVE_PRIVATE_PREREQUISITES) await db.exec(await read('supabase/migrations/'+file))
  await db.exec('set search_path=pg_catalog')
}
export async function launchCatalogQuery() { return (await read('scripts/launchInstallSequenceCatalog.sql')).trim().replace(/;$/, '') }
export async function launchCatalog(db) { return (await db.query(await launchCatalogQuery())).rows[0].catalog }
export function catalogDelta(before,after) {
  const delta={}
  for(const key of ['schemas','relations','functions','roles','default_privileges']) {
    const left=new Map((before[key]??[]).map(row=>[row.identity,row])),right=new Map((after[key]??[]).map(row=>[row.identity,row]))
    delta[key]={added:[...right.keys()].filter(id=>!left.has(id)),removed:[...left.keys()].filter(id=>!right.has(id)),
      changed:[...right.keys()].filter(id=>left.has(id)&&JSON.stringify(left.get(id))!==JSON.stringify(right.get(id)))}
  }
  return delta
}
// Adds only a guard and stage-local baseline capture inside the proposal's own
// single transaction. The caller supplies a separately accepted fresh baseline;
// a fixture captures its own synthetic approval, never a live approved baseline.
async function guardTransaction(source,stageId,approvedCatalog,settings=[]){
  const catalogSql=await launchCatalogQuery()
  if((source.match(/^begin;\s*$/gm)??[]).length!==1||(source.match(/^commit;\s*$/gm)??[]).length!==1) throw Error('one explicit proposal transaction required')
  const body=`declare fresh jsonb; approved jsonb:=${literal(JSON.stringify(approvedCatalog))}::jsonb; begin\n`+
    `select catalog into fresh from (${catalogSql}) launch_catalog;\n`+
    `if fresh is distinct from approved then raise exception ${literal('launch stage '+stageId+' approved catalogue missing or drifted')}; end if;\n`+
    `perform set_config('mip.launch_stage_capture',fresh::text,true);\nend;`
  let delimiter='$launch_guard_'+sha256(body).slice(0,24)+'$'
  while(body.includes(delimiter))delimiter=delimiter.slice(0,-1)+'x$'
  const guard=`\n-- Exact SOURCE proposal sha256: ${sha256(source)}\n`+
    `set local standard_conforming_strings=on;\nset local search_path=pg_catalog;\n`+
    `do ${delimiter}${body}${delimiter};\n`+
    settings.map(({name,query,value})=>`select set_config(${literal(name)},${query?'(('+query.trim().replace(/;$/,'')+'))::text':literal(JSON.stringify(value))},true);\n`).join('')+
    `select current_setting('mip.launch_stage_capture')::jsonb as launch_stage_capture,txid_current()::text as launch_transaction_id`+
    (settings.find(s=>s.query)?`,current_setting(${literal(settings.find(s=>s.query).name)})::jsonb as launch_native_stage_capture`:'')+`;\n`
  const sql=source.replace(/^begin;\s*$/m,match=>match+guard)
  return {sql,sourceHash:sha256(source),compiledHash:sha256(sql)}
}
export async function compileStageSql(stage,approvedCatalog) {
  return guardTransaction(await read(stage.proposal),stage.id,approvedCatalog,
    stage.query?[{name:stage.setting,query:await stage.query()}]:[])
}
// Separate B rehearsal artifact, preserving the original one-transaction shape.
// This does not authorize protected execution. Never wrap a COMMIT proposal in
// an outer rollback and assume that outer transaction contains its changes.
export async function compileRollbackOnlyStageSql(stage,approvedCatalog){
  const compiled=await compileStageSql(stage,approvedCatalog)
  const sql=compiled.sql.replace(/^commit;\s*$/m,'rollback;\n')
  return {...compiled,sql,compiledHash:sha256(sql),mode:'rollback-only-rehearsal'}
}
export async function installLaunchStageFixture(db,stage,{approvedCatalog}={}) {
  if(!approvedCatalog) throw Error('separate approved stage catalogue required')
  if(stage.catalogHelper) await db.exec(await read(stage.catalogHelper))
  const original=await launchCatalog(db)
  const compiled=await compileStageSql(stage,approvedCatalog)
  const result=await db.exec(compiled.sql)
  const capture=result.flatMap(part=>part.rows??[]).find(row=>row.launch_stage_capture)
  if(!capture) throw Error('transaction-local capture receipt missing')
  const installed=await launchCatalog(db)
  return {id:stage.id,proposal:stage.proposal,sourceHash:compiled.sourceHash,compiledHash:compiled.compiledHash,
    original,installed,nativeOriginal:capture.launch_native_stage_capture??null,captured: capture.launch_stage_capture,transactionId:capture.launch_transaction_id,delta:catalogDelta(original,installed)}
}
// Empty restore where supplied; containment otherwise. Never substitutes an
// uninstall for a preservation-only package. Native baselines captured afresh
// within this original rollback transaction, against separate full approval.
export async function recoverLaunchStageFixture(db,stage,receipt,{approvedCatalog,containment=false}={}) {
  if(!approvedCatalog) throw Error('separate approved recovery catalogue required')
  const path=containment?stage.containment:stage.rollback
  if(!path) throw Error('requested recovery not supplied by owner')
  if(stage.catalogHelper) await db.exec(await read(stage.catalogHelper))
  const compiled=await compileRecoveryStageSql(stage,receipt,approvedCatalog,{containment})
  await db.exec(compiled.sql)
  const after=await launchCatalog(db)
  return {path,mode:containment?'preserve-and-revoke':'empty-owner-restore',sourceHash:compiled.sourceHash,compiledHash:compiled.compiledHash,
    after,delta:catalogDelta(approvedCatalog,after)}
}
export async function compileRecoveryStageSql(stage,receipt,approvedCatalog,{containment=false}={}){
  if(!approvedCatalog)throw Error('separate approved recovery catalogue required')
  const path=containment?stage.containment:stage.rollback
  if(!path)throw Error('requested recovery not supplied by owner')
  const settings=[]
  if(stage.rollbackSetting) settings.push({name:stage.rollbackSetting,query:await (stage.installedQuery??stage.query)()})
  if(stage.originalSetting) settings.push({name:stage.originalSetting,value:receipt.nativeOriginal})
  return guardTransaction(await read(path),stage.id+'-recovery',approvedCatalog,settings)
}
export async function fileIdentity(path) { return {path,sha256:sha256(await read(path))} }
