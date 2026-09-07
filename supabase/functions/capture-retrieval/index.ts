import { createCaptureRetrievalHandler } from './handler.mjs'

Deno.serve(createCaptureRetrievalHandler({
  url: Deno.env.get('SUPABASE_URL'),
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
}))
