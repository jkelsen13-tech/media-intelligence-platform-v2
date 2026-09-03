// R4.75 Step 5 — New-subject propagation (DISPLAY / client state only).
//
// Canonical contract: MIP_INVESTIGATION_CONTEXT_AND_GLOBAL_DISCOVERY_v0.1
// §5.3 (New-subject transition) and §16 Step 5 (New-subject propagation).
//
// One named commit path for an explicit result select:
//   1) resolve canonical id from the caller-supplied payload (never invent);
//   2) establish the new Investigation Context via applySubject once;
//   3) name prior-subject sub-selections to clear (JUMP_CLEARS + leftover
//      focuses). Discovery filters are not investigation evidence and are
//      not on this list;
//   4) retain compatible preferences (landing view / density-adjacent);
//   5) InvestigationContextBar / inspector bind from the new IC;
//   6) analytical pages read canonical_subject_id after that one commit —
//      no per-page search.
//
// This module never writes V2, never touches reader_state, never invents
// events, articles, edges, weather, titles, or a second subject, and does
// not fork a ranking engine.

import { JUMP_CLEARS } from './jumpReset.js'
import {
  applySubject,
  emptyInvestigationContext,
  setInvestigationActiveView,
  subjectFromGraphNode,
  subjectFromNamedTarget,
  subjectFromWorldViewSelection,
  investigationContextDomProps,
} from './investigationContext.js'

export const NEW_SUBJECT_PROPAGATION_CONTRACT = 'MIP_INVESTIGATION_CONTEXT_AND_GLOBAL_DISCOVERY_v0.1'

/** Surfaces that must render from IC after one commit, without a new search. */
export const ANALYTICAL_VIEWS = Object.freeze([
  'news',
  'graph',
  'timeline',
  'arcs',
  'world',
  'compare',
])

/**
 * Prior-subject leftovers a new-subject commit must drop.
 * JUMP_CLEARS covers transient graph overlays. The extra keys are
 * cross-view focuses from the previous subject. Discovery is absent.
 */
export const INVALID_SUBSELECTIONS_ON_NEW_SUBJECT = Object.freeze([
  ...JUMP_CLEARS,
  'focusStack',
  'focusArc',
  'focusArticle',
  'focusTimelineEvent',
  'focusTimelineArc',
  'focusComparisonEvent',
  'activeLocationKey',
])

/**
 * Compatible preferences that may survive a new-subject commit.
 * `active_view` is kept unless the caller supplies an intended landing view.
 * Discovery stays local to News / Explore — it is not investigation evidence.
 */
export const RETAINED_PREFERENCES_ON_NEW_SUBJECT = Object.freeze([
  'active_view',
  'graphMode',
  'minReliability',
  'showInferred',
  'desktopShowAll',
  'discovery',
])

function emptySubject() {
  return {
    canonical_subject_type: null,
    canonical_subject_id: null,
    parent_event_id: null,
    as_of_time: null,
    selected_time_range: null,
    temporal_assessment_reference: null,
  }
}

function hasOwn(object, key) {
  return object != null && Object.hasOwn(object, key)
}

/**
 * Resolve canonical identity from an explicit select payload.
 * Caller-supplied only. Never invents IDs, titles, articles, or a second subject.
 * An honest-empty News payload (0 eligible articles, no named id) resolves empty.
 */
export function resolveCanonicalSubject(payload) {
  if (payload == null || typeof payload !== 'object') return emptySubject()

  if (hasOwn(payload, 'canonical_subject_id') || hasOwn(payload, 'canonical_subject_type')) {
    return {
      canonical_subject_type: payload.canonical_subject_type ?? null,
      canonical_subject_id: payload.canonical_subject_id ?? null,
      parent_event_id: payload.parent_event_id ?? null,
      as_of_time: hasOwn(payload, 'as_of_time') ? payload.as_of_time ?? null : null,
      selected_time_range: hasOwn(payload, 'selected_time_range') ? payload.selected_time_range ?? null : null,
      temporal_assessment_reference: payload.temporal_assessment_reference,
    }
  }

  if (payload.row || payload.fromSpatialProjection) {
    return subjectFromWorldViewSelection({
      node: payload.node ?? payload,
      row: payload.row ?? null,
    })
  }

  const namedId = payload.id ?? payload.eventKey ?? payload.articleId ?? payload.arcId ?? payload.nodeId ?? null
  if (payload.type && namedId != null) {
    if (
      payload.label != null ||
      payload.slug != null ||
      payload.occurred_at != null ||
      payload.subject_graph_node_id != null
    ) {
      return subjectFromGraphNode(payload)
    }
    return subjectFromNamedTarget({
      type: payload.type,
      id: namedId,
      parentEventId: payload.parentEventId ?? payload.parent_event_id ?? null,
    })
  }

  if (payload.id != null || payload.slug != null || payload.subject_graph_node_id != null) {
    return subjectFromGraphNode(payload)
  }

  return emptySubject()
}

function noCommit(ic, landingView) {
  const base = ic ?? emptyInvestigationContext(landingView ?? ic?.active_view ?? 'news')
  return {
    investigationContext: base,
    clearSubSelections: Object.freeze([]),
    retainDiscoveryFilters: true,
    retainedPreferences: RETAINED_PREFERENCES_ON_NEW_SUBJECT,
    commitCount: 0,
    committed: false,
  }
}

/**
 * §5.3 / §16 Step 5 — single new-subject commit.
 *
 * No resolvable caller-supplied id → no commit, no invented subject, existing
 * IC left unchanged (honest empty News is not a select).
 */
export function commitNewSubject(ic, payload, options = {}) {
  const landingView = options.landingView
  const subject = resolveCanonicalSubject(payload)
  if (!subject.canonical_subject_id) return noCommit(ic, landingView)

  const base = ic ?? emptyInvestigationContext(landingView ?? 'news')
  const withView = landingView ? setInvestigationActiveView(base, landingView) : base
  const next = applySubject(withView, subject)
  return {
    investigationContext: next,
    clearSubSelections: INVALID_SUBSELECTIONS_ON_NEW_SUBJECT,
    retainDiscoveryFilters: true,
    retainedPreferences: RETAINED_PREFERENCES_ON_NEW_SUBJECT,
    commitCount: 1,
    committed: true,
  }
}

/**
 * After one commit, every analytical page can bind from IC without searching.
 * Compare is included when the App surface is wired; readiness is the IC id.
 */
export function surfacesReadyFromInvestigation(ic) {
  const id = ic?.canonical_subject_id ?? null
  return Object.fromEntries(
    ANALYTICAL_VIEWS.map((view) => [
      view,
      {
        canonical_subject_id: id,
        readyWithoutSearch: true,
        inspector: investigationContextDomProps({ ...(ic ?? emptyInvestigationContext(view)), active_view: view }),
      },
    ]),
  )
}
