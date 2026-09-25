// Tier 4 deterministic duplicate rule (Phase 0 Item 4, 2026-07-28).
//
// The historical 8-char article suffix only locates mirror candidates.
// A unique evt-/art- pair must also share the complete post-prefix slug body:
// ingest-rss generates both from the same title stem and article-id prefix.
// A suffix collision alone is not identity evidence. Only an unambiguous
// matching pair suppresses its art- node in favor of the evt- summary;
// unpaired, mismatched, and ambiguous candidates always render.
//
// Pure functions, no imports — unit-tested outside the Vite bundle.

export function canonicalizeTimelineEvents(events) {
  const groups = new Map()
  for (const n of events ?? []) {
    // Only the established evt-/art- + eight-hex suffix convention can
    // identify a mirror candidate. Missing/arbitrary slugs stay independent.
    const match = typeof n.slug === 'string'
      ? /^(evt|art)-(?:.*-)?([0-9a-f]{8})$/.exec(n.slug)
      : null
    const key = match ? match[2] : Symbol()
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(n)
  }
  const canonicalOf = new Map()
  const kept = []
  let suppressed = 0
  for (const group of groups.values()) {
    const evtNodes = group.filter((n) => typeof n.slug === 'string' && n.slug.startsWith('evt-'))
    const artNodes = group.filter((n) => typeof n.slug === 'string' && n.slug.startsWith('art-'))
    // Multiple evt or art candidates make the suffix ambiguous. Preserve
    // every identity rather than choosing one and redirecting its edges.
    const paired = group.length === 2 && evtNodes.length === 1 && artNodes.length === 1 &&
      evtNodes[0].slug.slice(4) === artNodes[0].slug.slice(4)
    if (paired) {
      const canonical = evtNodes[0]
      for (const n of group) {
        canonicalOf.set(n.id ?? n.slug, canonical.id ?? canonical.slug)
      }
      kept.push(canonical)
      suppressed++
    } else {
      for (const n of group) {
        const identity = n.id ?? n.slug
        if (identity != null) canonicalOf.set(identity, identity)
        kept.push(n)
      }
    }
  }
  return { events: kept, canonicalOf, suppressed }
}

// Remap edge endpoints through the canonical map so links attached to a
// suppressed mirror node render against the canonical card instead of
// disappearing. (Preflight 2026-07-28: zero such edges — purely defensive.)
export function remapTimelineEdges(edges, canonicalOf) {
  return (edges ?? []).map((e) => ({
    ...e,
    source: canonicalOf.get(e.source) ?? e.source,
    target: canonicalOf.get(e.target) ?? e.target,
  }))
}
