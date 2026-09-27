import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {compileSource,SOURCE_COMMIT,SOURCE_PINS,NAME_MAPPING} from '../supabase/qualification/qik-comparison-adapter/compileSource.mjs'
const read=async(path,commit)=>{assert.equal(commit,SOURCE_COMMIT);return readFile(new URL('../'+path,import.meta.url))}
test('compiler refuses any changed prerequisite before returning a candidate',async()=>{
 await assert.rejects(compileSource(async(path,commit)=>Buffer.concat([await read(path,commit),Buffer.from('\n-- altered')])),/adapter_source_digest/)
})
test('pinned source compiles without fixture seed, synthetic authority or executable installation',async()=>{
 const out=await compileSource(read)
 assert.equal(out.executable,false);assert.equal(out.steps.length,25);assert.equal(SOURCE_PINS.length,23)
 assert.ok(!SOURCE_PINS.some(([p])=>p.endsWith('/source-fixture.sql')))
 for(const step of out.steps){
  assert.equal(step.compiled_sha256,createHash('sha256').update(step.sql).digest('hex'))
  assert.doesNotMatch(step.sql,/\bcomparison_qualification\b|\bqual_[a-z_]+\b/)
  assert.doesNotMatch(step.sql,/^begin;|^commit;/m)
 }
 const sql=out.steps.map(s=>s.sql).join('\n')
 assert.doesNotMatch(sql,/insert into mip_identity\.efta_scope select|\$scope\$/)
 assert.doesNotMatch(sql,/reason:='synthetic_mechanism_only'/)
 assert.match(sql,/mip_hosted_capture_requires_bound_producer/)
 assert.equal(out.steps.at(-3).path,'adapter:compatibility-closure-v1')
 assert.match(out.steps.at(-2).path,/019_native_retention_permissions.sql$/)
 assert.equal(out.steps.at(-1).path,'adapter:compatibility-assertions-v1')
 assert.equal(Object.keys(NAME_MAPPING).length,8)
 assert.ok(out.unresolved_install_prerequisites.includes('same-qik-autonomous-rejection-audit-transport'))
})
