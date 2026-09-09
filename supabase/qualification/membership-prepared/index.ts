// Private read-only qualification endpoint; no schedules or production writer replacement.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.0'
import { createQualificationHandler } from './qualifier.js'
const url = Deno.env.get('SUPABASE_URL')
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
Deno.serve(!url || !serviceKey
  ? () => new Response('configuration unavailable', {status:500})
  : createQualificationHandler({supabase:createClient(url,serviceKey),serviceKey}))
