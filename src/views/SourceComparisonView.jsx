import { useEffect, useMemo, useRef, useState } from 'react'
import { loadSourceComparisonView, E_LEVEL_NAMES } from '../lib/sourceComparisonReadPath.js'
import { filterEventsByTitle } from '../lib/listFilters.js'
import './sourcecomparison.css'

// Source Comparison (03_BACKLOG Item 1) — beta view behind
// pipeline_config.source_comparison_beta (route-gated again in App.jsx).
// Read-only against the Item 1 tables and the Phase 2 explanations store.
//
// Rendered rules:
//   - no composite score anywhere — eight dimensions stay separate;
//   - omission ("not present in this outlet's extracted coverage") and
//     coverage_unknown ("nothing extracted to compare") are different cards,
//     different copy, different styling;
//   - thin-extraction claims are labeled as title/summary-grain;
//   - syndicated copies render as "single original source, syndicated N
//     times", never as N independent sources;
//   - thin/empty outlet columns are shown, not hidden;
//   - every surface claim opens its Phase 2 explanation object.

function StrengthChip({ level }) {
  return <span className={`sc-chip sc-chip-${level.toLowerCase()}`}>{E_LEVEL_NAMES[level]}</span>
}

function formatReviewedAt(value, statuses = []) {
  if (value) {
    const date = new Date(value)
    if (!Number.isNaN(date.valueOf())) return date.toLocaleDateString()
  }
  const values = [...new Set((statuses ?? []).filter(Boolean))]
  if (values.length === 1) return values[0].replace(/_/g, ' ')
  if (values.length > 1) return 'mixed states'
  return 'not recorded'
}

function outletReviewPresentation(states) {
  const values = [...new Set((states ?? []).filter(Boolean))]
  if (values.length === 0 || values.every((state) => state === 'explanation_pending')) {
    return { label: 'Explanation pending', tone: 'pending' }
  }
  if (values.length > 1) return { label: 'Mixed review states', tone: 'mixed' }
  if (values[0] === 'ok') return { label: 'Explanation recorded', tone: 'recorded' }
  if (values[0] === 'under_review') return { label: 'Under review', tone: 'pending' }
  if (values[0] === 'insufficient_evidence') return { label: 'Evidence gap', tone: 'gap' }
  if (values[0] === 'source_unavailable') return { label: 'Source unavailable', tone: 'gap' }
  return { label: values[0].replace(/_/g, ' '), tone: 'mixed' }
}

function OutletCoverageCard({ coverage }) {
  const framing = coverage.framing.slice(0, 2)
  const review = outletReviewPresentation(coverage.explanationStates)
  const includedLabel = `${coverage.includedClaimCount} extracted claim${coverage.includedClaimCount === 1 ? '' : 's'}`
  return (
    <article className="sc-outlet-card">
      <header className="sc-outlet-card-head">
        <div className="sc-outlet-identity">
          <p className="sc-outlet-card-label">Ingested outlet sample</p>
          <h4>{coverage.outlet}</h4>
          <span className="sc-outlet-card-article-count">
            {coverage.articleCount} ingested article{coverage.articleCount === 1 ? '' : 's'} · review {formatReviewedAt(coverage.latestReviewedAt, coverage.reviewStatuses)}
          </span>
        </div>
        <span className={`sc-outlet-review-state sc-outlet-review-${review.tone}`}>{review.label}</span>
      </header>
      <section className="sc-outlet-framing" aria-label={`${coverage.outlet} framing`}>
        <p>Captured framing</p>
        {framing.length === 0 ? (
          <span>No claim surface is currently extracted for this outlet sample.</span>
        ) : framing.map((row) => (
          <blockquote key={`${row.claimId}-${row.surfaceText}`}>{row.surfaceText}</blockquote>
        ))}
        {coverage.framing.length > framing.length && <span>Additional extracted framing is available in the claim detail below.</span>}
      </section>
      <div className="sc-outlet-facts" aria-label={`${coverage.outlet} sample facts`}>
        <span className="sc-outlet-fact-token">Framing: {framing.length > 0 ? 'source text extracted' : 'not extracted'}</span>
        <span className="sc-outlet-fact-token">Included: {includedLabel}</span>
      </div>
    </article>
  )
}

