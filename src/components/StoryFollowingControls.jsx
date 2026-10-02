import { useStoryFollowing } from '../lib/useStoryFollowing.js'
import { isDisplayedPublicStory } from '../lib/storyFollowingClient.js'
import './storyFollowing.css'

export default function StoryFollowingControls({ story, userId, sessionReady = false, active = true, backend, onAccessFailure }) {
  const following = useStoryFollowing({ story, userId, sessionReady, active, backend, onAccessFailure })
  const f = following.data?.subscription
  return <section className="story-following" aria-label="Follow public story" aria-busy={following.busy}>
    <h3>Story Following</h3>
    {!userId ? <p>Sign in to follow this story and see material updates in the app.</p>
      : !sessionReady ? <p role="status">Checking your account…</p>
      : !isDisplayedPublicStory(story) ? <p>A reviewed story version is required to follow this story.</p>
      : <>
        <div role="status" aria-live="polite">
          {['unknown', 'loading'].includes(following.status) && <p>Loading your story Following…</p>}
          {following.status === 'saving' && <p>Saving and confirming your Following preference…</p>}
          {following.status === 'conflict' && <p>Your Following preference changed. Reload before choosing another action.</p>}
          {following.status === 'unavailable' && <p>{following.error === 'authentication_required' ? 'Your account session has ended. Sign in again.' : 'Story Following is unavailable. Reload to check its current state.'}</p>}
          {following.status === 'ready' && (following.data.story_status === 'revoked'
            ? <p>This story is unavailable. Your Following preference was revoked.</p>
            : f?.status === 'active' ? <p>Following this story. {following.data.unread_count} unread material {following.data.unread_count === 1 ? 'update' : 'updates'}.</p>
            : f?.status === 'revoked' ? <p>Your Following preference was revoked. Following again requires an explicit choice.</p>
            : <p>{f?.status === 'unsubscribed' ? 'You unfollowed this story.' : 'You are not following this story.'}</p>)}
        </div>
        {following.status === 'ready' && following.data.story_status === 'public' && <div className="story-following-actions">
          {f?.status === 'active' ? <>
            <button type="button" onClick={following.unfollow}>Unfollow story</button>
            <button type="button" onClick={following.acknowledge}>Acknowledge displayed story version</button>
          </> : <button type="button" onClick={following.follow}>Follow story</button>}
        </div>}
        {!following.busy && <button type="button" onClick={following.load}>Reload story Following</button>}
        {following.status === 'ready' && f?.status === 'active' && <>
          {following.data.unclassified_version_changes && <p>A newer version has no admitted material-change declaration. Its materiality is unknown.</p>}
          <ul className="story-following-updates">{following.data.changes.map(c => <li key={c.material_change_id}>
            <p>{c.reason}</p><small>Material change effective {new Date(c.effective_at).toISOString()} · declared {new Date(c.declared_at).toISOString()}</small>
          </li>)}</ul>
          {following.data.has_more && <p>Showing the first {following.data.changes.length} unread material updates. Open a newer story version to review later changes.</p>}
        </>}
        <p className="story-following-note">Updates stay in the app. Acknowledgement applies to the story version displayed above.</p>
      </>}
  </section>
}
