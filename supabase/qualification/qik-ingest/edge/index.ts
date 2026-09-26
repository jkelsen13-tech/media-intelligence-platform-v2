import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  runQikIngestCollector,
  ENV_RUN_KEY,
  HEADER_RUN_KEY,
  HEADER_SCHEDULER_TOKEN,
} from '../collector.mjs'

const JSON_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store',
  'x-mip-side-effect-scope': 'qik-ingest-retain-pending-review',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return json(500, { error: 'missing runtime configuration' })

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // YHB ingest-rss v8: owner run key OR Vault-backed scheduler RPC.
  // Qik names only. Unset owner key disables that path; it does not invent a token.
  const expected = Deno.env.get(ENV_RUN_KEY)
  const ownerAuthorized = !!expected && req.headers.get(HEADER_RUN_KEY) === expected
  const schedulerToken = req.headers.get(HEADER_SCHEDULER_TOKEN)
  let schedulerAuthorized = false
  if (schedulerToken) {
    const { data, error } = await supabase.rpc('mip_qik_ingest_schedule_authorized', {
      p_token: schedulerToken,
    })
    schedulerAuthorized = !error && data === true
  }
  if (!ownerAuthorized && !schedulerAuthorized) {
    return json(401, { error: 'unauthorized' })
  }
  const rpcToken = ownerAuthorized ? req.headers.get(HEADER_RUN_KEY) : schedulerToken

  const rpc = async (name: string, args: Record<string, unknown>) => {
    const map: Record<string, [string, Record<string, unknown>]> = {
      plan: ['mip_qik_ingest_plan', { p_token: args.token }],
      begin_run: ['mip_qik_ingest_begin_run', { p_token: args.token, p_run_id: args.run_id, p_now: args.now }],
      retain_item: ['mip_qik_ingest_retain_item', {
        p_token: args.token, p_run_id: args.run_id, p_source_id: args.source_id, p_item: args.item,
      }],
      record_source_run: ['mip_qik_ingest_record_source_run', {
        p_token: args.token, p_run_id: args.run_id, p_source_id: args.source_id, p_state: args.state,
        p_fetched: args.fetched, p_new: args.new_items, p_error_note: args.error_note, p_now: args.now,
      }],
      finish_run: ['mip_qik_ingest_finish_run', {
        p_token: args.token, p_run_id: args.run_id, p_state: args.state, p_counters: args.counters, p_now: args.now,
      }],
    }
    const mapped = map[name]
    if (!mapped) throw new Error('unknown_rpc')
    const { data, error } = await supabase.rpc(mapped[0], mapped[1])
    if (error) throw new Error(error.message)
    return data
  }

  const runId = `qik-ingest-${new Date().toISOString()}`
  const pipelineRpc = async (action: string, input: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.rpc('mip_pipeline_v1', {
      p_action: action,
      p_input: input,
    })
    if (error) throw new Error(error.message)
    return data
  }

  const result = await runQikIngestCollector({
    rpc,
    pipelineRpc,
    token: rpcToken,
    runId,
    fetchText: async (url: string) => {
      const response = await fetch(url, {
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; MIP-Qik-Ingest/1.0)',
          accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(8000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.text()
    },
  })
  return json(result.httpStatus, result.body)
})
