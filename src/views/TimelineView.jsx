import { useEffect, useMemo, useRef, useState } from 'react'
import {
  loadArcs,
  loadArcDetail,
  loadArcArticles,
  loadArcConnections,
  loadArticleExcerpt,
  loadTimeline,
} from '../lib/supabase'
import { loadTimelineGroupedBetaFlag } from '../lib/arcGroupedTimeline'
import { edgePlainLabel } from '../graph/theme'
import {
  SCREEN5_EYEBROW,
  SCREEN5_SUBTITLE,
  SCREEN5_BANNER,
  TIMELINE_CLOSING_FOOTNOTE,
  ALL_EVENTS_SCOPE,
  defaultArcSlug,
  normalizeArcEvent,
  normalizeArticleTimelineRecord,
  normalizeNodeEvent,
  sortTimelineEntries,
  deriveDateOptions,
  deriveTypeOptions,
  entryMatchesFilters,
  footerCounts,
} from '../lib/timelineScreenModel'
import {
  deriveEvidenceStates,
  missingScopeCopy,
  lastMilestoneCheck,
  pendingUncertainty,
} from '../lib/policyArcModel'
import ArcTimeline from '../components/ArcTimeline'
import ArcEvidencePanel from '../components/ArcEvidencePanel'
import EvidenceTabs from '../components/EvidenceTabs'
import EpistemicBanner from '../components/EpistemicBanner'
import EvidenceStateBar from '../components/EvidenceStateBar'
import RemainingUncertaintyBlock from '../components/RemainingUncertaintyBlock'
import TrustFooter from '../components/TrustFooter'
import GroupedTimelineView from './GroupedTimelineView'
import { investigationContextDomProps } from '../lib/investigationContext'
import { TIMELINE_SPACING_NOTE, timelinePresentationMode } from '../lib/workspacePresentation'
import '../styles/timeline.css'

// Track B Step 3 item 4 — the addendum's Screen 5 (Timeline), arc-scoped by
// default (owner delegation 2026-08-18): the screen follows ONE story arc's
// chronology — eyebrow, arc title, standing subtitle, tabs
// (Timeline / Connections / Evidence), date-range + event-type filter pills,
// epistemic banner, the vertical timeline with connector labels between
// EVERY entry (the item-3 engine), footer links with live counts, closing
// footnote, trust footer. The pre-existing global corpus views (flat and
// arc-grouped) are retained behind the explicit "All events" opt-in,
// rebuilt on the same ArcTimeline renderer so the connector rule holds
// there too. Criteria + locked decisions:
// verifier/trackb3-v4/trackb3-step3-item4.md.

const PAGE_SIZE = 25

const LINK_FILTERS = [
  { id: 'any', label: 'All events' },
  { id: 'linked', label: 'With links' },
  { id: 'causal', label: 'Causal links' },
  { id: 'sequence', label: 'Sequence links' },
  { id: 'none', label: 'No links' },
]

function TimelineTabIcon({ kind }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: '1.6', strokeLinecap: 'round', strokeLinejoin: 'round' }
  if (kind === 'connections') {
    return <svg viewBox="0 0 18 18" width="16" height="16" focusable="false"><circle cx="4" cy="4" r="2" {...common} /><circle cx="14" cy="9" r="2" {...common} /><circle cx="4" cy="14" r="2" {...common} /><path d="m5.8 5.1 6.3 2.8M5.8 12.9l6.3-2.8" {...common} /></svg>
  }
  if (kind === 'evidence') {
    return <svg viewBox="0 0 18 18" width="16" height="16" focusable="false"><path d="M4 2.5h7l3 3v10H4z" {...common} /><path d="M11 2.5v3h3M6.5 9h5M6.5 12h4" {...common} /></svg>
  }
  return <svg viewBox="0 0 18 18" width="16" height="16" focusable="false"><circle cx="9" cy="9" r="6.2" {...common} /><path d="M9 5.5V9l2.5 1.8" {...common} /></svg>
}

