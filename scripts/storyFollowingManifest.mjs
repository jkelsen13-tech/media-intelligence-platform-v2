import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
const root=new URL('../',import.meta.url)
const digest=bytes=>createHash('sha256').update(bytes).digest('hex')
const oldPath='verifier/investigation-api-prelaunch-convergence-2026-10-02.json'
const target='verifier/investigation-api-launch-gates-2026-10-02.json'
export async function buildStoryFollowingManifest() {
  const historical=await readFile(new URL(oldPath,root)),previous=JSON.parse(historical)
  const retained=new Set(),external=new Set()
  async function visit(path) {
    if(retained.has(path)) return
    retained.add(path)
    const source=await readFile(new URL(path,root),'utf8')
    for(const match of source.matchAll(/(?:\bimport\s+(?:[^'";]*?\s+from\s+)?|\bexport\s+[^'";]*?\s+from\s+|\bimport\s*\(\s*)['"]([^'"]+)['"]/g)) {
      if(match[1].startsWith('.')) {
        const resolved=new URL(match[1],new URL(path,root))
        if(!resolved.href.startsWith(root.href)) throw new Error('manifest dependency outside repository')
        await visit(resolved.href.slice(root.href.length))
      } else external.add(match[1])
    }
  }
  await visit('supabase/functions/investigation-api/index.ts')
  const hashPaths=paths=>Promise.all(paths.map(async path=>({path,sha256:digest(await readFile(new URL(path,root)))})))
  const sqlPaths=[...previous.sql_source_proposals.map(p=>p.path),'supabase/source-proposals/public-reviewed-versions-v1.sql','supabase/source-proposals/story_following_v1.sql']
  const files=await hashPaths([...retained].sort())
  const sql_source_proposals=(await hashPaths(sqlPaths)).map(p=>({...p,status:'not_applied'}))
  return {...previous,previous_manifests:[...previous.previous_manifests,{path:oldPath,sha256:digest(historical),status:'preserved'}],
    files,runtime_module_dependencies:[...external].sort().map(specifier=>({specifier,qualification:'native_exact_tree_check_pending'})),
    sql_source_proposals,frontend_files:await hashPaths(['src/lib/investigationBackend.js','src/lib/storyFollowingClient.js','src/lib/useStoryFollowing.js',
      'src/components/StoryFollowingControls.jsx','src/components/StoryFollowingPanel.jsx','src/components/storyFollowing.css']),
    story_following:{scope:'private_personal_preferences_for_public_reviewed_stories',route:'investigation-api/story-following',
      server_rpc:'mip_public_story_following_v1',public_context_rpc:'read_reviewed_public_story_context_v1',
      canonical_owner:'mip_private.reviewed_public_stories + reviewed_public_story_versions + reviewed_public_story_members',
      materiality_owner:'existing_reviewed_publication_owner',delivery_channel:'in_app',external_channels:'deferred_post_launch',
      user_actions:['list','read','subscribe','acknowledge','unsubscribe'],trusted_commands_excluded:['revoke','declare_public_story_material_change_v1'],
      actor_binding:previous.following.actor_binding,acknowledgement:'exact_displayed_public_version_only',
      limits:{request_bytes:8192,parsed_response_bytes:2097152,context_material_changes:100,context_evidence_versions:100,private_changes:50,deadline_ms:15000},
      installation_pack:await hashPaths(['supabase/source-proposals/story_following_v1.catalog.sql','supabase/source-proposals/story_following_v1.rollback.sql']),
      qualification:'disposable_restored_SQL_verified_gateway_installed_SDK_mounted_native_controls_and_list; not installed or deployed'},
    deployment_verification:'Source launch candidate only. Canonical SQL and Following remain unapplied; live deployment/Auth/account boundary readback and physical-device acceptance remain unperformed.'}
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const manifest=await buildStoryFollowingManifest()
  await writeFile(new URL(target,root),JSON.stringify(manifest,null,2)+'\n')
  console.log(`Updated ${target}: ${manifest.files.length} gateway dependencies`)
}