function ExplanationDetails({ explanation }) {
  if (!explanation) {
    return <p className="sc-meta">No explanation object found for this grouping — treated as unverified.</p>
  }
  return (
    <div className="sc-explanation">
      <p className="sc-ev-passage">{explanation.supporting_passage}</p>
      <p className="sc-meta">Rule: {explanation.rule_version}</p>
      <p className="sc-meta">Provenance: {explanation.provenance_class} · Review: {explanation.review_status} · State: {explanation.state}</p>
      {explanation.remaining_uncertainty && (
        <p className="sc-meta">Remaining uncertainty: {explanation.remaining_uncertainty}</p>
      )}
    </div>
  )
}

// Doc 05 pair 4: each surface row links straight to its article in the News
// Feed. Renders only when articleId is present and the callback exists.
function SurfaceRow({ surface, onOpenArticle }) {
  return (
    <li className="sc-surface">
      <header className="sc-surface-head">
        <span className="sc-outlet">{surface.outlet}</span>
        {surface.publishedAt && (
          <span className="sc-meta">{new Date(surface.publishedAt).toLocaleString()}</span>
        )}
        {surface.url && (
          <a className="sc-src" href={surface.url} target="_blank" rel="noreferrer">Article ↗</a>
        )}
        {surface.articleId && onOpenArticle && (
          <button
            type="button"
            className="sc-src sc-xlink"
            onClick={() => onOpenArticle(surface.articleId)}
          >
            Open in News →
          </button>
        )}
      </header>
      <p className="sc-surface-text">{surface.surfaceText}</p>
      {surface.loadedLanguage.length > 0 && (
        <p className="sc-loaded">
          Loaded language:{' '}
          {surface.loadedLanguage.map((h, i) => (
            <span key={i} className="sc-chip sc-chip-loaded" title={h.category}>
              {h.term} <span className="sc-loaded-cat">({h.category.replace(/_/g, ' ')})</span>
            </span>
          ))}
        </p>
      )}
      <details className="sc-details">
        <summary>Provenance / explanation</summary>
        <ExplanationDetails explanation={surface.explanation} />
      </details>
    </li>
  )
}

function ClaimCard({ claim, onOpenArticle }) {
  return (
    <article className={`sc-claim${claim.thinExtraction ? ' sc-claim-thin' : ''}`}>
      <header className="sc-claim-head">
        <span className={`sc-chip ${claim.classification === 'shared' ? 'sc-chip-shared' : 'sc-chip-unique'}`}>
          {claim.classification === 'shared' ? 'Shared fact' : 'Unique claim'}
        </span>
        <StrengthChip level={claim.evidenceStrength} />
        {claim.thinExtraction && (
          <span className="sc-chip sc-chip-thin">Thin extraction — title/summary only</span>
        )}
      </header>
      <p className="sc-claim-text">{claim.canonicalText}</p>

      <p className="sc-meta">
        Reported by: {claim.independentOutlets.join(', ') || 'none'}
        {' '}
        <span className="sc-lineage-note">
          {claim.independentOutlets.length <= 1
            ? '(one outlet in this event)'
            : '(multiple outlets; lineage not verified)'}
        </span>
        {claim.syndicatedExtra > 0 && (
          <span className="sc-syndicated">
            {' '}· single original source, syndicated {claim.syndicatedExtra + 1} times
          </span>
        )}
      </p>

      {claim.omittedBy.length > 0 && (
        <p className="sc-omission">
          Not present in extracted coverage: {claim.omittedBy.join(', ')} — a statement about
          ingested, extracted coverage only, not about the outlet's total real-world coverage.
        </p>
      )}
      {claim.coverageUnknown.length > 0 && (
        <p className="sc-unknown">
          Coverage unknown (nothing extracted to compare): {claim.coverageUnknown.join(', ')} —
          distinct from omission; extraction has not run or produced no claims for these articles.
        </p>
      )}

      {claim.evidenceLinks.length > 0 && (
        <p className="sc-meta">
          Primary evidence:{' '}
          {claim.evidenceLinks.map((l) => (
            <a key={l.id} className="sc-src" href={l.evidence_url} target="_blank" rel="noreferrer">
              {l.evidence_type.replace(/_/g, ' ')} ↗
            </a>
          ))}
        </p>
      )}
      {claim.corrections.length > 0 && (
        <p className="sc-correction">
          Correction on record: {claim.corrections.map((c) => c.correction_text || 'correction detected').join('; ')}
        </p>
      )}

      <ul className="sc-surface-list">
        {claim.surfaces.map((s) => <SurfaceRow key={s.id} surface={s} onOpenArticle={onOpenArticle} />)}
      </ul>
    </article>
  )
}

