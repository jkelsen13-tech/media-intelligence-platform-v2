import { useStoryFollowingList } from '../lib/useStoryFollowing.js'
import './storyFollowing.css'

export default function StoryFollowingPanel({ userId, sessionReady = false, active = true, backend, onOpenStory }) {
  const list = useStoryFollowingList({ userId, sessionReady, active, backend })
  return <section className="story-following-panel" aria-label="Following stories" aria-busy={list.busy}>
    <h2>Following</h2>
    {!userId ? <p>Sign in to see the stories you follow.</p>
      : !sessionReady ? <p role="status">Checking your account…</p>
      : list.status === 'unavailable' ? <p role="status">Following is unavailable. Your saved preferences could not be confirmed.</p>
      : list.status !== 'ready' ? <p role="status">Loading your followed stories…</p>
      : list.data.items.length === 0 ? <p>No followed stories for this account. Open a reviewed story and choose Follow story.</p>
      : <ul>{list.data.items.map(item => <li key={item.story_id}>
        <button type="button" disabled={typeof onOpenStory !== 'function'} onClick={() => onOpenStory?.(item.story_id, { publicVersionId: item.head_public_version_id })}>
          Open {item.story_title || 'followed story'}
        </button>
        <p>{item.unread_count} unread material {item.unread_count === 1 ? 'update' : 'updates'}</p>
        {item.unclassified_version_changes && <p>A newer version has unclassified changes.</p>}
      </li>)}</ul>}
    {list.eligible && !list.busy && <button type="button" onClick={list.load}>Reload followed stories</button>}
    {list.status === 'ready' && list.data.has_more && <p>This view shows the first 50 followed stories.</p>}
  </section>
}
