import { readFile } from 'node:fs/promises'
export const MARKETS_DIRECTORY_SQL = new URL('../supabase/source-proposals/markets-directory-v2.sql',import.meta.url)
export const MARKETS_ROLLBACK_SQL = new URL('../supabase/source-proposals/markets-directory-v2-rollback.sql',import.meta.url)
export async function marketsCatalogQuery() {
  const sql = await readFile(MARKETS_DIRECTORY_SQL,'utf8')
  const body = sql.split('-- BEGIN MARKETS BASELINE')[1]?.split('-- END MARKETS BASELINE')[0]
  if (!body) throw Error('Markets baseline markers unavailable')
  return body.replace('into actual;',';').trim()
}
// Disposable local fixture only: this accepts a supplied database, never discovers
// credentials or contacts qik. The protected installer must pin its own baseline.
export async function installMarketsDirectoryFixture(db) {
  await db.exec('set search_path=pg_catalog')
  const catalog = (await db.query(await marketsCatalogQuery())).rows[0].jsonb_build_object
  await db.query("select set_config('mip.markets_expected_catalog',$1,false)",[JSON.stringify(catalog)])
  await db.exec(await readFile(MARKETS_DIRECTORY_SQL,'utf8'))
  await db.exec('reset search_path')
  return catalog
}
