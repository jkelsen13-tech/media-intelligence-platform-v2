import {readFile} from 'node:fs/promises'

const here=new URL('./',import.meta.url)
const read=name=>readFile(new URL(name,here),'utf8')
export const STORE_SQL='001_store.sql'
export const LOAD_ORDER=Object.freeze(['00_preflight.sql',STORE_SQL,'05_operation_ledger.sql'])
export const CLEANUP_FILE='90_cleanup.sql'
const CALLS=Object.freeze({
  admit:'select mip_cas.admit($1::bytea,$2,$3::bytea) r',
  bind:'select mip_cas.bind($1::uuid,$2,$3::bytea,$4::jsonb) r',
  put:'select mip_cas.put($1::uuid,$2,$3::bytea,$4,$5::bytea,$6::jsonb) r',
  read:'select mip_cas.read($1::uuid,$2,$3) r',
  index_put:'select mip_cas.index_put($1::uuid,$2,$3,$4::bigint,$5::jsonb) r',
  transition:'select mip_cas.transition($1::uuid,$2,$3::bigint,$4) r',
  rehydrate:'select mip_cas.rehydrate($1::uuid,$2,$3::uuid,$4::bigint) r',
  complete:'select mip_cas.complete($1::uuid,$2,$3::uuid) r',
  cleanup:'select mip_cas.cleanup($1::uuid) r',
  locate:'select mip_cas.locate($1::uuid,$2,$3,$4::jsonb,$5::integer) r',
})
function encodeArg(value){
  if(Buffer.isBuffer(value))return value
  if(value instanceof Uint8Array)return Buffer.from(value)
  if(value!==null&&typeof value==='object')return JSON.stringify(value)
  return value
}
function normalizeResult(value){
  return value===''||value===undefined?null:value
}

export async function installCaptureCas(exec){
  if(typeof exec!=='function')throw Error('install_exec_required')
  // PGlite ignores RESET SESSION AUTHORIZATION; restore the bootstrap superuser explicitly.
  await exec('set session authorization postgres')
  for(const file of LOAD_ORDER)await exec(await read(file))
}

export async function cleanupCaptureCas(exec){
  if(typeof exec!=='function')throw Error('cleanup_exec_required')
  await exec('set session authorization postgres')
  try{
    await exec(await read(CLEANUP_FILE))
  }catch(error){
    try{await exec('rollback')}catch{/* already idle */}
    throw error
  }
}

// Session-user transport for existing mip_cas SECURITY DEFINER entrypoints.
// PGlite void results serialize as empty string; native psql emits nothing.
// PGlite does not honor RESET SESSION AUTHORIZATION; return to postgres explicitly.
export function createSessionCall(db,role){
  if(!db||typeof db.exec!=='function'||typeof db.query!=='function'||typeof role!=='string'||!/^[a-z][a-z0-9_]{0,62}$/.test(role))throw Error('cas_transport_required')
  return async(name,args)=>{
    const sql=CALLS[name]
    if(!sql)throw Error('cas_call_unknown')
    await db.exec('set session authorization '+role)
    try{
      const result=await db.query(sql,(args??[]).map(encodeArg))
      return normalizeResult(result.rows?.[0]?.r)
    }finally{
      await db.exec('set session authorization postgres')
    }
  }
}
