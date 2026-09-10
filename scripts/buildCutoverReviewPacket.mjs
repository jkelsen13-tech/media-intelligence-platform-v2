import {createHash} from 'node:crypto'
import {readFileSync, writeFileSync, statSync} from 'node:fs'
import {join, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {execFileSync} from 'node:child_process'

const repoRoot=resolve(fileURLToPath(new URL('..',import.meta.url)))
const packetDir='verifier/mip-production-cutover-review-v1'
const hex64=/^[0-9a-f]{64}$/

export const OPERATIONAL_BASELINE_COMMIT='1dc317200b7a928fad85d06b43351b60e2a50d92'
export const PACKET_ID='MIP_PRODUCTION_CUTOVER_REVIEW_v1'

// Secret-free disclosure set. Manifest itself is excluded from hashed_files so a
// later freeze commit can stamp review_packet_commit without invalidating hashes.
export const DISCLOSED_PATHS=[
  'docs/COMPARISON_CAPABILITY_SEPARATION_2026-09-10.md',
  'docs/COMPARISON_GENERATION_TRANSACTION_2026-09-09.md',
  'docs/COMPARISON_POSTGRES_CONCURRENCY_2026-09-09.md',
  'docs/COMPARISON_SELECTION_2026-09-10.md',
  'docs/COMPARISON_SOURCE_SNAPSHOT_2026-09-09.md',
  'docs/COMPARISON_RELEASE_THRESHOLD_2026-09-08.md',
  'docs/EVIDENCE_DISCOVERY_EVALUATION_V1.md',
  'docs/MIP_CUTOVER_STAGING_PROPOSAL_2026-09-10.md',
  'docs/MIP_PRODUCTION_CUTOVER_REVIEW_PACKET_2026-09-10.md',
  'docs/MIP_SEMANTIC_EVALUATION_POLICY_PROPOSAL_2026-09-10.md',
  'docs/RECORD_CANDIDATE_EVALUATION_2026-09-08.md',
  'docs/UNCERTAINTY_VOCABULARY.md',
  'package.json',
  'package-lock.json',
  'scripts/buildCutoverReviewPacket.mjs',
  'scripts/evaluateRecordCandidates.mjs',
  'supabase/qualification/comparison-generations/capability.sql',
  'supabase/qualification/comparison-generations/contract.sql',
  'supabase/qualification/comparison-generations/selection.sql',
  'supabase/qualification/comparison-generations/source-fixture.sql',
  'supabase/qualification/comparison-generations/source-snapshot.sql',
  'supabase/qualification/membership-prepared/deployment.json',
  'supabase/runtime-snapshots/source-comparison-run-v16/articleInputReadback.js',
  'supabase/runtime-snapshots/source-comparison-run-v16/index.ts',
  'supabase/runtime-snapshots/source-comparison-run-v16/lib.js',
  'supabase/runtime-snapshots/source-comparison-run-v16/loadedLanguageLexicon.json',
  'supabase/runtime-snapshots/source-comparison-run-v16/membershipFingerprint.js',
  'supabase/runtime-snapshots/source-comparison-run-v16/membershipScoreReadback.js',
  'supabase/runtime-snapshots/source-comparison-run-v16/projectionConfig.js',
  'tests/comparisonCapabilitySeparation.test.mjs',
  'tests/comparisonGenerationTransaction.test.mjs',
  'tests/comparisonSelection.test.mjs',
  'tests/comparisonSourceSnapshot.test.mjs',
  'tests/cutoverReviewPacket.test.mjs',
  'tests/recordCandidateEvaluation.test.mjs',
  'verifier/comparisonPostgresConcurrency.py',
  '.github/workflows/comparison-postgres.yml',
  '.github/workflows/deploy-cloud-run.yml',
  `${packetDir}/REVIEW_RESULT.json`,
  `${packetDir}/OWNER_ACCEPTANCE.json`,
  `${packetDir}/evaluation-policy.json`,
  `${packetDir}/runtime-inventory.json`,
  `${packetDir}/runtime-permission-proposal.json`,
  `${packetDir}/rpc-signatures.json`,
  `${packetDir}/remaining-dependencies.json`,
  `${packetDir}/known-limitations.json`
]

export const EXCLUDED_FROM_PACKET=[
  'credentials, tokens, Vault secret values, JWT/session contents',
  'auth.users emails and auth.sessions IP/user-agent/refresh-token material',
  'private investigation records and raw production source payloads',
  'live Edge Function source bodies (hashes/metadata only)',
  'cron.job command text',
  'tests/golden fixtures and other uncleared third-party article bodies',
  'the 10 September 2026 owner decision brief body (NOT RECOVERED)',
  'MIP_PIPELINE_SERVICE_KEY / GCP_SA_KEY values (names only)'
]

export function sha256File(path){
  return createHash('sha256').update(readFileSync(join(repoRoot,path))).digest('hex')
}

export function git(args){
  return execFileSync('git',args,{cwd:repoRoot,encoding:'utf8'}).trim()
}

export function buildManifest({reviewPacketCommit=null}={}){
  const hashed_files=DISCLOSED_PATHS.map(path=>({path,sha256:sha256File(path),bytes:statSync(join(repoRoot,path)).size}))
  for(const row of hashed_files){
    if(!hex64.test(row.sha256)) throw new Error('hash is not 64 hex: '+row.path)
  }
  return {
    packet_id:PACKET_ID,
    disclosure_status:'proposed_not_transmitted',
    operational_baseline_commit:OPERATIONAL_BASELINE_COMMIT,
    review_packet_commit:reviewPacketCommit,
    review_packet_commit_resolution:'Stamp the git commit that contains the hashed_files tree. Do not mix hashes from a different commit.',
    mixed_candidate_rule:'If any hashed file differs from this manifest, the packet is not the frozen candidate.',
    hashed_files,
    excluded:EXCLUDED_FROM_PACKET,
    rights_check:'Included paths are already in the private GitHub repository as MIP implementation, qualification, or operator documentation. No live payloads, Auth records, or uncleared third-party bodies were added. Redaction is by omission of whole classes, not by rewriting test assertions.',
    independent_reviewer_access:'Owner supplies this packet. This implementation agent does not contact Grok or transmit material.',
    secret_free:true
  }
}

export function assertPacketHygiene(files=DISCLOSED_PATHS){
  const forbidden=[
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\./,
    /\bsb_secret_[A-Za-z0-9]+/,
    /\bMIP_PIPELINE_SERVICE_KEY\s*=\s*\S+/,
    /"private_key"\s*:\s*"-----BEGIN/,
    /\bAIza[0-9A-Za-z_-]{20,}/
  ]
  const findings=[]
  for(const path of files){
    const text=readFileSync(join(repoRoot,path),'utf8')
    for(const re of forbidden){
      if(re.test(text)) findings.push({path,pattern:String(re)})
    }
  }
  return findings
}

export function writeManifest(manifest){
  const dest=join(repoRoot,packetDir,'disclosure-manifest.json')
  writeFileSync(dest,JSON.stringify(manifest,null,2)+'\n')
  return dest
}

const write=process.argv.includes('--write')
const stamp=process.argv.includes('--stamp-head')
const self=fileURLToPath(import.meta.url)
const invoked=process.argv[1] && resolve(process.argv[1])===self
if(invoked){
  const head=git(['rev-parse','HEAD'])
  const manifest=buildManifest({reviewPacketCommit:stamp?head:null})
  if(write || stamp){
    writeManifest(manifest)
    console.log('wrote '+packetDir+'/disclosure-manifest.json files='+manifest.hashed_files.length+' head='+head+' stamped='+Boolean(stamp))
  }else{
    process.stdout.write(JSON.stringify(manifest,null,2)+'\n')
  }
}
