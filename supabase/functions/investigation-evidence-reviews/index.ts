import { createEvidenceReviewsHandler, createEvidenceReviewsTransport } from './handler.mjs'

const transport = createEvidenceReviewsTransport({
  url: Deno.env.get('SUPABASE_URL'),
  anonKey: Deno.env.get('SUPABASE_ANON_KEY'),
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
})
Deno.serve(createEvidenceReviewsHandler(transport))
