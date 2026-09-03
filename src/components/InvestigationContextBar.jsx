import { investigationContextDomProps } from '../lib/investigationContext'

function display(value, empty = 'none') {
  if (value == null || String(value).trim() === '') return empty
  return String(value)
}

function rangeText(range) {
  if (!range || (range.from == null && range.to == null)) return 'none'
  return `${display(range.from, 'not recorded')} → ${display(range.to, 'not recorded')}`
}

export default function InvestigationContextBar({ investigationContext }) {
  const ic = investigationContext
  const hasSubject = Boolean(ic?.canonical_subject_id)
  return (
    <section
      className="ic-bar"
      aria-label="Investigation context"
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
    </section>
  )
}
