// Proposed forward-source identity only. This module never fetches a feed or enables collection.
// The qik C2 UUID is deliberately reused for a future C3 row in a different table;
// this is a reviewed proposal, not evidence that the C3 row already exists.
export const FORWARD_SOURCE = Object.freeze({
  id: '1b4c6203-f6dc-4be7-a61e-5ee1c2e2866d',
  key: 'doj-press-release-rss',
  label: 'U.S. Department of Justice Press Releases RSS',
  feedUrl: 'https://www.justice.gov/news/rss?type=press_release&m=1',
})

export const FORWARD_SOURCE_RECONCILIATION_ID = '5cc7fa53-53be-494d-ab6a-ecd1d912dbec'

function one(rows, errorCode) {
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error(errorCode)
  return rows[0]
}

// Before a separately approved C3 insertion, query public.ingest_sources
// WHERE id = FORWARD_SOURCE.id OR feed_url = FORWARD_SOURCE.feedUrl.
// Both identities must be vacant; a similar publisher name is not a match.
export function assertForwardSourceProvisionable(c3CollisionRows) {
  if (!Array.isArray(c3CollisionRows) || c3CollisionRows.length !== 0)
    throw new Error('forward_source_c3_collision')
  return Object.freeze({
    id: FORWARD_SOURCE.id,
    feed_url: FORWARD_SOURCE.feedUrl,
    enabled: false,
    collection_enabled: false,
  })
}

// Supply rows selected by exact id/key/URL from public.ingestion_sources,
// by exact id/feed_url from public.ingest_sources, and by the recorded
// reconciliation id/foreign keys from public.source_register_reconciliation.
// An explicit same-endpoint reconciliation is required. Today's qik row says
// distinct_registers and has no C3 id, so this check intentionally fails.
export function assertForwardSourceRegistries({c2Rows, c3Rows, reconciliationRows} = {}) {
  const c2 = one(c2Rows, 'forward_source_c2_missing_or_ambiguous')
  if (String(c2.id) !== FORWARD_SOURCE.id ||
      c2.source_key !== FORWARD_SOURCE.key ||
      c2.label !== FORWARD_SOURCE.label ||
      c2.source_url !== FORWARD_SOURCE.feedUrl ||
      c2.source_type !== 'official_feed')
    throw new Error('forward_source_c2_identity_mismatch')

  const c3 = one(c3Rows, 'forward_source_c3_missing_or_ambiguous')
  if (String(c3.id) !== FORWARD_SOURCE.id ||
      c3.feed_url !== FORWARD_SOURCE.feedUrl)
    throw new Error('forward_source_c3_identity_mismatch')

  const relation = one(reconciliationRows, 'forward_source_reconciliation_missing_or_ambiguous')
  if (String(relation.id) !== FORWARD_SOURCE_RECONCILIATION_ID ||
      String(relation.ingestion_source_id) !== FORWARD_SOURCE.id ||
      String(relation.ingest_source_id) !== FORWARD_SOURCE.id ||
      relation.relationship !== 'same_publisher_same_endpoint' ||
      relation.collection_enabled !== false)
    throw new Error('forward_source_reconciliation_mismatch')
  return FORWARD_SOURCE
}

// This is the final C3 plan tripwire before begin_run. It does not replace
// registry checks, acquisition permission, or the owner's enable decision.
export function assertForwardSourcePlan(plan) {
  if (plan?.collection_authorized !== true)
    throw new Error('forward_source_collection_disabled')
  const source = one(plan.sources, 'forward_source_plan_not_single_source')
  if (String(source.id) !== FORWARD_SOURCE.id ||
      source.feed_url !== FORWARD_SOURCE.feedUrl)
    throw new Error('forward_source_plan_identity_mismatch')
  return FORWARD_SOURCE
}
