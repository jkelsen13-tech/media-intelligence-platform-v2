import { safeExternalHttpUrl } from '../lib/externalUrls.js'
import { inspectionInstantMilliseconds } from '../lib/inspectionTime.js'

function Clock({ label, value }) {
  const milliseconds = inspectionInstantMilliseconds(value)
  return <p className="news-story-clock">{label}: {milliseconds === null ? 'unavailable' : <time dateTime={value}>{new Date(milliseconds).toLocaleString()}</time>}</p>
}
function SourceLink({ url, outlet }) {
  const href = safeExternalHttpUrl(url)
  return href ? <a href={href} target="_blank" rel="noreferrer">Read original at {outlet ?? 'source'} →</a>
    : url ? <p>Recorded source locator (not a link): <span>{url}</span></p> : <p>Original source locator unavailable.</p>
}
export default function NewsStoryReader({ context, state, history, reports, onCloseStory, onOpenNode, onOpenArticle, followingControls }) {
  const story = context?.story
  if (!story) return null
  const propositions = story.members.filter(member => member.admission_kind === 'reviewed_proposition')
  return <section className="news-story-reader" aria-label="Story reader">
    <div className="news-story-heading">
      <span className="ap-label">Story</span>
      {onCloseStory && <button type="button" className="news-chip" onClick={onCloseStory}>Back to news</button>}
    </div>
    <h2>{propositions[0]?.title ?? 'Attributed source reports'}</h2>
    <Clock label="Story published to readers" value={story.visible_at} />
    <details className="news-version-details"><summary>Version and review details</summary>
      <p className="news-story-identity">Story <code>{story.story_id}</code> · Public version <code>{story.public_version_id}</code> · Revision {story.sequence}</p>
      <Clock label="Story review time" value={story.reviewed_at} />
      <p>Review reference: {story.review_ref} · Publication policy: {story.policy_version}</p>
    </details>
    {propositions.map(member => <article className="news-story-source" key={member.public_version_id}>
      <h3>{member.title}</h3>
      <p className="ap-label">{member.source_outlet} · Reviewed source version</p>
      {member.summary && <p>{member.summary}</p>}
      <Clock label="Source publication time" value={member.published_at} />
      <Clock label="Article original fetched time" value={member.fetched_at} />
      <Clock label="Exact capture retained time" value={member.captured_at} />
      <details className="news-version-details"><summary>Source and evidence details</summary>
        <p>Source version <code>{member.capture_id}</code> · Public source version <code>{member.public_version_id}</code></p>
        <p>Exact capture digest: <code>{member.capture_hash}</code></p>
        <p>Source review reference: {member.review_ref} · Policy: {member.policy_version}</p>
        {member.superseded_by_public_version_id && <p>Superseding source version: <code>{member.superseded_by_public_version_id}</code></p>}
        {member.predecessor_public_version_id && <p>Previous source version: <code>{member.predecessor_public_version_id}</code></p>}
      </details>
      <p>Remaining uncertainty: {member.remaining_uncertainty}</p>
      {!member.is_current_source_version && <p>A newer source version has superseded this retained evidence. This is the selected historical version; it does not establish a current Breaking state.</p>}
      {member.pending_revision && <p>A newer retained source revision is pending review; this displayed version retains its original approval.</p>}
      {member.correction_reason && <p>Correction: {member.correction_reason}</p>}
      <SourceLink url={member.source_url} outlet={member.source_outlet} />
      {onOpenArticle && <button type="button" className="news-chip" onClick={() => onOpenArticle(member)}>Open article evidence</button>}
    </article>)}
    {reports.map(report => <article className="news-source-report" aria-label="Attributed source report" key={report.public_version_id}>
      <strong>{report.label}</strong>
      <p className="news-source-report-verification">{report.verification_label}</p>
      <h3>{report.title}</h3>
      <p>{report.source_outlet} reports: {report.summary ?? 'No permitted source summary is available.'}</p>
      {!report.is_current_source_version && <p>A newer source version has superseded this retained report. This is the selected historical version.</p>}
      {report.pending_revision && <p>A newer retained source revision is pending review. This report retains its original approval.</p>}
      <p>Remaining uncertainty: {report.review_uncertainty}</p>
      <p>This is an attributed report. The reported proposition has not been independently established by MIP.</p>
      <Clock label="Source report time" value={report.report_time} />
      <Clock label="Exact source-version fetch time" value={report.fetch_time} />
      <Clock label="Article original fetched time" value={report.article_original_fetched_at} />
      <Clock label="Capture retained time" value={report.capture_retained_at} />
      <details className="news-version-details"><summary>Source and evidence details</summary>
        <p>Source <code>{report.source_id}</code> · Source version <code>{report.source_version_id}</code> · Public report version <code>{report.public_version_id}</code></p>
        <p>Exact capture digest: <code>{report.capture_hash}</code></p>
        <p>Report review reference: {report.review_ref}. State policy: {report.policy_version}.</p>
        {report.superseded_by_public_version_id && <p>Superseding source version: <code>{report.superseded_by_public_version_id}</code></p>}
        {report.predecessor_public_version_id && <p>Previous report version: <code>{report.predecessor_public_version_id}</code></p>}
      </details>
      {report.correction_reason && <p>Source-report correction: {report.correction_reason}</p>}
      <SourceLink url={report.source_url} outlet={report.source_outlet} />
    </article>)}
    {story.members.some(member => member.admission_kind === 'source_report') && !reports.length && <p>Attributed report metadata is unavailable for this selected version.</p>}
    <section className="news-story-state" aria-label="Story material-change state">
      <strong>{state.label}</strong>
      {state.available ? <>
        <p>{state.reason}</p>
        <p>State reason: {state.reason_code.replaceAll('_', ' ')}. Event status: {state.event_state}.</p>
        <Clock label="Material change effective time" value={state.effective_at} />
        <Clock label="Material declaration time" value={state.declared_at} />
        <details className="news-version-details"><summary>Material change and review details</summary>
          <p>Material change <code>{state.material_change_id}</code> · State policy <code>{state.policy_version}</code></p>
          <p>Evidence versions: {state.evidence_refs.join(', ')}. Review references: {state.review_refs.join(', ')}.</p>
        </details>
        <p>{state.coverage_note}</p>
      </> : <p>{state.reason_code === 'supporting_source_version_superseded' ? 'Supporting evidence has been superseded. This selected story version remains readable; its current state awaits reviewed reconciliation.' : state.reason_code === 'latest_material_change_is_attributed_report_pending_verification' ? 'The latest material development is an attributed report pending verification / reconciliation.' : state.reason_code === 'incomplete_material_change_history' ? 'The available material-change history is incomplete. Coverage remains unknown.' : 'No qualifying admitted material-change declaration is available for this selected version. Coverage remains unknown.'}</p>}
    </section>
    {history.length > 0 && <details className="news-story-history"><summary>Material-state transition history</summary>
      <p>Deterministic reconstruction from retained declarations for the selected version. These records do not establish what a reader saw at the time.</p>
      <ol>{history.map(item => <li key={`${item.evaluated_at}-${item.material_change_id}`}><strong>{item.label}</strong> · <time dateTime={item.evaluated_at}>{new Date(item.evaluated_at).toLocaleString()}</time><p>{item.reason}</p><p>Material change {item.material_change_id} · Material version {item.material_public_version_id} · Policy {item.policy_version}</p></li>)}</ol>
    </details>}
    {followingControls}
    {story.subject_type === 'graph_node' && onOpenNode && <button type="button" className="news-action-button" onClick={() => onOpenNode(story.subject_id)}>Investigate in graph</button>}
    <p className="news-intake-note">Only the reviewed public story envelope is displayed. Source-report permission and proposition admission remain separate. State thresholds are a versioned synthetic calibration candidate; live corpus qualification remains pending.</p>
  </section>
}
