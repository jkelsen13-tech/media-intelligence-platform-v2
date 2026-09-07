import { useMemo, useState } from 'react'
import { retainedTextAvailability } from '../lib/investigationTextAvailability.js'

function InputRows({ rows, bundle, onOpenInput }) {
  const [limit, setLimit] = useState(10)
  return <>
    <ol className="piw-input-results">{rows.slice(0, limit).map(row => <li key={row.position}>
      <div><strong>{row.displayTitle}</strong><p className="piw-note">{row.kind === 'capture' ? 'Source capture' : 'Record version'} · Position {row.position}</p></div>
      <button type="button" className="piw-section-btn" disabled={!onOpenInput} onClick={() => onOpenInput?.({
        investigationId: bundle.investigation_id, versionId: bundle.version.id,
        observationId: bundle.observation.id, position: row.position,
      }, bundle)}>Inspect retained text</button>
    </li>)}</ol>
    {rows.length > limit ? <button type="button" className="piw-text-btn" onClick={() => setLimit(n => n + 10)}>Show more retained records ({rows.length - limit} remaining)</button> : null}
  </>
}

function Group({ group, ...props }) {
  const [open, setOpen] = useState(false)
  if (!group.rows.length) return <p className="piw-note">{group.label}: 0 records</p>
  return <details className="piw-linked-record" onToggle={event => {
    if (event.target === event.currentTarget) setOpen(event.currentTarget.open)
  }}>
    <summary>{group.label}: {group.rows.length} record(s)</summary>
    {open ? <InputRows rows={group.rows} {...props} /> : null}
  </details>
}

export default function InvestigationTextAvailability({ bundle, onOpenInput }) {
  const inventory = useMemo(() => retainedTextAvailability(bundle), [bundle])
  return <section className="piw-text-availability" aria-label="Retained text availability">
    <h3>Retained text availability</h3>
    <p className="piw-note">These counts describe fields in this saved observation, separately from analyst collection declarations. Body text may be partial; its presence does not establish full publisher text. Blank fields count as missing.</p>
    {!inventory.available ? <p>Retained text availability is unavailable for this saved version. This is not a count of zero.</p> : <>
      <p>{inventory.total} retained input records with usable identities. Counts include saved revisions and do not measure independent sources, evidence quality or collection completeness.</p>
      {inventory.total ? inventory.groups.map(group => <Group
        key={`${bundle.investigation_id}:${bundle.version.id}:${bundle.observation.id}:${group.kind}`}
        group={group} bundle={bundle} onOpenInput={onOpenInput} />)
        : <p>No retained inputs with usable identities are available to inspect. This does not establish an absence of evidence elsewhere.</p>}
      {inventory.excluded ? <p className="piw-note">{inventory.excluded} retained entries have ambiguous or unavailable identities and are excluded from these counts.</p> : null}
    </>}
    <p className="piw-note">Inspect a record to see exactly what was retained. Missing text may limit quotation review; it does not show that the source lacks information or that a claim is false. No collection or retrieval runs here.</p>
  </section>
}
