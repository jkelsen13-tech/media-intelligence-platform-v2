// Story Arc presentation seam: longitudinal status context belongs in Overview;
// attached source records belong in Evidence. Both exports use the same proxy
// calculation and source list, avoiding duplicate status logic across tabs.

const GAP_SEGMENTS = 8
const GAP_STALE_DAYS = 30

function CoverageGapBar({ articles, startedAt }) {
  const now = Date.now()
  const times = articles
    .map((article) => new Date(article.published_at).getTime())
    .filter((time) => Number.isFinite(time))
  const start = startedAt ? new Date(startedAt).getTime() : Math.min(...times)
  if (!Number.isFinite(start) || times.length === 0) {
    return (
      <div className="gap-bar">
        <div className="gap-bar-head">
          <span className="gap-bar-title">Coverage over time</span>
          <span className="gap-bar-stats"><span className="num gap-flag">NO ATTACHED ARTICLES</span></span>
        </div>
        <div className="gap-bar-track">
          {Array.from({ length: GAP_SEGMENTS }, (_, index) => <span key={index} className="gap-seg gap" />)}
        </div>
        <div className="gap-bar-foot">
          <span>proxy: attached-article timestamps</span>
          <span>no coverage signal</span>
        </div>
      </div>
    )
  }
  const span = Math.max(now - start, 86400000)
  const segments = Array.from({ length: GAP_SEGMENTS }, (_, index) => {
    const from = start + (span * index) / GAP_SEGMENTS
    const to = start + (span * (index + 1)) / GAP_SEGMENTS
    return times.some((time) => time >= from && time < to)
  })
  const outlets = new Set(articles.map((article) => article.outlet).filter(Boolean)).size
  const daysSinceLatest = Math.floor((now - Math.max(...times)) / 86400000)
  const stale = daysSinceLatest > GAP_STALE_DAYS
  return (
    <div className="gap-bar">
      <div className="gap-bar-head">
        <span className="gap-bar-title">Coverage over time</span>
        <span className="gap-bar-stats">
          <span className="num">{articles.length} <span className="stat-full">ARTICLES</span><span className="stat-short">ART</span></span>
          <span className="num">{outlets} <span className="stat-full">OUTLETS</span><span className="stat-short">OUT</span></span>
          <span className={`num${stale ? ' gap-flag' : ''}`}>{daysSinceLatest}D<span className="stat-full"> SINCE LAST</span></span>
        </span>
      </div>
      <div className="gap-bar-track">
        {segments.map((covered, index) => <span key={index} className={`gap-seg ${covered ? 'covered' : 'gap'}`} title={covered ? 'covered' : 'coverage gap'} />)}
      </div>
      <div className="gap-bar-foot">
        <span>{new Date(start).toISOString().slice(0, 10)}</span>
        <span>proxy: attached-article timestamps</span>
        <span>now</span>
      </div>
    </div>
  )
}

const MILESTONE_META = {
  pending: { color: 'var(--cat-amber)', label: 'Pending', icon: '○' },
  confirmed: { color: 'var(--cat-green)', label: 'Confirmed', icon: '✓' },
  failed: { color: 'var(--cat-red)', label: 'Failed', icon: '✗' },
  abandoned: { color: 'var(--cat-grey)', label: 'Abandoned', icon: '–' },
}
const MILESTONE_LEGACY = {
  confirmed_complete: 'confirmed',
  confirmed_failed: 'failed',
  unresolved: 'pending',
}

function milestoneMeta(status) {
  return MILESTONE_META[MILESTONE_META[status] ? status : MILESTONE_LEGACY[status] ?? 'pending']
}

export function arcAgeDays(startedAt) {
  if (!startedAt) return null
  return Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 86400000))
}

// Overview only: the status/proxy block describes the arc as a whole and
// contains no attached source-card list.
export function ArcOverviewStatus({ arc, detail, arcArticles }) {
  const ageDays = arcAgeDays(arc?.started_at)
  const milestones = detail?.milestones ?? []
  return (
    <section className="arc-status-panel arc-overview-status" aria-label="Arc age and coverage status">
      <div className="arc-age-row">
        <span className="ap-label">Arc age</span>
        <div className="arc-age-bar"><div className="arc-age-fill" style={{ width: `${Math.min(100, ((ageDays ?? 0) / 365) * 100)}%` }} /></div>
        <span className="arc-age-label"><span className="num">{ageDays ?? '—'}</span> days</span>
      </div>
      <CoverageGapBar articles={arcArticles} startedAt={arc?.started_at} />
      {arc?.coverage_gap && (
        <div className="arc-coverage-gap">
          Coverage gap — real-world developments are outpacing recorded media coverage. The story may still be unfolding, and the coverage proxy is incomplete.
        </div>
      )}
      <div className="arc-status-subsection">
        <span className="ap-label">Milestone checklist — did anything actually happen?</span>
        {milestones.length === 0 ? (
          <p className="arc-empty">No milestones tracked yet — expected outcomes have not been recorded for this arc.</p>
        ) : (
          <ul className="arc-milestones">
            {milestones.map((milestone) => {
              const meta = milestoneMeta(milestone.status)
              return (
                <li key={milestone.id} className="arc-milestone">
                  <span className="arc-milestone-status" style={{ color: meta.color }}>{meta.icon}</span>
                  <div className="arc-milestone-body">
                    <span className="arc-milestone-title">{milestone.title}</span>
                    <span className="arc-milestone-meta" style={{ color: meta.color }}>
                      {meta.label}{milestone.updated_at && ` · updated ${String(milestone.updated_at).slice(0, 10)}`}
                    </span>
                    {milestone.notes && <span className="arc-milestone-notes">{milestone.notes}</span>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}

// Evidence only: attached publisher records. No lifecycle/status content is
// repeated here, so the tab is unambiguously a source inventory.
export default function ArcEvidencePanel({ arcArticles, onOpenArticle }) {
  if (!arcArticles?.length) {
    return (
      <section className="ap-section" aria-label="Attached source records">
        <span className="ap-label">Attached source records</span>
        <p className="arc-empty">No attached publisher records are stored for this arc.</p>
      </section>
    )
  }
  return (
    <section className="ap-section" aria-label="Attached source records">
      <span className="ap-label">Attached source records (<span className="num">{arcArticles.length}</span>)</span>
      <p className="ap-muted">These are publisher records attached to this arc. Arc age, coverage, and milestone context appear in Overview.</p>
      <ul className="ap-sources">
        {arcArticles.map((article) => (
          <li key={article.id} className="ap-source">
            <span className="ap-source-outlet">{article.outlet}</span>
            <button className="ap-source-headline ap-article-link" title="Open in News Feed" onClick={() => onOpenArticle?.(article.id)}>
              {article.title}
            </button>
            {article.published_at && <span className="ap-source-date">{String(article.published_at).slice(0, 10)}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}
