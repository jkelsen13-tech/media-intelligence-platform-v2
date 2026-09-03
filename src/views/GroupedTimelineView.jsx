import { useEffect, useMemo, useRef, useState } from 'react'
import {
  loadArcGroupedTimeline,
  filterGrouped,
  paginateSections,
  verifyExactlyOnce,
  SECTION_PAGE_SIZE,
  UNCLASSIFIED_PAGE_SIZE,
} from '../lib/arcGroupedTimeline'
import { EDGE_WEIGHTS, edgePlainLabel } from '../graph/theme'
import '../styles/timeline.css'

// 04-ADD Track B Step 3 Addendum — Arc-Grouped Timeline. Renders BEHIND the
// timeline_grouped_beta flag alongside the untouched flat view. Reuses the
// Doc 05 cross-window chip pattern (arc/article chips render only when their
// join resolved) and the flat view's card markup conventions.
//
// Owner-approved shape (2026-08-10): arc sections sorted by most recent
// activity, 5 sections/page; Unclassified pinned last as a first-class
// section with its own 25-event internal pager; category filter reduces
// Unclassified to an explicit placeholder rather than dropping it.

const LINK_FILTERS = [
  { id: 'any', label: 'All events' },
  { id: 'linked', label: 'With links' },
  { id: 'causal', label: 'Causal links' },
  { id: 'sequence', label: 'Sequence links' },
  { id: 'none', label: 'No links' },
]

