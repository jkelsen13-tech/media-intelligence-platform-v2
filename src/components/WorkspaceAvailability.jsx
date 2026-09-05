import { workspaceAvailabilityCopy } from '../lib/workspacePresentation'

export default function WorkspaceAvailability({
  kind,
  title,
  body,
  details,
  icon = 'arc',
}) {
  const copy = workspaceAvailabilityCopy(kind)
  return (
    <section className="ws-availability" data-availability-kind={kind ?? 'generic'}>
      <div className={`ws-availability-icon ws-availability-icon-${icon}`} aria-hidden="true" />
      <p className="ws-availability-kicker">{copy.kicker}</p>
      <h3>{title ?? copy.title}</h3>
      <p>{body ?? copy.body}</p>
      {details ? <div className="ws-availability-details">{details}</div> : null}
    </section>
  )
}
