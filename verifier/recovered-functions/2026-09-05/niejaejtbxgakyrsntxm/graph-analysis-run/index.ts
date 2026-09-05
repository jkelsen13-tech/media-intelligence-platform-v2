// G-ALG-1: deterministic layout writer (owner-authorized 2026-08-05).
//
// Manually invoked, service-role only. Reads nodes/edges (read-only), computes
// the G-ALG-0 checkpoint identity, persists into the derived tables:
//   graph_checkpoints      — one row per distinct graph state (hash-reused)
//   graph_layout_versions  — one seeded phyllotaxis layout per checkpoint
//                            (identity-reused: same algorithm+version+seed+
//                            config for the same checkpoint is never duplicated)
// It NEVER writes to nodes, edges, articles, story_arcs, explanations, or any
// other production table. No cron, no trigger: runs only when called.
//
// Auth: fail-closed shared secret. Requires header
//   x-graph-analysis-key: <GRAPH_ANALYSIS_RUN_KEY>
// and refuses to run at all if the secret is not configured.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  computeCheckpoint,
  planWrites,
  buildLayoutPayload,
  keysetAll,
  NODE_ATTRIBUTES,
  EDGE_ATTRIBUTES,
} from './lib.js'

const JSON_HEADERS = { 'content-type': 'application/json' }

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' })

  const expected = Deno.env.get('GRAPH_ANALYSIS_RUN_KEY')
  if (!expected) return json(503, { error: 'GRAPH_ANALYSIS_RUN_KEY not configured; writer disabled' })
  if (req.headers.get('x-graph-analysis-key') !== expected) {
    return json(401, { error: 'unauthorized' })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Read-only snapshot of the live graph (whitelisted columns only).
  // Doc 13 site 3: keyset-paginated — an unpaginated read silently caps at
  // 1000 rows and the JS-side hash below would then describe a partial graph.
  const { data: nodeRows, error: nodeErr } = await keysetAll(supabase, 'nodes', NODE_ATTRIBUTES.join(','))
  if (nodeErr) return json(500, { error: `nodes read failed: ${nodeErr.message}` })
  const { data: edgeRows, error: edgeErr } = await keysetAll(supabase, 'edges', EDGE_ATTRIBUTES.join(','))
  if (edgeErr) return json(500, { error: `edges read failed: ${edgeErr.message}` })

  const checkpoint = await computeCheckpoint(nodeRows, edgeRows)

  const { data: existingCheckpoints, error: cpErr } = await supabase
    .from('graph_checkpoints')
    .select('id, nodes_hash, edges_hash')
  if (cpErr) return json(500, { error: `checkpoint lookup failed: ${cpErr.message}` })
  const { data: existingLayouts, error: lvErr } = await supabase
    .from('graph_layout_versions')
    .select('id, checkpoint_id, algorithm, algorithm_version, config, seed')
    .order('generated_at', { ascending: false })
  if (lvErr) return json(500, { error: `layout lookup failed: ${lvErr.message}` })

  const plan = planWrites(checkpoint, existingCheckpoints, existingLayouts)

  let checkpointId = plan.checkpointId
  if (plan.checkpointAction === 'insert') {
    const { data, error } = await supabase
      .from('graph_checkpoints')
      .insert(checkpoint)
      .select('id')
      .single()
    if (error) return json(500, { error: `checkpoint insert failed: ${error.message}` })
    checkpointId = data.id
  }

  let layoutId = plan.layoutId
  if (plan.layoutAction === 'insert') {
    const payload = { ...buildLayoutPayload(nodeRows, { supersedes: plan.supersedes }), checkpoint_id: checkpointId }
    const { data, error } = await supabase
      .from('graph_layout_versions')
      .insert(payload)
      .select('id')
      .single()
    if (error) return json(500, { error: `layout insert failed: ${error.message}` })
    layoutId = data.id
  }

  return json(200, {
    checkpoint_id: checkpointId,
    checkpoint_action: plan.checkpointAction,
    layout_version_id: layoutId,
    layout_action: plan.layoutAction,
    node_count: checkpoint.node_count,
    edge_count: checkpoint.edge_count,
    nodes_hash: checkpoint.nodes_hash,
    edges_hash: checkpoint.edges_hash,
  })
})
