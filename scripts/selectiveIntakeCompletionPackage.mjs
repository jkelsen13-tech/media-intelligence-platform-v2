import { readFile } from 'node:fs/promises'
import { selectiveExecutionInstalledCatalogQuery } from './selectiveExecutionPackage.mjs'

export const SELECTIVE_COMPLETION_PROPOSAL = new URL('../supabase/source-proposals/selective_intake_completion_v1.sql', import.meta.url)
export const SELECTIVE_COMPLETION_RESTORE = new URL('../supabase/source-proposals/selective_intake_completion_restore_v1.sql', import.meta.url)

// Disposable source fixture only. Production must independently approve its fresh installed catalogue.
export async function installSelectiveCompletionFixture(db) {
  await db.exec('set search_path=pg_catalog')
  const query = await selectiveExecutionInstalledCatalogQuery()
  const original = (await db.query(query)).rows[0].jsonb_build_object
  await db.query("select set_config('mip.selective_completion_original_catalog',$1,false)", [JSON.stringify(original)])
  await db.query("select set_config('mip.selective_completion_expected_catalog',$1,false)", [JSON.stringify(original)])
  await db.exec(await readFile(SELECTIVE_COMPLETION_PROPOSAL, 'utf8'))
  const installed = (await db.query(query)).rows[0].jsonb_build_object
  await db.query("select set_config('mip.selective_completion_rollback_expected_catalog',$1,false)", [JSON.stringify(installed)])
  await db.exec('reset search_path')
  return { original, installed }
}
