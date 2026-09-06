import { createEvidenceChecksHandler, createEvidenceChecksTransport } from './handler.mjs'

const transport = createEvidenceChecksTransport({
  url: Deno.env.get('SUPABASE_URL'),
  anonKey: Deno.env.get('SUPABASE_ANON_KEY'),
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
})
Deno.serve(createEvidenceChecksHandler(transport))
