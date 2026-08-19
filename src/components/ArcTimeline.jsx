import { useState } from 'react'
import { buildConnectors } from '../lib/timelineEngine'
import TimelineConnector from './TimelineConnector'
import TimelineEntryDetail from './TimelineEntryDetail'
import TypeIcon from './TypeIcon'
import TypePill from './TypePill'
import StatusBadge from './StatusBadge'
import SourceAttributionLine from './SourceAttributionLine'
import './epistemic.css'

// Track B Step 3 item 4 — the shared vertical timeline (addendum Screen 5,
// reference IMG_2994). Consumed by the Timeline screen (both scopes) and,
// in item 5, by the ArcsView Timeline tab — one renderer, one connector
// engine, so the causal-vs-sequence boundary is identical everywhere.
//
// Entry anatomy (D4): date at far left on its own axis; circular type icon
// on the spine (neutral marker for unmapped live categories); type pill;
// bold title; description; source line ONLY when a real outlet resolved;
// status badge right-aligned. Chevron-right collapsed, caret-up expanded;
// expansion renders the item-3 detail card, loading the article excerpt
// on demand when the entry carries a resolved articleId.
//
// Connector labels render between EVERY adjacent pair via the item-3
// engine — never dropped, abbreviated, or collapsed for density.

function DateAxis({ date }) {
  if (!date) {
    return <span className="ep-tl-date ep-tl-date-undated">undated</span>
  }
  const [y, m, d] = date.split('-')
  const month = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ][Number(m) - 1]
  return (
      <span className="ep-tl-date" aria-label={`${month} ${Number(d)}, ${y}`}>
        <span className="ep-tl-date-y">{y}</span>
        <span className="ep-tl-date-md">{month} {Number(d)}</span>
      </span>
  )
}

function TimelineEntry({ entry, article, expanded, onToggle }) {
  return (
    <div className="ep-tl-entry">
      <DateAxis date={entry.date} />
      <div className="ep-tl-spine" aria-hidden="true">
        <TypeIcon type={entry.type} />
      </div>
      <div className="ep-tl-card">
        <div className="ep-tl-card-head">
          <TypePill type={entry.type} />
          <button
            type="button"
            className="ep-tl-toggle"
            aria-expanded={expanded}
            aria-label={expanded ? `Collapse ${entry.title}` : `Expand ${entry.title}`}
            onClick={onToggle}
          >
            <span className="ep-tl-toggle-label">{expanded ? 'Hide details' : 'View details'}</span>
            <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
              {expanded ? (
                <path d="M2 8 6 4l4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              )}
            </svg>
          </button>
        </div>
        <span className="ep-tl-title">{entry.title}</span>
        {entry.description && <p className="ep-tl-desc">{entry.description}</p>}
        <div className="ep-tl-foot">
          {entry.outlet && <SourceAttributionLine outlet={entry.outlet} />}
          {entry.badgeState && <StatusBadge state={entry.badgeState} className="ep-tl-badge" />}
        </div>
        {expanded && (
          <TimelineEntryDetail
            entry={{ description: entry.description, summary: null }}
            article={article ?? null}
          />
        )}
      </div>
    </div>
  )
}

export default function ArcTimeline({ entries, edges = [], loadArticle, emptyText, registerRef, focusKey }) {
  const list = Array.isArray(entries) ? entries.filter(Boolean) : []
  const [expandedKey, setExpandedKey] = useState(null)
  const [articles, setArticles] = useState(() => new Map())

  if (list.length === 0) {
    return <p className="arc-empty">{emptyText ?? 'No events recorded yet.'}</p>
  }

  // One connector per gap, always (the screen's single most important
  // element). Arc scope passes edges=[] — every connector honestly reads
  // "Sequence only" (arc_events are not nodes; item-3 live-data finding).
  const connectors = buildConnectors(
    list.map((e) => ({ key: e.key })),
    edges,
  )

  const toggle = (entry) => {
    const key = entry.key
    const next = expandedKey === key ? null : key
    setExpandedKey(next)
    // On-demand excerpt loader (D9): fetch once per entry, only when the
    // entry carries a resolved article join and a loader was provided.
    if (next && entry.articleId && loadArticle && !articles.has(key)) {
      Promise.resolve(loadArticle(entry.articleId))
        .then((article) => {
          setArticles((prev) => new Map(prev).set(key, article ?? null))
        })
        .catch(() => {
          // Withhold posture: a failed excerpt read renders the explicit
          // unavailable state, never an error bolted onto the card.
          setArticles((prev) => new Map(prev).set(key, null))
        })
    }
  }

  return (
    <ol className="ep-tl-list">
      {list.map((entry, i) => (
        <li
          key={entry.key ?? i}
          className={`ep-tl-item${focusKey && focusKey === entry.key ? ' timeline-focused' : ''}`}
          ref={registerRef ? (el) => registerRef(entry.key, el) : undefined}
        >
          <TimelineEntry
            entry={entry}
            article={articles.get(entry.key) ?? null}
            expanded={expandedKey === entry.key}
            onToggle={() => toggle(entry)}
          />
          {i < connectors.length && <TimelineConnector connector={connectors[i]} />}
        </li>
      ))}
    </ol>
  )
}
