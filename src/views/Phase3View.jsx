import { useEffect, useState } from 'react'
import { loadPhase3BetaView } from '../lib/phase3ReadPath.js'
import './phase3.css'

// Phase 3 (02C) internal closed-beta view — legal cases + policy lifecycles.
// Rendered ONLY when pipeline_config.phase3_beta is true; the loader withholds
// everything otherwise. Read-only against the corpus and production graph.
//
// 02C hard rules rendered here:
//   - verdict = documented claim of the deciding body, never system fact;
//   - no composite legal alignment score anywhere in this view;
//   - evidence tracks stay separated; withheld_from_factfinder is prominent;
//   - unverified social material is dashed and labeled, never styled confirmed;
//   - 'missing:' markers render as absence cards, visually distinct from
//     populated evidence (finding-4 fold-in).

const TRACK_LABELS = {
  withheld_from_factfinder: 'Withheld / excluded from the factfinder',
  supporting: 'Supporting evidence',
  contradicting: 'Contradicting evidence',
  unauthenticated: 'Unauthenticated evidence',
  confirmed_reporting: 'Confirmed reporting',
  disputed_claim: 'Disputed claims',
  official_position: 'Official position',
  unverified_social: 'Unverified social material',
  missing_evidence: 'Missing evidence',
}

const TRACK_COPY = {
  withheld_from_factfinder:
    'Prominent by design: this track is high-value and easy to hide.',
  unverified_social:
    'Never established fact. Rendered unverified regardless of source volume.',
}

function ReviewChip({ status, reviewedBy }) {
  return (
    <span className={`p3-chip p3-chip-${status ?? 'unknown'}`}>
      {status}
      {reviewedBy ? ` · ${reviewedBy}` : ''}
    </span>
  )
}

function EvidenceRow({ row }) {
  if (row.is_marker) {
    // Absence card — visually and textually distinct from evidence passages.
    return (
      <li className="p3-ev p3-ev-marker">
        <p className="p3-ev-desc">{row.description}</p>
        <p className="p3-marker-copy">{row.marker_copy}</p>
        <ReviewChip status={row.review_status} reviewedBy={row.reviewed_by} />
      </li>
    )
  }
  return (
    <li className={`p3-ev${row.is_unverified_social ? ' p3-ev-unverified' : ''}`}>
      {row.is_unverified_social && (
        <p className="p3-unverified-banner">Unverified — not established fact</p>
      )}
      <p className="p3-ev-desc">{row.description}</p>
      {row.source_passage && <blockquote className="p3-ev-passage">{row.source_passage}</blockquote>}
      {row.source_url && (
        <a className="p3-ev-src" href={row.source_url} target="_blank" rel="noreferrer">
          Source ↗
        </a>
      )}
      {row.authentication_state && (
        <p className="p3-ev-meta">Authentication: {row.authentication_state}</p>
      )}
      {row.remaining_uncertainty && (
        <p className="p3-ev-meta">Remaining uncertainty: {row.remaining_uncertainty}</p>
      )}
      <ReviewChip status={row.review_status} reviewedBy={row.reviewed_by} />
    </li>
  )
}

function CaseCard({ kase }) {
  const isMode1 = kase.case_status === 'verdict_reached'
  return (
    <article className="p3-case">
      <header className="p3-case-head">
        <h3>{kase.title}</h3>
        <ReviewChip status={kase.review_status} reviewedBy={kase.reviewed_by} />
      </header>

      {kase.involves_minor_or_private_person && (
        <p className="p3-privacy-banner">
          Involves a minor or private individual — heightened care applies. No private-person
          accusation is presented as fact.
        </p>
      )}
      {kase.sealed_or_expunged && (
        <p className="p3-privacy-banner">Sealed or expunged record — handle per policy.</p>
      )}

      {isMode1 && kase.verdict_block ? (
        <section className="p3-verdict">
          <h4>Verdict / disposition</h4>
          <p className="p3-verdict-text">{kase.verdict_block.verdict}</p>
          <p className="p3-ev-meta">Charge / issue: {kase.verdict_block.charge}</p>
          <p className="p3-ev-meta">Deciding body: {kase.verdict_block.deciding_body}</p>
          <p className="p3-ev-meta">Appeal status: {kase.verdict_block.appeal_status}</p>
          <p className="p3-framed-as">{kase.verdict_block.framed_as}</p>
        </section>
      ) : (
        <p className="p3-open-banner">
          Open / contested record — no verdict exists for this case. Tracks below are kept
          strictly separated.
        </p>
      )}

      {kase.charge_or_issue && !isMode1 && (
        <p className="p3-ev-meta">Subject: {kase.charge_or_issue}</p>
      )}
      {kase.remaining_uncertainty && (
        <p className="p3-uncertainty">Remaining uncertainty: {kase.remaining_uncertainty}</p>
      )}
      {kase.authentication_completeness && (
        <p className="p3-ev-meta">
          Authentication completeness: {kase.authentication_completeness}
        </p>
      )}
      {kase.correction_notice && (
        <p className="p3-correction">Correction: {kase.correction_notice}</p>
      )}

      {kase.tracks.map(({ track, rows }) => (
        <section key={track} className={`p3-track p3-track-${track}`}>
          <h4>
            {TRACK_LABELS[track] ?? track}
            <span className="p3-track-count">{rows.length}</span>
          </h4>
          {TRACK_COPY[track] && <p className="p3-track-copy">{TRACK_COPY[track]}</p>}
          {rows.length === 0 ? (
            <p className="p3-track-empty">No entries on this track.</p>
          ) : (
            <ul className="p3-ev-list">
              {rows.map((row) => (
                <EvidenceRow key={row.id} row={row} />
              ))}
            </ul>
          )}
        </section>
      ))}
    </article>
  )
}

