export const ARC_RUNNER_CREDENTIAL_NAME = 'arc-membership-run'
export const ARC_RUNNER_CREDENTIAL_HEADER = 'x-mip-arc-membership-run-key'
export const ORIGINAL_IMPORT_CREDENTIAL_NAME = 'original-source-import'
export const ORIGINAL_IMPORT_CREDENTIAL_HEADER = 'x-mip-original-import-key'

export async function sha256Hex(value) {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function authorizeCredential(req, supabase, headerName, credentialName) {
  const supplied = req.headers.get(headerName)
  if (!supplied) return false
  const suppliedHash = await sha256Hex(supplied)
  const { data, error } = await supabase
    .from('original_source_import_credentials')
    .select('key_hash')
    .eq('credential_name', credentialName)
    .eq('active', true)
    .maybeSingle()
  return !error && !!data && data.key_hash === suppliedHash
}

export async function authorizeArcMembershipRunner(req, supabase, serviceKey) {
  if (req.headers.get('authorization') === `Bearer ${serviceKey}`) return true
  if (await authorizeCredential(req, supabase, ARC_RUNNER_CREDENTIAL_HEADER, ARC_RUNNER_CREDENTIAL_NAME)) return true
  return authorizeCredential(req, supabase, ORIGINAL_IMPORT_CREDENTIAL_HEADER, ORIGINAL_IMPORT_CREDENTIAL_NAME)
}
