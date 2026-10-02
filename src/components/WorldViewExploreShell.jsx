import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createExploreSession } from '../lib/worldViewExploreState.js'
import '../styles/world-view-explore.css'

const restoreMessages = {
  'context-changed': 'Investigation or recorded time changed. The current selection and camera are retained; the earlier camera was not restored.',
  'invalid-context': 'The current investigation is retained. The earlier camera could not be safely matched.',
  'invalid-camera': 'Explore closed. No valid earlier camera was available to restore.',
  'restore-unavailable': 'Explore closed. Camera restoration is unavailable in this renderer.',
  'restore-rejected': 'Explore closed. This renderer could not restore the earlier camera.',
  'restore-failed': 'Explore closed. The earlier camera could not be restored.',
}

function captureScrollAncestors(element) {
  const positions = []
  for (let parent = element?.parentElement; parent; parent = parent.parentElement) {
    positions.push({ element: parent, left: parent.scrollLeft, top: parent.scrollTop })
  }
  return positions
}

/** Wrap the existing map ONCE, outside conditional mode/layout branches. */
export default function WorldViewExploreShell({
  children, controls, status, context, preview, attribution,
  prototypeEnabled = false, initialDirection = 'immersive',
  contextToken, recordedTimeLabel, cameraAdapter,
  interactionEnabled, onInteractionChange, onExploreChange, onRestoreResult, contextRequest = 0,
}) {
  const [active, setActive] = useState(false)
  const [direction, setDirection] = useState(initialDirection === 'dock' ? 'dock' : 'immersive')
  const [localInteraction, setLocalInteraction] = useState(false)
  const [contextExpanded, setContextExpanded] = useState(false)
  const [controlsExpanded, setControlsExpanded] = useState(false)
  const [notice, setNotice] = useState('')
  const interacting = interactionEnabled ?? localInteraction
  const shellRef = useRef(null)
  const surfaceRef = useRef(null)
  const entryRef = useRef(null)
  const closeRef = useRef(null)
  const returnFocusRef = useRef(null)
  const returnFocusPendingRef = useRef(false)
  const scrollAncestorsRef = useRef([])
  const sessionRef = useRef(null)
  if (!sessionRef.current) sessionRef.current = createExploreSession()
  const latestRef = useRef(null)
  latestRef.current = { contextToken, cameraAdapter, onInteractionChange, onExploreChange, onRestoreResult }
  const id = useId()

  const setInteraction = useCallback(enabled => {
    setLocalInteraction(enabled)
    latestRef.current.onInteractionChange?.(enabled)
  }, [])

  const exit = useCallback(() => {
    if (!sessionRef.current.getSnapshot()) return
    const latest = latestRef.current
    const result = sessionRef.current.exit({
      contextToken: latest.contextToken,
      restoreCamera: latest.cameraAdapter?.setCameraState ? state => latest.cameraAdapter.setCameraState(state) : undefined,
    })
    setInteraction(false)
    setActive(false)
    setControlsExpanded(false)
    setContextExpanded(false)
    setNotice(restoreMessages[result.reason] ?? '')
    latest.onExploreChange?.(false)
    latest.onRestoreResult?.(result)
    // The entry control is hidden until the inactive layout commits. Focus
    // it from the inactive effect after scroll ownership has been released.
    returnFocusPendingRef.current = true
  }, [setInteraction])

  const enter = () => {
    let cameraState = null
    try { cameraState = latestRef.current.cameraAdapter?.getCameraState?.() ?? null } catch { /* fail safe */ }
    returnFocusRef.current = typeof document === 'undefined' ? entryRef.current : document.activeElement
    scrollAncestorsRef.current = captureScrollAncestors(shellRef.current)
    sessionRef.current.enter({
      cameraState,
      contextToken: latestRef.current.contextToken,
      scrollPosition: { x: typeof window === 'undefined' ? 0 : window.scrollX, y: typeof window === 'undefined' ? 0 : window.scrollY },
    })
    setNotice('')
    setInteraction(false)
    setActive(true)
    latestRef.current.onExploreChange?.(true)
  }

  useEffect(() => {
    if (active && sessionRef.current.observe(contextToken)) {
      setNotice('Investigation or recorded time changed. Exit will retain the current camera and selection.')
    }
  }, [active, contextToken])

  useEffect(() => { if (active && !prototypeEnabled) exit() }, [prototypeEnabled, active, exit])

  useEffect(() => {
    if (active && contextRequest > 0) {
      setInteraction(false)
      setContextExpanded(true)
    }
  }, [contextRequest, active, setInteraction])

  useEffect(() => {
    if (!active || typeof document === 'undefined' || typeof window === 'undefined') return undefined
    const body = document.body
    const root = document.documentElement
    const previousBodyOverflow = body.style.overflow
    const previousRootOverflow = root.style.overflow
    const scroll = sessionRef.current.getSnapshot()?.scrollPosition
    body.style.overflow = 'hidden'
    root.style.overflow = 'hidden'
    closeRef.current?.focus?.({ preventScroll: true })
    const handleKey = event => {
      const keyboard = keyboardRef.current
      if (event.key === 'Escape') {
        event.preventDefault()
        if (keyboard.controlsExpanded) { setControlsExpanded(false); return }
        if (keyboard.contextExpanded) { setContextExpanded(false); return }
        if (keyboard.interacting) { keyboard.setInteraction(false); return }
        keyboard.exit()
      }
      if (event.key === 'Tab') {
        const candidates = [...(surfaceRef.current?.querySelectorAll('button, a[href], input, select, textarea, [tabindex="0"]') ?? [])]
          .filter(element => !element.disabled && element.getClientRects().length > 0)
        const first = candidates[0], last = candidates.at(-1)
        if (!first) { event.preventDefault(); return }
        if (event.shiftKey && (document.activeElement === first || !surfaceRef.current?.contains(document.activeElement))) {
          event.preventDefault(); last.focus()
        } else if (!event.shiftKey && (document.activeElement === last || !surfaceRef.current?.contains(document.activeElement))) {
          event.preventDefault(); first.focus()
        }
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('keydown', handleKey)
      body.style.overflow = previousBodyOverflow
      root.style.overflow = previousRootOverflow
      for (const position of scrollAncestorsRef.current) {
        position.element.scrollLeft = position.left
        position.element.scrollTop = position.top
      }
      if (scroll) window.scrollTo?.(scroll.x, scroll.y)
    }
  // Keep document ownership for the visit. Keyboard reads the current UI via a
  // separate ref so expanding a panel cannot unlock/relock or shift the page.
  }, [active]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (active || !returnFocusPendingRef.current) return
    returnFocusPendingRef.current = false
    returnFocusRef.current?.focus?.({ preventScroll: true })
  }, [active])

  const keyboardRef = useRef(null)
  keyboardRef.current = { controlsExpanded, contextExpanded, interacting, exit, setInteraction }

  useEffect(() => () => {
    // The scroll effect above releases document locks even if a renderer throws
    // and its parent boundary removes the shell. Never apply a stale camera.
    sessionRef.current.clear()
    latestRef.current.onInteractionChange?.(false)
    returnFocusRef.current?.focus?.({ preventScroll: true })
  }, [])

  return (
    <section ref={shellRef} className={`wv-explore-shell${active ? ' wv-explore-open' : ''}`}>
      <div className="wv-explore-launch" hidden={!prototypeEnabled || active}>
        <button ref={entryRef} type="button" onClick={enter}>Explore World View</button>
        <span>Mobile layout prototypes · awaiting owner choice</span>
      </div>
      <div ref={surfaceRef} className={`wv-explore-surface wv-explore-${direction}${interacting ? ' wv-explore-interacting' : ''}`}
        role={active ? 'dialog' : undefined} aria-modal={active ? true : undefined}
        aria-labelledby={active ? `${id}-title` : undefined} data-explore-direction={direction}>
        <header className="wv-explore-toolbar" hidden={!active}>
          <div><h3 id={`${id}-title`}>Explore World View</h3><p>{recordedTimeLabel || 'Recorded time unavailable'}</p></div>
          <button ref={closeRef} type="button" onClick={exit} aria-label="Close Explore World View">Close</button>
          <div className="wv-explore-directions" role="group" aria-label="Compare mobile layout prototypes">
            <button type="button" aria-pressed={direction === 'immersive'} onClick={() => setDirection('immersive')}>A · Immersive</button>
            <button type="button" aria-pressed={direction === 'dock'} onClick={() => setDirection('dock')}>B · Split dock</button>
          </div>
        </header>
        {/* One controls instance: document flow outside Explore, expandable
            panel inside it. Its descendants and IDs are never duplicated. */}
        <aside id={`${id}-controls`} className="wv-explore-options" hidden={active && !controlsExpanded} aria-label="World View options">
          <div className="wv-explore-panel-heading" hidden={!active}><strong>World View options</strong><button type="button" onClick={() => setControlsExpanded(false)}>Close options</button></div>
          {controls || (active ? <p>No additional controls available.</p> : null)}
        </aside>
        {/* This child and every ancestor remain at the same React position. */}
        <div className="wv-explore-map">{children}</div>
        <nav className="wv-explore-actions" hidden={!active} aria-label="Explore controls">
          <button type="button" aria-pressed={interacting} onClick={() => setInteraction(!interacting)}>
            {interacting ? 'Done — scroll' : 'Interact'}
          </button>
          <button type="button" aria-expanded={controlsExpanded} aria-controls={`${id}-controls`}
            onClick={() => { setInteraction(false); setControlsExpanded(value => !value) }}>Options</button>
          <p>{interacting ? 'Drag the globe. Done releases gestures.' : 'Globe gestures paused. Swipe evidence to scroll; Page returns to the page.'}</p>
        </nav>
        <section className="wv-explore-context" hidden={!active} aria-label="Investigation context">
          <div className="wv-explore-preview">{preview || <span>Current investigation</span>}</div>
          <button type="button" aria-expanded={contextExpanded} aria-controls={`${id}-context`}
            onClick={() => { setInteraction(false); setContextExpanded(value => !value) }}>{contextExpanded ? 'Collapse evidence' : 'Evidence & context'}</button>
          <div id={`${id}-context`} className="wv-explore-context-body" hidden={!contextExpanded}>
            {context || <p>No evidence context available.</p>}
          </div>
        </section>
        <footer className="wv-explore-source" hidden={!active} aria-label="Active sources and attribution">
          <div>{status || 'Active source status unavailable'}</div>
          <div>{attribution || 'Source credits remain on the map.'}</div>
        </footer>
        <button type="button" className="wv-explore-page-strip" hidden={!active} onClick={exit} aria-label="Return to page and resume scrolling">Page</button>
        <p className="wv-explore-notice" role="status" hidden={!active || !notice}>{notice}</p>
      </div>
      <p className="wv-explore-exit-notice" role="status" hidden={active || !notice}>{notice}</p>
    </section>
  )
}
