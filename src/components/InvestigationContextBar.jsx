import { investigationContextDomProps } from '../lib/investigationContext'

function display(value, empty = 'none') {
  if (value == null || String(value).trim() === '') return empty
  return String(value)
}

function rangeText(range) {
  if (!range || (range.from == null && range.to == null)) return 'none'
  return `${display(range.from, 'not recorded')} → ${display(range.to, 'not recorded')}`
}

function fallbackCopy(fallback) {
  const kind = fallback?.kind ?? 'selection'
  const id = fallback?.requestedId ?? 'unknown'
  return `Sub-selection ${kind} ${id} is not valid on this subject. Showing the parent investigation context.`
}

export default function InvestigationContextBar({
  investigationContext,
  recentInvestigations = [],
  onRestoreRecent,
  selectionFallbacks = [],
  storageKey,
}) {
  const ic = investigationContext
  const hasSubject = Boolean(ic?.canonical_subject_id)
  const recents = recentInvestigations ?? []
  const fallbacks = selectionFallbacks ?? []
  return (
    <section
      className="ic-bar"
      aria-label="Investigation context"
      data-recent-storage-key={storageKey ?? ''}
      {...investigationContextDomProps(ic)}
    >
      <h2 className="ic-bar-title">Investigation context</h2>
      {!hasSubject ? (
        <p className="ic-bar-empty">No canonical subject. Absence is explicit — no event is invented.</p>
      ) : (
        <dl className="ic-bar-fields">
          <div>
            <dt>canonical_subject_type</dt>
            <dd>{display(ic.canonical_subject_type, 'not recorded')}</dd>
          </div>
          <div>
            <dt>canonical_subject_id</dt>
            <dd className="num" data-testid="ic-canonical-subject-id">
              {ic.canonical_subject_id}
            </dd>
          </div>
          <div>
            <dt>parent_event_id</dt>
            <dd className="num">{display(ic.parent_event_id, 'none')}</dd>
          </div>
          <div>
            <dt>as_of_time</dt>
            <dd className="num">{display(ic.as_of_time, 'not recorded')}</dd>
          </div>
          <div>
            <dt>selected_time_range</dt>
            <dd className="num">{rangeText(ic.selected_time_range)}</dd>
          </div>
          <div>
            <dt>active_view</dt>
            <dd>{display(ic.active_view, 'none')}</dd>
          </div>
          <div>
            <dt>temporal_assessment_reference</dt>
            <dd className="num">{display(ic.temporal_assessment_reference, 'none')}</dd>
          </div>
        </dl>
      )}
      {fallbacks.length > 0 && (
        <ul className="ic-bar-fallbacks" data-deep-link-fallback="true">
          {fallbacks.map((fallback) => (
            <li key={`${fallback.kind}:${fallback.requestedId}`}>
              {fallbackCopy(fallback)}
            </li>
          ))}
        </ul>
      )}
      {recents.length > 0 && (
        <nav className="ic-bar-recent" aria-label="Recent investigations">
          <h3 className="ic-bar-recent-title">Recent investigations</h3>
          <p className="ic-bar-recent-note">
            Local to this browser. Restore re-opens the prior subject and view. This is not an
            account sync and not a multi-investigation tab strip.
          </p>
          <ul className="ic-bar-recent-list">
            {recents.map((item) => (
              <li key={item.canonical_subject_id}>
                <button
                  type="button"
                  className="ic-bar-recent-item"
                  data-recent-subject-id={item.canonical_subject_id}
                  onClick={() => onRestoreRecent?.(item)}
                >
                  <span className="ic-bar-recent-type">{display(item.canonical_subject_type, 'subject')}</span>
                  <span className="ic-bar-recent-id num">{item.canonical_subject_id}</span>
                  <span className="ic-bar-recent-view">{display(item.active_view, 'view')}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </section>
  )
}