// Doc 05 pair 6: event.arcLinks comes from the live read-time join
// (event_articles → articles.arc_id → timeline nodes). Empty array = no arc
// resolved = no chips (honest degradation; ~12/347 events resolve today).
function EventCard({ event, onOpenArticle, onOpenArc, onOpenTimeline, focused, sectionRef }) {
  return (
    <section className={`sc-event${focused ? ' sc-focused' : ''}`} ref={sectionRef}>
      <header className="sc-event-head">
        <div>
          <p className="sc-event-eyebrow">Coverage comparison</p>
          <h3>{event.title}</h3>
        </div>
        <div className="sc-event-state">
          <span className="sc-chip sc-chip-shared">{event.outlets.length} {event.outlets.length === 1 ? 'outlet' : 'outlets'} ingested</span>
          <span className="sc-meta">
            {event.occurredAtStart}
            {event.occurredAtEnd && event.occurredAtEnd !== event.occurredAtStart ? ` → ${event.occurredAtEnd}` : ''}
          </span>
        </div>
      </header>

      <div className="sc-event-evidence-bar">
        <span><strong>{event.evidenceTotals?.claims ?? 0}</strong> claim{event.evidenceTotals?.claims === 1 ? '' : 's'} extracted</span>
        <span><strong>{event.evidenceTotals?.primaryLinks ?? 0}</strong> primary evidence link{event.evidenceTotals?.primaryLinks === 1 ? '' : 's'}</span>
        <span>Latest review: <strong>{formatReviewedAt(event.reviewedAt, event.reviewStatuses)}</strong></span>
      </div>
      <p className="sc-lineage-status">Lineage status: canonical-URL duplicates are collapsed; wire, ownership, and editorial lineage are not yet verified.</p>

      {(event.arcLinks?.length ?? 0) > 0 && (onOpenArc || onOpenTimeline) && (
        <p className="sc-meta sc-xlinks">
          {event.arcLinks.map((l) => (
            <span key={l.arcId} className="sc-xlink-group">
              {onOpenArc && (
                <button
                  type="button"
                  className="sc-src sc-xlink"
                  title="Open this story arc"
                  onClick={() => onOpenArc(l.arcId)}
                >
                  Arc{l.title ? `: ${l.title}` : ''} →
                </button>
              )}
              {l.timelineKey && onOpenTimeline && (
                <button
                  type="button"
                  className="sc-src sc-xlink"
                  title="Open this arc's events in the Causal Timeline"
                  onClick={() => onOpenTimeline({ eventKey: l.timelineKey, arcId: l.arcId })}
                >
                  Causal Timeline →
                </button>
              )}
            </span>
          ))}
        </p>
      )}

      {event.singleSource && (
        <p className="sc-single-source">
          One outlet is currently ingested for this event. Its captured record is shown below; comparison and source independence are not established.
        </p>
      )}
      <div className="sc-outlet-grid" aria-label="Per-outlet coverage records">
        {(event.outletCoverage ?? []).map((coverage) => <OutletCoverageCard key={coverage.outlet} coverage={coverage} />)}
      </div>
      {!event.singleSource && (
        <p className="sc-meta">
          Publication timing: first reported by {event.firstOutlet ?? 'unknown'}
          {event.timing.filter((t) => t.outlet !== event.firstOutlet).map((t) => (
            <span key={t.outlet} className="sc-timing">
              {' '}· {t.outlet} {t.lagHours === null ? '(time unknown)' : t.lagHours === 0 ? '(same hour)' : `(+${t.lagHours}h)`}
            </span>
          ))}
        </p>
      )}

      {event.claims.length === 0 ? (
        <p className="sc-empty">No claims extracted for this event yet.</p>
      ) : (
        event.claims.map((claim) => <ClaimCard key={claim.id} claim={claim} onOpenArticle={onOpenArticle} />)
      )}
    </section>
  )
}

