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
