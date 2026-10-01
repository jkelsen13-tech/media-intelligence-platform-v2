import { useEffect, useId, useRef, useState } from 'react'
import { DEFAULT_WORLD_VIEW_CONTEXT_LAYERS, normalizeWorldViewContextLayers, positionWorldViewSpatialContextCard, WORLD_VIEW_CONTEXT_FAMILIES } from '../lib/worldViewSpatialContext.js'
import '../styles/world-view-spatial-context.css'

export function WorldViewContextLayerControls({ value = DEFAULT_WORLD_VIEW_CONTEXT_LAYERS, onChange }) {
  const layers = normalizeWorldViewContextLayers(value)
  return <fieldset className="wv-context-layers">
    <legend>Context layers</legend>
    <p>Layer visibility controls which sourced indicators are eligible in the scene.</p>
    <div>{WORLD_VIEW_CONTEXT_FAMILIES.map(({ key, label }) => <label key={key}>
      <input type="checkbox" checked={layers[key]} onChange={event => onChange?.({ ...layers, [key]: event.target.checked })} />
      {label}
    </label>)}</div>
  </fieldset>
}

function Reference({ reference }) {
  if (typeof reference === 'string') return <span>{reference}</span>
  const url = reference?.url ?? reference?.source_url
  const safeUrl = typeof url === 'string' && /^https?:\/\//i.test(url) ? url : null
  const label = reference?.label ?? reference?.referenceId ?? safeUrl
  return <>{safeUrl && <a href={safeUrl} target="_blank" rel="noreferrer">{label}</a>}
    <pre>{JSON.stringify(reference, null, 2)}</pre></>
}

function ContextModule({ module, open, onToggle, prefix }) {
  const id = `${prefix}-${encodeURIComponent(module.id)}`
  return <section className="wv-context-module" data-context-module={module.id} data-classification={module.classification}>
    <h4><button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle}>
      <span>{module.title}</span><span className="wv-context-kind">{module.classification === 'context' ? 'Context' : 'Evidence'}{module.status === 'unavailable' ? ' · unavailable' : ''}</span>
      <span aria-hidden="true">{open ? '−' : '+'}</span>
    </button></h4>
    <div id={id} hidden={!open}>
      <dl>{module.fields.map((field, index) => <div key={`${field.label}-${index}`}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>
      {module.references.length > 0 && <><h5>Supplied references</h5><ul>{module.references.map((reference, index) => <li key={index}><Reference reference={reference} /></li>)}</ul></>}
      {module.provenance && <><h5>Supplied provenance</h5><pre>{JSON.stringify(module.provenance, null, 2)}</pre></>}
    </div>
  </section>
}

const initialState = key => ({ key, expanded: false, modules: {} })

/** One selected context. Anchor and viewport are renderer-owned container pixels. */
export default function WorldViewSpatialContextCard({ model, anchor, viewport, onClose, onInspect, compact = false }) {
  const prefix = useId()
  const wrapper = useRef(null)
  const expandButton = useRef(null)
  const [measured, setMeasured] = useState(null)
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 640px)').matches === true)
  const [local, setLocal] = useState(() => initialState(model?.key))
  useEffect(() => { setLocal(initialState(model?.key)) }, [model?.key])
  const state = local.key === model?.key ? local : initialState(model?.key)
  const mobile = compact || narrow
  const change = update => setLocal(previous => update(previous.key === model?.key ? previous : initialState(model?.key)))
  useEffect(() => {
    const media = typeof window !== 'undefined' ? window.matchMedia?.('(max-width: 640px)') : null
    if (!media) return undefined
    const changed = () => setNarrow(media.matches)
    changed(); media.addEventListener?.('change', changed)
    return () => media.removeEventListener?.('change', changed)
  }, [])
  useEffect(() => {
    if (viewport) return undefined
    const parent = wrapper.current?.parentElement
    if (!parent) return undefined
    const measure = () => setMeasured({ width: parent.clientWidth, height: parent.clientHeight })
    measure()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    observer?.observe(parent)
    return () => observer?.disconnect()
  }, [viewport, model?.available])
  const size = viewport ?? measured
  // Leave the native attribution strip accessible below selected overlays.
  const cardViewport = size ? { ...size, height: Math.max(0, size.height - 48) } : size
  const position = positionWorldViewSpatialContextCard(anchor, cardViewport, { width: mobile ? 240 : 320, height: mobile ? 144 : 320 })
  const shownModules = (model?.modules ?? []).filter(module => module.family == null || model.families.some(family => family.key === module.family && family.eligible))
  const dismissSheet = () => { change(current => ({ ...current, expanded: false })); expandButton.current?.focus() }
  const escape = event => {
    if (event.key !== 'Escape') return
    event.stopPropagation()
    if (mobile && state.expanded) dismissSheet()
    else onClose?.()
  }
  if (!model?.available) return null
  return <div ref={wrapper} className="wv-spatial-context" data-mobile={mobile} data-subject-key={model.key} onKeyDown={escape}
    style={size ? { width: size.width, height: size.height, right: 'auto', bottom: 'auto' } : undefined}>
    {position && model.indicator.exists ? <>
      <svg className="wv-context-leader" width={size.width} height={size.height} aria-hidden="true">
        <line {...position.leader} /><circle cx={anchor.x} cy={anchor.y} r="4" />
      </svg>
      <aside className="wv-context-card" aria-label="Selected spatial context" style={{ left: position.x, top: position.y, width: position.width, maxHeight: position.maxHeight }}>
        <header><div><span className="wv-context-eyebrow">Selected context</span><h3>{model.title}</h3></div>
          <button type="button" className="wv-context-close" aria-label="Close spatial context" onClick={() => onClose?.()}>×</button>
        </header>
        {mobile ? <button type="button" ref={expandButton} aria-expanded={state.expanded} aria-controls={`${prefix}-sheet`} onClick={() => change(current => ({ ...current, expanded: !current.expanded }))}>Explore context · {shownModules.length} sections</button>
          : <div className="wv-context-sections">{shownModules.map(module => <ContextModule key={module.id} module={module}
            prefix={prefix} open={state.modules[module.id] ?? module.id === 'event'} onToggle={() => change(current => ({ ...current, modules: { ...current.modules, [module.id]: !(current.modules[module.id] ?? module.id === 'event') } }))} />)}
            {onInspect && <button type="button" className="wv-context-inspect" onClick={() => onInspect(model)}>Open investigation inspector</button>}</div>}
      </aside>
    </> : onInspect && <button type="button" className="wv-context-selected-affordance" onClick={() => onInspect(model)}>Inspect selected context</button>}
    {mobile && <aside id={`${prefix}-sheet`} hidden={!state.expanded} className="wv-context-sheet" aria-label="Selected context details">
      <header><h3>{model.title}</h3><button type="button" className="wv-context-close" aria-label="Collapse context details" onClick={dismissSheet}>×</button></header>
      <p className="wv-context-note">Context remains separate from evidence. Each section retains its supplied reference time and geography.</p>
      <div className="wv-context-sections">{shownModules.map(module => <ContextModule key={module.id} module={module} prefix={`${prefix}-sheet`}
        open={state.modules[module.id] ?? module.id === 'event'} onToggle={() => change(current => ({ ...current, modules: { ...current.modules, [module.id]: !(current.modules[module.id] ?? module.id === 'event') } }))} />)}</div>
      {onInspect && <button type="button" className="wv-context-inspect" onClick={() => onInspect(model)}>Open investigation inspector</button>}
    </aside>}
  </div>
}
