import { useId, useLayoutEffect, useRef, useState } from 'react'
import { ArrowSquareOut, Buildings, CalendarBlank, ChartLineUp, Clock, FileText, Leaf, LinkSimple, MapPin, Stack, Users, X } from '@phosphor-icons/react'
import '../styles/world-view-billboard-prototype.css'
import { worldBillboardModuleTabs } from '../lib/worldViewBillboardModules.js'

const MODULE_ICONS = { evidence:FileText, context:Stack, sources:LinkSimple, event:CalendarBlank, people:Users, place:MapPin, market:ChartLineUp, environment:Leaf, infrastructure:Buildings, timelineRelationships:Clock }
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
  const overlayRef = useRef(null), cardRef = useRef(null), tetherRef = useRef(null), attachmentRef = useRef(null), gradientRef = useRef(null)
  const closeRef = useRef(null)
  const titleRef = useRef(null)
  const latestPaint = useRef(null), paintAttachment = useRef(null)
  const [titleScrollable, setTitleScrollable] = useState(false)
  const [tabState, setTabState] = useState({ key: selectedKey, tab: 'evidence' })
  const tabs = worldBillboardModuleTabs(model).map(entry => ({ ...entry, key:entry.id, Icon:MODULE_ICONS[entry.id] ?? Stack }))
  const tabScope = tabs.map(entry => entry.id).join('|')
  const readingScope = model?.readingKey ?? selectedKey
  const tab = tabState.key === readingScope && tabState.scope === tabScope && tabs.some(entry => entry.id === tabState.tab) ? tabState.tab : 'evidence'
  const modelCurrent = model && (model.key == null || model.key === selectedKey)
  const selected = modelCurrent && layout?.selected?.key === selectedKey ? layout.selected : null
  // Capture the renderer's projected canonical anchor at selection time. Frame,
  // camera and tab updates neither restart this entrance nor move its origin.
  if (!selected) entrance.current = { key: null, origin: null }
  else if (entrance.current.key !== readingScope) entrance.current = {
    key: readingScope,
    origin: Number.isFinite(selected.anchor?.x) && Number.isFinite(selected.anchor?.y)
      && Number.isFinite(selected.card?.x) && Number.isFinite(selected.card?.y)
      ? { x: selected.anchor.x - selected.card.x, y: selected.anchor.y - selected.card.y } : null,
  }
  const cluster = layout?.markers?.find(marker => marker.key === selectedKey && marker.state === 'cluster')
  const members = cluster ? asEntries(cluster.memberKeys).map(key => items.find(item => itemKey(item) === key)).filter(Boolean) : []
  const card = selected?.card
  latestPaint.current = { selected, cluster }
  // Measure only the painted card endpoint. The canonical projected anchor is
  // always the renderer's current value; no camera/time/selection is changed.
  paintAttachment.current = () => {
    const value = latestPaint.current
    if (!value?.selected?.tether || value.cluster || !cardRef.current || !overlayRef.current || !tetherRef.current) return
    const bounds = cardRef.current.getBoundingClientRect(), origin = overlayRef.current.getBoundingClientRect()
    const anchor = value.selected.anchor
    if (!Number.isFinite(anchor?.x) || !Number.isFinite(anchor?.y) || !bounds.width || !bounds.height) return
    const left = bounds.left-origin.left, top = bounds.top-origin.top, right = bounds.right-origin.left, bottom = bounds.bottom-origin.top
    let x = Math.min(right,Math.max(left,anchor.x)), y = Math.min(bottom,Math.max(top,anchor.y))
    if (anchor.x >= left && anchor.x <= right && anchor.y >= top && anchor.y <= bottom) {
      const edges = [{distance:anchor.x-left,x:left,y:anchor.y},{distance:right-anchor.x,x:right,y:anchor.y},
        {distance:anchor.y-top,x:anchor.x,y:top},{distance:bottom-anchor.y,x:anchor.x,y:bottom}].sort((a,b)=>a.distance-b.distance)
      x=edges[0].x;y=edges[0].y
    }
    tetherRef.current.setAttribute('x2',x);tetherRef.current.setAttribute('y2',y)
    attachmentRef.current?.setAttribute('cx',x);attachmentRef.current?.setAttribute('cy',y)
    gradientRef.current?.setAttribute('x2',x);gradientRef.current?.setAttribute('y2',y)
  }
  // Anchor/frame updates get one synchronous paint without restarting motion.
  useLayoutEffect(() => { paintAttachment.current?.() })
  useLayoutEffect(() => {
    const node = titleRef.current
    const measure = () => setTitleScrollable(Boolean(node && node.scrollHeight > node.clientHeight + 1))
    measure()
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [readingScope, model?.title, card?.width, card?.height])
  useLayoutEffect(() => {
    if ((!selected?.card && !cluster) || typeof document === 'undefined') return
    const previous = document.activeElement
    closeRef.current?.focus?.({preventScroll:true})
    return () => {
      // Closing the reader keeps canonical selection and the native plaque.
      // Restore an extant opener, without scrolling the camera or the page.
      if (previous?.isConnected && typeof previous.focus === 'function') previous.focus({preventScroll:true})
    }
  }, [readingScope, Boolean(selected?.card), Boolean(cluster)])
  useLayoutEffect(() => {
    if (!selected?.card || cluster || typeof window === 'undefined') return
    let frame = null, stopped = false, deadline = 0
    const node = cardRef.current
    const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const paint = now => {
      frame=null
      if (stopped || document.hidden) return
      paintAttachment.current?.()
      if (!reduced() && now < deadline) frame=requestAnimationFrame(paint)
    }
    const restart = () => {
      if (frame != null) cancelAnimationFrame(frame)
      frame=null
      if (stopped || document.hidden) return
      paintAttachment.current?.()
      // Visibility may interrupt the 220ms entrance or renderer relocation.
      // Resume attachment sampling for one fresh bounded window, never idle.
      deadline=performance.now()+260
      if (!reduced()) frame=requestAnimationFrame(paint)
    }
    const terminal = event => {
      if (event.target === node && !stopped && !document.hidden) paintAttachment.current?.()
    }
    // A headed compositor can begin motion after the visibility-return budget
    // has already expired. Track the card's real motion start, still bounded.
    const motionStart = event => { if (event.target === node) restart() }
    const startEvents = ['animationstart','transitionrun','transitionstart']
    restart()
    document.addEventListener('visibilitychange',restart)
    for (const name of startEvents) node?.addEventListener(name,motionStart)
    node?.addEventListener('animationend',terminal)
    node?.addEventListener('transitionend',terminal)
    return () => {
      stopped=true;if(frame != null) cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange',restart)
      for (const name of startEvents) node?.removeEventListener(name,motionStart)
      node?.removeEventListener('animationend',terminal);node?.removeEventListener('transitionend',terminal)
    }
  }, [readingScope, card?.x, card?.y, card?.width, card?.height, Boolean(cluster), tab])
  const activate = callback => callback?.()
  const closeOnEscape = event => {
    if (event.key === 'Escape') { event.stopPropagation(); onClose?.() }
  }
  const moveTab = (event, key) => {
    const index = tabs.findIndex(candidate => candidate.key === key)
    let next
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
    if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = tabs.length - 1
    if (next == null) return
    event.preventDefault(); event.stopPropagation()
    const nextKey = tabs[next].key
    setTabState({ key: readingScope, tab: nextKey, scope:tabScope }); tabRefs.current[nextKey]?.focus({preventScroll:true}); tabRefs.current[nextKey]?.scrollIntoView?.({block:'nearest',inline:'nearest'})
  }
  if (!cluster && (!selected?.card || !model || (model.key != null && model.key !== selectedKey))) return null
  const clusterPosition = cluster && { left: cluster.x, top: cluster.y }
  const module = tabs.find(entry => entry.id === tab)?.content
  const metadata = Array.isArray(model?.metadata) ? model.metadata : []
  const media = model?.media
  const title = suppliedText(model?.title)
  const mediaSource = safeUrl(media?.sourceUrl)
  const compact = card?.height < 280
  const gradientId = `${prefix.replaceAll(':', '')}-tether-gradient`
  const tetherLength = selected?.tether ? Math.hypot(selected.tether.x2-selected.tether.x1,selected.tether.y2-selected.tether.y1) : 0
  const tetherOpacity = tetherLength > 600 ? .58 : tetherLength > 300 ? .72 : .88
  const summary = <div className="wv-billboard-summary">
    {typeof media?.src === 'string' && media.src && suppliedText(media.sourceLabel) && <figure><img src={media.src} alt={suppliedText(media.alt) ?? ''} />
      {suppliedText(media.sourceLabel) && <figcaption>{mediaSource ? <a href={mediaSource} target="_blank" rel="noreferrer">{media.sourceLabel}</a> : media.sourceLabel}</figcaption>}
    </figure>}
    {metadata.length > 0 && <dl>{metadata.map((field, index) => <div key={field.id ?? index}><dt>{suppliedText(field.label)}</dt><dd>{suppliedText(field.value)}</dd></div>)}</dl>}
  </div>
  return <div ref={overlayRef} className="wv-billboard-overlay" data-interaction-enabled={interactionEnabled} onKeyDown={closeOnEscape}>
    {!cluster && selected?.tether && <svg className="wv-billboard-tether" aria-hidden="true" width="100%" height="100%" data-occluded={selected.occluded === true} style={{'--wv-tether-opacity':tetherOpacity}}>
      <defs><linearGradient ref={gradientRef} id={gradientId} gradientUnits="userSpaceOnUse" x1={selected.tether.x1} y1={selected.tether.y1} x2={selected.tether.x2} y2={selected.tether.y2}>
        <stop offset="0%" stopColor="#97e5df" stopOpacity=".88"/><stop offset="38%" stopColor="#97e5df" stopOpacity=".14"/><stop offset="62%" stopColor="#97e5df" stopOpacity=".14"/><stop offset="100%" stopColor="#97e5df" stopOpacity=".88"/>
      </linearGradient></defs>
      <line ref={tetherRef} style={{stroke:`url(#${gradientId})`}} x1={selected.tether.x1} y1={selected.tether.y1} x2={selected.tether.x2} y2={selected.tether.y2} />
      <circle className="wv-billboard-tether-anchor" cx={selected.tether.x1} cy={selected.tether.y1} r="3"/>
      <circle ref={attachmentRef} className="wv-billboard-tether-attachment" cx={selected.tether.x2} cy={selected.tether.y2} r="2.5"/>
    </svg>}
    {cluster ? <aside className="wv-billboard-cluster" style={clusterPosition} aria-labelledby={`${prefix}-cluster-title`}>
      <header><div><span className="wv-billboard-eyebrow">Inspect group</span><h3 id={`${prefix}-cluster-title`}>Choose a recorded member</h3></div>
        <button ref={closeRef} type="button" className="wv-billboard-icon-button" aria-label="Close group choices" onClick={() => activate(onClose)}><X aria-hidden="true" size={18} /></button></header>
      <ul>{members.map(item => <li key={itemKey(item)}><button type="button" disabled={typeof onSelect !== 'function'} onClick={() => onSelect?.(itemKey(item))}>
        <span>{suppliedText(item.title ?? item.label ?? itemKey(item))}</span>{suppliedText(item.precision) && <small>{suppliedText(item.precision)}</small>}
      </button></li>)}</ul>
      {!members.length && <p className="wv-billboard-empty">No supplied members available.</p>}
    </aside> : <aside ref={cardRef} key={readingScope} className="wv-billboard-card" style={{ left: card.x, top: card.y, width: card.width, maxHeight: card.height,
      transformOrigin: entrance.current.origin ? `${entrance.current.origin.x}px ${entrance.current.origin.y}px` : undefined }}
      aria-labelledby={`${prefix}-title`} data-selected-key={selectedKey} data-compact={compact} data-anchor-entrance={Boolean(entrance.current.origin)}>
      <header><div>{suppliedText(model.chip) && <span className="wv-billboard-eyebrow">{suppliedText(model.chip)}</span>}<h3 ref={titleRef} id={`${prefix}-title`} tabIndex={titleScrollable ? 0 : undefined}>{title}</h3>{suppliedText(model.locationScope) && <span className="wv-billboard-scope-cue" title={suppliedText(model.scopeCue) ?? undefined}>{suppliedText(model.locationScope)}</span>}{selected.occluded && <span className="wv-billboard-occlusion-cue" title="The canonical anchor is occluded. The selected reader retains its geographic tether.">Canonical anchor occluded</span>}{typeof selected.displayOccluded === 'boolean' && <span className="wv-billboard-stem-cue">{selected.displayOccluded ? 'Display marker occluded' : 'Display marker visible'}</span>}</div>
        <button ref={closeRef} type="button" className="wv-billboard-icon-button" aria-label="Close selected card" onClick={() => activate(onClose)}><X aria-hidden="true" size={18} /></button></header>
      {!compact && summary}
      <div className="wv-billboard-tabs" role="tablist" aria-label="Selected record modules">{tabs.map(({ key, label, Icon }) => <button key={key} ref={element => { tabRefs.current[key] = element }}
        type="button" role="tab" id={`${prefix}-${key}-tab`} aria-controls={`${prefix}-module-panel`} aria-selected={tab === key} tabIndex={tab === key ? 0 : -1}
        onClick={() => activate(() => setTabState({ key: readingScope, tab: key, scope:tabScope }))} onKeyDown={event => moveTab(event, key)}><Icon aria-hidden="true" size={15} />{label}</button>)}</div>
      <div className="wv-billboard-module-body" role="tabpanel" id={`${prefix}-module-panel`} aria-labelledby={`${prefix}-${tab}-tab`} tabIndex={0}>
        {compact && tab === 'evidence' && summary}
        <ModuleContent content={module} interactionEnabled />
        {tab === 'sources' && <References references={model.sourceRefs ?? model.references} interactionEnabled />}
      </div>
      <footer><button type="button" className="wv-billboard-inspect" disabled={typeof onInspect !== 'function'} onClick={() => activate(() => onInspect(model))}>Open inspector<ArrowSquareOut aria-hidden="true" size={16} /></button></footer>
    </aside>}
  </div>
}
