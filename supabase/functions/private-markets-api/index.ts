import { createPrivateGateway, createPrivateUserAuthenticator } from '../_shared/privateGateway.mjs'

Deno.serve(createPrivateGateway({
  kind: 'markets',
  authenticate: createPrivateUserAuthenticator({
    url: Deno.env.get('SUPABASE_URL'),
    anonKey: Deno.env.get('SUPABASE_ANON_KEY'),
  }),
}))
