import {readFile} from 'node:fs/promises'

const here = new URL('./', import.meta.url)
const read = name => readFile(new URL(name, here), 'utf8')
export const LOAD_ORDER = Object.freeze([
  '05_operation_ledger.sql',
  '010_collection_gate.sql',
  '020_run_ledger.sql',
  '030_retain_upsert.sql',
  '035_native_caller.sql',
  '040_watermarks.sql',
  '050_schedule_disabled.sql',
])
export const CLEANUP_FILE = '090_cleanup.sql'

export async function installQikIngest(exec, {until, sessionAuthorization = 'postgres'} = {}) {
  if (typeof exec !== 'function') throw new Error('install_exec_required')
  if (!['postgres','current'].includes(sessionAuthorization)) throw new Error('install_session_mode_invalid')
  if (sessionAuthorization === 'postgres') await exec('set session authorization postgres')
  const stopAt = until == null ? LOAD_ORDER.length : LOAD_ORDER.indexOf(until) + 1
  if (until && stopAt === 0) throw new Error('install_until_unknown')
  for (const file of LOAD_ORDER.slice(0, stopAt || LOAD_ORDER.length)) {
    try {
      await exec(await read(file))
      if (file !== '05_operation_ledger.sql') {
        await exec(`select qik_ingest_operation.capture_step('${file.replaceAll("'", "''")}')`)
      }
    } catch (error) {
      try { await exec('rollback') } catch { /* already idle */ }
      throw error
    }
  }
}

export async function cleanupQikIngest(exec, {sessionAuthorization = 'postgres'} = {}) {
  if (typeof exec !== 'function') throw new Error('cleanup_exec_required')
  if (!['postgres','current'].includes(sessionAuthorization)) throw new Error('install_session_mode_invalid')
  if (sessionAuthorization === 'postgres') await exec('set session authorization postgres')
  try {
    await exec(await read(CLEANUP_FILE))
  } catch (error) {
    try { await exec('rollback') } catch { /* already idle */ }
    throw error
  }
}
