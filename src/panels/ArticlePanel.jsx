import { useEffect, useMemo, useRef, useState } from 'react'
import { loadSources, loadNodeArticles, loadNodeCategory, loadSkyVerificationForNode, loadActorDerivation } from '../lib/supabase'
import { NODE_TYPES, EDGE_TYPES, CATEGORY_TYPES, edgePlainLabel } from '../graph/theme'
import { buildNodeEvidenceAxes } from '../lib/nodeEvidence'
import SkyBadge from './SkyBadge'

// Article panel (spec §4.4): title + category tag, confidence score on a
// red→green gradient, 3–5 sentence synthesis, source list with outbound
// links, and the connected-node list with type + strength. Desktop: a side
// panel the graph flex-shrinks beside (never covered). Mobile (<768px): a
// bottom sheet at 60vh with a drag handle — drag up for full height, drag
// down past the dismiss threshold to close. Pinnable; Escape/scrim close.
//
// Note on §4.4 item 4 (inline images): the articles table has no image/
// media column (id, feed, outlet, title, url, summary, published_at,
// fetched_at, outlet_id, author_id, body_text, embedding, claims, arc_id,
// unattributed, monoculture), so there is nothing to render — the section
// is omitted rather than fabricated.

// Trim a synthesis to at most `max` sentences (spec calls for 3–5).
function trimSentences(text, max = 5) {
  if (!text) return text
  const parts = text.match(/[^.!?]+[.!?]+["')\]]*\s*/g)
  if (!parts || parts.length <= max) return text
  return parts.slice(0, max).join('').trim()
}

// Edge strength label: similarity (0..1) when present, otherwise the
// heavy/medium/light weight bucket stored on the edge.
function strengthLabel(edge) {
  if (edge.similarity != null && Number.isFinite(Number(edge.similarity))) {
    return `${Math.round(Number(edge.similarity) * 100)}%`
  }
  return edge.weight ?? '—'
}

// Mobile sheet snap points, as fractions of viewport height.
const SHEET_DEFAULT = 0.6
const SHEET_FULL = 1
const SHEET_DISMISS = 0.42

// Step 9 (§8): type-aware ordering for the connected-node list — focusing
// an actor surfaces its events first, an event surfaces actors/institutions,
// a topic/policy surfaces its highest-degree members. Unknown types keep
// their natural order after the prioritized ones.
const TYPE_PRIORITY = {
  actor: ['event', 'actor'],
  event: ['actor', 'institution', 'policy'],
  topic: ['event', 'actor', 'policy'],
  policy: ['event', 'actor'],
}

export default function ArticlePanel({
  node,
  nodes,
  edges,
  pinned,
  onTogglePin,
  onNavigate,
  onFocusNode,
  onOpenConsequence,
  onShowEdgeEvidence,
  onOpenArticle,
  onClose,
  isMobile,
}) {
  const [sources, setSources] = useState(null)
  const [sourcesError, setSourcesError] = useState(null)
  const [backing, setBacking] = useState(null)
  const [category, setCategory] = useState(null)
  // Derived fallback for actor-type nodes with no direct category/sources.
  const [derived, setDerived] = useState(null)
  // Location corroboration across this node's backing articles (null = none).
  const [sky, setSky] = useState(null)
  // Selection is local to the currently open node's connection table. It is
  // not a graph assertion; it simply gives the reader a contained visual
  // anchor for the relationship whose detail was opened.
  const [selectedConnectionId, setSelectedConnectionId] = useState(null)

  // Bottom-sheet geometry (mobile only). sheetFrac is the committed snap
  // point; dragFrac tracks an in-progress drag and overrides it.
  const [sheetFrac, setSheetFrac] = useState(SHEET_DEFAULT)
  const [dragFrac, setDragFrac] = useState(null)
  const dragRef = useRef(null)

  const nodeKey = node.id ?? node.slug
  const isUuid = typeof node.id === 'string' && node.id.includes('-')

  useEffect(() => {
    setSelectedConnectionId(null)
  }, [nodeKey])

  useEffect(() => {
    let cancelled = false
    setSources(null)
    setSourcesError(null)
    loadSources(nodeKey)
      .then((rows) => {
        if (!cancelled) setSources(rows)
      })
      .catch((err) => {
        if (!cancelled) setSourcesError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [nodeKey])

  // Articles backing this node (citation-resolved + arc-attached).
  useEffect(() => {
    let cancelled = false
    setBacking(null)
    if (!isUuid) {
      setBacking([])
      return
    }
    loadNodeArticles(node.id)
      .then((rows) => {
        if (!cancelled) setBacking(rows)
      })
      .catch(() => {
        if (!cancelled) setBacking([])
      })
    return () => {
      cancelled = true
    }
  }, [node.id, isUuid])

  // Location corroboration backing this node (latest across its articles).
  useEffect(() => {
    let cancelled = false
    setSky(null)
    if (!isUuid) return
    loadSkyVerificationForNode(node.id)
      .then((v) => {
        if (!cancelled) setSky(v)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [node.id, isUuid])

  // Category tag: nodes have no category column; it comes from the arc.
  useEffect(() => {
    let cancelled = false
    setCategory(null)
    loadNodeCategory(node)
      .then((cat) => {
        if (!cancelled) setCategory(cat)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeKey])

  // Derivation fallback (targeted patch): for non-event nodes with no direct
  // arc category and/or no sources of their own, derive both from connected
  // event nodes at read time.
  const connectedEventIds = useMemo(() => {
    if (node.type === 'event') return []
    const ids = []
    for (const e of edges) {
      const other = e.source === nodeKey ? e.target : e.source === nodeKey || e.target === nodeKey ? e.source : null
      if ((e.source === nodeKey || e.target === nodeKey) && other) {
        const otherNode = nodes.find((n) => (n.id ?? n.slug) === other)
        if (otherNode?.type === 'event' && otherNode.id) ids.push(otherNode.id)
      }
    }
    return ids
  }, [node.type, nodeKey, nodes, edges])

  useEffect(() => {
    let cancelled = false
    setDerived(null)
    const needsCategory = category == null
    const needsSources = sources != null && sources.length === 0
    if (node.type === 'event' || connectedEventIds.length === 0 || (!needsCategory && !needsSources)) return
    loadActorDerivation(connectedEventIds)
      .then((d) => {
        if (!cancelled) setDerived(d)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [node.type, category, sources, connectedEventIds])

  const connections = useMemo(() => {
    const nodeById = new Map(nodes.map((n) => [n.id ?? n.slug, n]))
    const list = edges
      .filter((e) => e.source === nodeKey || e.target === nodeKey)
      .map((e) => {
        const otherKey = e.source === nodeKey ? e.target : e.source
        const other = nodeById.get(otherKey)
        return {
          edgeId: e.id,
          edge: e,
          otherKey,
          label: other?.label ?? otherKey,
          otherType: other?.type,
          edgeType: e.type,
          weight: e.weight,
          similarity: e.similarity,
          rel: e.label,
          direction: e.source === nodeKey ? 'out' : 'in',
        }
      })
    // Step 9: type-aware ordering — prioritized types for this node's type
    // come first; ties break toward stronger connections.
    const priority = TYPE_PRIORITY[node.type] ?? []
    return list.sort((a, b) => {
      const pa = priority.indexOf(a.otherType)
      const pb = priority.indexOf(b.otherType)
      const ra = pa === -1 ? priority.length : pa
      const rb = pb === -1 ? priority.length : pb
      if (ra !== rb) return ra - rb
      return (Number(b.similarity) || 0) - (Number(a.similarity) || 0)
    })
  }, [nodeKey, nodes, edges, node.type])

  // --- Mobile bottom-sheet drag (pointer events on the handle) ----------
  const onHandlePointerDown = (e) => {
    if (!isMobile) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startY: e.clientY, baseFrac: dragFrac ?? sheetFrac }
  }
  const onHandlePointerMove = (e) => {
    const drag = dragRef.current
    if (!drag) return
    const delta = (drag.startY - e.clientY) / window.innerHeight
    const next = Math.min(SHEET_FULL, Math.max(0.2, drag.baseFrac + delta))
    setDragFrac(next)
  }
  const onHandlePointerUp = () => {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    const frac = dragFrac ?? sheetFrac
    setDragFrac(null)
    if (frac < SHEET_DISMISS) {
      onClose()
      return
    }
    setSheetFrac(frac > (SHEET_DEFAULT + SHEET_FULL) / 2 ? SHEET_FULL : SHEET_DEFAULT)
  }

  const typeMeta = NODE_TYPES[node.type]
  const effectiveCategory = category ?? derived?.category ?? null
  const catMeta = CATEGORY_TYPES[effectiveCategory] ?? CATEGORY_TYPES.unclassified
  const displaySources = sources && sources.length > 0 ? sources : (derived?.sources ?? [])
  const sourcesDerived = !(sources && sources.length > 0) && (derived?.sources?.length ?? 0) > 0
  const summary = trimSentences(node.summary ?? node.description)
  const activeFrac = dragFrac ?? sheetFrac
  const evidenceAxes = useMemo(() => buildNodeEvidenceAxes(node), [node])

  const panelStyle = isMobile
    ? { height: `${Math.round(activeFrac * 100)}vh`, transition: dragFrac == null ? undefined : 'none' }
    : undefined

  return (
    <aside
      className={`article-panel${pinned ? ' pinned' : ''}${isMobile ? ' sheet-mode' : ''}`}
      style={panelStyle}
      role="dialog"
      aria-label={`Article panel: ${node.label}`}
    >
      {isMobile && (
        <div
          className="ap-sheet-handle"
          role="separator"
          aria-orientation="horizontal"
          aria-label="Drag to resize panel"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
        >
          <span className="ap-sheet-grip" />
        </div>
      )}
      <header className="ap-header">
        <div className="ap-title-row">
          <h2>{node.label}</h2>
          <div className="ap-actions">
            {node.type === 'policy' && onOpenConsequence && (
              <button
                className="ap-icon-btn"
                title="Open policy consequence view (§7.4)"
                aria-label="Open policy consequence view"
                onClick={() => onOpenConsequence(node)}
              >
                ⇄
              </button>
            )}
            {onFocusNode && (
              <button
                className="ap-icon-btn"
                title="Focus graph on this node (depth-2 neighborhood)"
                aria-label="Focus graph on this node"
                onClick={() => onFocusNode(node)}
              >
                ⌖
              </button>
            )}
            <button
              className={`ap-icon-btn${pinned ? ' active' : ''}`}
              title={pinned ? 'Unpin panel' : 'Pin panel — keep open while exploring the graph'}
              aria-pressed={pinned}
              onClick={onTogglePin}
            >
              {pinned ? '◉' : '◎'}
            </button>
            <button className="ap-icon-btn" title="Close panel (Esc)" aria-label="Close panel" onClick={onClose}>
              ×
            </button>
          </div>
        </div>
        <div className="ap-tags">
          <span
            className="ap-tag"
            style={{ borderColor: `var(${catMeta.cssVar})`, color: `var(${catMeta.cssVar})` }}
          >
            {catMeta.label}
          </span>
          {typeMeta && (
            <span
              className="ap-tag ap-tag-type"
              style={{
                borderColor: typeMeta.cssVar ? `var(${typeMeta.cssVar})` : typeMeta.color,
                color: typeMeta.cssVar ? `var(${typeMeta.cssVar})` : typeMeta.color,
              }}
            >
              {typeMeta.label}
            </span>
          )}
        </div>
      </header>

      <section className="ap-section" aria-label="Node evidence state">
        <span className="ap-label">Node evidence state</span>
        <dl className="ap-evidence-axes">
          {evidenceAxes.map((axis) => (
            <div key={axis.key} className={`ap-evidence-axis tone-${axis.tone}`}>
              <dt>{axis.label}</dt>
              <dd>{axis.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {sky && (
        <section className="ap-section">
          <SkyBadge verification={sky} />
        </section>
      )}

      {summary && (
        <section className="ap-section">
          <span className="ap-label">Synthesis</span>
          <p className="ap-summary">{summary}</p>
        </section>
      )}

      {backing && backing.length > 0 && (
        <section className="ap-section">
          <span className="ap-label">
            Articles attached to this node (<span className="num">{backing.length}</span>)
          </span>
          <ul className="ap-sources">
            {backing.map((a) => (
              <li key={a.id} className="ap-source">
                <span className="ap-source-outlet">{a.outlet}</span>
                {a.url ? (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ap-source-headline"
                  >
                    {a.title}
                  </a>
                ) : (
                  <span className="ap-source-headline">{a.title}</span>
                )}
                <span className="ap-source-meta">
                  {a.published_at && (
                    <span className="ap-source-date">{String(a.published_at).slice(0, 10)}</span>
                  )}
                  <button
                    className="ap-feed-link"
                    title="Open in News Feed"
                    onClick={() => onOpenArticle?.(a.id)}
                  >
                    Feed →
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="ap-section">
        <span className="ap-label">Node-level source records</span>
        {sourcesError && <p className="ap-sources-error">Failed to load sources: {sourcesError}</p>}
        {!sources && !sourcesError && <p className="ap-muted">Loading sources…</p>}
        {sources && displaySources.length === 0 && (
          <p className="ap-muted">No node-level source records documented yet.</p>
        )}
        {sources && displaySources.length > 0 && (
          <>
            {sourcesDerived && (
              <p className="ap-muted">via connected events</p>
            )}
          <ul className="ap-sources">
            {displaySources.map((s) => (
              <li key={s.id} className="ap-source">
                <span className="ap-source-outlet">{s.outlet}</span>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="ap-source-headline">
                    {s.headline}
                  </a>
                ) : (
                  <span className="ap-source-headline">{s.headline}</span>
                )}
                {s.published_at && <span className="ap-source-date">{s.published_at}</span>}
              </li>
            ))}
          </ul>
          </>
        )}
      </section>

      <section className="ap-section">
        <span className="ap-label">
          Connected nodes (<span className="num">{connections.length}</span>)
        </span>
        <ul className="ap-connections">
          {connections.map((c) => {
            const edgeMeta = EDGE_TYPES[c.edgeType]
            return (
              <li key={c.edgeId} className={`ap-connection-row${selectedConnectionId === c.edgeId ? ' selected' : ''}`}>
                <button
                  className="ap-connection"
                  aria-current={selectedConnectionId === c.edgeId ? 'true' : undefined}
                  onClick={() => {
                    setSelectedConnectionId(c.edgeId)
                    onNavigate(c.otherKey)
                  }}
                >
                  <span
                    className="ap-conn-dot"
                    style={{
                      background: NODE_TYPES[c.otherType]?.cssVar
                        ? `var(${NODE_TYPES[c.otherType].cssVar})`
                        : (NODE_TYPES[c.otherType]?.color ?? 'var(--text-muted)'),
                    }}
                  />
                  <span className="ap-conn-label">{c.label}</span>
                  <span className="ap-conn-meta" style={{ color: edgeMeta?.color ?? 'var(--text-secondary)' }}>
                    {c.direction === 'out' ? '→' : '←'} {edgePlainLabel(c.edge) || edgeMeta?.label}
                  </span>
                  <span className="ap-conn-strength num" title="Connection strength">
                    {edgeMeta?.label ?? c.edgeType} · {strengthLabel(c)}
                  </span>
                </button>
                {onShowEdgeEvidence && (
                  <button
                    className="ap-conn-evidence"
                    title="Edge evidence"
                    aria-label={`Evidence for connection to ${c.label}`}
                    onClick={() => {
                      setSelectedConnectionId(c.edgeId)
                      onShowEdgeEvidence(c.edge)
                    }}
                  >
                    ⓘ
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </aside>
  )
}
