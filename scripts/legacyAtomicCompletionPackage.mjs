import { readFile } from 'node:fs/promises'
export const LEGACY_ATOMIC_PROPOSAL = new URL('../supabase/source-proposals/legacy-atomic-completion-v1.sql', import.meta.url)
export async function legacyAtomicCatalogQuery() {
  const source = await readFile(LEGACY_ATOMIC_PROPOSAL, 'utf8')
  const body = source.split('-- BEGIN LEGACY ATOMIC BASELINE')[1]?.split('-- END LEGACY ATOMIC BASELINE')[0]
  if (!body) throw Error('legacy atomic catalog markers missing')
  return body.replace('into actual;', ';').trim()
}
// Disposable local fixture only; no remote/env/credential client.
export async function installLegacyAtomicCompletionFixture(db) {
  await db.exec('set search_path=pg_catalog')
  const catalog = (await db.query(await legacyAtomicCatalogQuery())).rows[0].jsonb_build_object
  await db.query("select set_config('mip.legacy_atomic_expected_catalog',$1,false)",[JSON.stringify(catalog)])
  await db.exec(await readFile(LEGACY_ATOMIC_PROPOSAL,'utf8'))
  await db.exec('reset search_path')
  return catalog
}
export async function legacyAtomicInstalledCatalogQuery(){
 const source=await readFile(new URL('../supabase/source-proposals/legacy-atomic-pack/installed-catalog.sql',import.meta.url),'utf8')
 return source.slice(source.indexOf('select jsonb_build_object('),source.lastIndexOf('rollback;')).trim()
}
