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

function isImportIdentityRecord(record) {
  return Boolean(record?.source_project_ref || record?.source_table)
}

function relationshipTable(record, hint = null) {
  return record?.source_table ?? hint ?? null
}

/**
 * Canonical relationship endpoints and type. Record identity (`source_id` on
 * an import source, `id` on a destination row) is never treated as the
 * source-node endpoint. Node `type` is not a relationship type.
 */
export function relationshipFields(record, tableHint = null) {
  if (!record) return null
  const table = relationshipTable(record, tableHint)
  const hasDedicatedEndpoints = record.endpoint_source_id != null
    || record.endpoint_target_id != null
    || record.source_node_id != null
    || record.target_node_id != null
    || record.relationship_type != null
  const destinationEdge = !isImportIdentityRecord(record)
    && (table === 'edges' || (record.id && record.source_id && record.target_id && record.type != null && tableHint === 'edges'))
  if (table !== 'edges' && !hasDedicatedEndpoints && !destinationEdge) return null

  if (isImportIdentityRecord(record)) {
    return {
      sourceEndpoint: record.endpoint_source_id ?? record.source_node_id ?? null,
      targetEndpoint: record.endpoint_target_id ?? record.target_node_id ?? null,
      relationshipType: record.relationship_type ?? (table === 'edges' ? record.type ?? null : null),
    }
  }

  return {
    sourceEndpoint: record.endpoint_source_id ?? record.source_node_id ?? record.source_id ?? null,
    targetEndpoint: record.endpoint_target_id ?? record.target_node_id ?? record.target_id ?? null,
    relationshipType: record.relationship_type ?? record.type ?? null,
  }
}

export function relationshipFieldsConflict(source, target, tableHint = null) {
  const left = relationshipFields(source, tableHint ?? source?.source_table)
  const right = relationshipFields(target, tableHint ?? source?.source_table)
  if (!left || !right) return false
  return left.sourceEndpoint !== right.sourceEndpoint
    || left.targetEndpoint !== right.targetEndpoint
    || left.relationshipType !== right.relationshipType
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

function contentDiverges(source, target) {
  if (!target) return false
  return contentFingerprint(source) !== contentFingerprint(target)
}

function identityMatches(source, target) {
  return Boolean(target && source.source_id === target.id)
}

function relationshipConflict(source, target, {
  conflictKind = 'incompatible_relationship_endpoints',
  recoveryStatus = 'unresolved_relationship_collision',
  note = 'Relationship endpoints or type disagree. Record identity is unchanged and no endpoint is rewritten.',
} = {}) {
  const incoming = relationshipFields(source, source.source_table)
  const existing = relationshipFields(target, source.source_table)
  return {
    conflict_kind: conflictKind,
    recovery_status: recoveryStatus,
    source_id: source.source_id,
    target_id: target?.id ?? null,
    source_url: source.url ?? null,
    affected_fields: ['endpoint_source_id', 'endpoint_target_id', 'relationship_type'],
    details: {
      note,
      incoming_endpoints: incoming,
      existing_endpoints: existing,
    },
  }
}

function contentConflict(source, target, {
  conflictKind = 'identical_id_divergent_content',
  recoveryStatus = 'unresolved_id_collision',
  note = 'Same identifier, divergent retained content. Both versions are kept.',
} = {}) {
  return {
    conflict_kind: conflictKind,
    recovery_status: recoveryStatus,
    source_id: source.source_id,
    target_id: target.id,
    source_url: source.url ?? null,
    affected_fields: ['title', 'url', 'body_text', 'published_at'],
    details: { note },
  }
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
    const preserved = { ...mapped }
    if (target && relationshipFieldsConflict(source, target, source.source_table)) {
      return {
        decision: IDENTITY_DECISIONS.skip_existing_mapping,
        mapping: preserved,
        conflict: relationshipConflict(source, { ...target, id: target.id ?? mapped.target_id }, {
          conflictKind: 'existing_import_mapping_relationship_divergent',
          recoveryStatus: 'existing_mapping_preserved_relationship_divergent',
          note: 'Existing import mapping is preserved. Divergent relationship endpoints or type are recorded, not overwritten.',
        }),
      }
    }
    if (target && contentDiverges(source, target)) {
      return {
        decision: IDENTITY_DECISIONS.skip_existing_mapping,
        mapping: preserved,
        conflict: contentConflict(source, { ...target, id: target.id ?? mapped.target_id }, {
          conflictKind: 'existing_import_mapping_content_divergent',
          recoveryStatus: 'existing_mapping_preserved_content_divergent',
          note: 'Existing import mapping is preserved. Divergent retained content is recorded, not merged.',
        }),
      }
    }
    const alreadyLogged = (existingConflicts ?? []).some((row) => (
      row.source_id === source.source_id
      && row.conflict_kind === 'existing_import_mapping_skipped'
    ))
    return {
      decision: IDENTITY_DECISIONS.skip_existing_mapping,
      mapping: preserved,
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

  if (target && relationshipFieldsConflict(source, target, source.source_table)) {
    return {
      decision: IDENTITY_DECISIONS.conflict,
      mapping: null,
      conflict: relationshipConflict(source, target),
    }
  }

  if (target?.relationship_endpoints_incompatible && !relationshipFields(source, source.source_table)) {
    return {
      decision: IDENTITY_DECISIONS.conflict,
      mapping: null,
      conflict: {
        conflict_kind: 'incompatible_relationship_endpoints',
        recovery_status: 'unresolved_relationship_collision',
        source_id: source.source_id,
        target_id: target.id ?? null,
        affected_fields: ['endpoint_source_id', 'endpoint_target_id', 'relationship_type'],
        details: { note: 'Relationship endpoints disagree. No endpoint is rewritten.' },
      },
    }
  }

  if (identityMatches(source, target) && contentDiverges(source, target)) {
    return {
      decision: IDENTITY_DECISIONS.conflict,
      mapping: null,
      conflict: contentConflict(source, target),
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

  if (identityMatches(source, target) && !contentDiverges(source, target)) {
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
