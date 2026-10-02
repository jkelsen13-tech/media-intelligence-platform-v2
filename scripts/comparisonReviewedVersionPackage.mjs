import { readFile } from 'node:fs/promises'

export const COMPARISON_VERSION_SQL = new URL('../supabase/source-proposals/comparison-reviewed-versions-v1.sql', import.meta.url)
export const COMPARISON_VERSION_ROLLBACK = new URL('../supabase/source-proposals/comparison-reviewed-versions-v1.rollback.sql', import.meta.url)
export async function comparisonVersionCatalogQuery() {
  const sql = await readFile(COMPARISON_VERSION_SQL, 'utf8')
  const body = sql.split('-- BEGIN COMPARISON CATALOG')[1]?.split('-- END COMPARISON CATALOG')[0]
  if (!body) throw new Error('comparison catalog markers missing')
  return body.replace('into actual;', ';').trim()
}
// Disposable supplied-database installer. No credentials, target discovery or
// remote clients. A production installer must separately approve exact bytes.
export async function installComparisonReviewedVersionFixture(db) {
  await db.exec('set search_path=pg_catalog')
  const catalog = (await db.query(await comparisonVersionCatalogQuery())).rows[0].jsonb_build_object
  await db.query("select set_config('mip.comparison_expected_catalog',$1,false)", [JSON.stringify(catalog)])
  await db.exec(await readFile(COMPARISON_VERSION_SQL, 'utf8'))
  await db.exec('reset search_path')
  return catalog
}
