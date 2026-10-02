import{PGlite}from'@electric-sql/pglite'
import{readFile,readdir}from'node:fs/promises'
export async function selectiveExecutionPrerequisites(){
 const db=await PGlite.create()
 const read=path=>readFile(new URL(path,import.meta.url),'utf8')
 await db.exec(await read('./changeQueueFixture.sql'))
 await db.exec('create table public.mip_profiles(id uuid primary key)')
 const files=await readdir(new URL('../supabase/migrations/',import.meta.url))
 for(const suffix of ['evidence_pipeline_reliability','evidence_change_queue_v1','evidence_assessment_dependencies_v1','investigation_change_briefings_v1','investigation_workspace_batch_v1'])await db.exec(await read('../supabase/migrations/'+files.find(f=>f.endsWith(`_${suffix}.sql`))))
 for(const proposal of ['assessment_relevant_inputs_v1','investigation_selective_intake_v1'])await db.exec(await read(`../supabase/source-proposals/${proposal}.sql`))
 return db
}
