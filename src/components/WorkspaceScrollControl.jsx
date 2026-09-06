import { useEffect, useState } from 'react'

// A native range remains visible on touch devices whose OS hides scrollbars.
// The page itself still owns scrolling; this is an additional navigation aid.
export default function WorkspaceScrollControl({ targetRef }) {
  const [position, setPosition] = useState(0)
  const [scrollable, setScrollable] = useState(false)
  useEffect(() => {
    const target = targetRef.current
    if (!target) return undefined
    const update = () => {
      const extent = target.scrollHeight - target.clientHeight
      setScrollable(extent > 1)
      setPosition(extent > 0 ? Math.min(100, Math.max(0, target.scrollTop / extent * 100)) : 0)
    }
    const observer = new ResizeObserver(update)
    observer.observe(target)
    for (const child of target.children) observer.observe(child)
    target.addEventListener('scroll', update, { passive: true })
    update()
    return () => {
      observer.disconnect()
      target.removeEventListener('scroll', update)
    }
  }, [targetRef])

  return scrollable ? (
    <label className="ws-page-scroll">
      <span aria-hidden="true">↕</span>
      <input
        type="range"
        min="0"
        max="100"
        step="0.1"
        value={position}
        aria-label="Scroll page"
        aria-valuetext={`${Math.round(position)}% through page`}
        onChange={(event) => {
          const target = targetRef.current
          if (target) target.scrollTop = Number(event.target.value) / 100 * (target.scrollHeight - target.clientHeight)
        }}
      />
    </label>
  ) : null
}
