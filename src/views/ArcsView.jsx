import { useEffect, useMemo, useRef, useState } from 'react'
import { loadArcs, loadArcDetail, loadArcArticles, loadArticleExcerpt } from '../lib/supabase'
import { filterArcs } from '../lib/listFilters'
import { normalizeArcEvent, TIMELINE_CLOSING_FOOTNOTE } from '../lib/timelineScreenModel'
import ArcEvidencePanel, { ArcOverviewStatus } from '../components/ArcEvidencePanel'
import ArcTimeline from '../components/ArcTimeline'
import EvidenceTabs from '../components/EvidenceTabs'
import EpistemicBanner from '../components/EpistemicBanner'
import EvidenceStateBar from '../components/EvidenceStateBar'
import LifecycleStrip from '../components/LifecycleStrip'
import RemainingUncertaintyBlock from '../components/RemainingUncertaintyBlock'
import TrustFooter from '../components/TrustFooter'
import TypeIcon from '../components/TypeIcon'
import TypePill from '../components/TypePill'
import {
  deriveEvidenceStates,
  missingScopeCopy,
  lastMilestoneCheck,
  pendingUncertainty,
} from '../lib/policyArcModel'
import { investigationContextDomProps } from '../lib/investigationContext'
import WorkspaceAvailability from '../components/WorkspaceAvailability'
import WorkspaceTechnicalDisclosure from '../components/WorkspaceTechnicalDisclosure'

// Story Arcs (concept doc §2.5): persistent longitudinal tracking through a
// story's full consequence arc. Track B Step 3 item 2 rebuilt the detail
// panel to the addendum's Screen 4 (Policy Arc) structure: eyebrow, report
// title, status line, standing explanation, tabs (Overview / Timeline /
// Evidence — item 5 shipped the Timeline tab on the shared ArcTimeline
// renderer + the item-3 connector engine), Explore-connections
// CTA, lifecycle strip, key developments, chronology banner, evidence-state
// bar, remaining uncertainty, sources line, trust footer. The pre-existing
// elements (milestone checklist, coverage-gap bar, arc-age bar, attached
// articles) are folded into the Evidence tab, not retired (owner delegation
// 2026-08-18); item 4 extracted them into the shared ArcEvidencePanel so
// Screen 5's Evidence tab reuses the same component. Sidebar, search, and
// cross-view entry are unchanged.

// A4: status dots are wired to status derived from real signals
// (arc_events recency + milestone state — see deriveArcStatus in
// src/lib/supabase.js). Three states, three distinct colors. When no real
// status can be derived, no dot is shown.
const STATUS_META = {
  active: { color: 'var(--cat-green)', label: 'Active' },
  dormant: { color: 'var(--cat-amber)', label: 'Dormant' },
  resolved: { color: 'var(--cat-blue)', label: 'Resolved' },
}

// A2: fifth category. Unclassified renders in neutral grey.
const CATEGORY_META = {
  institutional_accountability: { label: 'Institutional Accountability' },
  geopolitical_consequence: { label: 'Geopolitical Consequence' },
  economic_policy: { label: 'Economic Policy' },
  legislative_regulatory: { label: 'Legislative / Regulatory' },
  unclassified: { label: 'Unclassified', color: 'var(--cat-grey)' }, // neutral grey
}

function categoryLabel(category) {
  return CATEGORY_META[category]?.label ?? category
}

function categoryStyle(category) {
  const color = CATEGORY_META[category]?.color
  return color ? { color } : undefined
}

function isResearchCollection(arc) {
  return arc?.display_kind === 'research_collection'
}

function displayKindLabel(arc) {
  return isResearchCollection(arc) ? 'Research collection' : 'Story arc'
}

function lifecycleStage(category) {
  const stages = {
    legislative: 'Legislation / rule',
    accountability: 'Review / enforcement',
    economic: 'Policy effect',
    geopolitical: 'External context',
  }
  return stages[category] ?? 'Recorded development'
}