// Doc 05 pairs 4–6: onOpenArticle / onOpenArc / onOpenTimeline are optional;
// focusEventId scrolls + highlights a specific comparison event (pair 5's
// destination).
export default function SourceComparisonView({ onOpenArticle, onOpenArc, onOpenTimeline, focusEventId, investigationContext }) {
  const [view, setView] = useState(null)
  const [error, setError] = useState(null)
  const eventRefs = useRef(new Map())
  // Event title search (2026-08-10): same pattern as the News Feed search
  // bar — 350ms debounce, trimmed query, client-side substring filter over
  // the loaded event list. No refetch; no other card logic touched.
  const [eventQuery, setEventQuery] = useState('')
  const [debouncedEventQuery, setDebouncedEventQuery] = useState('')
  const eventDebounceRef = useRef(null)

  useEffect(() => {
    clearTimeout(eventDebounceRef.current)
    eventDebounceRef.current = setTimeout(() => setDebouncedEventQuery(eventQuery.trim()), 350)
    return () => clearTimeout(eventDebounceRef.current)
  }, [eventQuery])

  useEffect(() => {
    let cancelled = false
    loadSourceComparisonView()
      .then((v) => { if (!cancelled) setView(v) })
      .catch((e) => { if (!cancelled) setError(e) })
    return () => { cancelled = true }
  }, [])

  const visibleEvents = useMemo(
    () => (view?.events ? filterEventsByTitle(view.events, debouncedEventQuery) : []),
    [view, debouncedEventQuery],
  )

  // Jump focus, or Investigation Context restore after a tab switch.
  // Event subjects highlight only when a loaded row already matches.
  // No match → no invented event. Arc / article subjects do not become events.
  const highlightEventId =
    focusEventId ??
    (investigationContext?.canonical_subject_type === 'event'
      ? investigationContext.canonical_subject_id
      : null)

  useEffect(() => {
    if (!highlightEventId || !view?.events?.length) return
    const el = eventRefs.current.get(highlightEventId)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    el.classList.add('sc-focused')
    const t = setTimeout(() => el.classList.remove('sc-focused'), 4000)
    return () => clearTimeout(t)
  }, [highlightEventId, view])

  if (error) return <div className="notice error">Source comparison view failed to load.</div>
  if (view === null) return <div className="notice">Loading…</div>
  if (!view.enabled) {
    return (
      <div className="notice">
        Source Comparison is currently unavailable.
      </div>
    )
  }

  return (
    <div className="sc-view">
      <section className="sc-banner">
        <p className="sc-kicker">Evidence review</p>
        <h2>Source Comparison</h2>
        <p className="sc-subtitle">How outlets cover the same event.</p>
        <p className="sc-banner-detail">
          Compare source-linked coverage claim by claim. Shared facts, unique claims, omissions,
          loaded language, primary evidence, corrections, timing, and source quality stay separate;
          no composite score is computed.
        </p>
      </section>
      <aside className="sc-evidence-notice">
        Missing evidence is recorded, not treated as contradiction. Coverage labels describe only
        material ingested into this comparison.
      </aside>

      {view.loadError && (
        <div className="notice error">Comparison tables unreachable: {view.loadError}</div>
      )}

      {view.events.length === 0 ? (
        <p className="sc-empty">
          No validated comparison events are currently available. Candidate event clusters are withheld
          until article membership has passed same-event review; no outlet, timing, claim, or omission
          metric is shown before that gate is satisfied.
        </p>
      ) : (
        <>
          <input
            className="news-search sc-search"
            type="search"
            placeholder="Search comparison events by title…"
            value={eventQuery}
            onChange={(e) => setEventQuery(e.target.value)}
            aria-label="Search comparison events"
          />
          {visibleEvents.length === 0 ? (
            <p className="sc-empty">
              No events match “{debouncedEventQuery}”. Clear the search to see all{' '}
              {view.events.length} comparison events.
            </p>
          ) : (
            visibleEvents.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            onOpenArticle={onOpenArticle}
            onOpenArc={onOpenArc}
            onOpenTimeline={onOpenTimeline}
            focused={event.id === highlightEventId}
            sectionRef={(el) => {
              if (el) eventRefs.current.set(event.id, el)
              else eventRefs.current.delete(event.id)
            }}
          />
            ))
          )}
        </>
      )}
    </div>
  )
}
