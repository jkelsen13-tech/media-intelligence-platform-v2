import { useEffect, useMemo, useRef, useState } from 'react'
import {
  loadArticles,
  loadOutletDirectory,
  loadArticleDetail,
  loadArticleGraphLinks,
  loadSkyVerification,
  loadArticleTimelineKey,
  loadArticleComparisonEvents,
  loadCorpusMeta,
  loadNewSinceCount,
  loadArticleCitationMap,
  loadEventGrouping,
  loadOutletRegions,
  loadFilteredSourceMetricRows,
} from '../lib/supabase'
import {
  PROVENANCE_LABELS,
  groupArticlesByEvent,
  provenanceBasis,
  readThenAdvanceLastVisit,
} from '../lib/newsFeedModel'
import EpistemicBanner from '../components/EpistemicBanner'
import SourceAttributionLine from '../components/SourceAttributionLine'
import SkyBadge from '../panels/SkyBadge'
import { buildSourceMetrics, enrichOutletsWithMetrics, sortOutletsBySourceMetric } from '../lib/sourceMetrics.js'

// News Feed (Track B Step 4, addendum Screen 1): title block with the
// browser-local last-visit count, epistemic banner, wired outlet/status
// chips alongside the spec's visibly-INERT Region/Evidence/Topic pills
// (owner ruling #2 — no pill may imply filtering it does not do), event
// grouping ("N outlets reporting" instead of duplicate cards), and a
// per-article provenance footer driven by the real citations.cited_type
// discriminator (owner ruling #6). Status badges are omitted from card
// faces (owner ruling #9).

const PAGE_SIZE = 30

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'arc', label: 'Attached to arc' },
  { key: 'unattributed', label: 'Unattributed' },
  { key: 'monoculture', label: 'Monoculture flagged' },
]

// Reference-style filters. Every option maps to currently available metadata.
// Topic options are documented title/summary term matches, not an assertion of
// a complete article taxonomy. Source metrics remain distinct literal fields;
// no popularity, reliability, or composite vendor score is calculated.
const PRIMARY_RECORD_FEEDS = [
  'doj-primary-records',
  'p2025-primary-records',
  'curated-public-records',
  'epstein-process-only',
]

const EVIDENCE_FILTERS = [
  { key: 'all', label: 'All evidence bases' },
  { key: 'primary', label: 'Primary records linked' },
  { key: 'arc', label: 'Linked to story arc' },
]

const TOPIC_FILTERS = [
  { key: 'all', label: 'All topics', terms: [] },
  { key: 'courts', label: 'Courts & law', terms: ['court', 'justice', 'legal', 'ruling'] },
  { key: 'immigration', label: 'Immigration', terms: ['immigration', 'migrant', 'detention', 'asylum'] },
  { key: 'climate', label: 'Climate & energy', terms: ['climate', 'environment', 'epa', 'energy'] },
  { key: 'economy', label: 'Economy & trade', terms: ['tariff', 'economic', 'tax', 'trade', 'finance'] },
  { key: 'health', label: 'Public health', terms: ['health', 'vaccine', 'medical'] },
  { key: 'foreign', label: 'Foreign policy', terms: ['foreign policy', 'china', 'international', 'diplomatic', 'war', 'conflict'] },
  { key: 'infrastructure', label: 'Infrastructure', terms: ['infrastructure', 'bridge', 'rail', 'transit', 'power grid'] },
  { key: 'food', label: 'Food & agriculture', terms: ['agriculture', 'farm', 'food', 'crop'] },
  { key: 'sports', label: 'Sports', terms: ['sport', 'league', 'athlete', 'football', 'baseball', 'basketball'] },
  { key: 'fashion', label: 'Fashion & culture', terms: ['fashion', 'runway', 'designer', 'style'] },
]

const DATE_FILTERS = [
  { key: 'all', label: 'All dates' },
  { key: '24h', label: 'Last 24 hours' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'custom', label: 'Custom range' },
]

