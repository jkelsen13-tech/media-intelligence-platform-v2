import { useMemo, useState } from 'react'
import { retainedInputIndex, searchRetainedInputs, selectedRetainedInput, RETAINED_SEARCH_FIELDS } from '../lib/investigationRetainedInputs.js'
import { RetainedInputRecord } from './InvestigationAssessmentTrail.jsx'

function Search({ bundle, onOpenInput }) {
  const index = useMemo(() => retainedInputIndex(bundle), [bundle])
  const [draft, setDraft] = useState(''), [query, setQuery] = useState(''), [kind, setKind] = useState('all'), [limit, setLimit] = useState(10)
  const result = useMemo(() => searchRetainedInputs(index, query, kind), [index, query, kind])
  if (!index.available) return <p>Saved inputs are unavailable. No current source records are substituted.</p>
  const open = row => onOpenInput?.({ investigationId: bundle.investigation_id, versionId: bundle.version.id, observationId: bundle.observation.id, position: row.position }, bundle)
  return <section className="piw-retained-inputs" aria-label="Find retained inputs">
    <h3>Find retained inputs</h3>
    <p className="piw-note">Search only the text retained in this saved observation. Titles, summaries, body text, labels, outlets, URLs and recorded source status are searched as a case-insensitive phrase. No external search or collection runs.</p>
    <form className="piw-input-search" onSubmit={event => { event.preventDefault(); setQuery(draft); setLimit(10) }}>
      <label className="piw-field">Search retained text<input type="search" maxLength={200} value={draft} onChange={event => setDraft(event.target.value)} /></label>
      <button className="piw-section-btn" type="submit">Search saved inputs</button>
      <button className="piw-text-btn" type="button" onClick={() => { setDraft(''); setQuery(''); setKind('all'); setLimit(10) }}>Clear search and filters</button>
    </form>
    <label className="piw-field piw-input-kind">Input type<select aria-label="Input type" value={kind} onChange={event => { setKind(event.target.value); setLimit(10) }}>
      <option value="all">All retained input types</option><option value="capture">Source captures</option><option value="record_version">Record versions</option>
    </select></label>
    <p role="status">{result.rows.length} of {index.rows.length} retained inputs{query.trim() ? ` match “${query.trim()}”` : ' shown by this filter'}. {Math.min(limit, result.rows.length)} displayed.</p>
    {draft !== query ? <p className="piw-note">Submit the edited text to update these results.</p> : null}
    {!result.rows.length ? <p>{index.rows.length ? 'No inputs match this saved-snapshot search. This is not evidence that nothing exists elsewhere.' : 'No retained inputs are available to inspect in this observation.'}</p> : null}
    <ol className="piw-input-results">{result.rows.slice(0, limit).map(row => <li key={row.position}>
      <div><strong>{row.title}</strong><p className="piw-note">{row.kind === 'capture' ? 'Source capture' : 'Record version'} · Position {row.position}</p>
        {row.matchedFields.length ? <p className="piw-note">Matched fields: {row.matchedFields.map(key => RETAINED_SEARCH_FIELDS[key]).join(', ')}.</p> : !row.fields.length ? <p className="piw-note">No searchable text is recorded for this input.</p> : null}
      </div><button className="piw-section-btn" type="button" disabled={!onOpenInput} onClick={() => open(row)}>Inspect retained input</button>
    </li>)}</ol>
    {result.rows.length > limit ? <button className="piw-text-btn" type="button" onClick={() => setLimit(n => n + 10)}>Show more inputs ({result.rows.length - limit} remaining)</button> : null}
    <p className="piw-note">Order is MIP input order, not publication or event chronology. Matches count retained inputs, not independent sources, confirmed claims or evidence strength.</p>
    {index.excluded ? <p className="piw-note">{index.excluded} retained entries have ambiguous or unavailable input identities and cannot be opened here. No replacement is guessed.</p> : null}
    {index.rows.some(row => !row.fields.length) ? <p className="piw-note">{index.rows.filter(row => !row.fields.length).length} input(s) have no searchable text in the listed fields. Clear search and filters to browse them.</p> : null}
  </section>
}

function Disclosure(props) {
  const [open, setOpen] = useState(false)
  return <details className="piw-linked-record" onToggle={event => { if (event.target === event.currentTarget) setOpen(event.currentTarget.open) }}>
    <summary>Browse and search saved inputs</summary>{open ? <Search {...props} /> : null}
  </details>
}

export default function InvestigationRetainedInputs(props) {
  const bundle = props.bundle
  return <Disclosure key={`${bundle?.investigation_id}:${bundle?.version?.id}:${bundle?.observation?.id}`} {...props} />
}

export function RetainedInputInspector({ bundle, selection }) {
  const row = selectedRetainedInput(bundle, selection)
  if (!row) return <p>The selected input is unavailable in this saved version. No current record is substituted.</p>
  const record = row.input.capture ?? row.input.record_version
  return <section><h3>Retained input</h3>
    <p className="piw-note">{row.kind === 'capture' ? 'Source capture' : 'Record version'} from revision {bundle.version.revision}. This is the saved record; text matches do not verify its claims.</p>
    <p className="piw-mono">Retained identity {row.id}</p>
    {['record_kind','record_id'].map(key => typeof record[key] === 'string' ? <p key={key}>{key === 'record_kind' ? 'Record type' : 'Underlying record identity'}: {record[key]}</p> : null)}
    {['label','outlet','source_status'].map(key => typeof record.payload?.[key] === 'string' ? <p key={key}>{RETAINED_SEARCH_FIELDS[key]}: {record.payload[key]}</p> : null)}
    <RetainedInputRecord input={row.input} position={row.position} bundle={bundle} />
  </section>
}