// One event card — same structure as the flat view's card so the two modes
// stay visually consistent; arc chip is omitted inside an arc section (the
// section header IS the arc context) but the News Feed chip is kept.
// Package 1 arc-grouped addition: when the event resolves to the
// events/event_articles store, the card shows how many distinct outlets
// reported it ("N outlets reporting"); when the join does not resolve the
// line is withheld entirely (never a fabricated count).
function EventCard({ evt, outbound, inbound, isCollapsed, onToggle, onOpenArticle, registerRef }) {
  const key = evt.id ?? evt.slug
  const showArticle = Boolean(evt.article_id && onOpenArticle)
  const isArticleRecord = evt.record_kind === 'article_record'
  return (
    <li className="timeline-item" ref={registerRef}>
      <div className="timeline-marker" />
      <div className="timeline-card">
        <div className="timeline-card-head">
          <div>
            <div className="timeline-date">{evt.occurred_at ? String(evt.occurred_at).slice(0, 10) : 'undated'}</div>
            <h3>{evt.label}</h3>
            {isArticleRecord && (
              <span className="timeline-record-kind">News record · publication date</span>
            )}
            {isArticleRecord && evt.outlet && (
              <span className="timeline-outlets">Source: {evt.outlet}</span>
            )}
            {!isArticleRecord && evt.outletCount > 0 && (
              <span className="timeline-outlets">
                {evt.outletCount} outlet{evt.outletCount === 1 ? '' : 's'} reporting
              </span>
            )}
            {showArticle && (
              <div className="timeline-xlinks">
                <button type="button" className="timeline-xlink" onClick={() => onOpenArticle(evt.article_id)}>
                  Open in News Feed →
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            className="timeline-toggle"
            aria-expanded={!isCollapsed}
            aria-label={isCollapsed ? `Expand ${evt.label}` : `Collapse ${evt.label}`}
            onClick={() => onToggle(key)}
          >
            {isCollapsed ? '+' : '−'}
          </button>
        </div>
        {!isCollapsed && (
          <>
            {(evt.summary ?? evt.description) && <p>{evt.summary ?? evt.description}</p>}
            {inbound.length > 0 && (
              <div className="timeline-links">
                {inbound.map((e) => (
                  <span key={e.id} className="timeline-link inbound">
                    ← {e.sourceLabel} <em>({edgePlainLabel(e)})</em>
                    <b className={`timeline-badge ${e.type}`}>{e.type}</b>
                    <i style={{ borderTopWidth: EDGE_WEIGHTS[e.weight] ?? 3 }} />
                  </span>
                ))}
              </div>
            )}
            {outbound.length > 0 && (
              <div className="timeline-links">
                {outbound.map((e) => (
                  <span key={e.id} className="timeline-link outbound">
                    → {e.targetLabel} <em>({edgePlainLabel(e)})</em>
                    <b className={`timeline-badge ${e.type}`}>{e.type}</b>
                    <i style={{ borderTopWidth: EDGE_WEIGHTS[e.weight] ?? 3 }} />
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </li>
  )
}

// Package 1 arc-grouped addition (owner-directed 2026-08-18): arcId restricts
// the view to ONE arc's section — used for arc-scope Timeline landings so the
// return-to-origin jump renders the richer grouped cards (with per-event
// outlet counts) instead of the flat list. Additive: arcId null is the
// original global behavior, untouched.
export default function GroupedTimelineView({ onOpenArc, onOpenArticle, focusEventKey, arcId = null }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [linkFilter, setLinkFilter] = useState('any')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [category, setCategory] = useState('')
  const [sectionPage, setSectionPage] = useState(0)
  const [unclassifiedPage, setUnclassifiedPage] = useState(0)
  const [showFilteredUnclassified, setShowFilteredUnclassified] = useState(false)
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [pendingFocus, setPendingFocus] = useState(null)
  const itemRefs = useRef(new Map())
  const focusGuard = useRef(false)
  const loadStart = useRef(performance.now())

  useEffect(() => {
    loadArcGroupedTimeline()
      .then((d) => {
        // Real numbers, not placeholders (04-ADD evidence requirement).
        const loadMs = Math.round(performance.now() - loadStart.current)
        console.info(`[grouped-timeline] data load: ${loadMs}ms, timeline records: ${d.grouped.counts.total}, sections: ${d.grouped.counts.sectionCount}`)
        setData(d)
      })
      .catch((err) => setError(err.message))
  }, [])

  useEffect(() => {
    if (focusGuard.current) {
      focusGuard.current = false
      return
    }
    setSectionPage(0)
    setUnclassifiedPage(0)
  }, [query, linkFilter, dateFrom, dateTo, category])

  // linksByKey for the link-type filters + card edge rendering.
  const linksByKey = useMemo(() => {
    if (!data) return new Map()
    const labelById = new Map((data.labels ?? []).map((n) => [n.id ?? n.slug, n.label]))
    const map = new Map()
    for (const e of data.relationEdges ?? []) {
      const out = map.get(e.source) ?? { outbound: [], inbound: [] }
      out.outbound.push({ ...e, targetLabel: labelById.get(e.target) ?? e.target })
      map.set(e.source, out)
      const inn = map.get(e.target) ?? { outbound: [], inbound: [] }
      inn.inbound.push({ ...e, sourceLabel: labelById.get(e.source) ?? e.source })
      map.set(e.target, inn)
    }
    return map
  }, [data])

  const filtered = useMemo(() => {
    if (!data) return null
    const base = filterGrouped(
      data.grouped,
      {
        term: query.trim().toLowerCase(),
        linkFilter,
        dateFrom: dateFrom || null,
        dateTo: dateTo || null,
        category: category || null,
      },
      linksByKey,
    )
    // Arc scope: only the landing arc's section, never the section pager or
    // Unclassified. The section header still renders (arc context + meta).
    if (arcId) {
      return {
        ...base,
        sections: base.sections.filter((s) => s.arcId === arcId),
        unclassifiedEvents: [],
        unclassifiedTotal: 0,
        unclassifiedPlaceholder: false,
      }
    }
    return base
  }, [data, query, linkFilter, dateFrom, dateTo, category, linksByKey, arcId])

  const categories = useMemo(() => {
    if (!data) return []
    const set = new Set(data.grouped.sections.map((s) => s.category).filter(Boolean))
    return [...set].sort()
  }, [data])

  // Doc 05 focus: find the event's section (or Unclassified), jump to the
  // page containing it, expand, then scroll + highlight below.
  useEffect(() => {
    if (!focusEventKey || !data || !filtered) return
    const match = (evt) => (evt.id ?? evt.slug) === focusEventKey || (evt.slug ?? '').slice(-8) === focusEventKey
    let secIdx = filtered.sections.findIndex((s) => s.events.some(match))
    focusGuard.current = true
    setQuery('')
    setLinkFilter('any')
    setDateFrom('')
    setDateTo('')
    setCategory('')
    if (secIdx >= 0) {
      setSectionPage(Math.floor(secIdx / SECTION_PAGE_SIZE))
    } else {
      const uIdx = filtered.unclassifiedEvents.findIndex(match)
      if (uIdx === -1) return
      setSectionPage(Number.MAX_SAFE_INTEGER) // clamped to last page below
      setUnclassifiedPage(Math.floor(uIdx / UNCLASSIFIED_PAGE_SIZE))
    }
    setPendingFocus(focusEventKey)
  }, [focusEventKey, data]) // eslint-disable-line react-hooks/exhaustive-deps

  // Hard-count invariant, checked on every render of grouped data: every
  // canonical event appears exactly once across sections + Unclassified.
  const countCheck = useMemo(() => {
    if (!data) return null
    return verifyExactlyOnce(data.grouped, data.grouped.counts.total)
  }, [data])

  useEffect(() => {
    if (!pendingFocus || !filtered) return
    const match = (evt) => (evt.slug ?? '').slice(-8) === pendingFocus
    const all = [
      ...filtered.sections.flatMap((s) => s.events),
      ...filtered.unclassifiedEvents,
    ]
    const evt = all.find(match)
    if (!evt) return
    const key = evt.id ?? evt.slug
    setCollapsed((prev) => {
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      return next
    })
    const el = itemRefs.current.get(key)
    if (!el) return
    focusGuard.current = false
    setPendingFocus(null)
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('timeline-focused')
    const t = setTimeout(() => el.classList.remove('timeline-focused'), 4000)
    return () => clearTimeout(t)
  }, [pendingFocus, filtered])

  if (error) return <div className="notice error">Failed to load grouped timeline: {error}</div>
  if (!data || !filtered) return <div className="notice">Loading grouped timeline…</div>
  const edgesUnavailableNotice = data.edgesUnavailable ? (
    <div className="notice">
      public.edges is unavailable ({data.edgesUnavailable}). No relationships are invented.
    </div>
  ) : null

  const { counts } = data.grouped
  const { pageSections, pageCount, safePage, isLastPage } = paginateSections(
    filtered.sections,
    sectionPage,
  )

  const uPageCount = Math.max(1, Math.ceil(filtered.unclassifiedEvents.length / UNCLASSIFIED_PAGE_SIZE))
  const uSafePage = Math.min(unclassifiedPage, uPageCount - 1)
  const uPageEvents = filtered.unclassifiedEvents.slice(
    uSafePage * UNCLASSIFIED_PAGE_SIZE,
    uSafePage * UNCLASSIFIED_PAGE_SIZE + UNCLASSIFIED_PAGE_SIZE,
  )

  const toggleCard = (key) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const setAllCollapsed = (collapse) => {
    const keys = [
      ...filtered.sections.flatMap((s) => s.events),
      ...filtered.unclassifiedEvents,
    ].map((e) => e.id ?? e.slug)
    setCollapsed(collapse ? new Set(keys) : new Set())
  }

  const renderEvents = (events) =>
    events.map((evt) => {
      const key = evt.id ?? evt.slug
      const links = linksByKey.get(key) ?? { outbound: [], inbound: [] }
      return (
        <EventCard
          key={key}
          evt={evt}
          outbound={links.outbound}
          inbound={links.inbound}
          isCollapsed={collapsed.has(key)}
          onToggle={toggleCard}
          onOpenArticle={onOpenArticle}
          registerRef={(el) => {
            if (el) itemRefs.current.set(key, el)
            else itemRefs.current.delete(key)
          }}
        />
      )
    })

  return (
    <div className="timeline-view timeline-grouped">
      {edgesUnavailableNotice}
      {!arcId && (
        <div className="timeline-intro">
          <h2>Causal Timeline — grouped by story arc</h2>
          <p>
            Events mapped causally, not just chronologically — grouped into the story arcs they
            belong to, each arc its own bounded sub-timeline.
          </p>
        </div>
      )}

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
        <div className="timeline-range-filters" role="group" aria-label="Filter by date and category">
          <label>
            From{' '}
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label>
            To{' '}
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          {!arcId && (
            <label>
              Category{' '}
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="timeline-bulk">
          <button type="button" onClick={() => setAllCollapsed(false)}>Expand all</button>
          <button type="button" onClick={() => setAllCollapsed(true)}>Collapse all</button>
        </div>
      </div>

      {arcId ? (
        <p className="timeline-count" aria-live="polite">
          {filtered.sections.reduce((n, s) => n + s.events.length, 0)} timeline record
          {filtered.sections.reduce((n, s) => n + s.events.length, 0) === 1 ? '' : 's'} in this arc
          — graph events and assigned News records are shown separately{query || linkFilter !== 'any' || dateFrom || dateTo ? ' · filters active' : ''}
        </p>
      ) : (
        <p className="timeline-count" aria-live="polite">
          {counts.total} timeline records · {counts.graphEvents} graph events · {counts.newsRecords} News records · {counts.sectionCount} arc sections + {counts.unclassified}{' '}
          unclassified ({counts.direct} direct, {counts.derivable} via article arc) — every record
          shown exactly once
          {countCheck && !countCheck.ok && (
            <strong className="timeline-count-error">
              {' '}— COUNT CHECK FAILED: rendered {countCheck.rendered} of {countCheck.expected}
            </strong>
          )}
          {filtered.shownEvents !== counts.total && ` · filters active: showing ${filtered.shownEvents}`}
          {data.suppressed > 0 &&
            ` · ${data.suppressed} duplicate article mirrors suppressed (same article, same event: the evt- node is canonical)`}
        </p>
      )}

      {arcId && filtered.sections.length === 0 && (
        <p className="notice">
          No graph-resolved events for this arc in the grouped view
          {query || linkFilter !== 'any' || dateFrom || dateTo
            ? ' match the current filters.'
            : ' — the Flat layout shows this arc\u2019s recorded chronology.'}
        </p>
      )}

      {!arcId && filtered.sections.length === 0 && filtered.unclassifiedEvents.length === 0 && (
        <p className="notice">No events match the current filters.</p>
      )}

      {pageSections.map((sec) => (
        <section key={sec.arcId} className="timeline-arc-section" aria-label={`Arc: ${sec.title}`}>
          <header className="timeline-arc-header">
            <h3>
              {onOpenArc ? (
                <button type="button" className="timeline-arc-title" onClick={() => onOpenArc(sec.arcId)}>
                  {sec.title} →
                </button>
              ) : (
                sec.title
              )}
            </h3>
            <p className="timeline-arc-meta">
              <span className="timeline-badge-text">Start: {sec.startedAt ?? 'unknown'}</span>
              <span className="timeline-badge-text">
                {sec.status === 'active' ? 'Ongoing' : `End: ${sec.endAt ?? 'unknown'}`}
              </span>
              {sec.statusLabel && sec.status !== 'active' && (
                <span className="timeline-badge-text">Status: {sec.statusLabel}</span>
              )}
              <span className="timeline-badge-text">Category: {sec.category ?? 'uncategorized'}</span>
              <span className="timeline-badge-text">
                {sec.events.length} timeline record{sec.events.length === 1 ? '' : 's'}
              </span>
            </p>
          </header>
          <ol className="timeline">{renderEvents(sec.events)}</ol>
        </section>
      ))}

      {!arcId && isLastPage && (filtered.unclassifiedTotal > 0 || filtered.unclassifiedEvents.length > 0) && (
        <section className="timeline-arc-section timeline-unclassified" aria-label="Unclassified events">
          <header className="timeline-arc-header">
            <h3>Unclassified</h3>
            <p className="timeline-arc-meta">
              <span className="timeline-badge-text">UNCLASSIFIED</span>
              <span className="timeline-badge-text">
                {filtered.unclassifiedEvents.length} of {filtered.unclassifiedTotal} events
              </span>
              {filtered.unclassifiedPlaceholder && (
                <>
                  <span className="timeline-badge-text">no category — not matched by this filter</span>
                  <button
                    type="button"
                    className="timeline-xlink"
                    onClick={() => setShowFilteredUnclassified((v) => !v)}
                  >
                    {showFilteredUnclassified ? 'Hide' : 'Show anyway'}
                  </button>
                </>
              )}
            </p>
            <p className="timeline-unclassified-note">
              These events do not resolve to any story arc. Missing classification is not
              irrelevance; they are shown in full, unassigned.
            </p>
          </header>
          {(!filtered.unclassifiedPlaceholder || showFilteredUnclassified) && (
            <>
              <ol className="timeline">{renderEvents(uPageEvents)}</ol>
              {uPageCount > 1 && (
                <nav className="timeline-pager" aria-label="Unclassified pages">
                  <button type="button" disabled={uSafePage === 0} onClick={() => setUnclassifiedPage(uSafePage - 1)}>
                    ← Previous
                  </button>
                  <span>
                    Unclassified page {uSafePage + 1} of {uPageCount}
                  </span>
                  <button
                    type="button"
                    disabled={uSafePage >= uPageCount - 1}
                    onClick={() => setUnclassifiedPage(uSafePage + 1)}
                  >
                    Next →
                  </button>
                </nav>
              )}
            </>
          )}
        </section>
      )}

      {!arcId && pageCount > 1 && (
        <nav className="timeline-pager" aria-label="Arc section pages">
          <button type="button" disabled={safePage === 0} onClick={() => setSectionPage(safePage - 1)}>
            ← Previous
          </button>
          <span>
            Section page {safePage + 1} of {pageCount}
            {isLastPage ? ' (includes Unclassified)' : ''}
          </span>
          <button
            type="button"
            disabled={safePage >= pageCount - 1}
            onClick={() => setSectionPage(safePage + 1)}
          >
            Next →
          </button>
        </nav>
      )}
    </div>
  )
}
