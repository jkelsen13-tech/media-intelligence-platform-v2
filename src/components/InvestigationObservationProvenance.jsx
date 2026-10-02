import { useState } from 'react'
import { savedRelevanceDeclarations, collectionDiagnostics } from '../lib/investigationObservationProvenance.js'
import { formatWorkspaceDate } from '../lib/workspacePresentation.js'

export function RelevanceDeclarationRecords({ bundle, onOpenInput }) {
  const inventory = savedRelevanceDeclarations(bundle)
  const [limit, setLimit] = useState(10)
  return <section aria-label="Saved relevance declarations">
    <h3>Saved relevance declarations</h3>
    <p className="piw-note">These candidate-to-input selections belong to this saved observation. A declaration may concern an input already watched. It does not imply a new source arrival, independent corroboration, support, completed reassessment or truth.</p>
    {!inventory.available ? <p>Relevance declaration records are not available in this saved observation. No declarations are inferred from context membership.</p>
      : !inventory.rows.length ? <p>No usable relevance declarations recorded in this saved observation.</p> : <ul className="piw-cards">{inventory.rows.slice(0, limit).map(row => <li className="piw-card" key={`${row.candidate_id}:${row.change_position}`} data-relevance-position={row.change_position}>
        <p className="piw-mono">Candidate {row.candidate_id} · Input position {row.change_position}</p>
        <p>{row.scopeRole}</p>
        <p>Selection method: {row.selection_method}</p><p>Selection reference: {row.selection_ref}</p>
        <p>Selection rationale: {row.rationale}</p><p>Declared at: {formatWorkspaceDate(row.declared_at)}</p>
        <p className="piw-note">Provenance: observation {bundle.observation.id} / relevance_declarations / candidate and input position.</p>
        <button type="button" className="piw-text-btn" disabled={!row.input || !onOpenInput} onClick={() => onOpenInput?.({ investigationId: bundle.investigation_id, versionId: bundle.version.id, observationId: bundle.observation.id, position: row.change_position }, bundle)}>Inspect declared input</button>
        {!row.input ? <p>That exact input is unavailable in this saved observation. No current input is substituted.</p> : null}
      </li>)}</ul>}
    {inventory.rows.length > limit ? <button type="button" className="piw-text-btn" onClick={() => setLimit(n => n + 10)}>Show more declarations ({inventory.rows.length - limit} remaining)</button> : null}
    {inventory.excluded ? <p>{inventory.excluded} ambiguous or incomplete declaration records are excluded; their provenance is unknown.</p> : null}
  </section>
}

export function CollectionDiagnosticRecords({ bundle, checks, reviews }) {
  const rows = collectionDiagnostics(bundle, checks, reviews)
  const [limit, setLimit] = useState(10)
  return <section aria-label="Collection diagnostic provenance">
    <h3>Collection diagnostic provenance</h3>
    <p className="piw-note">Dispositions may coexist and apply only to the named field, declaration or review target. Declared not_run, partial and completed states do not measure collection coverage.</p>
    <ul className="piw-cards">{rows.slice(0, limit).map((row, i) => <li className="piw-card" key={`${row.kind}:${row.reference}:${i}`} data-collection-disposition={row.kind}>
      <p><strong>{row.kind}</strong> · {row.scope}</p><p>{row.basis}</p>
      <p className="piw-note">Provenance: {row.owner} · {row.reference}</p>
    </li>)}</ul>
    {rows.length > limit ? <button type="button" className="piw-text-btn" onClick={() => setLimit(n => n + 10)}>Show more diagnostic records ({rows.length - limit} remaining)</button> : null}
  </section>
}
