import { mipBackend } from '../lib/mipBackend.js'
import { useEffect, useMemo, useState } from 'react'
import { INFERRED_CLAIMED_BY } from '../graph/theme'

// Step 10 (§7.4): Policy Consequence view. Two-directional layout —
// UPSTREAM (←) the policies that enabled / are amended by / constrain this
// one; CENTER the policy itself; DOWNSTREAM (→) its event and policy
// consequences. Both evidence tracks (§3.4) render per item: supporting
// (stance='supports' or unset) and disputing (stance='disputes'), each
// with claimant + reliability tier, with a supporting|disputing|both
// filter. Consequences are labeled by TYPE only (funding, construction,
// …) — never good/bad valence. Inferred edges are labeled "hypothesis"
// with an expandable reasoning chain; "Sequence only" is shown explicitly
// when temporal ordering is all the reasoning there is. Unexamined
// alternatives (alternative_causes with ruled_out:false) are always
// visible.

// Relationship vocabulary (backend edge types). Policy→policy edges and
// policy→event edges are bucketed upstream/downstream by which endpoint
// this policy is.
const REL_LABELS = {
  amends: 'Amends',
  supersedes: 'Supersedes',
  enables: 'Enables',
  constrains: 'Constrains',
  conflicts_with: 'Conflicts with',
  enabled: 'Enabled',
  constrained_by: 'Constrained by',
  triggered_compliance: 'Triggered compliance',
  violated: 'Violated',
  tested: 'Tested',
}

// Neutral consequence-type vocabulary (§7.4: type, never valence). Read
// from edge metadata when the backend provides it; edges without a
// consequence type simply show no chip.
const CONSEQUENCE_TYPES = new Set([
  'funding',
  'construction',
  'employment',
  'litigation',
  'enforcement',
  'closure',
  'displacement',
])

function reliabilityTier(rel) {
  if (!['number', 'string'].includes(typeof rel) || String(rel).trim() === '') return null
  const n = Number(rel)
  if (!Number.isInteger(n) || n < 1 || n > 4) return null
  return `Tier ${n} of 4 (1 = highest)`
}

// Normalize an edge touching this policy into a display item.
function toItem(edge, nodeKey, nodeById) {
  const otherKey = edge.source === nodeKey ? edge.target : edge.source
  const other = nodeById.get(otherKey)
  const outgoing = edge.source === nodeKey
  const meta = edge.metadata ?? {}
  const ctype = meta.consequence_type
  return {
    edge,
    otherKey,
    otherLabel: other?.label ?? otherKey,
    otherType: other?.type,
    occurredAt: other?.occurred_at ?? null,
    rel: REL_LABELS[edge.type] ?? edge.label ?? edge.type,
    consequenceType:
      ctype && CONSEQUENCE_TYPES.has(String(ctype).toLowerCase()) ? String(ctype) : null,
    stance: edge.stance === 'disputes' ? 'disputes' : 'supports',
    inferred: edge.claimed_by === INFERRED_CLAIMED_BY,
    claimant: edge.claimed_by ?? null,
    docStrength: edge.doc_strength ?? null,
    reliability: edge.reliability ?? null,
    signalSource: edge.signal_source ?? null,
    disputedBy: Array.isArray(edge.disputed_by) ? edge.disputed_by : null,
    alternatives: Array.isArray(edge.alternative_causes) ? edge.alternative_causes : [],
    counterfactual: edge.counterfactual_test ?? null,
    sharedEntity: meta.shared_entity ?? null,
    temporalOrdering: meta.temporal_ordering ?? null,
    outgoing,
  }
}

// Upstream (←): policies that enabled it, it amends/supersedes, that
// constrain it. Downstream (→): its event consequences plus policies it
// enables / constrains / conflicts with.
function bucket(item) {
  const t = item.edge.type
  if (t === 'enables' || t === 'constrains') return item.outgoing ? 'downstream' : 'upstream'
  if (t === 'amends' || t === 'supersedes') return item.outgoing ? 'upstream' : 'downstream'
  // conflicts_with + policy→event types are downstream consequences.
  return 'downstream'
}