function evidenceStateLabel(confidence) {
  const labels = {
    confirmed: 'Documented record',
    corroborated: 'Documented across records',
    inferred: 'Inferred record',
  }
  return labels[confidence] ?? 'Evidence state not recorded'
}

export default function ArcsView({ focusArcId, onOpenArticle, onOpenNode, investigationContext }) {
  const [arcs, setArcs] = useState(null)
  const [arcsUnavailable, setArcsUnavailable] = useState(null)
  const [error, setError] = useState(null)
  const [selectedSlug, setSelectedSlug] = useState(null)
  const [detail, setDetail] = useState(null)
  const [detailError, setDetailError] = useState(null)
  const [arcArticles, setArcArticles] = useState([])
  // Screen 4 tabs in the addendum's order: Overview / Timeline / Evidence.
  const [activeTab, setActiveTab] = useState('overview')
  // Mobile (<1024px): the list is full-width and selecting an arc pushes a
  // full-screen detail view. Desktop keeps the split-pane and ignores this.
  const [pushed, setPushed] = useState(false)
  // Sidebar search (2026-08-10): same pattern as the News Feed search bar —
  // 350ms debounce, trimmed query, client-side substring filter over the
  // already-loaded arc rows (title + category). No data refetch.
  const [arcQuery, setArcQuery] = useState('')
  const [debouncedArcQuery, setDebouncedArcQuery] = useState('')
  const arcDebounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(arcDebounceRef.current)
    arcDebounceRef.current = setTimeout(() => setDebouncedArcQuery(arcQuery.trim()), 350)
    return () => clearTimeout(arcDebounceRef.current)
  }, [arcQuery])

  useEffect(() => {
    loadArcs()
      .then((result) => {
        const rows = result.arcs ?? []
        setArcs(rows)
        setArcsUnavailable(result.arcsUnavailable ?? null)
        if (rows.length > 0) {
          setSelectedSlug(rows[0].slug)
          // On narrow screens the list and detail are intentionally separate
          // views. Open the chosen arc's reference-style Overview first; the
          // persistent back control retains access to the complete arc list.
          // Desktop ignores this class and retains its split-pane layout.
          setPushed(true)
        }
      })
      .catch((err) => setError(err.message))
  }, [])

  // Cross-view entry: a news article's arc badge asked us to open this arc.
  useEffect(() => {
    if (!focusArcId || !arcs) return
    const match = arcs.find((a) => a.id === focusArcId || a.slug === focusArcId)
    if (match) {
      setSelectedSlug(match.slug)
      setPushed(true)
    }
  }, [focusArcId, arcs])

  // Investigation Context restore after a tab switch. Event subjects do not
  // invent an arc; only an explicit arc id selects one.
  useEffect(() => {
    if (focusArcId || !arcs || investigationContext?.canonical_subject_type !== 'arc') return
    const id = investigationContext.canonical_subject_id
    if (!id) return
    const match = arcs.find((a) => a.id === id || a.slug === id)
    if (match) {
      setSelectedSlug(match.slug)
      setPushed(true)
    }
  }, [focusArcId, arcs, investigationContext?.canonical_subject_type, investigationContext?.canonical_subject_id])

  const selected = useMemo(
    () => arcs?.find((a) => a.slug === selectedSlug) ?? null,
    [arcs, selectedSlug],
  )

  // Selecting a different arc returns to the Overview tab.
  useEffect(() => {
    setActiveTab('overview')
  }, [selectedSlug])

  // Filter affects only which rows the sidebar renders — selection and the
  // detail panel keep working against the full arc list, so a selected arc
  // is never unmounted by narrowing the search.
  const visibleArcs = useMemo(
    () => (arcs ? filterArcs(arcs, debouncedArcQuery, categoryLabel) : []),
    [arcs, debouncedArcQuery],
  )

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    setDetail(null)
    setDetailError(null)
    const key = selected.id ?? selected.slug
    loadArcDetail(key)
      .then((d) => {
        if (!cancelled) setDetail(d)
      })
      .catch((err) => {
        if (!cancelled) setDetailError(err.message)
      })
    loadArcArticles(selected.id)
      .then((rows) => {
        if (!cancelled) setArcArticles(rows)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [selected])

  // Screen 4 Timeline tab entries: the SAME arc_events detail the Overview
  // tab lists, normalized through the item-4 seam so this tab can never
  // drift from Screen 5's arc scope. Declared with the other hooks — the
  // early returns below must never change the hook order.
  const timelineEntries = useMemo(
    () => (detail ? detail.events.map(normalizeArcEvent).filter(Boolean) : []),
    [detail],
  )

  if (error) {
    return (
      <div {...investigationContextDomProps(investigationContext)}>
        <WorkspaceAvailability
          kind="arcs"
          details={`Failed to load story arcs: ${error}`}
        />
      </div>
    )
  }
  if (!arcs) {
    return (
      <div className="notice" {...investigationContextDomProps(investigationContext)}>
        Loading story arcs…
      </div>
    )
  }
  if (arcsUnavailable) {
    return (
      <div className="notice" {...investigationContextDomProps(investigationContext)}>
        <WorkspaceAvailability
          kind="arcs"
          details={`Story arcs are unavailable (${arcsUnavailable}). Id-only stub rows are treated as no-arc; no titles are invented.`}
        />
      </div>
    )
  }
  if (arcs.length === 0) {
    return (
      <div className="notice" {...investigationContextDomProps(investigationContext)}>
        <WorkspaceAvailability
          kind="arcs"
          details="No story arcs tracked yet."
        />
      </div>
    )
  }

  // Derived status is the real signal; fall back to the stored column only
  // for data shapes that predate derivation (demo data without it).
  const statusKey = selected
    ? selected.derived_status !== undefined
      ? selected.derived_status
      : selected.status
    : null
  const statusMeta = statusKey ? STATUS_META[statusKey] : null

  // Screen 4 derivations (pure seam: src/lib/policyArcModel.js). All are
  // null-safe; null means the corresponding block is omitted, never
  // fabricated.
  const counts = detail ? deriveEvidenceStates(detail.events, detail.milestones) : null
  const missingScope = counts
    ? missingScopeCopy({
        pendingCount: counts.missing,
        startedAt: selected?.started_at,
        lastCheck: lastMilestoneCheck(detail.milestones),
      })
    : null
  const uncertainty = detail ? pendingUncertainty(detail.milestones) : null
  const selectedIsCollection = isResearchCollection(selected)
  const recordLabel = selectedIsCollection ? 'Collection record' : 'Policy lifecycle record'
  const developmentsLabel = selectedIsCollection ? 'Included records' : 'Key developments'

  return (
    <div className={`arcs-view${pushed ? ' detail-open' : ''}`} {...investigationContextDomProps(investigationContext)}>
      <aside className="arcs-list">
        <h2>Tracked objects</h2>
        <p className="arcs-sub">
          Longitudinal story arcs and bounded research collections. Object type states whether the
          record follows one development through consequences or organizes separate source-mapped records.
        </p>
        <input
          className="news-search"
          type="search"
          placeholder="Search arcs by title or category…"
          value={arcQuery}
          onChange={(e) => setArcQuery(e.target.value)}
          aria-label="Search story arcs"
        />
        {visibleArcs.length === 0 && (
          <p className="arcs-sub">No arcs match “{debouncedArcQuery}”.</p>
        )}
        {visibleArcs.map((arc) => {
          // Derived status is the real signal; fall back to the stored
          // column only for data shapes that predate derivation (demo data
          // without it). No derivable status => no dot.
          const statusKey = arc.derived_status !== undefined ? arc.derived_status : arc.status
          const meta = statusKey ? STATUS_META[statusKey] : null
          return (
            <button
              key={arc.slug}
              className={`arc-list-item${arc.slug === selectedSlug ? ' selected' : ''}`}
              onClick={() => {
                setSelectedSlug(arc.slug)
                setPushed(true)
              }}
            >
              {meta && <span className="arc-status-dot" style={{ background: meta.color }} />}
              <span className="arc-list-title">{arc.title}</span>
              <span className="arc-list-object-kind">{displayKindLabel(arc)}</span>
              <span className="arc-list-meta" style={categoryStyle(arc.category)}>
                {categoryLabel(arc.category)}
              </span>
            </button>
          )
        })}
      </aside>

      {selected && (
        <section className="arc-panel">
          <header className="arc-panel-header">
            <button className="arc-back-btn" onClick={() => setPushed(false)}>
              ← All story arcs
            </button>
            <p className="ep-eyebrow">{displayKindLabel(selected)}</p>
            <h2 className="ep-report-title">{selected.title}</h2>
            {statusMeta && (
              <div className="ep-statusline">
                <span className="ep-statusline-dot" style={{ background: statusMeta.color }} />
                <span className="ep-statusline-label" style={{ color: statusMeta.color }}>
                  {statusMeta.label}
                </span>
                {selected.last_update_at && (
                  <span>· updated {String(selected.last_update_at).slice(0, 10)}</span>
                )}
              </div>
            )}
            <span className="arc-category" style={categoryStyle(selected.category)}>
              {categoryLabel(selected.category)}
            </span>
            {selected.category === 'unclassified' && selected.category_evidence == null && (
              <span className="arc-list-meta">
                Classifier declined — below confidence floor.
              </span>
            )}
            <p className="arc-summary">
              {selectedIsCollection
                ? 'This research collection organizes bounded, source-mapped records across separate topics. It does not establish a common outcome, causal connection, editorial lineage, or completeness.'
                : 'A story arc follows one policy or event through its full consequence — not its coverage arc. This view shows what changed, what followed, and what is still unreported.'}
            </p>
            {selected.summary && <p className="arc-summary">{selected.summary}</p>}

            {selected.root_node_id && onOpenNode && (
              <button className="ep-cta" onClick={() => onOpenNode(selected.root_node_id)}>
                <svg viewBox="0 0 14 14" width="13" height="13" aria-hidden="true" focusable="false">
                  <circle cx="3" cy="11" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
                  <circle cx="11" cy="3" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
                  <circle cx="11" cy="11" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M4.4 9.6 9.6 4.4M4.7 11h4.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                Explore connections
              </button>
            )}

            <EvidenceTabs
              label="Arc sections"
              activeId={activeTab}
              onSelect={setActiveTab}
              tabs={[
                { id: 'overview', label: 'Overview', panelId: 'arc-overview-panel' },
                { id: 'timeline', label: 'Timeline', panelId: 'arc-timeline-panel' },
                { id: 'evidence', label: 'Evidence', panelId: 'arc-evidence-panel' },
              ]}
            />
          </header>

          {detailError && (
            <WorkspaceTechnicalDisclosure banner="Arc detail is unavailable. The selected investigation is preserved.">
              Failed to load arc detail: {detailError}
            </WorkspaceTechnicalDisclosure>
          )}
          {!detail && !detailError && <div className="notice">Loading arc detail…</div>}

          {activeTab === 'overview' && detail && (
            <section id="arc-overview-panel" role="tabpanel" aria-labelledby="overview-tab">
              <ArcOverviewStatus arc={selected} detail={detail} arcArticles={arcArticles} />

              <section className="ap-section">
                <span className="ep-section-label">{selectedIsCollection ? 'Collection scope' : 'Policy lifecycle'}</span>
                <LifecycleStrip />
              </section>

              <section className="ap-section">
                <span className="ep-section-label">{recordLabel}</span>
                {detail.events.length === 0 ? (
                  <p className="arc-empty">{selectedIsCollection ? 'No source-mapped records are available yet.' : 'No consequence events recorded yet.'}</p>
                ) : (
                  <div className="arc-lifecycle-table-wrap">
                    <table className="arc-lifecycle-table">
                      <caption>{selectedIsCollection ? 'Orientation table of separately source-mapped records; attached articles remain in the Evidence tab.' : 'Orientation table of recorded lifecycle developments; attached articles remain in the Evidence tab.'}</caption>
                      <thead>
                        <tr>
                          <th scope="col">{selectedIsCollection ? 'Record category' : 'Lifecycle stage'}</th>
                          <th scope="col">Recorded date</th>
                          <th scope="col">Development</th>
                          <th scope="col">Evidence state</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.events.map((event) => (
                          <tr key={`lifecycle-${event.id}`}>
                            <td><span className="arc-lifecycle-stage"><TypeIcon type={event.category} />{lifecycleStage(event.category)}</span></td>
                            <td>{event.occurred_at ?? 'Undated'}</td>
                            <td>{event.title}</td>
                            <td><span className={`arc-lifecycle-evidence arc-lifecycle-evidence-${event.confidence ?? 'unknown'}`}>{evidenceStateLabel(event.confidence)}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="ap-section">
                <span className="ep-section-label">{developmentsLabel}</span>
                {detail.events.length === 0 ? (
                  <p className="arc-empty">{selectedIsCollection ? 'No source-mapped records are available yet.' : 'No consequence events recorded yet.'}</p>
                ) : (
                  <ol className="ep-keydevs">
                    {detail.events.map((e, i) => (
                      <li key={e.id} className="ep-keydev arc-development-card">
                        <TypeIcon type={e.category} />
                        <div className="ep-keydev-body">
                          <div className="ep-keydev-toprow">
                            <span className="ep-keydev-date">{e.occurred_at ?? 'undated'}</span>
                            <TypePill type={e.category} />
                            {i === 0 && !selectedIsCollection && (
                              <span className="arc-event-trigger">Triggering event</span>
                            )}
                          </div>
                          <span className="ep-keydev-title">{e.title}</span>
                          {e.description && (
                            <p className="ep-keydev-desc" title={e.description}>
                              {e.description}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              <EpistemicBanner>
                Chronology shows sequence. Causal links appear only when supported by evidence.
              </EpistemicBanner>

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

            </section>
          )}

          {activeTab === 'timeline' && detail && (
            <section id="arc-timeline-panel" role="tabpanel" aria-labelledby="timeline-tab">
            {/* The shared ArcTimeline renderer (item 4) over the same
               arc_events — edges=[] by construction (arc_events are not
               graph nodes), so every connector between every adjacent
               pair honestly renders "Sequence only", identical to Screen
               5's arc scope. Connectors are never dropped for density. */}
            <ArcTimeline
              entries={timelineEntries}
              edges={[]}
              loadArticle={loadArticleExcerpt}
              emptyText="No consequence events recorded yet for this arc."
            />
            </section>
          )}

          {activeTab === 'evidence' && detail && (
            <section id="arc-evidence-panel" role="tabpanel" aria-labelledby="evidence-tab">
            {/* Evidence is intentionally source-only: Arc age, coverage proxy,
               and milestone status are longitudinal context in Overview. */}
            <ArcEvidencePanel arcArticles={arcArticles} onOpenArticle={onOpenArticle} />
            </section>
          )}

          {/* Trust footer (addendum: bottom of every screen). reviewedAt is
              null — story_arcs.last_update_at is a machine update timestamp,
              not a human review date, and a review date is never fabricated;
              the Reviewed line appears when a real one exists. The left slot
              carries the item-3 closing footnote (imported via the
              timelineScreenModel seam, never re-typed) only while the
              Timeline tab is active — it speaks to the timeline, not to the
              Overview/Evidence tabs. */}
          <TrustFooter
            left={
              activeTab === 'timeline' ? (
                <span className="ep-tl-footnote">{TIMELINE_CLOSING_FOOTNOTE}</span>
              ) : null
            }
            reviewedAt={null}
          />
        </section>
      )}
    </div>
  )
}
