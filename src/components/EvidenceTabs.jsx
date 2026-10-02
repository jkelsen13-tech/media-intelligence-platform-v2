// Package 2 item 5 — one accessible tab-row primitive for Timeline and Story
// Arc detail surfaces. The caller owns the selected state and panel rendering;
// this component owns the stable tab semantics and visual class contract.
export default function EvidenceTabs({ label, tabs, activeId, onSelect, className = '' }) {
  const safeTabs = Array.isArray(tabs) ? tabs.filter((tab) => tab?.id && tab?.label) : []
  const activeIndex = Math.max(0, safeTabs.findIndex((tab) => tab.id === activeId))
  return (
    <div className={`ep-tabs${className ? ` ${className}` : ''}`} role="tablist" aria-label={label}>
      {safeTabs.map((tab, index) => {
        const selected = tab.id === activeId
        return (
          <button
            key={tab.id}
            id={`${tab.id}-tab`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={tab.panelId}
            tabIndex={index === activeIndex ? 0 : -1}
            className={`ep-tab${selected ? ' ep-tab-active' : ''}`}
            onClick={() => onSelect?.(tab.id)}
            onKeyDown={(event) => {
              let next
              if (event.key === 'ArrowRight') next = (index + 1) % safeTabs.length
              else if (event.key === 'ArrowLeft') next = (index - 1 + safeTabs.length) % safeTabs.length
              else if (event.key === 'Home') next = 0
              else if (event.key === 'End') next = safeTabs.length - 1
              else return
              event.preventDefault()
              event.currentTarget.parentElement?.querySelectorAll('[role="tab"]')[next]?.focus()
              onSelect?.(safeTabs[next].id)
            }}
          >
            {tab.icon && <span className="ep-tab-icon" aria-hidden="true">{tab.icon}</span>}
            <span className="ep-tab-label">{tab.label}</span>
          </button>
        )
      })}
    </div>
  )
}
