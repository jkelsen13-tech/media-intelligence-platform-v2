// Source-only host refusal proof; no database connection or credential submission.
import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {randomBytes,createHash} from 'node:crypto'
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {validateProvisioningHostConfig} from './hostConfig.mjs'
import pg from 'pg'
import {reconcileManagedPrerequisites,provisionManagedPrerequisites} from './provision.mjs'
test('held host refuses unsupported invocation without exposing injected values',()=>{
 const canary=randomBytes(36).toString('base64url')
 const child=spawnSync(process.execPath,[new URL('./run.mjs',import.meta.url).pathname],{encoding:'utf8',
 env:{PATH:process.env.PATH,GITHUB_EVENT_NAME:'push',QIK_NATIVE_INSTALLER_DATABASE_URL:canary,QIK_NATIVE_AUDIT_DATABASE_URL:canary,QIK_NATIVE_METADATA_AUDIT_DATABASE_URL:canary}})
 assert.equal(child.status,1)
 assert.equal(child.stderr,'')
 assert.equal(child.stdout.includes(canary),false)
 const r=JSON.parse(child.stdout)
 assert.equal(r.phase,'host_admission');assert.equal(r.state,'outcome_unknown')
 assert.equal(r.needs_reconciliation,true);assert.equal(r.installation_allowed,false)
 assert.equal(r.activation_allowed,false);assert.equal(r.material_access_allowed,false);assert.equal(r.publication_allowed,false)
})
test('held host implementation pin matches actual module bytes',()=>{
 const bytes=readFileSync(new URL('./provision.mjs',import.meta.url))
 const blob=createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex')
 const host=readFileSync(new URL('./run.mjs',import.meta.url),'utf8')
 assert.ok(host.includes("'supabase/qualification/native-provisioning-compat/provision.mjs':'"+blob+"'"))
})

test('strict prerequisite configuration rejects extra keys and incomplete input',()=>{
 const config={disposable:false,provisioningProfile:'supabase-managed-v1',operationId:'1'.repeat(32),expectedLogin:'postgres',auditLogin:'mip_native_audit_v1',expectedMetadataAuditor:'mip_native_metadata_audit_v1',c3OperationId:'2'.repeat(32),c3ManifestSha256:'3'.repeat(64)}
 const parse=value=>{const raw=JSON.stringify(value);return validateProvisioningHostConfig(raw,createHash('sha256').update(raw).digest('hex'))}
 assert.deepEqual(parse(config),config)
 for(const value of [null,[],{...config,disposable:true},{...config,operationId:undefined},{...config,provisioningProfile:'other'}])assert.throws(()=>parse(value))
})

test('real activation host passes exact source and manifest gates before refusing invalid config',async()=>{
 const release=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim()
 assert.match(release,/^[a-f0-9]{40}$/)
 const response=await fetch('https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt',{signal:AbortSignal.timeout(30000)})
 assert.equal(response.ok,true)
 const ca=Buffer.from(await response.arrayBuffer())
 assert.equal(createHash('sha256').update(ca).digest('hex'),'700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7')
 const dir=mkdtempSync(join(tmpdir(),'qik-host-source-'))
 try{
  const cert=join(dir,'public-ca.crt');writeFileSync(cert,ca,{mode:0o600})
  const manifest=readFileSync(new URL('../../../verifier/qik-native-activation-successor.json',import.meta.url))
  const env={PATH:process.env.PATH,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:'jkelsen13-tech/media-intelligence-platform-v2',GITHUB_RUN_ATTEMPT:'1',
   GITHUB_SHA:release,QIK_APPROVED_RELEASE_SHA:release,MIP_NATIVE_HOST_RELEASE_SHA:release,
   MIP_NATIVE_HOST_ADMISSION:'qualified-source-metadata-only-activation-v1',MIP_NATIVE_HOST_BUDGET_ADMISSION:'within-existing-25-once-10-monthly',MIP_NATIVE_HOST_ACTION:'install',
   QIK_NATIVE_ACTIVATION_MANIFEST_SHA256:createHash('sha256').update(manifest).digest('hex'),NODE_EXTRA_CA_CERTS:cert,MIP_NATIVE_HOST_CONFIG_JSON:'{}'}
  const run=()=>spawnSync(process.execPath,[new URL('../native-governed-activation/run.mjs',import.meta.url).pathname],{encoding:'utf8',env,timeout:30000})
  let child=run()
  assert.equal(child.status,1);assert.equal(child.stderr,'')
  assert.equal(JSON.parse(child.stdout).phase,'configuration')
  env.QIK_NATIVE_ACTIVATION_MANIFEST_SHA256='0'.repeat(64)
  child=run()
  assert.equal(child.status,1);assert.equal(JSON.parse(child.stdout).phase,'manifest_integrity')
 }finally{rmSync(dir,{recursive:true,force:true})}
})

