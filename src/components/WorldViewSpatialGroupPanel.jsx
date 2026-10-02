import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { sourceNativeLocationLabel } from '../lib/spatialProjection.js'
import { projectionRowDisplayKey } from '../lib/worldViewDisplayClusters.js'
import './world-view-spatial-groups.css'

const EMPTY = Object.freeze([])
const PAGE_SIZE = 20
const rowLabel = row => sourceNativeLocationLabel(row) || row.precision_class || row.mip_object_id
const inspectLabel = cluster => `Inspect group: ${cluster.rowCount} projection rows, ${cluster.locationCount} display locations`

/** Overlay positions and lines come only from the current renderer presentation. */
export function WorldViewDisplayOverlay({ presentation, onInspectCluster }) {
  const arrowId = 'wv-relationship-arrow-' + useId().replace(/:/g, '')
  const { width, height, layout, relationshipSummary, relationshipLabels } = presentation ?? {}
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  return (
    <div className="wv-display-overlay" style={{ width: width + 'px', height: height + 'px' }}>
      <svg className="wv-display-lines" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <marker id={arrowId} viewBox="0 0 8 8" refX="8" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 8 4 L 0 8 Z" fill="var(--text-secondary)" />
          </marker>
        </defs>
        {(relationshipSummary?.lines ?? EMPTY).map(line => (
          <g key={line.edgeIndex} className={`wv-display-relation${line.selected ? ' is-selected' : ''}`} data-edge-id={line.edge.id ?? undefined}>
            <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} markerEnd={`url(#${arrowId})`} />
            {relationshipLabels?.has(line.edgeIndex) && (
              <text x={(line.x1 + line.x2) / 2} y={(line.y1 + line.y2) / 2 - 5} textAnchor="middle">
                {line.type || line.label || 'relationship'}
              </text>
            )}
          </g>
        ))}
      </svg>
      {(layout?.clusters ?? EMPTY).map(cluster => (
        <button key={cluster.id} type="button"
          className={`wv-display-group-hit${cluster.selected ? ' is-selected' : ''}`}
          style={{ left: `${cluster.x / width * 100}%`, top: `${cluster.y / height * 100}%` }}
          aria-label={inspectLabel(cluster)} data-cluster-id={cluster.id}
          disabled={!onInspectCluster} onClick={() => onInspectCluster(cluster.id)}>
          <span className="wv-display-group-badge wv-cluster-badge" aria-hidden="true">
            <span>{cluster.rowCount}</span><small>rows</small>
          </span>
        </button>
      ))}
    </div>
  )
}

function Pages({ page, count, onChange, label }) {
  if (count <= 1) return null
  return (
    <nav className="wv-spatial-pages" aria-label={label}>
      <button type="button" disabled={page === 0} onClick={() => onChange(page - 1)}>Previous</button>
      <span role="status">Page {page + 1} of {count}</span>
      <button type="button" disabled={page === count - 1} onClick={() => onChange(page + 1)}>Next</button>
    </nav>
  )
}

function RowButton({ row, rowKey, selected, locations, inGroup = false, onClick, disabled }) {
  const descriptionId = 'wv-row-description-' + useId().replace(/:/g, '')
  return (
    <button type="button" className={selected ? 'is-selected' : undefined}
      aria-label={`Select projection row: ${rowLabel(row)}`} aria-describedby={selected ? descriptionId + ' ' + descriptionId + '-selected' : descriptionId} data-row-key={rowKey}
      disabled={disabled} onClick={onClick}>
      {rowLabel(row)}{selected && <span id={descriptionId + '-selected'} className="wv-spatial-selected">Selected</span>}
      <span id={descriptionId} className="wv-spatial-row-metadata">
        <span>Object: {row.mip_object_id} · Revision: {row.revision_id ?? 'Not supplied'} · Precision: {row.precision_class ?? 'Not supplied'}</span>
        <span>{locations} display locations {inGroup ? 'in this group' : 'shown individually'}</span>
      </span>
    </button>
  )
}

/** Inspection chooses a display group only. Canonical picks require a separate
 * original-row action and return scalar keys for the parent's current-layout guard. */