function fmtDate(iso) {
  if (!iso) return 'undated'
  const d = new Date(iso)
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function strengthBadge(strength, citedType, citedEntity) {
  // A direct source-mapped Graph attachment is a routing/provenance link, not
  // a composite evidence or reliability score. Its required database value is
  // therefore rendered as a descriptive label rather than a percentage.
  if (String(citedEntity ?? '').startsWith('Source-mapped event:')) {
    return <span className="news-cit-strength">source-mapped</span>
  }
  if (strength == null) return null
  const pct = Math.round(strength * 100)
  const color =
    strength >= 0.75
      ? 'var(--green-bright)'
      : strength >= 0.5
        ? 'var(--flag-yellow)'
        : 'var(--cat-grey)'
  return (
    <span className="news-cit-strength num" style={{ color }}>
      {pct}% doc
    </span>
  )
}

function PublisherSourceRecord({ article, region }) {
  if (!article) return null
  const outlet = article.outlet ?? 'Publisher record'
  return (
    <section className="news-source-record" aria-label="Publisher source record">
      <span className="ap-label">Publisher source record</span>
      <SourceAttributionLine outlet={outlet} region={region ?? null} badge={null} />
      <p className="news-source-record-copy">
        {article.url
          ? 'An original publisher URL is recorded for this article.'
          : 'No original publisher URL is stored for this article.'}
      </p>
      <p className="news-source-record-copy">
        {article.author_name
          ? `Byline recorded: ${article.author_name}.`
          : 'No author byline is stored. This is a metadata gap, not an absence of publisher attribution.'}
      </p>
      {article.url && (
        <a className="news-source-record-link" href={article.url} target="_blank" rel="noreferrer">
          Open publisher record at {outlet} →
        </a>
      )}
    </section>
  )
}

// Doc 05 pairs 3 & 5: onOpenTimeline / onOpenComparison are optional — when a
// destination is unavailable the corresponding chip simply never renders.
export default function NewsView({ onOpenArc, onOpenNode, focusArticleId, onOpenTimeline, onOpenComparison }) {
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [outlet, setOutlet] = useState(null)
  const [status, setStatus] = useState('all')
  const [region, setRegion] = useState('all')
  const [evidenceBasis, setEvidenceBasis] = useState('all')
  const [topic, setTopic] = useState('all')
  const [dateRange, setDateRange] = useState('all')
  const [customDateStart, setCustomDateStart] = useState('')
  const [customDateEnd, setCustomDateEnd] = useState('')
  const [sourceOrder, setSourceOrder] = useState('corpus')
  const [outlets, setOutlets] = useState([])
  const [sourceMetricRows, setSourceMetricRows] = useState([])
  const [articles, setArticles] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(null) // article id
  const [detail, setDetail] = useState(null)
  const [graphLinks, setGraphLinks] = useState([])
  const [detailError, setDetailError] = useState(null)
  // Location corroboration for the expanded article (null = none / table absent).
  const [sky, setSky] = useState(null)
  // Doc 05: cross-window keys for the expanded article. null = join found no
  // target → chip does not render (honest degradation).
  const [timelineKey, setTimelineKey] = useState(null)
  const [comparisonEvents, setComparisonEvents] = useState([])
  // Mobile: filters collapse into a bottom sheet behind a single button.
  const [filtersOpen, setFiltersOpen] = useState(false)
  // Step 4 display-model inputs (read-path joins; each degrades to an empty
  // Map/null on failure so a join outage never blanks the feed).
  const [citationMap, setCitationMap] = useState(() => new Map())
  const [eventMap, setEventMap] = useState(() => new Map())
  const [outletRegions, setOutletRegions] = useState(() => new Map())
  const [corpusMeta, setCorpusMeta] = useState(null)
  // Owner ruling #1: browser-local last-visit marker; null on first visit or
  // private-mode storage failure → the count line then does not render.
  const [newSinceCount, setNewSinceCount] = useState(null)
  const debounceRef = useRef(null)
  // Tier 5: request-sequence guard. Every query captures a monotonically
  // increasing token; a response whose token is no longer current is dropped
  // entirely (results, total, error, loading). Rapid typing or a filter
  // change can therefore never be overwritten by a slower earlier request,
  // and a pending search never presents a stale count as current.
  const requestRef = useRef(0)
  const loadingMoreRef = useRef(false)

  useEffect(() => {
    loadOutletDirectory().then(setOutlets).catch(() => {})
  }, [])

  // Step 4 mount loads: corpus meta, the last-visit count, and the three
  // feed-wide join maps. Each is independent and failure-isolated.
  useEffect(() => {
    loadCorpusMeta().then(setCorpusMeta).catch(() => {})
    loadArticleCitationMap().then(setCitationMap).catch(() => {})
    loadEventGrouping().then(setEventMap).catch(() => {})
    loadOutletRegions().then(setOutletRegions).catch(() => {})
    const prev = readThenAdvanceLastVisit(window.localStorage, Date.now())
    if (prev != null) {
      loadNewSinceCount(new Date(prev).toISOString())
        .then(setNewSinceCount)
        .catch(() => {})
    }
  }, [])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQ(q.trim()), 350)
    return () => clearTimeout(debounceRef.current)
  }, [q])

  const selectedRegionOutlets = useMemo(() => {
    if (region === 'all') return undefined
    return outlets.filter((item) => item.country === region).map((item) => item.name)
  }, [outlets, region])

  const selectedTopicTerms = useMemo(
    () => TOPIC_FILTERS.find((item) => item.key === topic)?.terms ?? [],
    [topic],
  )

  const publicationBounds = useMemo(() => {
    if (dateRange === 'custom') {
      return {
        after: customDateStart ? new Date(`${customDateStart}T00:00:00`).toISOString() : undefined,
        before: customDateEnd ? new Date(`${customDateEnd}T23:59:59.999`).toISOString() : undefined,
      }
    }
    const hours = dateRange === '24h' ? 24 : dateRange === '7d' ? 24 * 7 : dateRange === '30d' ? 24 * 30 : 0
    return { after: hours ? new Date(Date.now() - hours * 60 * 60 * 1000).toISOString() : undefined, before: undefined }
  }, [dateRange, customDateStart, customDateEnd])

  const sourceMetricContext = useMemo(() => ({
    q: debouncedQ,
    outlets: selectedRegionOutlets,
    status: evidenceBasis === 'arc' ? 'arc' : status,
    feeds: evidenceBasis === 'primary' ? PRIMARY_RECORD_FEEDS : undefined,
    topicTerms: selectedTopicTerms,
    publishedAfter: publicationBounds.after,
    publishedBefore: publicationBounds.before,
  }), [debouncedQ, evidenceBasis, publicationBounds.after, publicationBounds.before, selectedRegionOutlets, selectedTopicTerms, status])

  useEffect(() => {
    let cancelled = false
    loadFilteredSourceMetricRows(sourceMetricContext)
      .then((rows) => { if (!cancelled) setSourceMetricRows(rows) })
      .catch(() => { if (!cancelled) setSourceMetricRows([]) })
    return () => { cancelled = true }
  }, [sourceMetricContext])

  const sourceMetrics = useMemo(() => buildSourceMetrics(sourceMetricRows, eventMap), [sourceMetricRows, eventMap])
  const orderedOutlets = useMemo(() => {
    const rows = enrichOutletsWithMetrics(outlets, sourceMetrics).filter((item) => item.volume > 0)
    return sortOutletsBySourceMetric(rows, sourceOrder)
  }, [outlets, sourceMetrics, sourceOrder])

  const availableRegions = useMemo(
    () => [...new Set(outlets.map((item) => item.country).filter(Boolean))].sort(),
    [outlets],
  )

  useEffect(() => {
    const seq = ++requestRef.current
    setLoading(true)
    setError(null)
    loadArticles({
      q: debouncedQ,
      outlet,
      outlets: selectedRegionOutlets,
      status: evidenceBasis === 'arc' ? 'arc' : status,
      feeds: evidenceBasis === 'primary' ? PRIMARY_RECORD_FEEDS : undefined,
      topicTerms: selectedTopicTerms,
      publishedAfter: publicationBounds.after,
      publishedBefore: publicationBounds.before,
      limit: PAGE_SIZE,
      offset: 0,
    })
      .then(({ articles, total }) => {
        if (seq !== requestRef.current) return // stale response — drop
        setArticles(articles)
        setTotal(total)
      })
      .catch((err) => {
        if (seq !== requestRef.current) return
        setError(err.message)
      })
      .finally(() => {
        if (seq !== requestRef.current) return
        setLoading(false)
      })
  }, [debouncedQ, outlet, status, evidenceBasis, selectedRegionOutlets, selectedTopicTerms, publicationBounds])

  const expandArticle = (id) => {
    setExpanded(id)
    setDetail(null)
    setGraphLinks([])
    setDetailError(null)
    setSky(null)
    setTimelineKey(null)
    setComparisonEvents([])
    loadArticleDetail(id)
      .then(setDetail)
      .catch((err) => setDetailError(err.message))
    loadArticleGraphLinks(id)
      .then(setGraphLinks)
      .catch(() => {})
    loadSkyVerification(id)
      .then(setSky)
      .catch(() => {})
    // Doc 05 pair 3: art- slug suffix ↔ article id prefix join, resolved at
    // read time. No matching timeline event node → no chip.
    if (onOpenTimeline) {
      loadArticleTimelineKey(id)
        .then(setTimelineKey)
        .catch(() => {})
    }
    // Doc 05 pair 5: event_articles + current article_claims FKs.
    if (onOpenComparison) {
      loadArticleComparisonEvents(id)
        .then(setComparisonEvents)
        .catch(() => {})
    }
  }

  // Cross-view entry: another view asked us to open a specific article.
  useEffect(() => {
    if (!focusArticleId) return
    setQ('')
    setOutlet(null)
    setStatus('all')
    setRegion('all')
    setEvidenceBasis('all')
    setTopic('all')
    setDateRange('all')
    setCustomDateStart('')
    setCustomDateEnd('')
    expandArticle(focusArticleId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusArticleId])

  const loadMore = () => {
    // Tier 5: captured under the CURRENT token — if the user starts a new
    // search while this page request is in flight, its (old-filter) response
    // is dropped instead of being appended to the new result list. The
    // in-flight ref also blocks double-clicks from appending the same page
    // twice.
    if (loadingMoreRef.current) return
    loadingMoreRef.current = true
    const seq = requestRef.current
    loadArticles({
      q: debouncedQ,
      outlet,
      outlets: selectedRegionOutlets,
      status: evidenceBasis === 'arc' ? 'arc' : status,
      feeds: evidenceBasis === 'primary' ? PRIMARY_RECORD_FEEDS : undefined,
      topicTerms: selectedTopicTerms,
      publishedAfter: publicationBounds.after,
      publishedBefore: publicationBounds.before,
      limit: PAGE_SIZE,
      offset: articles.length,
    })
      .then(({ articles: more }) => {
        if (seq !== requestRef.current) return
        setArticles((prev) => [...prev, ...more])
      })
      .catch((err) => {
        if (seq !== requestRef.current) return
        setError(err.message)
      })
      .finally(() => {
        loadingMoreRef.current = false
      })
  }

  const toggleExpand = (id) => {
    if (expanded === id) {
      setExpanded(null)
      setDetail(null)
      setSky(null)
      setTimelineKey(null)
      setComparisonEvents([])
      return
    }
    expandArticle(id)
  }

  const claims = useMemo(() => {
    if (!detail?.claims) return { substantive: [], framing: [] }
    const list = Array.isArray(detail.claims) ? detail.claims : []
    return {
      substantive: list.filter((c) => c.kind === 'substantive'),
      framing: list.filter((c) => c.kind === 'framing'),
    }
  }, [detail])

  // Step 4 event grouping: multi-article events collapse into one group
  // card; singles and eventless articles stay flat, feed order preserved.
  const feedEntries = useMemo(
    () => groupArticlesByEvent(articles, eventMap),
    [articles, eventMap],
  )

  // If a focused article isn't in the current page, still render its detail.
  const focusedMissing =
    expanded && !articles.some((a) => a.id === expanded) ? expanded : null

  // Doc 05 pairs 3 & 5: cross-window chips. Each renders only when its join
  // resolved — never a broken link, never a fabricated destination.
  // Package 1 item 2: the Causal Timeline jump carries the article's
  // ORIGINATING arc so the timeline lands on that arc (return-to-origin),
  // not the global corpus. Arc unknown (focused-miss detail) → arcId null
  // → the contract's declared global fallback applies.
  const expandedArcId = articles.find((a) => a.id === expanded)?.arc_id ?? null
  const crossWindowChips = (timelineKey || comparisonEvents.length > 0) && (
    <div className="news-graph-links">
      <span className="ap-label">Other views</span>
      <div className="news-filter-row">
        {timelineKey && onOpenTimeline && (
          <button
            className="news-chip graph-link"
            title="Open this article's event in the Causal Timeline"
            onClick={() => onOpenTimeline({ eventKey: timelineKey, arcId: expandedArcId })}
          >
            ◈ Causal Timeline →
          </button>
        )}
        {onOpenComparison &&
          comparisonEvents.map((ev) => (
            <button
              key={ev.eventId}
              className="news-chip graph-link"
              title={`Compare outlet coverage of “${ev.title}”`}
              onClick={() => onOpenComparison(ev.eventId)}
            >
              ◈ Compare coverage: {ev.title} →
            </button>
          ))}
      </div>
    </div>
  )

  // Every card discloses the publisher record when a URL exists. Structured
  // citation classes remain additive and never substitute for a source URL.
  const provenanceLine = (a) => {
    const basis = provenanceBasis(a, citationMap.get(a.id)?.citedTypes)
    const label = basis
      ? PROVENANCE_LABELS[basis]
      : a.url
        ? 'Publisher source URL recorded'
        : 'Publisher source URL not recorded'
    return <div className="news-prov">{label}</div>
  }

  // Per-card cross-navigation is a true button group, rendered only where the
  // underlying live destination is present. The card body is a separate button
  // so controls never become invalid nested interactive elements.
  const cardChips = (a) => {
    const cit = citationMap.get(a.id)
    const hasArc = Boolean(a.arc_id)
    const hasGraph = Boolean(cit?.hasGraphLink && cit.firstNodeId)
    if (!hasArc && !hasGraph) return null
    return (
      <div className="news-card-chips" aria-label="Open linked views">
        {hasArc && (
          <button
            type="button"
            className="news-action-button"
            title={`Open story arc “${a.arc_title ?? ''}”`}
            onClick={() => onOpenArc?.(a.arc_id)}
          >
            ◈ Open arc
          </button>
        )}
        {hasGraph && (
          <button
            type="button"
            className="news-action-button secondary"
            title="Open the cited node in the knowledge graph"
            onClick={() => onOpenNode?.(cit.firstNodeId)}
          >
            ⌘ Open graph
          </button>
        )}
      </div>
    )
  }

  const articleCard = (a, { inGroup = false } = {}) => (
    <article className={`news-card${inGroup ? ' in-group' : ''}`}>
      <button
        type="button"
        className="news-card-trigger"
        onClick={() => toggleExpand(a.id)}
        aria-expanded={expanded === a.id}
      >
        <div className="news-card-top">
          <span className="news-date accent">{fmtDate(a.published_at)}</span>
        </div>
        <h3>{a.title}</h3>
        <SourceAttributionLine
          outlet={a.outlet}
          region={outletRegions.get(a.outlet) ?? null}
          badge={null}
        />
        {a.summary && <p className="news-summary">{a.summary}</p>}
      </button>
      {cardChips(a)}
      {provenanceLine(a)}
    </article>
  )

  const expandedDetail = (
    <div className="news-detail">
      {detailError && <div className="notice error">{detailError}</div>}
      {!detail && !detailError && <div className="news-detail-loading">Loading detail…</div>}
      {detail && (
        <>
          {graphLinks.length > 0 && (
            <div className="news-graph-links">
              <span className="ap-label">Knowledge graph connections</span>
              <div className="news-filter-row">
                {graphLinks.map((g, i) => (
                  <button
                    key={i}
                    className="news-chip graph-link"
                    title={`Open “${g.label}” in the knowledge graph`}
                    onClick={() => onOpenNode?.(g.nodeId)}
                  >
                    ◈ {g.label}
                    {g.type ? ` · ${g.type}` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}
          {crossWindowChips}
          <PublisherSourceRecord article={detail} region={outletRegions.get(detail.outlet) ?? null} />
          {/* Location corroboration (formerly Sky verification; 02A
              Amendment B): renders only when a corroboration exists. */}
          <SkyBadge verification={sky} />
          {!sky && detail.image_url && (
            <p className="sky-companion-hint">
              Location corroboration available in the MIP companion app
            </p>
          )}
          <div className="news-detail-grid">
            <div>
              <span className="ap-label">Substantive claims</span>
              {claims.substantive.length === 0 && (
                <span className="ap-muted">No structured substantive claims have been extracted yet. This is an extraction gap, not a statement that the publisher record contains no claims.</span>
              )}
              <ul className="news-claims">
                {claims.substantive.map((c, i) => (
                  <li key={i}>
                    <span>{c.text}</span>
                    {c.provenance === 'reviewed_claim_record' && (
                      <span className={`news-claim-auditability ${c.auditability_state === 'verified_retained_source' ? 'verified' : 'unverified'}`}>
                        {c.auditability_state === 'verified_retained_source'
                          ? `Verified against retained ${String(c.evidence_source_field ?? 'publisher')} text${c.evidence_excerpt ? '.' : '; excerpt not recorded.'}`
                          : `Unverified against retained source — ${c.auditability_note ?? 'no exact retained publisher excerpt is stored.'}`}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <span className="ap-label">Framing markers</span>
              {claims.framing.length === 0 && <span className="ap-muted">No structured framing markers have been extracted yet. This is not a neutrality or bias finding.</span>}
              <ul className="news-claims framing">
                {claims.framing.map((c, i) => (
                  <li key={i}>
                    <span>{c.text}</span>
                    {c.provenance === 'reviewed_claim_record' && (
                      <span className={`news-claim-auditability ${c.auditability_state === 'verified_retained_source' ? 'verified' : 'unverified'}`}>
                        {c.auditability_state === 'verified_retained_source'
                          ? `Verified against retained ${String(c.evidence_source_field ?? 'publisher')} text${c.evidence_excerpt ? '.' : '; excerpt not recorded.'}`
                          : `Unverified against retained source — ${c.auditability_note ?? 'no exact retained publisher excerpt is stored.'}`}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {/* Status badges live on the EXPANDED detail only (owner ruling
              #9 — card faces carry no status badge). Source row is the list
              record, whose shape is pinned by loadArticles. */}
          {(() => {
            const src = articles.find((x) => x.id === expanded)
            if (!src) return null
            return (
              <div className="news-badges">
                {src.author_name && <span className="news-badge">by {src.author_name}</span>}
                {src.unattributed && <span className="news-badge muted">byline not recorded</span>}
                {src.monoculture && <span className="news-badge mono">monoculture</span>}
                {sky && <span className="news-badge sky">◈ location-corroborated</span>}
              </div>
            )
          })()}
          <span className="ap-label">Supporting citation records</span>
          {detail.citations.length === 0 && (
            <span className="ap-muted">No additional structured citation records have been extracted. The publisher source record above is not a claim-level citation.</span>
          )}
          <ul className="news-citations">
            {detail.citations.map((c, i) => (
              <li key={i}>
                <span className="news-cit-entity">{String(c.cited_entity ?? '').replace(/^Source-mapped event: /, '')}</span>
                <span className="news-cit-type">{String(c.cited_entity ?? '').startsWith('Source-mapped event:') ? 'source mapping' : c.cited_type}</span>
                {strengthBadge(c.documentation_strength, c.cited_type, c.cited_entity)}
              </li>
            ))}
          </ul>
          <span className="ap-label">Linked evidence records</span>
          {(detail.evidenceRecords ?? []).length === 0 ? (
            <span className="ap-muted">No linked evidence record is stored for the reviewed claims attached to this article.</span>
          ) : (
            <ul className="news-citations">
              {detail.evidenceRecords.map((record, i) => (
                <li key={`${record.evidence_type}-${record.evidence_url}-${i}`}>
                  <span className="news-cit-type">{String(record.evidence_type ?? 'evidence record').replace(/_/g, ' ')}</span>
                  <a className="news-source-record-link" href={record.evidence_url} target="_blank" rel="noreferrer">
                    Open linked evidence record →
                  </a>
                </li>
              ))}
            </ul>
          )}
          {detail.url && (
            <a className="news-read-link" href={detail.url} target="_blank" rel="noreferrer">
              Read original at {detail.outlet ?? 'source'} →
            </a>
          )}
        </>
      )}
    </div>
  )

  const outletRow = (
    <div className="news-filter-row">
      <button
        className={`news-chip${outlet === null ? ' active' : ''}`}
        onClick={() => setOutlet(null)}
      >
        All outlets
      </button>
      {orderedOutlets.map((item) => (
        <button
          key={item.name}
          className={`news-chip${outlet === item.name ? ' active' : ''}`}
          onClick={() => setOutlet(item.name)}
          title={`Volume: ${item.volume} article${item.volume === 1 ? '' : 's'} in the current filter · Earliest timestamp in recorded multi-outlet events: ${item.firstToReportCount}${item.country ? ` · publisher country: ${item.country}` : ''}${item.parentOwnership ? ` · ownership: ${item.parentOwnership}` : ''}`}
        >
          <span className="news-source-name">{item.name}</span>
          <span className="news-source-metric num" aria-label={`Volume ${item.volume}`}>V {item.volume}</span>
          <span className="news-source-metric num" aria-label={`First to report ${item.firstToReportCount}`}>F {item.firstToReportCount}</span>
          <span className="news-source-metric unavailable" aria-label="Independent corroboration unavailable without verified lineage">C —</span>
        </button>
      ))}
    </div>
  )
  const statusRow = (
    <div className="news-filter-row">
      {STATUS_FILTERS.map((f) => (
        <button
          key={f.key}
          className={`news-chip${status === f.key ? ' active' : ''}`}
          onClick={() => setStatus(f.key)}
        >
          {f.label}
        </button>
      ))}
    </div>
  )

  const referenceFilters = (suffix = '') => (
    <div className={`news-reference-filter-row${suffix}`} aria-label="Article filters">
      <label className="news-filter-select">
        <span>◷ Date</span>
        <select value={dateRange} onChange={(event) => setDateRange(event.target.value)}>
          {DATE_FILTERS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select>
      </label>
      {dateRange === 'custom' && (
        <div className="news-custom-date-range" aria-label="Custom publication date range">
          <label>From <input type="date" value={customDateStart} onChange={(event) => setCustomDateStart(event.target.value)} /></label>
          <label>To <input type="date" value={customDateEnd} onChange={(event) => setCustomDateEnd(event.target.value)} /></label>
        </div>
      )}
      <label className="news-filter-select">
        <span>◎ Region</span>
        <select value={region} onChange={(event) => setRegion(event.target.value)}>
          <option value="all">All regions</option>
          {availableRegions.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
      <label className="news-filter-select">
        <span>◈ Evidence</span>
        <select value={evidenceBasis} onChange={(event) => setEvidenceBasis(event.target.value)}>
          {EVIDENCE_FILTERS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select>
      </label>
      <label className="news-filter-select">
        <span>◇ Topic</span>
        <select value={topic} onChange={(event) => setTopic(event.target.value)}>
          {TOPIC_FILTERS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select>
      </label>
    </div>
  )

  return (
    <div className="news-view">
      {/* Addendum Screen 1 title block. Owner ruling #1: the count is
          browser-local and says so; first visit / private mode → no line. */}
      <div className="news-title-block">
        <h2 className="news-title">
          News <span className="news-title-dot" aria-hidden="true" />
        </h2>
        {newSinceCount != null && (
          <p className="news-title-sub">
            New since your last visit on this device ·{' '}
            <span className="num">{newSinceCount}</span>
          </p>
        )}
      </div>

      <EpistemicBanner>
        Missing evidence is recorded, not treated as contradiction.
      </EpistemicBanner>
      <p className="news-intake-note">
        Reader feed includes records marked eligible for display. Pending-review and withheld intake records remain retained for review and do not change outlet, source-order, or corpus-count fields.
      </p>

      <div className="news-controls">
        <div className="news-result-row">
          <span className="news-count">
            {loading ? (
              'loading…'
            ) : (
              <>
                <span className="num">{total}</span> article{total === 1 ? '' : 's'}
              </>
            )}
          </span>
          <button className="news-filters-btn" onClick={() => setFiltersOpen(true)}>
            Filters
          </button>
        </div>
        {(outlet !== null || status !== 'all' || region !== 'all' || evidenceBasis !== 'all' || topic !== 'all' || dateRange !== 'all') && (
          <div className="news-filter-row news-active-filters">
            {outlet !== null && <button className="news-chip active" title="Clear outlet filter" onClick={() => setOutlet(null)}>{outlet} ×</button>}
            {status !== 'all' && <button className="news-chip active" title="Clear status filter" onClick={() => setStatus('all')}>{STATUS_FILTERS.find((f) => f.key === status)?.label} ×</button>}
            {region !== 'all' && <button className="news-chip active" title="Clear region filter" onClick={() => setRegion('all')}>{region} ×</button>}
            {evidenceBasis !== 'all' && <button className="news-chip active" title="Clear evidence filter" onClick={() => setEvidenceBasis('all')}>{EVIDENCE_FILTERS.find((item) => item.key === evidenceBasis)?.label} ×</button>}
            {topic !== 'all' && <button className="news-chip active" title="Clear topic filter" onClick={() => setTopic('all')}>{TOPIC_FILTERS.find((item) => item.key === topic)?.label} ×</button>}
            {dateRange !== 'all' && <button className="news-chip active" title="Clear date filter" onClick={() => { setDateRange('all'); setCustomDateStart(''); setCustomDateEnd('') }}>{DATE_FILTERS.find((item) => item.key === dateRange)?.label} ×</button>}
          </div>
        )}
        <input
          className="news-search"
          type="search"
          placeholder="Search headlines, summaries, article text…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {referenceFilters()}
        <div className="news-source-order-row">
          <p className="news-source-metric-key"><strong>Source fields:</strong> <span>V = volume in current filter</span><span>F = first-to-report count in recorded multi-outlet events</span><span>C = corroboration, unavailable without verified lineage</span></p>
          <label className="news-source-order">
            <span>Source order</span>
            <select value={sourceOrder} onChange={(event) => setSourceOrder(event.target.value)}>
              <option value="corpus">Volume (current filter)</option>
              <option value="first">First-to-report (recorded events)</option>
              <option value="corroboration" disabled>Corroboration unavailable</option>
              <option value="name">Source name A–Z</option>
            </select>
          </label>
          <p>Sorted by: {sourceOrder === 'first' ? 'first-to-report — a unique earliest publisher timestamp within a recorded multi-outlet event in this corpus' : sourceOrder === 'name' ? 'source name A–Z' : 'volume — a literal article count in the current filter'}. Corroboration is unavailable until verified source-lineage records exist; multiple outlets do not establish independence. No composite vendor score or reliability ranking is calculated.</p>
        </div>
        <div className="news-desktop-filters">
          {outletRow}
          {statusRow}
        </div>
      </div>

      {filtersOpen && (
        <div className="sheet-backdrop" onClick={() => setFiltersOpen(false)}>
          <div
            className="sheet filter-sheet"
            role="dialog"
            aria-label="Article filters"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-head">
              <h2>Filters</h2>
              <button
                className="sheet-close"
                aria-label="Close filters"
                onClick={() => setFiltersOpen(false)}
              >
                ×
              </button>
            </div>
            {referenceFilters(' sheet-reference-filters')}
            <span className="ap-label">Source order</span>
            <label className="news-source-order sheet-source-order">
              <span>Order source list by</span>
              <select value={sourceOrder} onChange={(event) => setSourceOrder(event.target.value)}>
                <option value="corpus">Volume (current filter)</option>
                <option value="first">First-to-report (recorded events)</option>
                <option value="corroboration" disabled>Corroboration unavailable</option>
                <option value="name">Source name A–Z</option>
              </select>
            </label>
            <span className="ap-label">Outlet</span>
            {outletRow}
            <span className="ap-label">Status</span>
            {statusRow}
            <button className="sheet-done" onClick={() => setFiltersOpen(false)}>
              Done
            </button>
          </div>
        </div>
      )}

      {error && <div className="notice error">Failed to load articles: {error}</div>}
      {!loading && !error && articles.length === 0 && !focusedMissing && (
        <div className="notice">No articles match. The ingestion pipeline runs every 24h.</div>
      )}

      <ol className="news-list">
        {feedEntries.map((entry) =>
          entry.kind === 'group' ? (
            <li key={`ev-${entry.eventId}`} className="news-item">
              <div className="news-group-card">
                <div className="news-group-head">
                  <span className="news-date accent">{fmtDate(entry.latest)}</span>
                  <span className="news-group-outlets num">
                    {entry.outlets.length} outlet{entry.outlets.length === 1 ? '' : 's'} reporting
                  </span>
                </div>
                <h3 className="news-group-title">
                  {entry.title ?? entry.articles[0]?.title ?? 'Untitled event'}
                </h3>
                <div className="news-group-members">
                  {entry.articles.map((a) => (
                    <div key={a.id} className="news-group-member">
                      {articleCard(a, { inGroup: true })}
                      {expanded === a.id && expandedDetail}
                    </div>
                  ))}
                </div>
              </div>
            </li>
          ) : (
            <li key={entry.article.id} className="news-item">
              {articleCard(entry.article)}
              {expanded === entry.article.id && expandedDetail}
            </li>
          ),
        )}
      </ol>

      {focusedMissing && (
        <div className="news-detail">
          {detailError && <div className="notice error">{detailError}</div>}
          {!detail && !detailError && <div className="news-detail-loading">Loading detail…</div>}
          {detail && (
            <>
              <h3 className="news-focus-title">{detail.title}</h3>
              {crossWindowChips}
              <SkyBadge verification={sky} />
              {graphLinks.length > 0 && (
                <div className="news-graph-links">
                  <span className="ap-label">Knowledge graph connections</span>
                  <div className="news-filter-row">
                    {graphLinks.map((g, i) => (
                      <button
                        key={i}
                        className="news-chip graph-link"
                        onClick={() => onOpenNode?.(g.nodeId)}
                      >
                        ◈ {g.label}
                        {g.type ? ` · ${g.type}` : ''}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {detail.url && (
                <a className="news-read-link" href={detail.url} target="_blank" rel="noreferrer">
                  Read original at {detail.outlet ?? 'source'} →
                </a>
              )}
            </>
          )}
        </div>
      )}

      {articles.length < total && !loading && (
        <button className="news-load-more" onClick={loadMore}>
          Load more (<span className="num">{total - articles.length}</span> remaining)
        </button>
      )}

      {/* Screen footer: corpus scale from the live count token; freshness is
          carried by the app-header line (App.jsx) so it is never duplicated
          with a stale copy here. */}
      {corpusMeta?.count != null && (
        <p className="news-corpus-foot ap-muted">
          Live corpus — <span className="num">{corpusMeta.count}</span> articles
        </p>
      )}
    </div>
  )
}
