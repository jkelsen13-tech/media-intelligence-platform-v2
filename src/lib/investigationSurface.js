import { classifyJoinState } from './investigationJoinState.js'
import { supabase } from './supabase.js'

export const INVESTIGATION_SURFACE_VIEW = 'investigation_surface_public'

export function surfaceAvailability(row) {
  if (!row) {
    return {
      canonical_event_id: null,
      has_released_geography: false,
      public_article: false,
      reviewed_claims: false,
      published_relationships: false,
      auto_approval_enabled: false,
    }
  }
  const publicArticleCount = row.public_article_count == null ? null : Number(row.public_article_count)
  return {
    canonical_event_id: row.canonical_event_id ?? null,
    event_label: row.event_label ?? row.label ?? null,
    event_type: row.event_type ?? row.type ?? null,
    occurred_at: row.occurred_at ?? null,
    has_released_geography: row.has_released_geography === true,
    spatial_revision_id: row.spatial_revision_id ?? null,
    public_article: publicArticleCount > 0,
    public_article_count: publicArticleCount,
    reviewed_claims: row.reviewed_claim_count > 0,
    published_relationships: row.published_relationship_count > 0,
    auto_approval_enabled: row.auto_approval_enabled === true,
  }
}

export function surfaceJoinDisclosures(row, { view = null, subjectType = 'event' } = {}) {
  if (!row) return []
  const surface = surfaceAvailability(row)
  const disclosures = []
  if (!surface.canonical_event_id) return []
  if (!surface.public_article) {
    const articleJoin = classifyJoinState({
      availableCount: 0,
      view: 'news',
      subjectType: 'article',
    })
    if (articleJoin) {
      articleJoin.reason = surface.public_article_count == null
        ? 'source_article_count_unavailable'
        : 'source_article_none_public'
      disclosures.push(articleJoin)
    }
  }
  if (!surface.reviewed_claims) {
    disclosures.push(classifyJoinState({
      insufficientEvidence: true,
      failureReason: 'no_reviewed_claims',
      view,
      subjectType,
    }))
  }
  if (!surface.published_relationships) {
    disclosures.push(classifyJoinState({
      availableCount: 0,
      failureReason: 'no_published_relationships',
      view: 'graph',
      subjectType,
    }))
  }
  if (!surface.has_released_geography && view === 'world') {
    disclosures.push(classifyJoinState({
      availableCount: 0,
      failureReason: 'no_released_geography',
      view,
      subjectType,
    }))
  }
  return disclosures.filter(Boolean)
}

export async function loadInvestigationSurface(canonicalEventId, { supabaseClient } = {}) {
  const client = supabaseClient ?? supabase
  if (!client || !canonicalEventId) return null
  try {
    const { data, error } = await client
      .from(INVESTIGATION_SURFACE_VIEW)
      .select('canonical_event_id, slug, event_label, event_type, occurred_at, has_released_geography, spatial_revision_id, public_article_count, reviewed_claim_count, published_relationship_count, auto_approval_enabled')
      .eq('canonical_event_id', canonicalEventId)
      .maybeSingle()
    if (error || !data) return null
    return data
  } catch {
    return null
  }
}
