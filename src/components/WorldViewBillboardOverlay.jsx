import { useId, useRef, useState } from 'react'
import { ArrowSquareOut, FileText, LinkSimple, Stack, X } from '@phosphor-icons/react'
import '../styles/world-view-billboard-prototype.css'

const TABS = [
  { key: 'evidence', label: 'Evidence', Icon: FileText },
  { key: 'context', label: 'Context', Icon: Stack },
  { key: 'sources', label: 'Sources', Icon: LinkSimple },
]
const suppliedText = value => typeof value === 'string' || typeof value === 'number' ? String(value) : null
const safeUrl = value => typeof value === 'string' && /^https?:\/\//i.test(value) ? value : null
const itemKey = item => item?.key ?? item?.id
const asEntries = value => value == null ? [] : Array.isArray(value) ? value : [value]

function References({ references, interactionEnabled }) {
  return <ul className="wv-billboard-references">{asEntries(references).map((reference, index) => {
    const text = suppliedText(reference)
    const href = safeUrl(reference?.href ?? reference?.url ?? reference?.source_url)
    const label = text ?? suppliedText(reference?.label ?? reference?.title ?? href)
    if (!label) return null
    return <li key={reference?.id ?? index}>{href && interactionEnabled
      ? <a href={href} target="_blank" rel="noreferrer"><LinkSimple aria-hidden="true" size={14} />{label}</a>
      : <span>{label}</span>}</li>
  })}</ul>
}

function ModuleContent({ content, interactionEnabled }) {
  const entries = asEntries(content)
  if (!entries.length) return <p className="wv-billboard-empty">No supplied information in this module.</p>
  return <div className="wv-billboard-module-entries">{entries.map((entry, index) => {
    const text = suppliedText(entry)
    if (text != null) return <p key={index}>{text}</p>
    if (!entry || typeof entry !== 'object') return null
    const label = suppliedText(entry.label ?? entry.title)
    const value = suppliedText(entry.value ?? entry.text ?? entry.description)
    const fields = Array.isArray(entry.fields) ? entry.fields : []
    return <section key={entry.id ?? index} className="wv-billboard-module-entry">
      {label && <h4>{label}</h4>}{value != null && <p>{value}</p>}
      {fields.length > 0 && <dl>{fields.map((field, fieldIndex) => <div key={field.id ?? fieldIndex}>
        <dt>{suppliedText(field.label)}</dt><dd>{suppliedText(field.value)}</dd>
      </div>)}</dl>}
      <References references={entry.sourceRefs ?? entry.references} interactionEnabled={interactionEnabled} />
    </section>
  })}</div>
}

/** Renderer owns all scene markers and geometry. This overlay owns selected reading UI only.
 * Cluster click contract: renderer sets selectedKey to a cluster marker key. A member
 * choice invokes onSelect(memberKey); it does not choose a hidden original automatically.
 * Tabs never call selection, camera or recorded-time callbacks.
 * interactionEnabled describes renderer-owned world picking; explicit current visible
 * member choices, close, source links and inspector remain usable while gestures pause.
 */
