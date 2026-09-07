import { useEffect, useRef, useState } from 'react'
import { sourceSpansMatch, sourceSpanSelection } from '../lib/investigationSourceSpansClient.js'
import { RetainedInputDates, RetainedInputRecord } from './InvestigationAssessmentTrail.jsx'

const labels = { title: 'Title', summary: 'Summary', body_text: 'Body text' }
const messages = { equal: 'Exact match.', text_unavailable: 'Text is not recorded on both sides. Missing text is not a deletion.',
  limit_exceeded: 'The text exceeds the bounded span-comparison limit. Use the retained field comparison below.' }

function SpanText({ selection }) {
  const [full, setFull] = useState(false)
  const { points, reference } = selection, start = reference.span_start, end = reference.span_end
  const clipEnd = full ? end : Math.min(end, start + 1200)
  return <>
    <blockquote className="piw-retained-body piw-span-text">
      {start > 80 ? '…' : ''}{points.slice(Math.max(0, start - 80), start).join('')}
      {start === end ? <span className="piw-span-empty" aria-label="Empty changed interval" /> : <mark>{points.slice(start, clipEnd).join('')}</mark>}
      {clipEnd < end ? '…' : ''}{points.slice(end, end + 80).join('')}{end + 80 < points.length ? '…' : ''}
    </blockquote>
    {start === end ? <p className="piw-note">No text at this boundary. The changed interval is empty on this side.</p> : null}
    <p className="piw-mono">Code points [{start}, {end}) · Position {reference.position}</p>
    {end - start > 1200 ? <button type="button" className="piw-text-btn" onClick={() => setFull(!full)}>{full ? 'Show shorter interval' : 'Show full changed interval'}</button> : null}
    {clipEnd < end ? <p className="piw-note">Changed interval preview is shortened. The boundary and full retained field remain exact.</p> : null}
  </>
}

export function SourceSpanInspector({ bundle, selection }) {
  const [recordOpen, setRecordOpen] = useState(false)
  if (selection?.versionId !== bundle?.version?.id || selection?.observationId !== bundle?.observation?.id) return <p>The selected text belongs to a different saved version.</p>
  const resolved = sourceSpanSelection(bundle, selection.position, selection.field, selection.span)
  if (!resolved) return <p>Selected retained text is unavailable.</p>
  return <section><h3>Selected text difference</h3>
    <p className="piw-note">An exact text comparison, not a saved evidence judgment. A difference alone does not establish a correction or contradiction.</p>
    <SpanText selection={resolved} /><RetainedInputDates input={resolved.input} />
    <details className="piw-linked-record" onToggle={event => { if (event.target === event.currentTarget) setRecordOpen(event.currentTarget.open) }}><summary>Open full retained record</summary>{recordOpen ? <RetainedInputRecord input={resolved.input} position={selection.position} bundle={bundle} /> : null}</details>
  </section>
}

function SpanField({ row, bundle, leftPosition, rightPosition, onOpenSpan }) {
  const [open, setOpen] = useState(false)
  return <details className="piw-source-field" onToggle={event => { if (event.target === event.currentTarget) setOpen(event.currentTarget.open) }}>
    <summary>{labels[row.field]} · {row.status === 'different' ? 'Changed interval' : row.status === 'equal' ? 'Exact match' : 'Not compared'}</summary>
    {open ? row.status !== 'different' ? <p>{messages[row.status]}</p> : <div className="piw-source-pair">{[['First capture', leftPosition, row.left], ['Second capture', rightPosition, row.right]].map(([label, position, span]) => {
      const selection = sourceSpanSelection(bundle, position, row.field, span)
      return <div key={label}><h5>{label}</h5><SpanText selection={selection} />
        {onOpenSpan ? <button type="button" className="piw-text-btn" onClick={() => onOpenSpan({ position, field: row.field, span, versionId: bundle.version.id, observationId: bundle.observation.id }, bundle)}>Open this text in inspector</button> : null}
      </div>
    })}</div> : null}
  </details>
}

export default function InvestigationSourceSpans({ bundle, leftPosition, rightPosition, client, onAccessFailure, onOpenSpan }) {
  const identity = `${bundle.investigation_id}:${bundle.version.id}:${bundle.observation.id}:${leftPosition}:${rightPosition}`
  const current = useRef(identity), serial = useRef(0)
  current.current = identity
  const [state, setState] = useState({ status: 'idle' })
  useEffect(() => { setState({ status: 'idle' }); return () => { serial.current++ } }, [identity, client])
  const read = async () => {
    const token = ++serial.current, key = identity
    setState({ status: 'loading', key })
    let result
    try { result = await client.read(bundle.investigation_id, bundle.version.id, leftPosition, rightPosition) } catch { result = null }
    if (token !== serial.current || current.current !== key) return
    if (result?.error || !result) {
      setState({ status: 'error', key })
      if (['authentication_required', 'access_denied'].includes(result?.error?.code)) onAccessFailure?.(result.error.code, bundle)
    } else if (!sourceSpansMatch(bundle, leftPosition, rightPosition, result.data)) setState({ status: 'mismatch', key })
    else setState({ status: 'ready', key, data: result.data })
  }
  if (!client) return null
  const visible = state.key === identity ? state : { status: 'idle' }
  return <div className="piw-source-spans">
    <button type="button" className="piw-section-btn" disabled={visible.status === 'loading'} onClick={read}>{visible.status === 'loading' ? 'Comparing saved text…' : 'Highlight changed text'}</button>
    <p className="piw-note">Compares title, summary and body text from these two retained captures. The interval covers all differences and may include unchanged words between them. It does not determine meaning or derivation.</p>
    {visible.status === 'loading' ? <p role="status">Reading this saved capture pair.</p> : null}
    {['error', 'mismatch'].includes(visible.status) ? <p role="alert">{visible.status === 'mismatch' ? 'The returned spans do not match these saved captures. No highlights are shown.' : 'Text comparison is unavailable. Retry the lookup.'}</p> : null}
    {visible.status === 'ready' ? <div data-source-spans="ready">{visible.data.fields.map(row => <SpanField key={row.field} row={row} bundle={bundle} leftPosition={leftPosition} rightPosition={rightPosition} onOpenSpan={onOpenSpan} />)}</div> : null}
  </div>
}
