// Installer authentication/metadata preflight only. Never install, provision or activate.
// The production export fixes its transport; the factory is an in-process synthetic test seam.
import {createHash} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import pg from 'pg'
import {connectionTarget} from '../collector-native-capture/authenticatedPgDriver.mjs'
import {CA_SHA256,POOLER} from '../native-governed-host/adapter.mjs'

const LOGIN=/^[a-z][a-z0-9_]{0,62}$/, ID=/^[0-9a-f]{32}$/, HASH=/^[0-9a-f]{64}$/
const TLS_CODES=new Set(['CERT_HAS_EXPIRED','CERT_NOT_YET_VALID','DEPTH_ZERO_SELF_SIGNED_CERT','SELF_SIGNED_CERT_IN_CHAIN','UNABLE_TO_VERIFY_LEAF_SIGNATURE','UNABLE_TO_GET_ISSUER_CERT','UNABLE_TO_GET_ISSUER_CERT_LOCALLY','ERR_TLS_CERT_ALTNAME_INVALID','ERR_TLS_CERT_SIGNATURE_ALGORITHM_UNSUPPORTED'])
const NETWORK_CODES=new Set(['ECONNREFUSED','ECONNRESET','ETIMEDOUT','ENOTFOUND','EAI_AGAIN','EHOSTUNREACH','ENETUNREACH'])
const fail=code=>{const e=Error('installer_preflight_refused');e.preflightCode=code;throw e}
function classify(error,phase){
 if(['configuration','ca','environment','identity','prerequisite','tls'].includes(error?.preflightCode))return error.preflightCode
 if(TLS_CODES.has(error?.code))return 'tls'
 if(['28P01','28000'].includes(error?.code))return 'authentication'
 if(error?.code==='42501')return 'permission'
 if(['42P01','42703','42883','3F000'].includes(error?.code))return 'prerequisite'
 if(NETWORK_CODES.has(error?.code)||error?.code==='57014')return 'connection_or_timeout'
 return phase==='connect'?'connection':'query'
}
export function validateInstallerPreflightConfig(c,secrets){
 if(!c||Array.isArray(c)||Object.keys(c).sort().join()!=='c3ManifestSha256,c3OperationId,expectedLogin'
 ||!LOGIN.test(c.expectedLogin??'')||['service_role','authenticator','supabase_admin'].includes(c.expectedLogin)
 ||!ID.test(c.c3OperationId??'')||!HASH.test(c.c3ManifestSha256??'')
 ||!secrets||Object.keys(secrets).join()!=='installer'||typeof secrets.installer!=='string'
 ||secrets.installer.length>4096)fail('configuration')
 let url;try{url=connectionTarget(secrets.installer,c.expectedLogin,false,POOLER)}catch{fail('configuration')}
 if(url.pathname!=='/postgres')fail('configuration')
 return url
}
export async function loadPinnedInstallerCa(env=process.env){
 if(!env.NODE_EXTRA_CA_CERTS||env.NODE_OPTIONS||env.NODE_DEBUG||env.NODE_DEBUG_NATIVE||env.DEBUG
 ||env.SSLKEYLOGFILE||env.NODE_TLS_REJECT_UNAUTHORIZED||env.PGOPTIONS||env.PGPASSWORD||env.PGHOST
 ||env.ACTIONS_STEP_DEBUG==='true'||env.ACTIONS_RUNNER_DEBUG==='true')fail('environment')
 let ca;try{ca=await readFile(env.NODE_EXTRA_CA_CERTS)}catch{fail('ca')}
 if(createHash('sha256').update(ca).digest('hex')!==CA_SHA256)fail('ca')
 return ca
}
const IDENTITY_SQL=`
select session_user::text login,current_user::text effective,r.rolsuper,r.rolcanlogin,
r.rolcreaterole,r.rolcreatedb,r.rolbypassrls,r.rolinherit,r.rolreplication,
d.datdba=r.oid database_owner,current_setting('transaction_read_only')='on' read_only,
coalesce((select ssl from pg_stat_ssl where pid=pg_backend_pid()),false) tls,
current_setting('server_version_num')='170006' postgres_supported,
exists(select 1 from pg_extension where extname='vector' and extversion='0.8.2') vector_supported
from pg_roles r join pg_database d on d.datname=current_database() where r.rolname=session_user`
// Exact existing atomic C3 configuration/receipt digest contract; only hash/booleans leave DB.
const C3_SQL=`
select encode(sha256(convert_to(jsonb_build_object(
 'gate',(select jsonb_agg(to_jsonb(t) order by id) from qik_ingest.collection_gate t),
 'schedule',(select jsonb_agg(to_jsonb(t) order by jobname) from qik_ingest.schedule_intent t),
 'credentials',(select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) from qik_ingest.runtime_credentials t),
 'sources',(select jsonb_agg(to_jsonb(t) order by id) from public.ingest_sources t),
 'receipt',(select jsonb_agg(to_jsonb(t) order by id) from qik_ingest_operation.persistent_install_receipt t)
 )::text,'UTF8')),'hex') baseline,
 (select count(*)=1 and bool_and(not collection_authorized) from qik_ingest.collection_gate where id) gate_closed,
 not exists(select 1 from qik_ingest.schedule_intent where active) schedule_closed,
 not exists(select 1 from public.ingest_sources where enabled and collection_enabled) sources_closed,
 exists(select 1 from qik_ingest_operation.persistent_install_receipt
 where id and operation_id=$1 and sql_manifest_sha256=$2) receipt_matches`

