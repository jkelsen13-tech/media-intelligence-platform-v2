import { StrictMode, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import GraphView from '../src/graph/GraphView.jsx'
import GraphCoverageNotice from '../src/graph/GraphCoverageNotice.jsx'
import Legend from '../src/graph/Legend.jsx'
import ArticlePanel from '../src/panels/ArticlePanel.jsx'
import RelationshipPanel from '../src/panels/RelationshipPanel.jsx'
import PolicyPanel from '../src/panels/PolicyPanel.jsx'
import { GRAPH_NARROW_CHROME_QUERY, graphInspectorPresentation } from '../src/graph/graphCanvasLayout.js'
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

function useNarrowChrome() {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(GRAPH_NARROW_CHROME_QUERY).matches : false,
  )
  useEffect(() => {
    const mql = window.matchMedia(GRAPH_NARROW_CHROME_QUERY)
    const onChange = (event) => setNarrow(event.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])
  return narrow
}

function FixtureApp() {
  const [selected, setSelected] = useState(nodes[0])
  const [policyNode, setPolicyNode] = useState(null)
  const [edgeEvidence, setEdgeEvidence] = useState(null)
  const [layoutRevision, setLayoutRevision] = useState(0)
  const isNarrowChrome = useNarrowChrome()
  const selectedId = useMemo(() => selected?.id ?? policyNode?.id ?? null, [selected, policyNode])
  const inspectorMode = graphInspectorPresentation({
    selected,
    policyNode,
    edgeEvidence,
    isMobile: false,
    isNarrowChrome,
  })
  const overlay = inspectorMode === 'drawer'

  return (
    <div className="app ws-app" data-theme="light">
      <div className="workspace-app ws-shell ws-graph-primary" data-workspace="investigation">
        <header className="ws-topbar">
          <strong>Isolated graph layout fixture</strong>
          <button type="button" className="graph-toolbar-btn" onClick={() => setEdgeEvidence(edges[0] ? { edge: edges[0] } : null)}>
            Open relationship
          </button>
          <button type="button" className="graph-toolbar-btn" onClick={() => { setSelected(null); setPolicyNode(nodes[0]) }}>
            Open policy
          </button>
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
              <div className={`graph-layout${overlay ? ' inspector-overlay' : ''}`}>
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
                        onSelect={(node) => {
                          setPolicyNode(null)
                          setEdgeEvidence(null)
                          setSelected(node)
                        }}
                        panelOpen={false}
                        layoutRevision={layoutRevision}
                        selectedId={selectedId}
                        allNodes={nodes}
                        focused={false}
                      />
                    </div>
                    {edgeEvidence && overlay && (
                      <div
                        className="ap-scrim"
                        data-graph-overlay="scrim"
                        onClick={() => setEdgeEvidence(null)}
                        aria-hidden="true"
                      />
                    )}
                    {edgeEvidence && (
                      <RelationshipPanel
                        edge={edgeEvidence.edge}
                        sourceLabel={nodes.find((n) => n.id === edgeEvidence.edge.source)?.label}
                        targetLabel={nodes.find((n) => n.id === edgeEvidence.edge.target)?.label}
                        isMobile={false}
                        onClose={() => setEdgeEvidence(null)}
                      />
                    )}
                  </div>
                </div>
                {selected && overlay && (
                  <div
                    className="ap-scrim"
                    data-graph-overlay="scrim"
                    onClick={() => setSelected(null)}
                    aria-hidden="true"
                  />
                )}
                {selected && (
                  <ArticlePanel
                    node={selected}
                    nodes={nodes}
                    edges={edges}
                    pinned={false}
                    onTogglePin={() => {}}
                    onNavigate={(node) => setSelected(node)}
                    onClose={() => setSelected(null)}
                    isMobile={false}
                  />
                )}
                {policyNode && overlay && (
                  <div
                    className="ap-scrim"
                    data-graph-overlay="scrim"
                    onClick={() => setPolicyNode(null)}
                    aria-hidden="true"
                  />
                )}
                {policyNode && (
                  <PolicyPanel
                    node={policyNode}
                    nodes={nodes}
                    edges={edges}
                    onNavigate={(node) => { setPolicyNode(null); setSelected(node) }}
                    onClose={() => setPolicyNode(null)}
                    isMobile={false}
                  />
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
