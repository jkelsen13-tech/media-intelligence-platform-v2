// Source-only host refusal proof; no database connection or credential submission.
import test from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {randomBytes,createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
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
