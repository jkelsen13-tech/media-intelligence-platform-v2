import { Columns, Path, ShieldCheck } from '@phosphor-icons/react'
import { AVAILABILITY_DETAILS_LABEL, workspaceAvailabilityCopy } from '../lib/workspacePresentation'

const ICONS = {
  arc: Path,
  compare: Columns,
  generic: ShieldCheck,
}

export default function WorkspaceAvailability({
  kind,
  title,
  body,
  details,
  icon = 'arc',
}) {
  const copy = workspaceAvailabilityCopy(kind)
  const Icon = ICONS[icon] ?? ICONS.generic
  return (
    <section className="ws-availability" data-availability-kind={kind ?? 'generic'}>
      <div className={`ws-availability-icon ws-availability-icon-${icon}`} aria-hidden="true">
        <Icon size={20} weight="regular" />
      </div>
      <p className="ws-availability-kicker">{copy.kicker}</p>
      <h3>{title ?? copy.title}</h3>
      <p>{body ?? copy.body}</p>
      {details ? (
        <details className="ws-availability-details">
          <summary>{AVAILABILITY_DETAILS_LABEL}</summary>
          {details}
        </details>
      ) : null}
    </section>
  )
}
