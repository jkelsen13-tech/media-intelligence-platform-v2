import { PGlite } from '@electric-sql/pglite'
import { applyFoundation } from './mipConsolidationRestore.mjs'
import { applyStagingPage, fingerprintPayload } from './mipLegacyGraphStaging.mjs'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const db = await PGlite.create()
const temp = await mkdtemp(join(tmpdir(), 'mip-review-'))
const report = { sha: '05cdae98f7e3a7790780fde0b36be88aac388676', live_database_used: false }
try {
  await applyFoundation(db)
  const id = '99999999-0000-4000-8000-000000000087'
  report.cli_to_apply = []
  for (const [i,n] of ['9007199254740992','9007199254740993'].entries()) {
    const raw = `{"source_records":[{"source_project_ref":"yhbwnrtlqbjtcrrlpbge","source_table":"nodes","source_id":"${id}","payload":{"id":"${id}","type":"event","label":"CLI precision fixture","metadata":{"n":${n}}}}]}`
    const path = join(temp, `source-${i}.json`)
    await writeFile(path,raw)
    const output = execFileSync(process.execPath,['scripts/mipLegacyGraphStaging.mjs','dry-run',path],{encoding:'utf8'})
    const plan = JSON.parse(output)
    const result = await applyStagingPage(db,{run_id:`cli-precision-${i}`,records:plan.planned})
    report.cli_to_apply.push({ exact_source:n, cli_planned_number: String(plan.planned[0].payload.metadata.n), fingerprint:plan.planned[0].payload_sha256, result })
  }
  report.stored = (await db.query(`select payload#>>'{metadata,n}' as exact_stored_number,
    (select count(*)::int from legacy_graph_staging.payload_versions where source_id=$1) as versions,
    (select count(*)::int from legacy_graph_staging.record_conflicts where source_id=$1) as conflicts
    from legacy_graph_staging.staged_records where source_id=$1`,[id])).rows
  report.other_numeric_paths=[]
  for (const [i,raw] of ['0.123456789012345678901234567891','1e400'].entries()) {
    const path=join(temp,`decimal-${i}.json`)
    await writeFile(path,`{"source_records":[{"source_project_ref":"yhbwnrtlqbjtcrrlpbge","source_table":"nodes","source_id":"${id}","payload":{"id":"${id}","type":"event","label":"Other precision","metadata":{"n":${raw}}}}]}`)
    const plan=JSON.parse(execFileSync(process.execPath,['scripts/mipLegacyGraphStaging.mjs','dry-run',path],{encoding:'utf8'}))
    report.other_numeric_paths.push({exact_source:raw,planned_payload:plan.planned[0].payload,decision:plan.planned[0].decision})
  }
  report.bigint_transport=[]
  for (const [i,n] of [9007199254740993n,1000000000000000000000n].entries()) {
    const source_id=`99999999-0000-4000-8000-00000000009${i}`
    try {
      const result=await applyStagingPage(db,{run_id:`bigint-${i}`,records:[{source_project_ref:'yhbwnrtlqbjtcrrlpbge',source_table:'nodes',source_id,payload:{id:source_id,type:'event',label:'BigInt fixture',metadata:{n}}}]})
      report.bigint_transport.push({exact_source:String(n),result})
    } catch(e) {report.bigint_transport.push({exact_source:String(n),error:e.message})}
  }
  console.log(JSON.stringify(report,null,2))
} finally {await db.close(); await rm(temp,{recursive:true,force:true})}
