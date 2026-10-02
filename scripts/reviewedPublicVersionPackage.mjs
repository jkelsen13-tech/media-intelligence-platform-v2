import { readFile } from 'node:fs/promises'
export const REVIEWED_VERSION_PROPOSAL = new URL('../supabase/source-proposals/public-reviewed-versions-v1.sql', import.meta.url)
export async function reviewedVersionCatalogQuery() {
  const source = await readFile(REVIEWED_VERSION_PROPOSAL, 'utf8')
  const body = source.split('-- BEGIN REVIEWED VERSION BASELINE')[1]?.split('-- END REVIEWED VERSION BASELINE')[0]
  if (!body) throw new Error('reviewed version baseline markers missing')
  return body.replace('into actual;', ';').trim()
}
export async function reviewedVersionInstalledCatalogQuery() {
  const source = await readFile(new URL('../supabase/source-proposals/public-reviewed-versions-v1.installed-catalog.sql', import.meta.url), 'utf8')
  return source.slice(source.indexOf('with base as ('),source.lastIndexOf('rollback;')).trim()
}
// Disposable local fixture installer. No environment/credential/remote client.
export async function installReviewedPublicVersionFixture(db) {
  await db.exec('set search_path=pg_catalog')
  const catalog = (await db.query(await reviewedVersionCatalogQuery())).rows[0].jsonb_build_object
  await db.query("select set_config('mip.public_reviewed_versions_expected_catalog',$1,false)", [JSON.stringify(catalog)])
  await db.exec(await readFile(REVIEWED_VERSION_PROPOSAL, 'utf8'))
  await db.exec('reset search_path')
  return catalog
}
