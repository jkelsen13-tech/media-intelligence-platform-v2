import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.0'

type ShadowSource = {
  source_id: string
  feed_url: string
  outlet_name: string
  enabled_at_source: boolean
  source_observed_at: string
  payload_hash: string
}

type ShadowPlan = {
  source_project: string
  config: {
    feed_fetch_timeout_ms: number
    feeds_per_run: number
    schedule_slot_minutes: number
    max_items_per_feed: number
    max_new_per_run: number
    source_observed_at: string
    payload_hash: string
  }
  sources: ShadowSource[]
}

const JSON_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store',
  'x-mip-side-effect-scope': 'collector-shadow-receipt-only',
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

function sha256Hex(bytes: Uint8Array) {
  return crypto.subtle.digest('SHA-256', bytes)
    .then((buffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join(''))
}

function boundedError(error: unknown) {
  return String(error instanceof Error ? error.message : error).slice(0, 1000)
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return json(500, { error: 'missing runtime configuration' })

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const token = req.headers.get('x-mip-collector-shadow-token')
  const { data: authorized, error: authError } = await supabase.rpc(
    'mip_collector_shadow_schedule_authorized',
    { p_token: token },
  )
  if (authError || authorized !== true) return json(401, { error: 'unauthorized' })

  let requestedSourceIndex: number | null = null
  try {
    const body = await req.json()
    if (Number.isInteger(body?.source_index) && Number(body.source_index) >= 0) {
      requestedSourceIndex = Number(body.source_index)
    }
  } catch {
    // An empty body uses the deterministic clock rotation.
  }

  const { data: planData, error: planError } = await supabase.rpc('mip_collector_shadow_plan')
  if (planError) return json(500, { error: 'shadow plan unavailable' })
  const plan = planData as ShadowPlan
  if (!plan?.sources?.length) return json(409, { error: 'no shadow sources configured' })

  const slotMinutes = Math.max(1, Number(plan.config.schedule_slot_minutes || 5))
  const sourceIndex = requestedSourceIndex === null
    ? Math.floor(Date.now() / (slotMinutes * 60_000)) % plan.sources.length
    : requestedSourceIndex % plan.sources.length
  const source = plan.sources[sourceIndex]
  const startedAt = new Date().toISOString()
  const timeoutMs = Math.max(500, Math.min(15_000, Number(plan.config.feed_fetch_timeout_ms || 2500)))

  let state = 'failed'
  let httpStatus: number | null = null
  let contentSha256: string | null = null
  let byteCount = 0
  let itemCount = 0
  let entryCount = 0
  let contentType: string | null = null
  let errorNote: string | null = null

  try {
    const response = await fetch(source.feed_url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; MIP-Collector-Shadow/1.0)',
        accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    })
    httpStatus = response.status
    contentType = response.headers.get('content-type')
    const bytes = new Uint8Array(await response.arrayBuffer())
    byteCount = bytes.byteLength
    contentSha256 = await sha256Hex(bytes)
    const text = new TextDecoder().decode(bytes)
    itemCount = [...text.matchAll(/<item(?:\s|>)/gi)].length
    entryCount = [...text.matchAll(/<entry(?:\s|>)/gi)].length
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    state = 'succeeded'
  } catch (error) {
    errorNote = boundedError(error)
  }

  const completedAt = new Date().toISOString()
  const receipt = {
    contract: 'mip-collector-shadow-v1',
    source_project: plan.source_project,
    source_snapshot_hash: source.payload_hash,
    config_snapshot_hash: plan.config.payload_hash,
    source_index: sourceIndex,
    publication_writes: false,
    predecessor_acknowledgements: false,
    canonical_domain_writes: false,
  }
  const { data: receiptId, error: recordError } = await supabase.rpc('mip_collector_shadow_record', {
    p_source_id: source.source_id,
    p_started_at: startedAt,
    p_completed_at: completedAt,
    p_state: state,
    p_http_status: httpStatus,
    p_content_sha256: contentSha256,
    p_byte_count: byteCount,
    p_item_count: itemCount,
    p_entry_count: entryCount,
    p_content_type: contentType,
    p_error_note: errorNote,
    p_receipt: receipt,
  })
  if (recordError) return json(500, { error: 'shadow receipt write failed' })

  return json(state === 'succeeded' ? 200 : 502, {
    receipt_id: receiptId,
    state,
    source_id: source.source_id,
    outlet_name: source.outlet_name,
    http_status: httpStatus,
    content_sha256: contentSha256,
    byte_count: byteCount,
    item_count: itemCount,
    entry_count: entryCount,
    error: errorNote,
    ...receipt,
  })
})
