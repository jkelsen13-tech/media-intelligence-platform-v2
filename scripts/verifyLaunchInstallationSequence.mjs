import { spawnSync } from 'node:child_process'
import { readFile,writeFile,readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { INITIAL_STAGES,NATIVE_PRIVATE_PREREQUISITES,fileIdentity,sha256 } from './launchInstallationSequence.mjs'
import { PUBLIC_SURFACE_TRANSFER_CHUNKS,PUBLIC_SURFACE_PUBLICATION_GATES,PUBLIC_SURFACE_AUTHENTICATED_REVIEW_REVOKE } from './mipConsolidationRestore.mjs'

const root=new URL('../',import.meta.url),path=file=>new URL(file,root).pathname
const date='2026-10-02'
const runtimes=[{id:'NODE24',executable:process.execPath},{id:'NODE22',executable:'/workspace/mip-runtime22/node_modules/node/bin/node'}]
const fixtureFiles=['scripts/launchInstallationSequence.mjs','scripts/launchInstallSequenceCatalog.sql','scripts/compileLaunchInstallationStage.mjs',
  'scripts/verifyLaunchInstallationSequence.mjs','tests/launchInstallationSequence.test.mjs','tests/launchInstallationSequenceFixture.mjs',
  'scripts/mipConsolidationRestore.mjs','scripts/reviewedPublicVersionPackage.mjs','scripts/storyFollowingPackage.mjs','scripts/marketsDirectoryPackage.mjs',
  'scripts/legacyAtomicCompletionPackage.mjs','scripts/comparisonReviewedVersionPackage.mjs','scripts/selectiveExecutionPackage.mjs',
  'docs/MIP_WHOLE_INSTALL_SEQUENCE_2026-10-02.md','package-lock.json',
  ...[...NATIVE_PRIVATE_PREREQUISITES,...PUBLIC_SURFACE_TRANSFER_CHUNKS,PUBLIC_SURFACE_PUBLICATION_GATES,PUBLIC_SURFACE_AUTHENTICATED_REVIEW_REVOKE,
    '20260905082406_evidence_pipeline_reliability.sql','20260905151626_mip_consolidation_delta.sql','20260905160001_event_scoped_public_article_counts.sql',
    '20260905182355_mip_nested_claim_publication_gates.sql','20260905203600_mip_legacy_graph_private_staging.sql','20260909153133_comparison_explanation_event_binding.sql'].map(f=>'supabase/migrations/'+f)]
const readerArtifacts=['src/lib/reviewedPublicVersion.js','src/lib/reviewedPublicVersionBackend.js','src/lib/supabase.js','src/lib/newsBackend.js',
  'src/lib/newsStatePolicy.js','src/lib/newsStoryState.js','src/views/NewsView.jsx','src/views/NewsStoryReader.jsx','src/lib/storyFollowingClient.js',
  'src/components/StoryFollowingControls.jsx','src/components/StoryFollowingPanel.jsx','src/lib/investigationBackend.js','src/lib/marketsBackend.js',
  'src/lib/sourceComparisonReadPath.js','src/lib/publicDataBackend.js','supabase/functions/investigation-api/index.ts',
  'supabase/functions/backfill-legacy/index.ts','supabase/functions/investigation-api/handler.mjs',
  'supabase/source-proposals/storyFollowingHandler.mjs','supabase/source-proposals/investigationSelectiveIntakeHandler.mjs',
  'scripts/selectiveIntakeExecution.mjs','scripts/selectiveIntakeDeclaration.mjs']
// This verifier creates only disposable local engine instances through node:test.
// Runtime paths are explicit; there is no backend URL, key, provider or psql call.
const receiptFiles=[]
for(const runtime of runtimes){
  if(!existsSync(runtime.executable))throw Error('required runtime missing: '+runtime.id)
  const output=`docs/MIP_WHOLE_INSTALL_SEQUENCE_${runtime.id}_${date}.json`
  const run=spawnSync(runtime.executable,['--test','tests/launchInstallationSequence.test.mjs'],{cwd:root,encoding:'utf8',
    env:{...process.env,MIP_LAUNCH_SEQUENCE_RECEIPT:path(output)},maxBuffer:16*1024*1024})
  process.stdout.write(run.stdout??'');process.stderr.write(run.stderr??'')
  if(run.error||run.status!==0)throw Error('disposable SQL qualification failed: '+runtime.id)
  const receipt=JSON.parse(await readFile(path(output),'utf8'))
  if(receipt.status!=='PASS')throw Error('incomplete qualification receipt: '+runtime.id)
  receiptFiles.push(output)
}
const packageFiles=[]
for(const directory of ['selective-intake-pack','legacy-atomic-pack'])
  for(const entry of await readdir(path('supabase/source-proposals/'+directory),{withFileTypes:true}))if(entry.isFile())packageFiles.push('supabase/source-proposals/'+directory+'/'+entry.name)
for(const entry of await readdir(path('supabase/source-proposals'),{withFileTypes:true}))
  if(entry.isFile()&&/^(public-reviewed-versions-v1|story_following_v1|markets-directory-v2|comparison-reviewed-versions-v1)[.]/.test(entry.name))packageFiles.push('supabase/source-proposals/'+entry.name)
const files=[...new Set([...fixtureFiles,...readerArtifacts,...packageFiles,...INITIAL_STAGES.flatMap(s=>[s.proposal,s.rollback,s.containment,s.catalogHelper].filter(Boolean))])].sort()
for(const file of files)if(!existsSync(path(file)))throw Error('exact source artifact missing: '+file)
const qualifications=await Promise.all(receiptFiles.map(fileIdentity))
const main=JSON.parse(await readFile(path(receiptFiles[0]),'utf8'))
const approvalFile=`docs/MIP_WHOLE_INSTALL_APPROVAL_${date}.md`
const approval=`# Whole launch installation D review cover — ${date}\n\n`+
  `**SOURCE/SYNTHETIC QUALIFIED; UNAPPLIED.** Proposed target: existing protected project \`qikvmopbtijoebdqosyq\`, its verified existing database/article publication and private native-owner authority. No live transaction, role, grant, registration, acquisition, deployment or release occurred. The retained SELECT-only live inventory is metadata; fresh full post-dependency target catalogs and exact operator identity remain required preflight inputs.\n\n`+
  `Approval scope is each exact transaction below, with its separately accepted fresh catalog and compiled SHA256. Role creation/grants, reader/gateway deployment, actual source/rights/criteria enablement and final release each remain distinct D; protected B rehearsal also needs separate exact rollback-only D. Do not combine these approvals or reuse the first-stage baseline.\n\n`+
  `| Order | Stage | Exact source proposal SHA256 |\n|---|---|---|\n`+
  main.stages.map((s,i)=>`| ${i+1} | ${s.id} | \`${s.sourceHash}\` |`).join('\n')+`\n\n`+
  `The [complete source/artifact inventory](MIP_WHOLE_INSTALL_SEQUENCE_SOURCE_${date}.json) binds install/catalog/helper/recovery/reader/route bytes and actual new-object/signature/changed-owner scopes. The [operator sequence](MIP_WHOLE_INSTALL_SEQUENCE_${date}.md) supplies target/role preflight, dependency verification, fresh own-transaction baseline capture, local compiler, reader/data readback and restart checks. The native deployed private migrations are disposable fixture foundation only: never replay them on the protected target. Relevance and postcapture are independently hashed absent-owner prerequisite stages; installed mismatches HOLD.\n\n`+
  `Legacy's supplied stage explicitly creates \`mip_legacy_completion_owner\` NOLOGIN/NOINHERIT/NOBYPASSRLS with fixed narrow privileges and no service membership. Approve those exact role/policy/grant bytes separately; no extra role is proposed by the new sequence scripts. Comparison is deliberately denied after stage1 and restored only by stage8's exact binding successor; reader availability grants no source/proposition admission. Empty directories and empty criteria/rights registries authorize no collection.\n\n`+
  `Recovery: Comparison and Markets empty rollbacks restore their exact predecessor catalogs; Legacy and Selective use supplied exact revoke-only stops, retaining roles, policies, native/private/public histories and receipt heads. Following/public exact empty restoration is proven at their own checkpoints. Whole reverse recovery does **not** erase retained owners or restore one global pre-install catalog. Populated destructive rollback refuses; preserve rows and approve exact containment/restart instead.\n\n`+
  `Evidence: [Node24](MIP_WHOLE_INSTALL_SEQUENCE_NODE24_${date}.json) and [Node22](MIP_WHOLE_INSTALL_SEQUENCE_NODE22_${date}.json), 12/12 combined cases each. Actual disposable SQL proves all8 stages coexist; wrong/global/drifted baseline refusal; each separate no-COMMIT rollback-only rehearsal; exact supplied empty checkpoint restoration; retained whole reverse containment; populated guards and byte-identical history preservation; reader/service/role boundaries. Single-session PGlite is not hosted PostgreSQL, JWT/PostgREST, independent lock concurrency, provider rights, genuine reviewer/policy/corpus, device/appearance or release evidence. Historical receipts remain unchanged. External push/email stays post-launch.\n`
await writeFile(path(approvalFile),approval)
files.push(approvalFile)
const manifest={contract:'mip-launch-install-sequence-source-v1',date,status:'SOURCE_SYNTHETIC_QUALIFIED_UNAPPLIED',live_operations:0,
  target_proposal:'qikvmopbtijoebdqosyq; target/role/catalog/bytes need separate exact D; no connection attempted',
  sources:await Promise.all(files.map(fileIdentity)),qualifications,stage_order:INITIAL_STAGES.map(s=>s.id),
  fixture_stage_object_scopes:main.stages.map(s=>({id:s.id,source_sha256:s.sourceHash,delta:s.delta})),
  fixture_compiled_artifacts:main.stages.map(s=>({id:s.id,sha256:s.compiledHash,baseline_sha256:s.originalCatalogHash,
    semantics:'synthetic fixture artifact only; protected fresh baseline produces a different separately approved compiled hash'})),
  recovery:'Exact package empty checkpoint restoration; whole reverse Comparison/Markets restoration then Legacy/Selective preserve-and-revoke; native prerequisites and earlier owners retained',
  remaining_gates:['Protected B rollback-only transaction authorization','Exact target SQL/role installation D and installed readback','Reader/gateway deployment D and current Auth/account readback',
    'Real source rights/bytes/provider/criteria/method acceptance and operation enablement C+D','Independent review/device/appearance/release D']}
await writeFile(path(`docs/MIP_WHOLE_INSTALL_SEQUENCE_SOURCE_${date}.json`),JSON.stringify(manifest,null,2)+'\n')
console.log('SOURCE_ONLY_QUALIFIED',sha256(JSON.stringify(manifest)))
