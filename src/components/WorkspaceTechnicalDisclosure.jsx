import { TECHNICAL_DETAILS_LABEL } from '../lib/workspacePresentation'

export default function WorkspaceTechnicalDisclosure({
  banner,
  children,
  summary = TECHNICAL_DETAILS_LABEL,
  className = 'ws-calm-notice',
}) {
  return (
    <div className={className}>
      {banner ? <p>{banner}</p> : null}
      {children ? (
        <details className="ws-tech-details">
          <summary>{summary}</summary>
          {children}
        </details>
      ) : null}
    </div>
  )
}
