import { useEffect, useState } from 'react'
import { mipBackend } from '../lib/mipBackend.js'
import { reviewStatusBadge } from '../lib/explanationEligibility.js'
import './review-status.css'

// 02B-ADD Part A (owner-authorized 2026-08-03): review-queue status surface.
// Reads ONLY through the real explanation read path (provenance_ui flag-gated —
// when the flag is off the panel shows the disabled state, never data). Its one
// job is to make review statuses visible with the mandated visual distinction:
// 'Reviewed — human confirmed' vs 'Auto-verified — system confidence threshold'.
export default function ReviewStatusPanel({ onClose, backend = mipBackend.publicData.evidence }) {
  const [view, setView] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setView(null)
    setError(null)
    backend.loadExplanationReadView({ limit: 1000 })
      .then((v) => {
        if (!cancelled) setView(v)
      })
      .catch((e) => {
        if (!cancelled) setError(e)
      })
    return () => {
      cancelled = true
    }
  }, [backend])

  // Group every fetched row (eligible + excluded) by review_status.
  const groups = new Map()
  if (view?.enabled) {
    const all = [
      ...view.eligible,
      ...view.excluded.map((entry) => entry.explanation),
    ]
    for (const row of all) {
      const key = row.review_status ?? 'unknown'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(row)
    }
  }

  return (
    <div className="review-status" role="region" aria-label="Explanation review status">
      <div className="review-status-head">
        <h2>Review status</h2>
        <button className="ap-icon-btn" aria-label="Close review status" onClick={onClose}>
          ×
        </button>
      </div>
      {error && <p className="ap-muted">Review status could not be loaded.</p>}
      {!error && view === null && <p className="ap-muted">Loading…</p>}
      {!error && view && !view.enabled && (
        <p className="ap-muted">Provenance read path is disabled (provenance_ui flag off).</p>
      )}
      {!error && view?.enabled && (
        <>
          <p className="review-status-sub">
            Explanation rows by review status. “Reviewed” means a human confirmed the row;
            “Auto-verified” means only the system confidence threshold was met — never
            human review.
          </p>
          <div className="review-status-scroll">
            {[...groups.entries()].map(([status, rows]) => {
              const badge = reviewStatusBadge(status)
              return (
                <section key={status} className={`review-status-group tone-${badge.tone}`}>
                  <h3>
                    <span className={`review-status-badge tone-${badge.tone}`}>{badge.label}</span>
                    <span className="review-status-count">{rows.length}</span>
                  </h3>
                  <ul>
                    {rows.map((row) => (
                      <li key={row.id}>
                        <code>{row.assertion_id}</code>
                        {row.assertion_type ? ` (${row.assertion_type})` : ''}
                      </li>
                    ))}
                  </ul>
                </section>
              )
            })}
            {groups.size === 0 && <p className="ap-muted">No explanation rows found.</p>}
          </div>
        </>
      )}
    </div>
  )
}