export default function TimelineView({ onOpenArc, onOpenArticle, focusEventKey, focusArcKey, investigationContext }) {
  // --- arcs + scope -----------------------------------------------------------
  const [arcs, setArcs] = useState(null)
  const [arcsUnavailable, setArcsUnavailable] = useState(null)
  const [arcsError, setArcsError] = useState(null)
  const [selectedSlug, setSelectedSlug] = useState(null)
  const [allEvents, setAllEvents] = useState(false)
  const [activeTab, setActiveTab] = useState('timeline')
  const [month, setMonth] = useState(null)
  const [type, setType] = useState(null)

  // --- arc-scope data ----------------------------------------------------------
  const [detail, setDetail] = useState(null)
  const [detailError, setDetailError] = useState(null)
  const [arcArticles, setArcArticles] = useState(null)
  const [connections, setConnections] = useState(null)
  const [connectionsError, setConnectionsError] = useState(null)

  // --- global-scope data (lazy: read only after the explicit opt-in, or when a
  // cross-window focus request targets a global event) --------------------------
  const [globalData, setGlobalData] = useState(null)
  const [globalError, setGlobalError] = useState(null)
  const [groupedBeta, setGroupedBeta] = useState(false)
  const [timelineMode, setTimelineMode] = useState('flat')
  const [query, setQuery] = useState('')
  const [linkFilter, setLinkFilter] = useState('any')
  const [presentation, setPresentation] = useState('chronology')
  const [page, setPage] = useState(0)
  const [pendingFocus, setPendingFocus] = useState(null)
  const [focusHighlight, setFocusHighlight] = useState(null)
  const itemRefs = useRef(new Map())

  useEffect(() => {
    loadArcs()
      .then((result) => {
        const rows = result.arcs ?? []
        setArcs(rows)
        setArcsUnavailable(result.arcsUnavailable ?? null)
        const slug = defaultArcSlug(rows)
        if (slug) setSelectedSlug(slug)
        else setAllEvents(true) // no arcs tracked — global is the only honest scope
      })
      .catch((err) => setArcsError(err.message))
    loadTimelineGroupedBetaFlag()
      .then((on) => setGroupedBeta(on === true))
      .catch(() => setGroupedBeta(false))
  }, [])

  const selected = useMemo(
    () => arcs?.find((a) => a.slug === selectedSlug) ?? null,
    [arcs, selectedSlug],
  )

  // Arc-scope loads (events + milestones, attached articles, connections).
  useEffect(() => {
    if (!selected || allEvents) return
    let cancelled = false
    setDetail(null)
    setDetailError(null)
    setArcArticles(null)
    setConnections(null)
    setConnectionsError(null)
    loadArcDetail(selected.id ?? selected.slug)
      .then((d) => !cancelled && setDetail(d))
      .catch((err) => !cancelled && setDetailError(err.message))
    loadArcArticles(selected.id)
      .then((rows) => !cancelled && setArcArticles(rows))
      .catch(() => !cancelled && setArcArticles([]))
    loadArcConnections(selected.id)
      .then((c) => !cancelled && setConnections(c))
      .catch((err) => !cancelled && setConnectionsError(err.message))
    return () => {
      cancelled = true
    }
  }, [selected, allEvents])

  // Global-scope load: explicit opt-in or cross-window focus only.
  useEffect(() => {
    if ((!allEvents && !focusEventKey) || globalData || globalError) return
    let cancelled = false
    loadTimeline()
      .then((d) => !cancelled && setGlobalData(d))
      .catch((err) => !cancelled && setGlobalError(err.message))
    return () => {
      cancelled = true
    }
  }, [allEvents, focusEventKey, globalData, globalError])

  // Changing arc or scope returns to the Timeline tab with filters cleared.
  useEffect(() => {
    setActiveTab('timeline')
    setMonth(null)
    setType(null)
  }, [selectedSlug, allEvents])

  // New search/filter criteria land on page 1 (global scope).
  useEffect(() => {
    setPage(0)
  }, [query, linkFilter, month, type])

  // --- entry lists ---------------------------------------------------------------
  const arcEntries = useMemo(
    () =>
      sortTimelineEntries([
        ...(detail ? detail.events.map(normalizeArcEvent).filter(Boolean) : []),
        ...(arcArticles ?? []).map(normalizeArticleTimelineRecord).filter(Boolean),
      ]),
    [detail, arcArticles],
  )

  const global = useMemo(() => {
    if (!globalData) return null
    const entries = sortTimelineEntries([
      ...(globalData.events ?? []).map(normalizeNodeEvent).filter(Boolean),
      ...(globalData.articleRecords ?? []).map(normalizeArticleTimelineRecord).filter(Boolean),
    ])
    const edges = globalData.relationEdges ?? []
    const labels = new Map(
      (globalData.labels ?? []).map((n) => [n.id ?? n.slug, n.label]),
    )
    const linksByKey = new Map()
    for (const e of edges) {
      for (const [k, role] of [
        [e.source, 'outbound'],
        [e.target, 'inbound'],
      ]) {
        const rec = linksByKey.get(k) ?? { outbound: [], inbound: [] }
        rec[role].push(e)
        linksByKey.set(k, rec)
      }
    }
    const term = query.trim().toLowerCase()
    const filtered = entries.filter((entry) => {
      if (!entryMatchesFilters(entry, { month, type })) return false
      if (term) {
        const haystack = [entry.title, entry.description].filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(term)) return false
      }
      const links = linksByKey.get(entry.key)
      const all = links ? [...links.outbound, ...links.inbound] : []
      switch (linkFilter) {
        case 'linked':
          return all.length > 0
        case 'causal':
          return all.some((e) => e.type === 'causal')
        case 'sequence':
          return all.some((e) => e.type === 'sequence')
        case 'none':
          return all.length === 0
        default:
          return true
      }
    })
    return {
      entries,
      filtered,
      edges,
      labels,
      linksByKey,
      suppressed: globalData.suppressed ?? 0,
      edgesUnavailable: globalData.edgesUnavailable ?? null,
    }
  }, [globalData, query, linkFilter, month, type])

  // Package 1 item 2 return-to-origin (Three-Screen Review named finding):
  // a jump that names its originating arc lands on THAT arc's timeline,
  // never the global corpus. Unknown arc → leave the current scope alone
  // (honest degradation; the global event-focus path below still applies
  // when no arc was named).
  useEffect(() => {
    if (!focusArcKey || !arcs) return
    const arc = arcs.find((a) => a.id === focusArcKey || a.slug === focusArcKey)
    if (!arc) return
    setAllEvents(false)
    setSelectedSlug(arc.slug)
    // Package 1 scope addition (owner-directed): arc-scope landings render
    // the grouped view by default when its flag is on; Flat stays one chip
    // away. (groupedBeta resolves async; the effect re-runs when it lands.)
    if (groupedBeta) setTimelineMode('grouped')
  }, [focusArcKey, arcs, groupedBeta])

  // Cross-window focus (Doc 05): a News Feed article asked us to open its
  // event. Switch to the global corpus, clear filters, jump to its page.
  // (Package 1 item 2: only when the jump named NO originating arc.)
  useEffect(() => {
    if (!focusEventKey || focusArcKey || !global) return
    const idx = global.entries.findIndex(
      (entry) => entry.key === focusEventKey || (entry.slug ?? '').slice(-8) === focusEventKey,
    )
    if (idx === -1) return
    const entry = global.entries[idx]
    setAllEvents(true)
    setQuery('')
    setLinkFilter('any')
    setMonth(null)
    setType(null)
    setPage(Math.floor(idx / PAGE_SIZE))
    setPendingFocus(entry.key)
  }, [focusEventKey, focusArcKey, global])

  // Package 1 item 2: arc-scope event focus. When the jump landed on the
  // originating arc, highlight the matching event inside that arc if the
  // suffix join resolves; the arc landing itself is the guaranteed part.
  useEffect(() => {
    if (!focusEventKey || !focusArcKey || allEvents || !detail) return
    const entry = arcEntries.find(
      (candidate) => candidate.key === focusEventKey || (candidate.key ?? '').slice(-8) === focusEventKey,
    )
    if (entry) setPendingFocus(entry.key)
  }, [focusEventKey, focusArcKey, allEvents, detail, arcEntries])

  // Complete the focus once the row is rendered on the current page.
  useEffect(() => {
    if (!pendingFocus) return
    // Arc scope has no pagination: every rendered row is a candidate.
    const rows =
      allEvents || !selected
        ? global
          ? global.filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
          : null
        : arcEntries.filter((e) => entryMatchesFilters(e, { month, type }))
    if (!rows || !rows.some((e) => e.key === pendingFocus)) return
    const el = itemRefs.current.get(pendingFocus)
    setPendingFocus(null)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setFocusHighlight(pendingFocus)
    const t = setTimeout(() => setFocusHighlight(null), 4000)
    return () => clearTimeout(t)
  }, [pendingFocus, global, page, allEvents, selected, arcEntries, month, type])

  // Investigation Context restore after a tab switch (not a JUMP).
  // Highlight only when a loaded entry already matches. No match → no invented event.
  useEffect(() => {
    if (focusEventKey) return
    const id = investigationContext?.canonical_subject_id
    if (!id) return
    if (investigationContext?.canonical_subject_type === 'arc' || investigationContext?.canonical_subject_type === 'article') return
    const pool = [...(arcEntries ?? []), ...(global?.entries ?? [])]
    const entry = pool.find(
      (candidate) =>
        candidate.key === id ||
        candidate.id === id ||
        (candidate.slug ?? '') === id ||
        (candidate.slug ?? '').slice(-8) === id ||
        (candidate.key ?? '').slice(-8) === id,
    )
    if (entry) setPendingFocus(entry.key)
  }, [investigationContext?.canonical_subject_id, investigationContext?.canonical_subject_type, focusEventKey, arcEntries, global])

  // --- render ---------------------------------------------------------------

  if (arcsError) {
    return (
      <div className="notice error" {...investigationContextDomProps(investigationContext)}>
        Failed to load story arcs: {arcsError}
      </div>
    )
  }
  if (!arcs) {
    return (
      <div className="notice" {...investigationContextDomProps(investigationContext)}>
        Loading timeline…
      </div>
    )
  }
  const arcsUnavailableNotice = arcsUnavailable ? (
    <div className="notice">
      Some timeline context is unavailable. Recorded events remain visible. Story arcs are unavailable ({arcsUnavailable}). Id-only stub rows are treated as no-arc; no titles are invented.
    </div>
  ) : null

  const scopeIsGlobal = allEvents || !selected
  const entries = scopeIsGlobal ? (global?.filtered ?? []) : arcEntries.filter((e) => entryMatchesFilters(e, { month, type }))
  const dateOptions = deriveDateOptions(scopeIsGlobal ? (global?.entries ?? []) : arcEntries)
  const typeOptions = deriveTypeOptions(scopeIsGlobal ? (global?.entries ?? []) : arcEntries)

  const graphEventCount = (scopeIsGlobal ? global?.entries : arcEntries)?.filter((entry) => entry.kind === 'graph_event').length ?? 0
  const articleRecordCount = (scopeIsGlobal ? global?.entries : arcEntries)?.filter((entry) => entry.kind === 'article_record').length ?? 0

  const counts = detail ? deriveEvidenceStates(detail.events, detail.milestones) : null
  const missingScope = counts
    ? missingScopeCopy({
        pendingCount: counts.missing,
        startedAt: selected?.started_at,
        lastCheck: lastMilestoneCheck(detail.milestones),
      })
    : null
  const uncertainty = detail ? pendingUncertainty(detail.milestones) : null

  // Live footer counts (D6) — never literals. A failed connections read
  // shows no number rather than a fabricated one.
  const globalConnectionEdges = scopeIsGlobal
    ? (global?.edges.filter((e) => entries.some((en) => en.key === e.source || en.key === e.target)) ?? [])
    : []
  const foot = scopeIsGlobal
    ? footerCounts({ scope: ALL_EVENTS_SCOPE, entries: global?.entries ?? [], connections: globalConnectionEdges })
    : footerCounts({
        scope: selectedSlug,
        articles: arcArticles ?? [],
        connections: connections?.edges ?? [],
      })

  const pageCount = scopeIsGlobal ? Math.max(1, Math.ceil(entries.length / PAGE_SIZE)) : 1
  const safePage = Math.min(page, pageCount - 1)
  const visibleEntries = scopeIsGlobal
    ? entries.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)
    : entries

  const registerRef = (key, el) => {
    if (el) itemRefs.current.set(key, el)
    else itemRefs.current.delete(key)
  }

  const connectionLabel = (key, labels) => labels?.get(key) ?? key

  return (
    <div className="timeline-view" {...investigationContextDomProps(investigationContext)}>
      {arcsUnavailableNotice}
      {global?.edgesUnavailable && (
        <div className="notice">
          public.edges is unavailable ({global.edgesUnavailable}). No relationships are invented.
        </div>
      )}
      <div className="timeline-intro">
        <p className="ep-eyebrow">{SCREEN5_EYEBROW}</p>
        <h2 className="ep-report-title">
          {scopeIsGlobal ? 'All events — global corpus' : selected.title}
        </h2>
        <p>{SCREEN5_SUBTITLE}</p>

        <div className="ep-tl-scope">
          {!scopeIsGlobal || arcs.length > 0 ? (
            <select
              className="ep-tl-scope-select"
              value={selectedSlug ?? ''}
              disabled={scopeIsGlobal && arcs.length > 0}
              onChange={(e) => {
                setSelectedSlug(e.target.value)
                setAllEvents(false)
              }}
              aria-label="Choose story arc"
            >
              {arcs.map((a) => (
                <option key={a.slug} value={a.slug}>
                  {a.title}
                </option>
              ))}
            </select>
          ) : null}
          <button
            type="button"
            className="ep-tl-scope-toggle"
            onClick={() => setAllEvents((v) => !v)}
          >
            {scopeIsGlobal ? '← Back to the arc timeline' : 'All events (global corpus)'}
          </button>
        </div>

        <EvidenceTabs
          label="Timeline sections"
          activeId={activeTab}
          onSelect={setActiveTab}
          tabs={[
            { id: 'timeline', label: 'Timeline', icon: <TimelineTabIcon kind="timeline" />, panelId: 'timeline-panel' },
            { id: 'connections', label: 'Connections', icon: <TimelineTabIcon kind="connections" />, panelId: 'timeline-connections-panel' },
            { id: 'evidence', label: 'Evidence', icon: <TimelineTabIcon kind="evidence" />, panelId: 'timeline-evidence-panel' },
          ]}
        />
      </div>

      {activeTab === 'timeline' && (
        <section id="timeline-panel" role="tabpanel" aria-labelledby="timeline-tab">
          <div className="ep-tl-filters" data-filter-family="investigation" aria-label="Investigation filters">
            <h3 className="filter-family-label">Investigation filters</h3>
            <select
              className="ep-tl-pill"
              value={month ?? ''}
              onChange={(e) => setMonth(e.target.value || null)}
              aria-label="Filter by date range"
            >
              <option value="">All dates</option>
              {dateOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              className="ep-tl-pill"
              value={type ?? ''}
              onChange={(e) => setType(e.target.value || null)}
              aria-label="Filter by event type"
            >
              <option value="">All event types</option>
              {typeOptions.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <EpistemicBanner>{SCREEN5_BANNER}</EpistemicBanner>

          {scopeIsGlobal && (
            <div className="timeline-controls">
              <input
                type="search"
                className="timeline-search"
                placeholder="Search events…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search timeline events"
              />
              <div className="timeline-filter-chips" role="group" aria-label="Filter by link type">
                {LINK_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`timeline-chip${linkFilter === f.id ? ' active' : ''}`}
                    aria-pressed={linkFilter === f.id}
                    onClick={() => setLinkFilter(f.id)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Package 1 scope addition (owner-directed 2026-08-18): the
              Flat/Grouped layout chips now render at BOTH scopes — arc-scope
              landings default to the grouped view (richer event cards with
              per-event outlet counts); Flat remains available at arc scope
              exactly where it already worked. Additive, not a replacement. */}
          {groupedBeta && (
            <div className="timeline-filter-chips" role="group" aria-label="Timeline layout">
              <button
                type="button"
                className={`timeline-chip${timelineMode === 'flat' ? ' active' : ''}`}
                aria-pressed={timelineMode === 'flat'}
                onClick={() => setTimelineMode('flat')}
              >
                Flat
              </button>
              <button
                type="button"
                className={`timeline-chip${timelineMode === 'grouped' ? ' active' : ''}`}
                aria-pressed={timelineMode === 'grouped'}
                onClick={() => setTimelineMode('grouped')}
              >
                Grouped by arc (Beta)
              </button>
            </div>
          )}

          {timelineMode === 'grouped' && groupedBeta ? (
            <GroupedTimelineView
              onOpenArc={onOpenArc}
              onOpenArticle={onOpenArticle}
              focusEventKey={focusEventKey}
              arcId={scopeIsGlobal ? null : selected.id}
            />
          ) : (
            <>
              {scopeIsGlobal && globalError && (
                <div className="notice error">Failed to load timeline: {globalError}</div>
              )}
              {scopeIsGlobal && !global && !globalError && (
                <div className="notice">Loading timeline…</div>
              )}
              {!scopeIsGlobal && detailError && (
                <div className="notice error">Failed to load arc timeline: {detailError}</div>
              )}
              {!scopeIsGlobal && !detail && !detailError && (
                <div className="notice">Loading arc timeline…</div>
              )}
              {((scopeIsGlobal && global) || (!scopeIsGlobal && detail)) && (
                <>
                  <div className="timeline-presentation">
                    <div className="timeline-presentation-toggle" role="group" aria-label="Timeline presentation">
                      <button
                        type="button"
                        className={timelinePresentationMode(presentation) === 'chronology' ? 'active' : ''}
                        aria-pressed={presentation === 'chronology'}
                        onClick={() => setPresentation('chronology')}
                      >
                        Chronology
                      </button>
                      <button
                        type="button"
                        className={timelinePresentationMode(presentation) === 'list' ? 'active' : ''}
                        aria-pressed={presentation === 'list'}
                        onClick={() => setPresentation('list')}
                      >
                        List
                      </button>
                    </div>
                    <p className="timeline-spacing-note">{TIMELINE_SPACING_NOTE}</p>
                  </div>
                  <p className="timeline-count" aria-live="polite">
                    {entries.length} timeline record{entries.length === 1 ? '' : 's'} · {graphEventCount} graph event{graphEventCount === 1 ? '' : 's'} · {articleRecordCount} News record{articleRecordCount === 1 ? '' : 's'}
                    {!scopeIsGlobal && entries.length !== arcEntries.length &&
                      ` (filtered from ${arcEntries.length})`}
                    {scopeIsGlobal && entries.length !== (global?.entries.length ?? 0) &&
                      ` (filtered from ${global?.entries.length ?? 0})`}
                    {scopeIsGlobal && (global?.suppressed ?? 0) > 0 &&
                      ` · ${global.suppressed} duplicate event mirrors suppressed; separately listed News records remain visible`}
                  </p>
                  <ArcTimeline
                    entries={visibleEntries}
                    edges={scopeIsGlobal ? (global?.edges ?? []) : []}
                    layout={presentation === 'list' ? 'list' : 'horizontal'}
                    loadArticle={loadArticleExcerpt}
                    registerRef={scopeIsGlobal ? registerRef : undefined}
                    focusKey={focusHighlight}
                    emptyText={
                      scopeIsGlobal
                        ? 'No events match these filters.'
                        : 'No consequence events recorded yet for this arc.'
                    }
                  />
                  {scopeIsGlobal && pageCount > 1 && (
                    <nav className="timeline-pager" aria-label="Timeline pages">
                      <button
                        type="button"
                        disabled={safePage === 0}
                        onClick={() => setPage(safePage - 1)}
                      >
                        ← Previous
                      </button>
                      <span>
                        Page {safePage + 1} of {pageCount}
                      </span>
                      <button
                        type="button"
                        disabled={safePage >= pageCount - 1}
                        onClick={() => setPage(safePage + 1)}
                      >
                        Next →
                      </button>
                    </nav>
                  )}
                </>
              )}
            </>
          )}
        </section>
      )}

      {activeTab === 'connections' && (
        <section id="timeline-connections-panel" role="tabpanel" aria-labelledby="connections-tab" className="ap-section">
          {scopeIsGlobal ? (
            !global ? (
              <div className="notice">Loading connections…</div>
            ) : globalConnectionEdges.length === 0 ? (
              <p className="arc-empty">
                No graph connections touch the events currently in view.
              </p>
            ) : (
              <ul className="ep-tl-connections">
                {globalConnectionEdges.slice(0, 100).map((e) => (
                  <li key={e.id} className="ep-tl-connection">
                    <span className="ep-tl-connection-pair">
                      {connectionLabel(e.source, global?.labels)}
                      {' → '}
                      {connectionLabel(e.target, global?.labels)}
                    </span>
                    <span className="ep-tl-connection-meta">
                      {edgePlainLabel(e)}
                      {e.doc_strength ? ` · ${e.doc_strength}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )
          ) : connections?.edgesUnavailable ? (
            <div className="notice">
              public.edges is unavailable ({connections.edgesUnavailable}). No relationships are invented.
            </div>
          ) : connectionsError ? (
            <div className="notice error">Failed to load connections: {connectionsError}</div>
          ) : !connections ? (
            <div className="notice">Loading connections…</div>
          ) : connections.edges.length === 0 ? (
            <p className="arc-empty">
              No graph connections recorded for this arc's events in the current corpus.
            </p>
          ) : (
            <ul className="ep-tl-connections">
              {connections.edges.map((e) => (
                <li key={e.id} className="ep-tl-connection">
                  <span className="ep-tl-connection-pair">
                    {connectionLabel(e.source, connections.labels)}
                    {' → '}
                    {connectionLabel(e.target, connections.labels)}
                  </span>
                  <span className="ep-tl-connection-meta">
                    {edgePlainLabel(e)}
                    {e.doc_strength ? ` · ${e.doc_strength}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {activeTab === 'evidence' && (
        <>
          {scopeIsGlobal ? (
            <section id="timeline-evidence-panel" role="tabpanel" aria-labelledby="evidence-tab" className="ap-section">
              <p className="arc-empty">
                Evidence state is tracked per story arc. Choose an arc above to see its
                supporting / contested / missing counts.
              </p>
                  {global && foot.articles > 0 && (
                <ul className="ap-sources">
                  {[...new Map(
                    global.entries
                      .filter((entry) => entry.articleId)
                      .map((entry) => [entry.articleId, entry]),
                  ).values()].map((entry) => (
                    <li key={entry.articleId} className="ap-source">
                      <button
                        className="ap-source-headline ap-article-link"
                        title="Open in News Feed"
                        onClick={() => onOpenArticle?.(entry.articleId)}
                      >
                        {entry.title}
                      </button>
                      {entry.date && <span className="ap-source-date">{entry.date}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : detailError ? (
            <div className="notice error">Failed to load arc detail: {detailError}</div>
          ) : !detail ? (
            <div className="notice">Loading evidence…</div>
          ) : (
            <section id="timeline-evidence-panel" role="tabpanel" aria-labelledby="evidence-tab">
              <section className="ap-section">
                <span className="ep-section-label">Evidence state</span>
                <EvidenceStateBar
                  supporting={counts.supporting}
                  contested={counts.contested}
                  missing={counts.missing}
                  missingScope={missingScope}
                />
              </section>
              {uncertainty && (
                <RemainingUncertaintyBlock>
                  Still unresolved: {uncertainty.join('; ')}.
                </RemainingUncertaintyBlock>
              )}
              <ArcEvidencePanel
                arc={selected}
                detail={detail}
                arcArticles={arcArticles ?? []}
                onOpenArticle={onOpenArticle}
              />
            </section>
          )}
        </>
      )}

      {/* Footer links with LIVE counts (D6) — never literals; they navigate
          to the tab where the underlying records are listed.
          Package 1 item 3 (22_NOTE): these buttons switch tabs in place —
          they do not navigate anywhere — so the labels say "Open <tab>",
          not "View articles"/"See connections" (which imply navigation). */}
      <div className="ep-tl-footerlinks">
        <button type="button" className="ep-tl-footerlink" onClick={() => setActiveTab('evidence')}>
          Open Evidence ({foot.articles} article{foot.articles === 1 ? '' : 's'})
        </button>
        <span className="ep-tl-footerlink-sep" aria-hidden="true" />
        <button
          type="button"
          className="ep-tl-footerlink"
          onClick={() => setActiveTab('connections')}
        >
          Open Connections (
          {connectionsError && !scopeIsGlobal ? 'count unavailable' : foot.connections})
        </button>
      </div>

      {/* Trust footer (addendum: bottom of every screen). The left slot
          carries the closing footnote — the connector rule restated;
          reviewedAt is null because no review date exists in the record
          and one is never fabricated. */}
      <TrustFooter
        left={<span className="ep-tl-footnote">{TIMELINE_CLOSING_FOOTNOTE}</span>}
        reviewedAt={null}
      />
    </div>
  )
}