export default function WorldViewSpatialGroupPanel({
  presentation, inspectedClusterId = null, inspectionRevision = 0, onInspectCluster, onSelectMember, onSelectSingle,
}) {
  const detailsRef = useRef(null)
  const headingRef = useRef(null)
  const lastFocusedStamp = useRef(null)
  const [groupPage, setGroupPage] = useState(0)
  const [memberPage, setMemberPage] = useState(0)
  const [singlePage, setSinglePage] = useState(0)
  const rawClusters = presentation?.layout?.clusters ?? EMPTY
  const rawSingles = presentation?.layout?.singles ?? EMPTY
  const clusters = useMemo(() => [...rawClusters].sort((a, b) => Number(b.selected) - Number(a.selected)), [rawClusters])
  const active = clusters.find(cluster => cluster.id === inspectedClusterId) ?? null
  const clusterRowStats = useMemo(() => {
    const all = new Map()
    for (const cluster of clusters) {
      const stats = new Map()
      for (const marker of cluster.members) {
        const entry = stats.get(marker.row)
        if (entry) { entry.locations++; entry.selected ||= Boolean(marker.selected) }
        else stats.set(marker.row, { locations: 1, selected: Boolean(marker.selected) })
      }
      all.set(cluster.id, stats)
    }
    return all
  }, [clusters])
  const members = useMemo(() => (active?.rowMembers ?? EMPTY).map(row => ({
    row, key: projectionRowDisplayKey(row),
    selected: clusterRowStats.get(active.id)?.get(row)?.selected ?? false,
    locations: clusterRowStats.get(active.id)?.get(row)?.locations ?? 0,
  })).filter(member => member.key !== null).sort((a, b) => Number(b.selected) - Number(a.selected)), [active, clusterRowStats])
  const singles = useMemo(() => {
    const rows = new Map()
    for (const marker of rawSingles) {
      const key = projectionRowDisplayKey(marker.row)
      if (key === null) continue
      const existing = rows.get(key)
      if (existing) { existing.selected ||= Boolean(marker.selected); existing.locations++ }
      else rows.set(key, { key, row: marker.row, selected: Boolean(marker.selected), locations: 1 })
    }
    return [...rows.values()].sort((a, b) => Number(b.selected) - Number(a.selected))
  }, [rawSingles])
  const groupSelectionKey = JSON.stringify(clusters.filter(cluster => cluster.selected).map(cluster => cluster.id))
  const singleSelectionKey = JSON.stringify(singles.filter(single => single.selected).map(single => single.key))
  useEffect(() => { setGroupPage(0) }, [groupSelectionKey])
  useEffect(() => { setSinglePage(0) }, [singleSelectionKey])
  const membershipKey = JSON.stringify(members.map(member => member.key))
  useEffect(() => { setMemberPage(0) }, [inspectedClusterId, membershipKey])
  useEffect(() => {
    if (!active) return
    const stamp = JSON.stringify([inspectedClusterId, inspectionRevision])
    if (lastFocusedStamp.current === stamp) return
    lastFocusedStamp.current = stamp
    if (detailsRef.current) detailsRef.current.open = true
    headingRef.current?.focus({ preventScroll: true })
  }, [inspectedClusterId, inspectionRevision, Boolean(active)])

  const groupPages = Math.max(1, Math.ceil(clusters.length / PAGE_SIZE))
  const memberPages = Math.max(1, Math.ceil(members.length / PAGE_SIZE))
  const singlePages = Math.max(1, Math.ceil(singles.length / PAGE_SIZE))
  const groupsAt = Math.min(groupPage, groupPages - 1)
  const membersAt = Math.min(memberPage, memberPages - 1)
  const singlesAt = Math.min(singlePage, singlePages - 1)
  const pageSlice = (rows, page) => rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const inspectGroup = id => {
    if (detailsRef.current) detailsRef.current.open = true
    onInspectCluster(id)
  }

  return (
    <details ref={detailsRef} className="wv-spatial-groups" role="region" aria-label="Spatial groups">
      <summary>Spatial groups <span>{clusters.length} groups · {singles.length} individual rows</span></summary>
      <p>Display groups. Counts refer to projection rows and their display locations.</p>
      <p>Inspect a group, then choose an original projection row. A group anchor is a display placement.</p>
      {clusters.length > 0 && (
        <>
          <ul className="wv-spatial-group-list">
            {pageSlice(clusters, groupsAt).map(cluster => (
              <li key={cluster.id}>
                <button type="button" aria-label={inspectLabel(cluster)} data-cluster-id={cluster.id}
                  className={cluster.selected ? 'is-selected' : undefined}
                  disabled={!onInspectCluster} onClick={() => inspectGroup(cluster.id)}>
                  {cluster.rowCount} rows · {cluster.locationCount} display locations
                  {cluster.selected && <span className="wv-spatial-selected">Selected</span>}
                </button>
                {cluster.selected && cluster.rowMembers.filter(row => clusterRowStats.get(cluster.id)?.get(row)?.selected).slice(0, PAGE_SIZE).map(row => (
                  <p className="wv-spatial-selected-row" key={projectionRowDisplayKey(row)}>Selected projection row: {rowLabel(row)}</p>
                ))}
              </li>
            ))}
          </ul>
          <Pages page={groupsAt} count={groupPages} onChange={setGroupPage} label="Spatial group pages" />
        </>
      )}
      {active && (
        <section className="wv-spatial-members" aria-label="Inspected group projection rows" data-inspected-cluster-id={active.id}>
          <h4 ref={headingRef} tabIndex={-1}>{active.rowCount} rows · {active.locationCount} display locations</h4>
          <ul className="wv-spatial-row-list">
            {pageSlice(members, membersAt).map(member => (
              <li key={member.key}>
                <RowButton row={member.row} rowKey={member.key} selected={member.selected} locations={member.locations} inGroup
                  disabled={!onSelectMember} onClick={() => onSelectMember(active.id, member.key)} />
              </li>
            ))}
          </ul>
          <Pages page={membersAt} count={memberPages} onChange={setMemberPage} label="Inspected group row pages" />
        </section>
      )}
      {inspectedClusterId && !active && <p>The inspected group is no longer in the current display. Choose a visible group or individual row.</p>}
      {singles.length > 0 && (
        <section className="wv-spatial-singles" aria-label="Individual projection rows">
          <h4>Individual projection rows</h4>
          <ul className="wv-spatial-row-list">
            {pageSlice(singles, singlesAt).map(single => (
              <li key={single.key}>
                <RowButton row={single.row} rowKey={single.key} selected={single.selected} locations={single.locations}
                  disabled={!onSelectSingle} onClick={() => onSelectSingle(single.key)} />
              </li>
            ))}
          </ul>
          <Pages page={singlesAt} count={singlePages} onChange={setSinglePage} label="Individual projection row pages" />
        </section>
      )}
      {clusters.length === 0 && singles.length === 0 && <p>No admitted display groups or individual projection rows in the current viewport.</p>}
    </details>
  )
}