test('held prerequisite workflow is manual, exact-release, restricted and shares install serialization',()=>{
 const workflow=readFileSync(new URL('../../../.github/workflows/qik-managed-prerequisites-held.yml',import.meta.url),'utf8')
 assert.match(workflow,/workflow_dispatch:/)
 assert.doesNotMatch(workflow,/^  (push|pull_request|schedule|workflow_run):/m)
 assert.match(workflow,/group: qik-native-atomic-install/)
 assert.match(workflow,/cancel-in-progress: false/)
 assert.match(workflow,/environment: qik-forward-controlled/)
 assert.match(workflow,/contents: read/)
 assert.match(workflow,/test "\$GITHUB_SHA" = "\$APPROVED"/)
 assert.match(workflow,/persist-credentials: false/)
 assert.doesNotMatch(workflow,/upload-artifact|actions\/cache|curl|psql|supabase .*deploy/)
})

// Source-only configuration refusal: intercepted connect must never be reached.
test('secure binding diagnostics are static, fail closed and never expose injected values',async()=>{
 const arm=process.env.MIP_MANAGED_PROVISIONING_ARM,disposable=process.env.MIP_DISPOSABLE_POSTGRES
 const connect=pg.Client.prototype.connect
 let connections=0
 process.env.MIP_MANAGED_PROVISIONING_ARM='synthetic-pg17-only';process.env.MIP_DISPOSABLE_POSTGRES='qik-persistent-install'
 pg.Client.prototype.connect=async()=>{connections++;throw Error('unexpected_connection')}
 const cfg={disposable:true,provisioningProfile:'supabase-managed-solo-session-lock-v1',operationId:'1'.repeat(32),expectedLogin:'postgres',auditLogin:'mip_native_audit_v1',expectedMetadataAuditor:'mip_native_metadata_audit_v1',c3OperationId:'2'.repeat(32),c3ManifestSha256:'3'.repeat(64)}
 const password=()=>randomBytes(36).toString('base64url')
 const installer=password(),audit=password(),metadata=password(),canary=password()
 const uri=(u,p)=>'postgresql://'+u+':'+encodeURIComponent(p)+'@127.0.0.1:5432/postgres'
 const good={installer:uri('postgres',installer),audit:uri('mip_native_audit_v1',audit),metadataAudit:uri('mip_native_metadata_audit_v1',metadata),caPem:''}
 const cases=[
  [null,'secure_bindings_missing'],
  [{...good,installer:canary},'installer_binding_refused'],
  [{...good,audit:canary},'audit_binding_refused'],
  [{...good,metadataAudit:canary},'metadata_binding_refused'],
  [{...good,audit:uri('mip_native_audit_v1','short')},'audit_password_policy_refused'],
  [{...good,metadataAudit:uri('mip_native_metadata_audit_v1','short')},'metadata_password_policy_refused'],
  [{...good,metadataAudit:uri('mip_native_metadata_audit_v1',audit)},'distinct_passwords_required']
 ]
 try{
  for(const api of [reconcileManagedPrerequisites,provisionManagedPrerequisites])for(const [secrets,expected] of cases){
   const r=await api(cfg,secrets)
   assert.equal(r.state,'provisioning_refused');assert.equal(r.phase,'configuration');assert.equal(r.diagnostic,expected)
   assert.equal(r.needs_reconciliation,false);assert.equal(r.connection_cleanup_verified,true)
   assert.equal(r.installation_allowed,false);assert.equal(r.activation_allowed,false);assert.equal(r.material_access_allowed,false);assert.equal(r.publication_allowed,false)
   const output=JSON.stringify(r)
   for(const value of [installer,audit,metadata,canary,'postgresql://','short','SCRAM'])assert.equal(output.includes(value),false)
  }
  const invalidConfig=await reconcileManagedPrerequisites({...cfg,expectedLogin:'other'},good)
  assert.equal(invalidConfig.diagnostic,undefined)
  assert.equal(connections,0)
 }finally{
  pg.Client.prototype.connect=connect
  for(const [key,value] of [['MIP_MANAGED_PROVISIONING_ARM',arm],['MIP_DISPOSABLE_POSTGRES',disposable]])if(value===undefined)delete process.env[key];else process.env[key]=value
 }
})

