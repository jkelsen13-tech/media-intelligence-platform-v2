import SourceAttributionLine from './SourceAttributionLine.jsx'

/** Pure presentation: the supplied model comes from buildNewsStoryPresentation. */
export default function NewsStoryCard({
  story, expanded = false, inGroup = false, detailId,
  onToggle, onOpenArc, onOpenNode,
}) {
  const date = story.publishedAt
    ? new Date(story.publishedAt).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    }) : 'undated'
  return (
    <article className={`news-card${inGroup ? ' in-group' : ''}`}>
      <button type="button" className="news-card-trigger"
        onClick={() => onToggle(story.id)}
        aria-expanded={expanded} aria-controls={expanded ? detailId : undefined}
        aria-label={`${expanded ? 'Hide' : 'Show'} evidence for ${story.title}`}>
        <div className="news-card-top">
          <time className="news-date accent" dateTime={story.publishedAt ?? undefined}>{date}</time>
        </div>
        <h3>{story.title}</h3>
        <SourceAttributionLine outlet={story.outlet} region={story.region} badge={null} />
        {story.summary && <p className="news-summary">{story.summary}</p>}
      </button>
      {(story.arc || story.graphNodeId) && (
        <div className="news-card-chips" aria-label="Open linked views">
          {story.arc && <button type="button" className="news-action-button"
            title={`Open story arc “${story.arc.title}”`}
            onClick={() => onOpenArc(story.arc.id)}>◈ Open arc</button>}
          {story.graphNodeId && <button type="button" className="news-action-button secondary"
            title="Open the cited node in the knowledge graph"
            onClick={() => onOpenNode(story.graphNodeId)}>⌘ Open graph</button>}
        </div>
      )}
      <div className="news-prov">{story.provenanceLabel}</div>
    </article>
  )
}