function LifecycleStrip({ events, emptyCopy }) {
  if (events.length === 0) return <p className="p3-track-empty">{emptyCopy}</p>
  return (
    <ol className="p3-strip">
      {events.map((e) => (
        <li key={e.id} className={`p3-segment${e.missing_evidence ? ' p3-segment-missing' : ''}`}>
          <details>
            <summary>
              <span className="p3-segment-state">{e.state.replace(/_/g, ' ')}</span>
              {e.event_date && <span className="p3-segment-date">{e.event_date}</span>}
            </summary>
            <div className="p3-segment-body">
              {e.missing_evidence && (
                <p className="p3-marker-copy">Outcome evidence missing — labeled missing, not failure or contradiction.</p>
              )}
              {e.source_passage && <blockquote className="p3-ev-passage">{e.source_passage}</blockquote>}
              {typeof e.source_locator?.url === 'string' && /^https:\/\//.test(e.source_locator.url) && (
                <a className="p3-ev-src" href={e.source_locator.url} target="_blank" rel="noreferrer">Official source ↗</a>
              )}
              {e.method_version && <p className="p3-ev-meta">Method: {e.method_version}</p>}
              {e.remaining_uncertainty && (
                <p className="p3-ev-meta">Remaining uncertainty: {e.remaining_uncertainty}</p>
              )}
              <ReviewChip status={e.review_status} reviewedBy={e.reviewed_by} />
            </div>
          </details>
        </li>
      ))}
    </ol>
  )
}

function PolicyCard({ policy }) {
  return (
    <article className="p3-case">
      <header className="p3-case-head">
        <h3>{policy.name}</h3>
        <ReviewChip status={policy.review_status} reviewedBy={policy.reviewed_by} />
      </header>
      {policy.jurisdiction && <p className="p3-ev-meta">{policy.jurisdiction}{policy.instrument_type ? ` · ${policy.instrument_type}` : ''}</p>}
      {policy.agency && <p className="p3-ev-meta">Owning agency: {policy.agency}</p>}
      {policy.source_locator && (
        <p className="p3-ev-meta">
          Source locator: Chapter {policy.source_locator.chapter}, {policy.source_locator.chapter_title}, pp. {policy.source_locator.pages} ({policy.source_locator.edition})
        </p>
      )}
      {policy.description && <p className="p3-ev-desc">{policy.description}</p>}
      <section className="p3-track">
        <h4>Stated objective</h4>
        <LifecycleStrip
          events={policy.stated_objective}
          emptyCopy="No stated-objective transitions curated. Single-state policies render without fabricated intermediate states."
        />
      </section>
      <section className="p3-track">
        <h4>Actual outcome</h4>
        <LifecycleStrip
          events={policy.actual_outcome}
          emptyCopy="No outcome transitions curated — missing outcome evidence is labeled missing, never treated as failure or contradiction."
        />
      </section>
    </article>
  )
}

export default function Phase3View() {
  const [view, setView] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    loadPhase3BetaView()
      .then((v) => { if (!cancelled) setView(v) })
      .catch((e) => { if (!cancelled) setError(e) })
    return () => { cancelled = true }
  }, [])

  if (error) return <div className="notice error">Legal &amp; Policy view failed to load.</div>
  if (view === null) return <div className="notice">Loading…</div>
  if (!view.enabled) {
    return (
      <div className="notice">
        Legal &amp; Policy is currently unavailable.
      </div>
    )
  }

  return (
    <div className="p3-view">
      <section className="p3-banner">
        <h2>Legal &amp; Policy</h2>
        <p>
          Curated records under human editorial review. Verdicts appear as documented claims of
          their deciding bodies. No composite alignment scores are computed. Missing evidence is
          labeled missing — never treated as failure or contradiction.
        </p>
      </section>

      <section>
        <h2 className="p3-section-title">Legal cases</h2>
        {view.cases.length === 0 ? (
          <p className="p3-track-empty">No curated legal cases yet.</p>
        ) : (
          view.cases.map((kase) => <CaseCard key={kase.id} kase={kase} />)
        )}
      </section>

      <section>
        <h2 className="p3-section-title">Policy change over time</h2>
        {view.policies.length === 0 ? (
          <p className="p3-track-empty">No curated policies yet.</p>
        ) : (
          view.policies.map((policy) => <PolicyCard key={policy.id} policy={policy} />)
        )}
      </section>
    </div>
  )
}