test('actual held prerequisite entrypoint emits only bounded configuration diagnostic',async()=>{
 const release=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim()
 assert.match(release,/^[a-f0-9]{40}$/)
 const response=await fetch('https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt',{signal:AbortSignal.timeout(30000)})
 assert.equal(response.ok,true)
 const ca=Buffer.from(await response.arrayBuffer())
 assert.equal(createHash('sha256').update(ca).digest('hex'),'700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7')
 const config={disposable:false,provisioningProfile:'supabase-managed-solo-session-lock-v1',operationId:'1'.repeat(32),expectedLogin:'postgres',auditLogin:'mip_native_audit_v1',expectedMetadataAuditor:'mip_native_metadata_audit_v1',c3OperationId:'2'.repeat(32),c3ManifestSha256:'3'.repeat(64)}
 const raw=JSON.stringify(config),installer=randomBytes(36).toString('base64url'),audit=randomBytes(36).toString('base64url'),metadata=randomBytes(36).toString('base64url')
 const env={PATH:process.env.PATH,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REPOSITORY:'jkelsen13-tech/media-intelligence-platform-v2',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:release,QIK_APPROVED_RELEASE_SHA:release,MIP_MANAGED_RELEASE_SHA:release,
 QIK_MANAGED_PROVISIONING_HOST_ADMISSION:'qualified-source-metadata-managed-prerequisites-v1',QIK_NATIVE_INSTALL_BUDGET_ADMISSION:'within-existing-25-once-10-monthly',MIP_MANAGED_PROVISIONING_ACTION:'reconcile',
 QIK_MANAGED_PROVISIONING_CONFIG_JSON:raw,QIK_MANAGED_PROVISIONING_CONFIG_SHA256:createHash('sha256').update(raw).digest('hex'),QIK_CA_PEM_BASE64:ca.toString('base64'),QIK_NATIVE_INSTALLER_DATABASE_URL:installer,QIK_NATIVE_AUDIT_DATABASE_URL:audit,QIK_NATIVE_METADATA_AUDIT_DATABASE_URL:metadata}
 const child=spawnSync(process.execPath,[new URL('./run.mjs',import.meta.url).pathname],{encoding:'utf8',env,timeout:30000})
 assert.equal(child.status,1);assert.equal(child.stderr,'')
 const r=JSON.parse(child.stdout)
 assert.equal(r.state,'provisioning_refused');assert.equal(r.phase,'configuration');assert.equal(r.diagnostic,'installer_binding_refused')
 assert.equal(r.needs_reconciliation,false);assert.equal(r.connection_cleanup_verified,true)
 for(const canary of [installer,audit,metadata])assert.equal(child.stdout.includes(canary),false)
 assert.equal(r.installation_allowed,false);assert.equal(r.activation_allowed,false);assert.equal(r.material_access_allowed,false);assert.equal(r.publication_allowed,false)
})
