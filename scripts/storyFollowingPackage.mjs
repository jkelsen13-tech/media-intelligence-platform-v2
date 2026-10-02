import { readFile } from 'node:fs/promises'
export const STORY_FOLLOWING_PROPOSAL = new URL('../supabase/source-proposals/story_following_v1.sql',import.meta.url)
export const STORY_FOLLOWING_ROLLBACK = new URL('../supabase/source-proposals/story_following_v1.rollback.sql',import.meta.url)
export async function storyFollowingCatalogQuery() {
  const source=await readFile(STORY_FOLLOWING_PROPOSAL,'utf8')
  const body=source.split('-- BEGIN STORY FOLLOWING BASELINE')[1]?.split('-- END STORY FOLLOWING BASELINE')[0]
  if(!body) throw new Error('Story Following baseline markers missing')
  return body.replace('into actual;',';').trim()
}
// Disposable in-memory fixture only; no endpoint, credentials or live client.
export async function installStoryFollowingFixture(db) {
  await db.exec('set search_path=pg_catalog')
  await db.exec(await readFile(new URL('../supabase/source-proposals/story_following_v1.catalog.sql',import.meta.url),'utf8'))
  const catalog=(await db.query(await storyFollowingCatalogQuery())).rows[0].jsonb_build_object
  await db.query("select set_config('mip.story_following_expected_catalog',$1,false)",[JSON.stringify(catalog)])
  await db.exec(await readFile(STORY_FOLLOWING_PROPOSAL,'utf8'))
  const installed=(await db.query(await storyFollowingCatalogQuery())).rows[0].jsonb_build_object
  await db.query("select set_config('mip.story_following_expected_installed_catalog',$1,false)",[JSON.stringify(installed)])
  await db.exec('reset search_path')
  return {catalog,installed}
}
