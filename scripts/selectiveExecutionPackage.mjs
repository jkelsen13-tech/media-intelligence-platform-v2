import {readFile} from 'node:fs/promises'
export const SELECTIVE_EXECUTION_PROPOSAL=new URL('../supabase/source-proposals/selective_intake_execution_v1.sql',import.meta.url)
export const SELECTIVE_EXECUTION_EMPTY_ROLLBACK=new URL('../supabase/source-proposals/selective-intake-pack/remove-empty-extension.sql',import.meta.url)
export const SELECTIVE_EXECUTION_ROLLBACK=new URL('../supabase/source-proposals/selective-intake-pack/rollback.sql',import.meta.url)
export async function selectiveExecutionCatalogQuery(){
 const source=await readFile(SELECTIVE_EXECUTION_PROPOSAL,'utf8')
 const body=source.split('-- BEGIN SELECTIVE EXECUTION BASELINE')[1]?.split('-- END SELECTIVE EXECUTION BASELINE')[0]
 if(!body)throw Error('selective execution catalog markers missing')
 return body.replace('into actual;',';').trim()
}
export async function selectiveExecutionInstalledCatalogQuery(){return selectiveExecutionCatalogQuery()}
// Disposable local SQL fixture only. Production install requires a separately pinned baseline.
export async function installSelectiveExecutionFixture(db){
 await db.exec('set search_path=pg_catalog')
 const catalog=(await db.query(await selectiveExecutionCatalogQuery())).rows[0].jsonb_build_object
 await db.query("select set_config('mip.selective_execution_expected_catalog',$1,false)",[JSON.stringify(catalog)])
 await db.exec(await readFile(SELECTIVE_EXECUTION_PROPOSAL,'utf8'))
 const installed=(await db.query(await selectiveExecutionInstalledCatalogQuery())).rows[0].jsonb_build_object
 await db.query("select set_config('mip.selective_execution_preflight_expected_catalog',$1,false)",[JSON.stringify(installed)])
 await db.query("select set_config('mip.selective_execution_original_catalog',$1,false)",[JSON.stringify(catalog)])
 await db.query("select set_config('mip.selective_execution_rollback_expected_catalog',$1,false)",[JSON.stringify(installed)])
 await db.exec('reset search_path')
 return {catalog,installed}
}
