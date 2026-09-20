// Pure native presentation primitives, shared by the live workspace and the
// explicitly receipt-only adapter. No client, persistence, or authority seam.
export function StatusBanner({ children, tone = 'note', ...rest }) {
  return <p className={`piw-banner piw-banner-${tone}`} role={tone === 'error' ? 'alert' : 'status'} {...rest}>{children}</p>
}

export function BoundedRecords({ items, renderItem, label, initial = 4, emptyText }) {
  const list = items ?? []
  if (!list.length) return <p className="piw-muted">{emptyText ?? `No ${label} recorded on this saved version.`}</p>
  return <>{list.slice(0, initial).map(renderItem)}{list.length > initial ? <details className="piw-more">
    <summary>Show {list.length - initial} more {label}</summary>{list.slice(initial).map(renderItem)}
  </details> : null}</>
}
