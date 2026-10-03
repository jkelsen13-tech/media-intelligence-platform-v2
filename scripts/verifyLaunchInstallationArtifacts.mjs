// Disposable local qualification only. Never run the historical dated verifier
// to write successor evidence over an earlier qualified generation.
import { readFile,writeFile,mkdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { PGlite } from '@electric-sql/pglite'
import { launchInstallationSourceIdentities } from './compileLaunchInstallationStage.mjs'
import { fileIdentity,NATIVE_PRIVATE_PREREQUISITES } from './launchInstallationSequence.mjs'

const [runtime,output,...extra]=process.argv.slice(2)
if(!['node22','node24'].includes(runtime)||!output||extra.length)throw Error('usage: node scripts/verifyLaunchInstallationArtifacts.mjs <node22|node24> <new-receipt-directory>')
const executable=runtime==='node22'?'/workspace/mip-runtime22/node_modules/node/bin/node':process.execPath
const version=spawnSync(executable,['--version'],{encoding:'utf8'})
if(version.status!==0||!version.stdout.startsWith(runtime==='node22'?'v22.':'v24.'))throw Error('exact requested runtime unavailable')
await mkdir(output)
const root=new URL('../',import.meta.url)
const sourceIdentities=async()=>[
  ...await launchInstallationSourceIdentities(),
  ...await Promise.all([
    'scripts/verifyLaunchInstallationArtifacts.mjs','tests/launchInstallationArtifact.test.mjs',
    'tests/launchInstallationSequence.test.mjs','tests/launchInstallationSequenceFixture.mjs',
    'tests/legacyOwnerTransfer.test.mjs','tests/legacyOwnerTransferFixture.mjs',
    'tests/fixtures/frozenLaunchGate/legacy-atomic-completion-v1.sql','tests/fixtures/frozenLaunchGate/legacy-atomic-completion-v1.provenance.json',
    ...NATIVE_PRIVATE_PREREQUISITES.map(name=>'supabase/migrations/'+name),
  ].map(fileIdentity)),
]
const sources=await sourceIdentities(),db=await PGlite.create()
let engine
try{engine=(await db.query('select version() engine,current_setting(\'server_version\') server_version')).rows[0]}finally{await db.close()}
const started=new Date().toISOString()
const run=spawnSync(executable,['--test','--test-reporter=tap','tests/launchInstallationArtifact.test.mjs','tests/launchInstallationSequence.test.mjs','tests/legacyOwnerTransfer.test.mjs'],{
  cwd:root,encoding:'utf8',maxBuffer:16*1024*1024,
  env:{...process.env,MIP_LAUNCH_SEQUENCE_RECEIPT:join(output,'whole-sequence.json'),MIP_LEGACY_OWNER_RECEIPT:join(output,'managed-owner.json')},
})
const tap=run.stdout??''
await writeFile(join(output,'tests.tap'),tap+(run.stderr??''),{flag:'wx'})
const counts={}
for(const key of ['tests','pass','fail','cancelled','skipped','todo','duration_ms']){
  const match=tap.match(new RegExp('^# '+key+' ([0-9.]+)$','m'));counts[key]=match?Number(match[1]):null
}
const whole=JSON.parse(await readFile(join(output,'whole-sequence.json'),'utf8'))
const managed=JSON.parse(await readFile(join(output,'managed-owner.json'),'utf8'))
const sourceStable=isDeepStrictEqual(sources,await sourceIdentities())
const pass=!run.error&&run.status===0&&counts.tests===35&&counts.pass===35&&['fail','cancelled','skipped','todo'].every(k=>counts[k]===0)&&whole.status==='PASS'&&managed.status==='PASS'&&sourceStable
const receipt={contract:'mip-launch-install-packages-qualification-v1',date:'2026-10-03',status:pass?'PASS':'FAIL',
  started_at:started,finished_at:new Date().toISOString(),runtime:version.stdout.trim(),engine,counts,source_stable:sourceStable,sources,
  source_only:true,synthetic_disposable:true,live_operations:0,
  cases:['strict complete security catalog and duplicate refusal','paired-file collision/failure/concurrent publication','read-only exact artifact/catalog/current-source/original-receipt verification',
    'before-guard timeout observation and rollback/session restoration','ACL/RLS drift and occupied owner namespace refusal',
    'all eight fresh stage catalogs and supplied exact checkpoint recovery','populated destructive refusal and retained history preservation',
    'existing-data cutover and immutable reader no-fallback','ordinary profile/Following/raw/private denial','distinct non-superuser managed-owner success and injected-failure grantor/ACL/membership restoration'],
  limits:['PGlite PostgreSQL18.3/WASM disposable fixture; not native PostgreSQL17 or the protected hosted target',
    'single-session fixture; no genuine independent-connection locking, Auth/JWT/PostgREST/account readback or provider qualification',
    'lock/statement/inactivity limits observed as settings; no measured total transaction or hosted cancellation guarantee',
    'SQL compilation/readback and synthetic owner proof grant no rehearsal/install/recovery/population/activation/release authority'],
  test_exit_code:run.status,error:run.error?.message??null}
await writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'})
console.log(JSON.stringify({status:receipt.status,runtime:receipt.runtime,counts,receipt:join(output,'receipt.json')}))
if(!pass)process.exitCode=1
