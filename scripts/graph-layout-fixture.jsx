import { StrictMode, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import GraphView from '../src/graph/GraphView.jsx'
import GraphCoverageNotice from '../src/graph/GraphCoverageNotice.jsx'
import Legend from '../src/graph/Legend.jsx'
import fixture from '../tests/golden/fixtures/graph_fixture.json'
import '../src/index.css'
import '../src/styles/workspace.css'

// Isolated layout harness. It never feeds the production App data path.
const nodes = fixture.nodes
const edges = fixture.edges.map((edge) => ({
  id: edge.id,
  source: edge.source_id,
  target: edge.target_id,
  type: edge.type,
  reliability: edge.reliability,
  similarity: edge.similarity,
  weight: 'medium',
}))

const coverage = {
  articleCount: 1842,
  articlesWithPublishedNode: nodes.length,
  pendingGraphCandidates: 0,
  documentedRelationshipCount: edges.length,
  articlesWithoutPublishedNode: 1822,
  publishedNodeCount: nodes.length,
}

function FixtureApp() {
  const [selected, setSelected] = useState(nodes[0])
  const [layoutRevision, setLayoutRevision] = useState(0)
  const selectedId = useMemo(() => selected?.id ?? null, [selected])

  return (
    <div className="app ws-app" data-theme="light">
      <div className="workspace-app ws-shell ws-graph-primary" data-workspace="investigation">
        <header className="ws-topbar">
          <strong>Isolated graph layout fixture</strong>
        </header>
        <div className="ws-workspace-head">
          <section className="ws-canonical" aria-label="Investigation workspace">
            <p className="ws-eyebrow">Investigation workspace</p>
            <h1 className="ws-title">Layout fixture</h1>
          </section>
        </div>
        <div className="workspace-body ws-body has-native-inspector">
          <div className="ws-content">
            <main className="app-main">
              <div className={`graph-layout${selected ? ' inspector-overlay' : ''}`}>
                <div className="graph-area">
                  <div className="graph-workspace-controls">
                    <p className="graph-scope-status">
                      Isolated fixture • {nodes.length} nodes • {edges.length} documented relationships
                    </p>
                  </div>
                  <GraphCoverageNotice
                    coverage={coverage}
                    shownNodeCount={nodes.length}
                    totalNodeCount={nodes.length}
                    onToggle={() => setLayoutRevision((n) => n + 1)}
                  />
                  <div className="graph-body">
                    <div className="graph-rail">
                      <Legend />
                    </div>
                    <div className="graph-stage" data-graph-stage="true">
                      <GraphView
                        nodes={nodes}
                        edges={edges}
                        onSelect={setSelected}
                        panelOpen={false}
                        layoutRevision={layoutRevision}
                        selectedId={selectedId}
                        allNodes={nodes}
                        focused={false}
                      />
                    </div>
                  </div>
                </div>
                {selected && (
                  <aside className="article-panel" role="dialog" aria-label={`Article panel: ${selected.label}`}>
                    <header className="ap-header">
                      <div className="ap-title-row">
                        <h2>{selected.label}</h2>
                        <button type="button" className="ap-icon-btn" aria-label="Close" onClick={() => setSelected(null)}>
                          ×
                        </button>
                      </div>
                    </header>
                    <p className="ap-summary">{selected.summary ?? selected.label}</p>
                  </aside>
                )}
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <FixtureApp />
  </StrictMode>,
)
