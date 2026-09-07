import { createInputImpactHandler } from './handler.mjs'
import { createWorkspaceTransport } from '../investigation-workspace/handler.mjs'

// Reuse the fixed-target Auth/RPC transport; service credentials remain server-side.
const transport = createWorkspaceTransport({
  url: Deno.env.get('SUPABASE_URL'),
  anonKey: Deno.env.get('SUPABASE_ANON_KEY'),
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
})
Deno.serve(createInputImpactHandler(transport))