function ReasoningChain({ item }) {
  const [open, setOpen] = useState(false)
  const sequenceOnly = !item.sharedEntity && !item.counterfactual
  return (
    <div className="pp-reasoning">
      <button
        type="button"
        className="pp-reasoning-toggle"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        hypothesis {open ? '▾' : '▸'}
      </button>
      {open && (
        <dl className="pp-reasoning-body">
          {item.sharedEntity && (
            <>
              <dt>Shared entity</dt>
              <dd>{String(item.sharedEntity)}</dd>
            </>
          )}
          {item.temporalOrdering && (
            <>
              <dt>Temporal ordering</dt>
              <dd>{String(item.temporalOrdering)}</dd>
            </>
          )}
          {item.counterfactual && (
            <>
              <dt>Counterfactual test</dt>
              <dd>{item.counterfactual}</dd>
            </>
          )}
          {sequenceOnly && <dd className="pp-sequence-only">Sequence only</dd>}
        </dl>
      )}
    </div>
  )
}

function ConsequenceItem({ item, onNavigate }) {
  const unexamined = item.alternatives.filter((a) => a && a.ruled_out === false)
  const tier = reliabilityTier(item.reliability)
  return (
    <li className={`pp-item${item.inferred ? ' inferred' : ''}`}>
      <div className="pp-item-head">
        <span className="pp-item-rel">{item.rel}</span>
        {item.consequenceType && <span className="pp-ctype">{item.consequenceType}</span>}
        {item.inferred && <span className="pp-hypothesis-tag">hypothesis</span>}
      </div>
      <button
        type="button"
        className="pp-item-target"
        onClick={() => onNavigate?.(item.otherKey)}
        title="Open this node"
      >
        {item.otherLabel}
      </button>
      <div className="pp-item-meta">
        {item.claimant && <span>claimant: {item.claimant}</span>}
        {tier && <span className="num">{tier}</span>}
        {item.docStrength && <span>doc: {item.docStrength}</span>}
      </div>
      {item.stance === 'disputes' && item.disputedBy && item.disputedBy.length > 0 && (
        <div className="pp-item-meta">disputed by: {item.disputedBy.join(', ')}</div>
      )}
      {unexamined.length > 0 && (
        <div className="pp-alternatives">
          {unexamined.map((a, i) => (
            <span key={i} className="pp-alt-chip" title={a.description ?? a.cause ?? ''}>
              Unexamined alternative{a.cause ? `: ${a.cause}` : ''}
            </span>
          ))}
        </div>
      )}
      {item.inferred && <ReasoningChain item={item} />}
    </li>
  )
}

