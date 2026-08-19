// Package 2 item 5 — one accessible tab-row primitive for Timeline and Story
// Arc detail surfaces. The caller owns the selected state and panel rendering;
// this component owns the stable tab semantics and visual class contract.
export default function EvidenceTabs({ label, tabs, activeId, onSelect, className = '' }) {
  const safeTabs = Array.isArray(tabs) ? tabs.filter((tab) => tab?.id && tab?.label) : []
  return (
    <div className={`ep-tabs${className ? ` ${className}` : ''}`} role="tablist" aria-label={label}>
      {safeTabs.map((tab) => {
        const selected = tab.id === activeId
        return (
          <button
            key={tab.id}
            id={`${tab.id}-tab`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={tab.panelId}
            className={`ep-tab${selected ? ' ep-tab-active' : ''}`}
            onClick={() => onSelect?.(tab.id)}
          >
            {tab.icon && <span className="ep-tab-icon" aria-hidden="true">{tab.icon}</span>}
            <span className="ep-tab-label">{tab.label}</span>
          </button>
        )
      })}
    </div>
  )
}
