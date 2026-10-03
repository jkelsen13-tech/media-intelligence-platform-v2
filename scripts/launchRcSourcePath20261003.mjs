import { readFile,realpath } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { isAbsolute,relative } from 'node:path'
import historicalPaths from './launchRcHistoricalSourcePaths20261003.json' with {type:'json'}

export const LAUNCH_RC_HISTORICAL_SOURCE_PATHS = historicalPaths
export function repositorySourcePath(path) {
  if (typeof path !== 'string' || !/^[A-Za-z0-9_./-]+$/.test(path)
    || path.split('/').some(part=>part==='' || part==='.' || part==='..')) throw new Error('source path must stay repository relative')
  return path
}
export function historicalSourcePath({manifestPath,manifestSha256,sourcePath}) {
  const mapping = manifestPath===historicalPaths.manifest_path && manifestSha256===historicalPaths.manifest_sha256
    ? historicalPaths.entries.find(entry=>entry.source_path===sourcePath) : null
  return repositorySourcePath(mapping?.path ?? sourcePath)
}
export async function readRepositorySource(root,sourcePath) {
  const path=repositorySourcePath(sourcePath)
  const rootPath=await realpath(fileURLToPath(root)),target=await realpath(new URL(path,root))
  const inside=relative(rootPath,target)
  if (isAbsolute(inside) || inside==='..' || inside.startsWith('../')) throw new Error('source path resolves outside repository')
  return readFile(target)
}