// This factory is for source/synthetic tests; never select dependencies from a host input.
export function createInstallerAuthPreflight({makeClient,loadCa}){
 return async function preflight(c,secrets){
  let db=null,transaction=false,phase='configuration',qualified=false,diagnostic=null,baseline=null
  let cleanup=true
  try{
   const url=validateInstallerPreflightConfig(c,secrets)
   phase='ca';const ca=await loadCa()
   phase='connect'
   db=makeClient({connectionString:url.href,ssl:{rejectUnauthorized:true,ca},
    connectionTimeoutMillis:5000,statement_timeout:5000,query_timeout:7000,
    application_name:'mip-installer-auth-metadata-preflight'})
   await db.connect()
   phase='read_only'
   // Mark before BEGIN acknowledgement, so a lost acknowledgement still triggers rollback.
   transaction=true;await db.query('begin read only')
   await db.query("set local statement_timeout='5000ms'")
   await db.query("set local lock_timeout='1000ms'")
   phase='identity'
   const rows=(await db.query(IDENTITY_SQL)).rows,r=rows?.[0]
   if(rows?.length!==1||r.login!==c.expectedLogin||r.effective!==c.expectedLogin
    ||r.rolsuper!==false||r.rolcanlogin!==true||r.rolcreaterole!==true||r.rolcreatedb!==true
    ||r.rolbypassrls!==true||r.rolinherit!==true||r.rolreplication!==false
    ||r.database_owner!==true||r.read_only!==true)fail('identity')
   if(r.tls!==true)fail('tls')
   if(r.postgres_supported!==true||r.vector_supported!==true)fail('prerequisite')
   phase='c3'
   const cr=(await db.query(C3_SQL,[c.c3OperationId,c.c3ManifestSha256])).rows
   const x=cr?.[0]
   if(cr?.length!==1||x.gate_closed!==true||x.schedule_closed!==true||x.sources_closed!==true
    ||x.receipt_matches!==true||!HASH.test(x.baseline??''))fail('prerequisite')
   baseline=x.baseline;qualified=true
  }catch(error){diagnostic=classify(error,phase)}
  finally{
   if(db){
    if(transaction)try{await db.query('rollback')}catch{cleanup=false}
    try{await db.end()}catch{cleanup=false}
   }
  }
  if(!cleanup){qualified=false;diagnostic='cleanup'}
  return Object.freeze({contract:'installer-auth-metadata-preflight-v1',
   state:qualified?'installer_authenticated_c3_current':'preflight_refused',
   diagnostic,phase:qualified?'complete':phase,connection_cleanup_verified:cleanup,
   c3_baseline_sha256:qualified?baseline:null,installation_ready:false,
   installation_performed:false,activation_allowed:false,publication_allowed:false,
   material_access_allowed:false,production_qualified:false})
 }
}
export const runInstallerAuthPreflight=createInstallerAuthPreflight({
 makeClient:options=>new pg.Client(options),loadCa:()=>loadPinnedInstallerCa()
})
