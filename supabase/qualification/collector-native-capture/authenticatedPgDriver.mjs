// Source-only authenticated PostgreSQL transport. No session impersonation or retries.
// Credentials are supplied by the execution host; never log connection options.
import pg from 'pg'
import {assertCredentialLogging} from './credentialDelivery.mjs'

const CAS_CALLS = Object.freeze({
  put: 'select mip_cas.put($1::uuid,$2,$3::bytea,$4,$5::bytea,$6::jsonb) result',
  read: 'select mip_cas.read($1::uuid,$2,$3) result',
  transition: 'select mip_cas.transition($1::uuid,$2,$3::bigint,$4) result',
  rehydrate: 'select mip_cas.rehydrate($1::uuid,$2,$3::uuid,$4::bigint) result',
  complete: 'select mip_cas.complete($1::uuid,$2,$3::uuid) result',
})
const encode = value => Buffer.isBuffer(value) ? value
  : value instanceof Uint8Array ? Buffer.from(value)
  : value !== null && typeof value === 'object' ? JSON.stringify(value) : value

export async function connectAuthenticatedPg({connectionString, expectedLogin, effectiveRole = null, disposable = false, sessionPoolerHost = null}) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(expectedLogin ?? '')
      || ['postgres','service_role','authenticator','supabase_admin'].includes(expectedLogin)) {
    throw Error('cnc_login_forbidden')
  }
  const url = connectionTarget(connectionString, expectedLogin, disposable, sessionPoolerHost)
  const client = new pg.Client({
    connectionString: url.href, ssl: disposable ? false : {rejectUnauthorized: true},
    connectionTimeoutMillis: 10000, statement_timeout: 1000,
    query_timeout: 20000, application_name: 'mip-cnc-authenticated-qualification',
  })
  try {
    await client.connect()
    const {rows} = await client.query(`
      select session_user::text as login, current_user::text as effective,
             r.rolsuper, r.rolbypassrls, r.rolcreaterole, r.rolcreatedb
      from pg_roles r where r.rolname = session_user
    `)
    const row = rows[0]
    if (!row || row.login !== expectedLogin || row.effective !== expectedLogin
        || row.rolsuper || row.rolbypassrls || row.rolcreaterole || row.rolcreatedb) {
      throw Error('cnc_authenticated_identity_refused')
    }
    if (effectiveRole !== null) {
      if (effectiveRole !== 'service_role' || !expectedLogin.endsWith('_native')) throw Error('cnc_effective_role_denied')
      await client.query('set role service_role')
      const check = (await client.query('select session_user::text as login,current_user::text as effective')).rows[0]
      if (check.login !== expectedLogin || check.effective !== 'service_role') throw Error('cnc_native_role_failed')
    }
    await assertCredentialLogging(client)
    return client
  } catch {
    await client.end().catch(() => {})
    throw Error('cnc_authenticated_connection_failed')
  }
}

export function createAuthenticatedCasCall(client) {
  if (!client || typeof client.query !== 'function') throw Error('cas_transport_required')
  return async (name, args = []) => {
    if (!Object.hasOwn(CAS_CALLS, name)) throw Error('cas_call_unknown')
    // One query, one attempt; a lost acknowledgement is an ambiguous result.
    const result = await client.query(CAS_CALLS[name], args.map(encode))
    return result.rows?.[0]?.result ?? null
  }
}

export function connectionTarget(connectionString, expectedLogin, disposable=false, sessionPoolerHost=null) {
  let url
  try { url=new URL(connectionString) } catch { throw Error('cnc_connection_invalid') }
  const direct=url.hostname==='db.qikvmopbtijoebdqosyq.supabase.co'
  const pooler=sessionPoolerHost==='aws-0-us-west-1.pooler.supabase.com' && url.hostname===sessionPoolerHost
  const local=['localhost','127.0.0.1','[::1]'].includes(url.hostname)
  if(!['postgres:','postgresql:'].includes(url.protocol) || !url.password || url.search || url.hash
      || (disposable?!local:(!direct&&!pooler)) || (!disposable&&url.port&&url.port!=='5432')
      || decodeURIComponent(url.username)!==expectedLogin+(!disposable&&pooler?'.qikvmopbtijoebdqosyq':'')) throw Error('cnc_connection_invalid')
  return url
}
