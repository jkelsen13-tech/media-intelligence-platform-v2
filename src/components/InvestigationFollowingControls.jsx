import { useInvestigationFollowing } from '../lib/useInvestigationFollowing.js'
import { formatWorkspaceDate } from '../lib/workspacePresentation.js'

export default function InvestigationFollowingControls({ workspace, client }) {
  const model = useInvestigationFollowing({ userId: workspace.userId, sessionLoading: workspace.sessionLoading,
    bundle: workspace.state.bundle, active: workspace.status === 'ready', client,
    onAccessFailure: workspace.actions.rejectInputImpactAccess })
  if (!model.eligible) return null
  const data = model.data, f = data?.subscription, active = f?.status === 'active'
  return <section className="piw-section" aria-label="Private investigation follow" data-private-following-status={model.status}>
    <h3>Follow this private investigation</h3>
    <p className="piw-muted">Saved account preference for this assigned investigation and its recorded subject. It is separate from marking reviewed and public Story Following.</p>
    {!model.subjectId && <p>An explicit recorded graph subject is required to follow this investigation.</p>}
    {model.status === 'unknown' && <p>Following status has not been loaded.</p>}
    {model.busy && <p role="status">{model.status === 'saving' ? 'Confirming saved preference…' : 'Loading following status…'}</p>}
    {model.status === 'unavailable' && <p role="alert">Following is unavailable. Saved status could not be confirmed.</p>}
    {model.status === 'conflict' && <p role="alert">The saved preference changed or this version precedes its cursor. Reload status before choosing another action.</p>}
    <button className="piw-btn" type="button" disabled={model.busy} onClick={model.load}>{data ? 'Reload following status' : 'Load following status'}</button>
    {data && <>
      <p>{f === null ? 'No saved follow preference.' : active ? 'Following is saved for this account.' : f.status === 'revoked' ? 'The saved follow preference was revoked.' : 'The saved follow preference is unsubscribed.'}</p>
      {f && <p className="piw-muted">Acknowledged version: <code>{f.acknowledged_version_id}</code></p>}
      {!active && <button className="piw-btn" type="button" disabled={!model.subjectId || model.busy} onClick={model.follow}>Follow investigation</button>}
      {active && <button className="piw-btn" type="button" disabled={model.busy} onClick={model.unfollow}>Unfollow investigation</button>}
      {active && data.anchor_matches_head !== true && <p>The current recorded subject differs from the saved anchor. Change acknowledgment is unavailable.</p>}
      {active && data.anchor_matches_head === true && <button className="piw-btn" type="button"
        disabled={model.busy || !model.subjectId || f.subject.id !== model.subjectId || f.acknowledged_version_id === model.displayedVersionId}
        onClick={model.acknowledge}>Acknowledge displayed version</button>}
      {active && <>
        <p className="piw-muted">Only explicit reviewer declarations are listed. Their material classification is provisional; this is not complete change coverage.</p>
        {data.unclassified_version_changes === true && <p>Other saved versions advanced without a material declaration. Their materiality is unknown.</p>}
        {!data.changes.length && <p>No registered declarations are shown after the saved cursor. This does not prove that nothing material changed.</p>}
        <ul>{data.changes.map(change => <li key={change.id}>
          <p>{change.materiality_reason}</p>
          <p className="piw-muted">Declared {formatWorkspaceDate(change.declared_at)} · after version <code>{change.after_version_id}</code></p>
        </li>)}</ul>
        {data.has_more === true && <p>More registered declarations exist. Only this bounded page is shown; acknowledging the displayed version is an explicit cursor decision.</p>}
      </>}
    </>}
  </section>
}