function Track({ title, items, trackFilter, onNavigate, emptyText }) {
  const visible = items.filter(
    (i) => trackFilter === 'both' || i.stance === (trackFilter === 'supporting' ? 'supports' : 'disputes'),
  )
  const supporting = visible.filter((i) => i.stance === 'supports')
  const disputing = visible.filter((i) => i.stance === 'disputes')
  return (
    <section className="pp-track">
      <h3 className="pp-track-title">{title}</h3>
      {visible.length === 0 && <p className="ap-muted">{emptyText}</p>}
      <div className="pp-evidence-tracks">
        {(trackFilter !== 'disputing') && (
          <div className="pp-evidence-col">
            <span className="pp-evidence-label supports">Supporting</span>
            <ul className="pp-items">
              {supporting.map((item) => (
                <ConsequenceItem key={item.edge.id} item={item} onNavigate={onNavigate} />
              ))}
              {supporting.length === 0 && <li className="ap-muted">None</li>}
            </ul>
          </div>
        )}
        {(trackFilter !== 'supporting') && (
          <div className="pp-evidence-col">
            <span className="pp-evidence-label disputes">Disputing</span>
            <ul className="pp-items">
              {disputing.map((item) => (
                <ConsequenceItem key={item.edge.id} item={item} onNavigate={onNavigate} />
              ))}
              {disputing.length === 0 && <li className="ap-muted">None</li>}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}

export default function PolicyPanel({ node, nodes, edges, onNavigate, onClose, isMobile, backend = mipBackend.publicData.evidence }) {
  const [detail, setDetail] = useState(null)
  const [trackFilter, setTrackFilter] = useState('both')

  const nodeKey = node.id ?? node.slug

  useEffect(() => {
    let cancelled = false
    setDetail(null)
    backend.loadPolicyDetail(node.id)
      .then((d) => {
        if (!cancelled) setDetail(d)
      })
      .catch(() => {
        if (!cancelled) setDetail({ policy: null, actors: [], topics: [] })
      })
    return () => {
      cancelled = true
    }
  }, [node.id, backend])

  const { upstream, downstream } = useMemo(() => {
    const nodeById = new Map(nodes.map((n) => [n.id ?? n.slug, n]))
    const items = edges
      .filter((e) => e.source === nodeKey || e.target === nodeKey)
      .map((e) => toItem(e, nodeKey, nodeById))
    const up = []
    const down = []
    for (const item of items) (bucket(item) === 'upstream' ? up : down).push(item)
    // Downstream sorted chronologically (undated last, stable).
    down.sort((a, b) => {
      if (!a.occurredAt && !b.occurredAt) return 0
      if (!a.occurredAt) return 1
      if (!b.occurredAt) return -1
      return String(a.occurredAt).localeCompare(String(b.occurredAt))
    })
    return { upstream: up, downstream: down }
  }, [nodeKey, nodes, edges])

  const policy = detail?.policy ?? null
  const name = policy?.name ?? node.label
  const status = policy?.status ?? null

  return (
    <aside
      className={`article-panel policy-panel${isMobile ? ' sheet-mode' : ''}`}
      role="dialog"
      aria-label={`Policy consequence view: ${name}`}
    >
      <header className="ap-header">
        <div className="ap-title-row">
          <h2>{name}</h2>
          <div className="ap-actions">
            <button className="ap-icon-btn" title="Close panel (Esc)" aria-label="Close panel" onClick={onClose}>
              ×
            </button>
          </div>
        </div>
        <div className="ap-tags">
          <span className="ap-tag ap-tag-type" style={{ borderColor: 'var(--cat-violet)', color: 'var(--cat-violet)' }}>
            Policy
          </span>
          {status && <span className="ap-tag pp-status">{status}</span>}
          {policy?.instrument_type && <span className="ap-tag pp-instrument">{policy.instrument_type}</span>}
        </div>
      </header>

      {/* CENTER: the policy itself */}
      <section className="ap-section pp-center">
        <dl className="pp-facts">
          {policy?.jurisdiction && (
            <>
              <dt>Jurisdiction</dt>
              <dd>{policy.jurisdiction}</dd>
            </>
          )}
          {policy?.enacted_date && (
            <>
              <dt>Enacted</dt>
              <dd className="num">{String(policy.enacted_date).slice(0, 10)}</dd>
            </>
          )}
          {policy?.effective_date && (
            <>
              <dt>Effective</dt>
              <dd className="num">{String(policy.effective_date).slice(0, 10)}</dd>
            </>
          )}
        </dl>
        {(policy?.source_url || policy?.full_text_url) && (
          <p className="pp-links">
            {policy.source_url && (
              <a href={policy.source_url} target="_blank" rel="noopener noreferrer">
                Source ↗
              </a>
            )}
            {policy.full_text_url && (
              <a href={policy.full_text_url} target="_blank" rel="noopener noreferrer">
                Full text ↗
              </a>
            )}
          </p>
        )}
        {!policy && detail && (
          <p className="ap-muted">No policy record linked yet — showing graph relationships.</p>
        )}
        {!policy && !detail && <p className="ap-muted">Loading policy record…</p>}
      </section>

      {/* §3.4 track filter */}
      <div className="pp-track-filter" role="group" aria-label="Evidence track filter">
        {[
          ['both', 'Both'],
          ['supporting', 'Supporting'],
          ['disputing', 'Disputing'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={`pp-filter-chip${trackFilter === key ? ' active' : ''}`}
            aria-pressed={trackFilter === key}
            onClick={() => setTrackFilter(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* UPSTREAM (←) */}
      <Track
        title="← Upstream"
        items={upstream}
        trackFilter={trackFilter}
        onNavigate={onNavigate}
        emptyText="No upstream policy relationships."
      />

      {/* DOWNSTREAM (→) */}
      <Track
        title="Downstream →"
        items={downstream}
        trackFilter={trackFilter}
        onNavigate={onNavigate}
        emptyText="No downstream consequences recorded."
      />
    </aside>
  )
}