export default function WorldViewBillboardOverlay({ layout, items = [], selectedKey, model, onSelect, onClose, onInspect, interactionEnabled = false }) {
  const prefix = useId()
  const tabRefs = useRef({})
  const entrance = useRef({ key: null, origin: null })
  const [tabState, setTabState] = useState({ key: selectedKey, tab: 'evidence' })
  const tab = tabState.key === selectedKey ? tabState.tab : 'evidence'
  const selected = layout?.selected?.key === selectedKey ? layout.selected : null
  // Capture the renderer's projected canonical anchor at selection time. Frame,
  // camera and tab updates neither restart this entrance nor move its origin.
  if (!selected) entrance.current = { key: null, origin: null }
  else if (entrance.current.key !== selectedKey) entrance.current = {
    key: selectedKey,
    origin: Number.isFinite(selected.anchor?.x) && Number.isFinite(selected.anchor?.y)
      && Number.isFinite(selected.card?.x) && Number.isFinite(selected.card?.y)
      ? { x: selected.anchor.x - selected.card.x, y: selected.anchor.y - selected.card.y } : null,
  }
  const cluster = layout?.markers?.find(marker => marker.key === selectedKey && marker.state === 'cluster')
  const members = cluster ? asEntries(cluster.memberKeys).map(key => items.find(item => itemKey(item) === key)).filter(Boolean) : []
  const activate = callback => callback?.()
  const closeOnEscape = event => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose?.() }
  }
  const moveTab = (event, key) => {
    const index = TABS.findIndex(candidate => candidate.key === key)
    let next
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length
    if (event.key === 'ArrowLeft') next = (index + TABS.length - 1) % TABS.length
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = TABS.length - 1
    if (next == null) return
    event.preventDefault(); event.stopPropagation()
    const nextKey = TABS[next].key
    setTabState({ key: selectedKey, tab: nextKey }); tabRefs.current[nextKey]?.focus()
  }
  if (!cluster && (!selected?.card || !model || (model.key != null && model.key !== selectedKey))) return null
  const card = selected?.card
  const clusterPosition = cluster && { left: cluster.x, top: cluster.y }
  const module = Array.isArray(model?.modules)
    ? model.modules.filter(entry => (entry.kind ?? entry.classification ?? entry.id) === tab)
    : model?.modules?.[tab]
  const metadata = Array.isArray(model?.metadata) ? model.metadata : []
  const media = model?.media
  const title = suppliedText(model?.title)
  const mediaSource = safeUrl(media?.sourceUrl)
  const compact = card?.height < 280
  const summary = <div className="wv-billboard-summary">
    {typeof media?.src === 'string' && media.src && suppliedText(media.sourceLabel) && <figure><img src={media.src} alt={suppliedText(media.alt) ?? ''} />
      {suppliedText(media.sourceLabel) && <figcaption>{mediaSource ? <a href={mediaSource} target="_blank" rel="noreferrer">{media.sourceLabel}</a> : media.sourceLabel}</figcaption>}
    </figure>}
    {metadata.length > 0 && <dl>{metadata.map((field, index) => <div key={field.id ?? index}><dt>{suppliedText(field.label)}</dt><dd>{suppliedText(field.value)}</dd></div>)}</dl>}
  </div>
  return <div className="wv-billboard-overlay" data-interaction-enabled={interactionEnabled} onKeyDown={closeOnEscape}>
    {!cluster && selected?.tether && <svg className="wv-billboard-tether" aria-hidden="true" width="100%" height="100%" data-occluded={selected.occluded === true}>
      <line x1={selected.tether.x1} y1={selected.tether.y1} x2={selected.tether.x2} y2={selected.tether.y2} />
    </svg>}
    {cluster ? <aside className="wv-billboard-cluster" style={clusterPosition} aria-labelledby={`${prefix}-cluster-title`}>
      <header><div><span className="wv-billboard-eyebrow">Inspect group</span><h3 id={`${prefix}-cluster-title`}>Choose a recorded member</h3></div>
        <button type="button" className="wv-billboard-icon-button" aria-label="Close group choices" onClick={() => activate(onClose)}><X aria-hidden="true" size={18} /></button></header>
      <ul>{members.map(item => <li key={itemKey(item)}><button type="button" disabled={typeof onSelect !== 'function'} onClick={() => onSelect?.(itemKey(item))}>
        <span>{suppliedText(item.title ?? item.label ?? itemKey(item))}</span>{suppliedText(item.precision) && <small>{suppliedText(item.precision)}</small>}
      </button></li>)}</ul>
      {!members.length && <p className="wv-billboard-empty">No supplied members available.</p>}
    </aside> : <aside key={selectedKey} className="wv-billboard-card" style={{ left: card.x, top: card.y, width: card.width, maxHeight: card.height,
      transformOrigin: entrance.current.origin ? `${entrance.current.origin.x}px ${entrance.current.origin.y}px` : undefined }}
      aria-labelledby={`${prefix}-title`} data-selected-key={selectedKey} data-compact={compact} data-anchor-entrance={Boolean(entrance.current.origin)}>
      <header><div>{suppliedText(model.chip) && <span className="wv-billboard-eyebrow">{suppliedText(model.chip)}</span>}<h3 id={`${prefix}-title`}>{title}</h3></div>
        <button type="button" className="wv-billboard-icon-button" aria-label="Close selected card" onClick={() => activate(onClose)}><X aria-hidden="true" size={18} /></button></header>
      {!compact && summary}
      <div className="wv-billboard-tabs" role="tablist" aria-label="Selected record modules">{TABS.map(({ key, label, Icon }) => <button key={key} ref={element => { tabRefs.current[key] = element }}
        type="button" role="tab" id={`${prefix}-${key}-tab`} aria-controls={`${prefix}-module-panel`} aria-selected={tab === key} tabIndex={tab === key ? 0 : -1}
        onClick={() => activate(() => setTabState({ key: selectedKey, tab: key }))} onKeyDown={event => moveTab(event, key)}><Icon aria-hidden="true" size={15} />{label}</button>)}</div>
      <div className="wv-billboard-module-body" role="tabpanel" id={`${prefix}-module-panel`} aria-labelledby={`${prefix}-${tab}-tab`} tabIndex={0}>
        {compact && tab === 'evidence' && summary}
        <ModuleContent content={module} interactionEnabled />
        {tab === 'sources' && <References references={model.sourceRefs ?? model.references} interactionEnabled />}
      </div>
      <footer><button type="button" className="wv-billboard-inspect" disabled={typeof onInspect !== 'function'} onClick={() => activate(() => onInspect(model))}>Open inspector<ArrowSquareOut aria-hidden="true" size={16} /></button></footer>
    </aside>}
  </div>
}
