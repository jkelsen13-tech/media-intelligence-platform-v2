// Connect a private saved question only to an already loaded public node.
// No private payload is cast into a public event or persisted in a URL.
export function privateWorkspacePublicNode({ status, userId, panels, graph } = {}) {
  if (!userId || status !== 'ready' || graph?.source !== 'supabase') return null
  const id = panels?.canonicalSubject?.id
  if (!id) return null
  return graph.nodes?.find(node => node.id != null && String(node.id) === String(id)) ?? null
}

export function savedInvestigationHandoffVisible({ binding, userId, status, bundle, subjectId, view } = {}) {
  return Boolean(binding && userId && status === 'ready' && ['graph','timeline','world'].includes(view)
    && binding.userId === userId && binding.investigationId === bundle?.investigation_id
    && binding.versionId === bundle?.version?.id
    && binding.subjectId === subjectId)
}

// Navigation provenance is entry-scoped, not a substitute for authorization.
// Only identity already in the public context may survive an ordinary tab exit.
export function publicWorkspaceEntry(context, { routeOwned = false } = {}) {
  return context?.canonical_subject_id && context?.canonical_subject_type
    ? { kind: 'public', id: context.canonical_subject_id, type: context.canonical_subject_type, routeOwned }
    : { kind: 'private' }
}
export function retainWorkspaceEntry(entry, state) {
  // Explicit URL entry wins over retained private state until a new private selection.
  if (entry?.routeOwned) return entry
  return state?.selectedInvestigationId || state?.bundle ? { kind: 'private' } : entry
}
export function preservesPublicWorkspaceEntry(entry, context) {
  return Boolean(entry?.kind === 'public' && entry.id === context?.canonical_subject_id
    && entry.type === context?.canonical_subject_type)
}
