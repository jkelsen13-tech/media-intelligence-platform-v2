import { checkServerIdentity } from 'node:tls'
import { SOURCE_REF, DESTINATION_REF } from './mipNieParentCustody.mjs'

const PROJECT_REFS = new Set([SOURCE_REF, DESTINATION_REF])
const LOGIN = /^[a-z_][a-z0-9_]{0,62}$/

/** Build a verified PostgreSQL connection for one approved project.
 * Credentials and the optional trust root arrive only from the qualified host.
 * ClientClass injection is for isolated transport tests; the live path uses pg.
 */
export function createVerifiedPgConnect({ projectRef, database = 'postgres',
  login, password, transport, poolerHost, ca, timeoutMs = 5000, ClientClass }) {
  if (!PROJECT_REFS.has(projectRef) || !LOGIN.test(login ?? '')
      || typeof password !== 'string' || password.length < 1
      || typeof database !== 'string' || !LOGIN.test(database)
      || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000
      || (ca !== undefined && (typeof ca !== 'string' || ca.length < 1))
      || !['direct','session_pooler'].includes(transport)
      || (transport === 'session_pooler' && (typeof poolerHost !== 'string'
        || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.pooler\.supabase\.com$/.test(poolerHost)))
      || (transport === 'direct' && poolerHost !== undefined)) {
    throw Error('pg_connect_configuration_invalid')
  }
  const host = transport === 'direct' ? `db.${projectRef}.supabase.co` : poolerHost
  const username = transport === 'direct' ? login : `${login}.${projectRef}`
  const connect = async () => {
    const PgClient = ClientClass ?? (await import('pg')).Client
    const client = new PgClient({ host, port: 5432, database, user: username, password,
      connectionTimeoutMillis: timeoutMs, ssl: { rejectUnauthorized: true,
        servername: host, ...(ca === undefined ? {} : { ca }) } })
    try {
      await client.connect()
      const stream = client.connection?.stream
      const certificate = stream?.getPeerCertificate?.()
      if (stream?.encrypted !== true || stream.authorized !== true
          || stream.authorizationError || stream.servername !== host
          || !certificate || Object.keys(certificate).length === 0
          || checkServerIdentity(host, certificate)) throw Error('pg_tls_endpoint_invalid')
      // This attestation is derived here from fixed configuration and the TLS
      // stream. checkedClient also verifies the server-side authenticated role.
      client.connectionInfo = Object.freeze({ projectRef, tlsVerified: true,
        host, port: 5432, login, transport })
      return client
    } catch {
      try { await client.end() } catch { /* discard failed connection */ }
      throw Error('pg_tls_endpoint_invalid')
    }
  }
  return Object.assign(connect, { endpointHost:host, projectRef, transport })
}
