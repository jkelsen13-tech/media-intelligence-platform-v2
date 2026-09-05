export const GRAPH_EVENT_FAMILY = 'graph_event'
export const SOURCE_COMPARISON_EVENT_FAMILY = 'source_comparison_event'

export const IDENTITY_DECISIONS = Object.freeze({
  mapped: 'use_existing_mapping',
  insert: 'insert_unmapped_identity',
  skip_existing_mapping: 'existing_import_mapping_skipped',
  historical_gap: 'historical_url_upsert_no_snapshot',
  conflict: 'conflict_recorded',
  title_only: 'title_collision_not_identity',
  family_mismatch: 'event_family_not_interchangeable',
})

function norm(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function sameText(left, right) {
  return norm(left).length > 0 && norm(left) === norm(right)
}

export function mappingKey(row) {
  return `${row.source_project_ref}:${row.source_table}:${row.source_id}`
}

export function findExistingMapping(mappings, source) {
  return (mappings ?? []).find((row) => (
    row.source_project_ref === source.source_project_ref
    && row.source_table === source.source_table
    && row.source_id === source.source_id
  )) ?? null
}

export function contentFingerprint(record = {}) {
  return JSON.stringify({
    title: norm(record.title ?? record.canonical_title ?? record.label ?? record.headline),
    url: norm(record.url),
    body: norm(record.body_text ?? record.summary ?? record.description),
    published_at: record.published_at ?? record.occurred_at ?? null,
  })
}

/**
 * Equal titles never establish identity. Graph event IDs and Source Comparison
 * event IDs are different object families even when the UUID strings match.
 */
export function reconcileIdentity({ source, target = null, existingMappings = [], existingConflicts = [] }) {
  if (!source?.source_project_ref || !source.source_table || !source.source_id) {
    throw new Error('source identity requires project, table, and id')
  }
  if (source.object_family && target?.object_family && source.object_family !== target.object_family) {
    return {
      decision: IDENTITY_DECISIONS.family_mismatch,
      mapping: null,
      conflict: {
        conflict_kind: 'event_family_not_interchangeable',
        recovery_status: 'unresolved_family_collision',
        source_id: source.source_id,
        target_id: target.id ?? null,
        affected_fields: ['id', 'object_family'],
        details: {
          source_family: source.object_family,
          target_family: target.object_family,
          note: 'Graph and Source Comparison event IDs are not interchangeable.',
        },
      },
    }
  }

  const mapped = findExistingMapping(existingMappings, source)
  if (mapped) {
    const alreadyLogged = (existingConflicts ?? []).some((row) => (
      row.source_id === source.source_id
      && row.conflict_kind === 'existing_import_mapping_skipped'
    ))
    return {
      decision: IDENTITY_DECISIONS.skip_existing_mapping,
      mapping: mapped,
      conflict: alreadyLogged ? null : {
        conflict_kind: 'existing_import_mapping_skipped',
        recovery_status: 'not_applicable_existing_mapping',
        source_id: source.source_id,
        target_id: mapped.target_id,
        source_url: mapped.source_url ?? source.url ?? null,
        affected_fields: [],
        details: { note: 'Existing import mapping precedes reconciliation.' },
      },
    }
  }

  if (source.recovery_status === 'not_restorable_no_pre_import_snapshot') {
    return {
      decision: IDENTITY_DECISIONS.historical_gap,
      mapping: null,
      conflict: {
        conflict_kind: 'historical_url_upsert_no_snapshot',
        recovery_status: 'not_restorable_no_pre_import_snapshot',
        source_id: source.source_id,
        target_id: source.target_id ?? null,
        source_url: source.url ?? null,
        affected_fields: source.affected_fields ?? ['title', 'url', 'body_text'],
        details: { note: 'Recorded historical gap. Missing versions are not invented.' },
      },
    }
  }

  if (target && source.source_id === target.id && contentFingerprint(source) !== contentFingerprint(target)) {
    return {
      decision: IDENTITY_DECISIONS.conflict,
      mapping: null,
      conflict: {
        conflict_kind: 'identical_id_divergent_content',
        recovery_status: 'unresolved_id_collision',
        source_id: source.source_id,
        target_id: target.id,
        source_url: source.url ?? null,
        affected_fields: ['title', 'url', 'body_text', 'published_at'],
        details: { note: 'Same identifier, divergent retained content. Both versions are kept.' },
      },
    }
  }

  if (target && sameText(source.url, target.url) && source.source_id !== target.id) {
    return {
      decision: IDENTITY_DECISIONS.conflict,
      mapping: null,
      conflict: {
        conflict_kind: 'equal_url_divergent_ids',
        recovery_status: 'unresolved_url_collision',
        source_id: source.source_id,
        target_id: target.id,
        source_url: source.url,
        affected_fields: ['id', 'url'],
        details: { note: 'Equal URLs with divergent IDs. Mapping is not inferred.' },
      },
    }
  }

  const sourceTitle = source.title ?? source.canonical_title ?? source.label
  const targetTitle = target?.title ?? target?.canonical_title ?? target?.label
  if (target && sameText(sourceTitle, targetTitle) && !sameText(source.url, target.url) && source.source_id !== target.id) {
    return {
      decision: IDENTITY_DECISIONS.title_only,
      mapping: null,
      conflict: {
        conflict_kind: 'title_collision_not_identity',
        recovery_status: 'unresolved_title_collision',
        source_id: source.source_id,
        target_id: target.id,
        source_url: source.url ?? null,
        affected_fields: ['title'],
        details: { note: 'Equal titles do not establish identity.' },
      },
    }
  }

  if (target?.relationship_endpoints_incompatible) {
    return {
      decision: IDENTITY_DECISIONS.conflict,
      mapping: null,
      conflict: {
        conflict_kind: 'incompatible_relationship_endpoints',
        recovery_status: 'unresolved_relationship_collision',
        source_id: source.source_id,
        target_id: target.id ?? null,
        affected_fields: ['source_id', 'target_id'],
        details: { note: 'Relationship endpoints disagree. No endpoint is rewritten.' },
      },
    }
  }

  if (target && source.source_id === target.id && contentFingerprint(source) === contentFingerprint(target)) {
    return {
      decision: IDENTITY_DECISIONS.mapped,
      mapping: {
        source_project_ref: source.source_project_ref,
        source_table: source.source_table,
        source_id: source.source_id,
        target_id: target.id,
        source_url: source.url ?? null,
      },
      conflict: null,
    }
  }

  return {
    decision: IDENTITY_DECISIONS.insert,
    mapping: null,
    conflict: null,
  }
}

export function reconcileBatch(records, { existingMappings = [], existingConflicts = [] } = {}) {
  const mappings = [...existingMappings]
  const conflicts = [...existingConflicts]
  const inserted = []
  const preservedGaps = []
  for (const record of records) {
    const result = reconcileIdentity({
      source: record.source,
      target: record.target ?? null,
      existingMappings: mappings,
      existingConflicts: conflicts,
    })
    if (result.mapping && !findExistingMapping(mappings, result.mapping)) mappings.push(result.mapping)
    if (result.conflict) conflicts.push(result.conflict)
    if (result.decision === IDENTITY_DECISIONS.insert) inserted.push(record.source)
    if (result.decision === IDENTITY_DECISIONS.historical_gap) preservedGaps.push(result.conflict)
  }
  return { mappings, conflicts, inserted, preservedGaps }
}
