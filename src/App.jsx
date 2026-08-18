import { useEffect, useMemo, useState, useCallback } from 'react'
import GraphView from './graph/GraphView'
import Legend from './graph/Legend'
import EdgeControls from './graph/EdgeControls'
import GraphModePanel from './graph/GraphModePanel'
import RelationshipPanel from './panels/RelationshipPanel'
import EdgeList from './graph/EdgeList'
import ReviewStatusPanel from './panels/ReviewStatusPanel'
import TopicBrowser from './graph/TopicBrowser'
import ArticlePanel from './panels/ArticlePanel'
import PolicyPanel from './panels/PolicyPanel'
import TimelineView from './views/TimelineView'
import ArcsView from './views/ArcsView'
import NewsView from './views/NewsView'
import Phase3View from './views/Phase3View'
import SourceComparisonView from './views/SourceComparisonView'
import { loadPhase3BetaFlag } from './lib/phase3ReadPath'
import { loadSourceComparisonBetaFlag } from './lib/sourceComparisonReadPath'
import { buildNavViews, buildMoreEntries, isMoreViewKey } from './lib/navViews'
import { loadGraph, loadTopics, loadCorpusMeta } from './lib/supabase'
import { liveCorpusLabel } from './lib/newsFeedModel'
import { computeHubs } from './lib/hubs'
import { jumpFocusStack } from './lib/jumpReset'
import { resolveTimelineJump } from './lib/navigationContract'
import { resolveFocal, focusDepth } from './lib/desktopFocus'
import {
  filterGraphRegion,
  graphRegionOptions,
  GRAPH_WORKSPACE_MODES,
} from './lib/graphWorkspaceModel'
import AccountPanel from './panels/AccountPanel'
import { loadAccountUiFlag } from './lib/auth'

// Nav structure lives in ./lib/navViews (Track B 6->5 restructure,
// 2026-08-16): four core tabs + "More"; the flag-gated Legal & Policy and
// Source Comparison surfaces moved into the More sheet. View keys and
// render blocks below are unchanged.

// Mobile-first graph entry: the top N hubs by degree centrality.
const HUB_LIST_SIZE = 30

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  )
  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = (e) => setMatches(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return matches
}

// Depth-limited neighborhood (BFS) around a hub node.
function localSubgraph(nodes, edges, hubId, depth = 2) {
  const adj = new Map()
  const addEdge = (a, b) => {
    if (!adj.has(a)) adj.set(a, [])
    adj.get(a).push(b)
  }
  edges.forEach((e) => {
    addEdge(e.source, e.target)
    addEdge(e.target, e.source)
  })
  const seen = new Set([hubId])
  let frontier = [hubId]
  for (let d = 0; d < depth; d++) {
    const next = []
    for (const id of frontier) {
      for (const nb of adj.get(id) ?? []) {
        if (!seen.has(nb)) {
          seen.add(nb)
          next.push(nb)
        }
      }
    }
    frontier = next
  }
  const subNodes = nodes.filter((n) => seen.has(n.id ?? n.slug))
  const subEdges = edges.filter((e) => seen.has(e.source) && seen.has(e.target))
  return { nodes: subNodes, edges: subEdges }
}

// Step 8 (§5): topic focus — nodes tagged with the topic plus their
// immediate neighbors (depth 1 around the whole member set).
function topicSubgraph(nodes, edges, memberIds) {
  const seeds = new Set(memberIds)
  const keep = new Set(memberIds)
  edges.forEach((e) => {
    if (seeds.has(e.source)) keep.add(e.target)
    if (seeds.has(e.target)) keep.add(e.source)
  })
  return {
    nodes: nodes.filter((n) => keep.has(n.id ?? n.slug)),
    edges: edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
  }
}

export default function App() {
  const [graph, setGraph] = useState(null)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null) // selected node data
  const [pinned, setPinned] = useState(false)
  const [view, setView] = useState('news')
  const [nodeQuery, setNodeQuery] = useState('')
  const [aboutOpen, setAboutOpen] = useState(false)
  // Track B nav restructure: the "More" tab opens a bottom sheet listing
  // the flag-gated surfaces instead of switching views itself.
  const [moreOpen, setMoreOpen] = useState(false)
  // Mobile graph entry: 'hubs' (ranked list) -> 'sub' (hub subgraph) / 'all'.
  const [graphScreen, setGraphScreen] = useState('hubs')
  // Track B Step 2 item 3: desktop defaults to the top hub's focused
  // subgraph; the full graph is an explicit opt-in (this flag). Mobile is
  // out of scope — it already enters through the hub list.
  const [desktopShowAll, setDesktopShowAll] = useState(false)
  // Screen 6 focused-Graph workspace. Geography and Time stay data-backed
  // record views; Region filters semantic clusters without fabricating links.
  const [graphMode, setGraphMode] = useState('relationships')
  const [graphRegion, setGraphRegion] = useState('all')
  const [focusExpansion, setFocusExpansion] = useState(0)
  // Step 9 (§8): focus stack. Each crumb is
  // { kind: 'node', id, label } or { kind: 'topic', id, label, memberIds }.
  // Non-empty stack = the graph renders the focal node's depth-2
  // neighborhood (or the topic's members + neighbors).
  const [focusStack, setFocusStack] = useState([])
  // Step 7 (§6): edge filters — reliability threshold (1 = show all) and
  // the MIP hypothesis (inferred) toggle, default OFF.
  const [minReliability, setMinReliability] = useState(1)
  const [showInferred, setShowInferred] = useState(false)
  // Step 7: tapped-edge evidence popover payload { edge, position }.
  const [edgeEvidence, setEdgeEvidence] = useState(null)
  // 02B final acceptance: nonvisual (screen-reader/keyboard) relationship list.
  const [edgeListOpen, setEdgeListOpen] = useState(false)
  const [reviewStatusOpen, setReviewStatusOpen] = useState(false)
  // Step 10 (§7.4): policy consequence view — set when a policy node is
  // tapped (replaces the article panel for policy nodes).
  const [policyNode, setPolicyNode] = useState(null)
  // Step 8 (§5): topics. null = tables absent/unreachable → hide the
  // affordance entirely.
  const [topicsData, setTopicsData] = useState(null)
  const [topicsOpen, setTopicsOpen] = useState(false)
  // 02C Phase 3: beta flag. False until pipeline_config.phase3_beta === true;
  // unreadable flag also resolves false (withhold posture).
  const [phase3Beta, setPhase3Beta] = useState(false)
  // 03_BACKLOG Item 1: source comparison beta flag. Same withhold posture:
  // false until pipeline_config.source_comparison_beta === true.
  const [sourceComparisonBeta, setSourceComparisonBeta] = useState(false)
  // 04-ADD Step 3 item 4: the arc-grouped timeline beta flag moved inside
  // TimelineView (the mode toggle is a Screen 5 control, not App chrome).
  // 16_ACCOUNT_PIPELINE: account UI flag. Same withhold posture: false
  // until pipeline_config.account_ui === true; rollback = flip flag false,
  // the entry point disappears without touching accounts or data.
  const [accountUi, setAccountUi] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  // Cross-view focus: clicking an arc/article/node link in one view opens
  // the target in its own view.
  const [focusArc, setFocusArc] = useState(null)
  const [focusArticle, setFocusArticle] = useState(null)
  // Doc 05: timeline focus key (8-hex group suffix) and comparison event id.
  // Package 1 item 2: focusTimelineArc carries the ORIGINATING arc of a
  // News → Timeline jump (return-to-origin; see lib/navigationContract.js).
  const [focusTimelineEvent, setFocusTimelineEvent] = useState(null)
  const [focusTimelineArc, setFocusTimelineArc] = useState(null)
  const [focusComparisonEvent, setFocusComparisonEvent] = useState(null)

  const isMobile = useMediaQuery('(max-width: 767px)')

  // Step 4: live-corpus header line (addendum carried-forward requirement)
  // replaces the machine-facing "data: supabase" label. Failure-isolated —
  // a corpus-meta outage must never block the graph load.
  const [corpusMeta, setCorpusMeta] = useState(null)
  useEffect(() => {
    loadCorpusMeta().then(setCorpusMeta).catch(() => {})
  }, [])
  const corpusLine = liveCorpusLabel(corpusMeta?.count, corpusMeta?.latestFetchedAt, Date.now())

  useEffect(() => {
    loadGraph().then(setGraph).catch((err) => setError(err.message))
    loadTopics()
      .then((data) => {
        // Only expose the affordance when the tables exist AND carry data.
        if (data && data.topics.length > 0) setTopicsData(data)
      })
      .catch(() => {})
    loadPhase3BetaFlag()
      .then((on) => setPhase3Beta(on === true))
      .catch(() => setPhase3Beta(false))
    loadSourceComparisonBetaFlag()
      .then((on) => setSourceComparisonBeta(on === true))
      .catch(() => setSourceComparisonBeta(false))
    loadAccountUiFlag()
      .then((on) => setAccountUi(on === true))
      .catch(() => setAccountUi(false))
  }, [])

  // Step 9 (§8): tapping a node makes it focal — its depth-2 neighborhood
  // re-renders and the node is pushed onto the breadcrumb stack. Tapping
  // the current focal node again is a no-op (panel still opens).
  const pushFocus = useCallback((node) => {
    const key = node.id ?? node.slug
    setFocusStack((stack) => {
      const top = stack[stack.length - 1]
      if (top && top.kind === 'node' && top.id === key) return stack
      return [...stack, { kind: 'node', id: key, label: node.label ?? key }]
    })
  }, [])

  const focusBack = useCallback(() => setFocusStack((s) => s.slice(0, -1)), [])
  const focusTo = useCallback((index) => setFocusStack((s) => s.slice(0, index + 1)), [])
  // "Show full graph" is the explicit full-graph opt-in on desktop: it
  // clears any focus AND suppresses the desktop default focus until the
  // user explicitly returns via the toolbar's "Focused view" control.
  const clearFocus = useCallback(() => {
    setFocusStack([])
    setDesktopShowAll(true)
  }, [])

  const handleSelect = useCallback(
    (data) => {
      // Edge taps and canvas taps clear the panel unless it is pinned.
      if (!data || data.source) {
        if (!pinned) setSelected(null)
        return
      }
      // A node inspector is the one primary overlay. Lists, review panels,
      // topic browser, and prior relationship evidence close before it opens.
      setEdgeEvidence(null)
      setEdgeListOpen(false)
      setReviewStatusOpen(false)
      setTopicsOpen(false)
      // Step 10: policy nodes open the Consequence view instead of the
      // article panel; everything else keeps the existing behavior.
      if (data.type === 'policy') {
        setSelected(null)
        setPinned(false)
        setPolicyNode(data)
      } else {
        setPolicyNode(null)
        setSelected(data)
      }
      pushFocus(data)
    },
    [pinned, pushFocus],
  )

  const openConsequenceView = useCallback((node) => {
    setEdgeEvidence(null)
    setEdgeListOpen(false)
    setReviewStatusOpen(false)
    setTopicsOpen(false)
    setSelected(null)
    setPinned(false)
    setPolicyNode(node)
  }, [])

  const closePolicyPanel = useCallback(() => setPolicyNode(null), [])

  const handleNavigate = useCallback(
    (nodeKey) => {
      if (!graph) return
      const next = graph.nodes.find((n) => (n.id ?? n.slug) === nodeKey)
      if (next) {
        setEdgeEvidence(null)
        setEdgeListOpen(false)
        setReviewStatusOpen(false)
        setTopicsOpen(false)
        if (next.type === 'policy') {
          setSelected(null)
          setPolicyNode(next)
        } else {
          setSelected(next)
          setPolicyNode(null)
        }
        pushFocus(next)
      }
    },
    [graph, pushFocus],
  )

  // Step 9: "Focus" affordance in the article panel — make the viewed
  // node focal without closing the panel.
  const handleFocusNode = useCallback(
    (node) => {
      pushFocus(node)
      setGraphScreen((s) => (s === 'hubs' ? 'all' : s))
    },
    [pushFocus],
  )

  // Step 8: topic drill-down focuses the graph on the topic's members.
  const handleSelectTopic = useCallback(
    ({ id, name, memberIds }) => {
      setTopicsOpen(false)
      setGraphScreen('all')
      setFocusStack([{ kind: 'topic', id, label: name, memberIds }])
    },
    [],
  )

  const handleClose = useCallback(() => {
    setSelected(null)
    setPinned(false)
  }, [])

  // One primary graph overlay at a time. A relationship panel, node/policy
  // inspector, relationship list, review panel, or topic browser never stacks
  // above another interactive surface and overloads the canvas.
  const clearPrimaryGraphOverlays = useCallback(() => {
    setEdgeEvidence(null)
    setSelected(null)
    setPinned(false)
    setPolicyNode(null)
    setEdgeListOpen(false)
    setReviewStatusOpen(false)
    setTopicsOpen(false)
  }, [])

  const openRelationshipEvidence = useCallback((edge) => {
    clearPrimaryGraphOverlays()
    setEdgeEvidence({ edge, position: null })
  }, [clearPrimaryGraphOverlays])

  const toggleRelationshipList = useCallback(() => {
    if (edgeListOpen) {
      setEdgeListOpen(false)
      return
    }
    clearPrimaryGraphOverlays()
    setEdgeListOpen(true)
  }, [edgeListOpen, clearPrimaryGraphOverlays])

  const toggleReviewStatus = useCallback(() => {
    if (reviewStatusOpen) {
      setReviewStatusOpen(false)
      return
    }
    clearPrimaryGraphOverlays()
    setReviewStatusOpen(true)
  }, [reviewStatusOpen, clearPrimaryGraphOverlays])

  // Escape closes the article / policy / relationship panel (§4.4 close
  // affordance; item 5 extends it to the docked relationship panel).
  useEffect(() => {
    if (!selected && !policyNode && !edgeEvidence && !edgeListOpen && !reviewStatusOpen && !topicsOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        handleClose()
        closePolicyPanel()
        setEdgeEvidence(null)
        setEdgeListOpen(false)
        setReviewStatusOpen(false)
        setTopicsOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, policyNode, edgeEvidence, edgeListOpen, reviewStatusOpen, topicsOpen, handleClose, closePolicyPanel])

  // --- Cross-view navigation ---
  // Package 1 item 1 (22_NOTE action 1): a cross-view jump REPLACES context.
  // Every handler below routes through this reset so no endpoint, source,
  // excerpt, or uncertainty from a prior relationship/panel can survive into
  // the destination surface (see src/lib/jumpReset.js — JUMP_CLEARS).
  const resetJumpContext = useCallback(() => {
    clearPrimaryGraphOverlays()
    // Cross-view navigation replaces the old graph focal context rather than
    // appending to it. A graph-target jump installs its own one-crumb root.
    setFocusStack([])
  }, [clearPrimaryGraphOverlays])

  const openNodeInGraph = useCallback(
    (nodeKey) => {
      if (!graph) return
      resetJumpContext()
      const next = graph.nodes.find((n) => (n.id ?? n.slug) === nodeKey)
      setGraphScreen('all')
      setView('graph')
      if (next) {
        setSelected(next)
        // Reset — never append: the jump target becomes the new root crumb,
        // so no stale focus path from a prior arc's exploration remains.
        const key = next.id ?? next.slug
        setFocusStack(jumpFocusStack('node', key, next.label ?? key))
      }
    },
    [graph, resetJumpContext],
  )

  const openArcInView = useCallback((arcKey) => {
    resetJumpContext()
    setFocusArc(arcKey)
    setView('arcs')
  }, [resetJumpContext])

  const openArticleInNews = useCallback((articleId) => {
    resetJumpContext()
    setFocusArticle(articleId)
    setView('news')
  }, [resetJumpContext])

  // Doc 05 pair 3/6 destination, now under the Package 1 item 2 navigation
  // contract: the jump target is resolved through lib/navigationContract.js.
  // Return-to-origin (Three-Screen Review named finding): when the target
  // carries its originating arc, the Timeline opens on THAT arc — not the
  // global corpus. Global is the declared fallback for arc-less targets.
  // No resolvable target → no jump (honest degradation, never a fabricated
  // destination).
  const openEventInTimeline = useCallback((target) => {
    const resolved = resolveTimelineJump(target)
    if (!resolved) return
    resetJumpContext()
    setFocusTimelineEvent(resolved.eventKey)
    setFocusTimelineArc(resolved.scope === 'arc' ? resolved.arcId : null)
    setView('timeline')
  }, [resetJumpContext])

  // Doc 05 pair 5 destination: focus an event in Source Comparison.
  const openComparisonEvent = useCallback((eventId) => {
    resetJumpContext()
    setFocusComparisonEvent(eventId)
    setView('compare')
  }, [resetJumpContext])

  // Graph node search: label substring match, top 8 suggestions.
  const nodeMatches = useMemo(() => {
    if (!graph || !nodeQuery.trim()) return []
    const term = nodeQuery.trim().toLowerCase()
    return graph.nodes
      .filter((n) => (n.label ?? '').toLowerCase().includes(term))
      .slice(0, 8)
  }, [graph, nodeQuery])

  const pickNode = (node) => {
    setEdgeEvidence(null)
    setEdgeListOpen(false)
    setReviewStatusOpen(false)
    setTopicsOpen(false)
    setPolicyNode(null)
    setSelected(node)
    setNodeQuery('')
    pushFocus(node)
  }

  // --- Mobile graph entry: ranked hubs by degree centrality ---
  const hubs = useMemo(() => (graph ? computeHubs(graph.nodes, graph.edges, HUB_LIST_SIZE) : []), [graph])

  // Step 9 + item 3: the active focal crumb drives the rendered subgraph.
  // On desktop with no explicit focus and no full-graph opt-in, the focal
  // is the synthetic top-hub default (see lib/desktopFocus.js).
  const topHub = hubs.length > 0 ? hubs[0].node : null
  const focal = useMemo(
    () => resolveFocal({ isMobile, desktopShowAll, focusStack, topHub }),
    [isMobile, desktopShowAll, focusStack, topHub],
  )
  const focalKey = focal ? `${focal.kind}:${focal.id}` : null
  useEffect(() => {
    // A new focus is a new bounded investigation. Carrying a previous
    // expansion or a region filter across it would hide context without a
    // reader request, so both return to their documented defaults.
    setFocusExpansion(0)
    setGraphRegion('all')
  }, [focalKey])

  const subgraph = useMemo(() => {
    if (!graph || !focal) return null
    if (focal.kind === 'topic') return topicSubgraph(graph.nodes, graph.edges, focal.memberIds)
    return localSubgraph(graph.nodes, graph.edges, focal.id, focusDepth(isMobile) + focusExpansion)
  }, [graph, focal, isMobile, focusExpansion])

  const openHub = useCallback((node) => {
    setEdgeEvidence(null)
    setEdgeListOpen(false)
    setReviewStatusOpen(false)
    setTopicsOpen(false)
    setPolicyNode(null)
    setFocusStack([{ kind: 'node', id: node.id ?? node.slug, label: node.label }])
    setGraphScreen('all')
    setSelected(null)
    setPinned(false)
  }, [])

  const focusedNodes = subgraph ? subgraph.nodes : graph?.nodes ?? []
  const focusedEdges = subgraph ? subgraph.edges : graph?.edges ?? []
  const regionOptions = useMemo(() => graphRegionOptions(focusedNodes), [focusedNodes])
  const regionScopedGraph = useMemo(
    () => filterGraphRegion(focusedNodes, focusedEdges, graphRegion),
    [focusedNodes, focusedEdges, graphRegion],
  )
  const displayNodes = regionScopedGraph.nodes
  const displayEdges = regionScopedGraph.edges
  const canExpandFocus = Boolean(
    focal && focal.kind === 'node' && focusExpansion < 2 && focusedNodes.length < (graph?.nodes.length ?? 0),
  )
  const graphScopeLabel =
    subgraph != null
      ? `Focused view · ${displayNodes.length} of ${graph?.nodes.length ?? 0} nodes · ${displayEdges.length} documented relationships`
      : `Full graph · ${displayNodes.length} nodes · ${displayEdges.length} documented relationships`
  // On desktop the graph screen is always the full canvas.
  const showHubList = isMobile && graphScreen === 'hubs' && focusStack.length === 0

  const inferredCount = useMemo(
    () => (graph ? graph.edges.filter((e) => e.claimed_by === 'MIP_inferred').length : 0),
    [graph],
  )

  // Nav entries — 4 core tabs + "More" while at least one gated surface is
  // authorized. Withhold posture: an unreadable flag resolves false above,
  // and with both flags false the More tab hides entirely (not grayed out).
  const navViews = buildNavViews({ phase3Beta, sourceComparisonBeta })
  const moreEntries = buildMoreEntries({ phase3Beta, sourceComparisonBeta })
  // The More tab shows active while one of its member views is on screen.
  const moreActive = isMoreViewKey(view)

  const openFromMore = (key) => {
    setView(key)
    setMoreOpen(false)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>MIP</h1>
        <span className="subtitle">Media Intelligence Platform</span>
        <nav className="app-nav" aria-label="Primary">
          {navViews.map((v) => (
            <button
              key={v.key}
              className={`nav-tab${(v.key === 'more' ? moreActive : view === v.key) ? ' active' : ''}`}
              onClick={() => (v.key === 'more' ? setMoreOpen(true) : setView(v.key))}
            >
              {v.label}
            </button>
          ))}
        </nav>
        {/* Step 4: live corpus line. Falls back to the honest source label
            only while the corpus count is unknown — never a stale number. */}
        {corpusLine ? (
          <span className="data-source">{corpusLine}</span>
        ) : (
          graph && <span className="data-source">data: {graph.source}</span>
        )}
        {accountUi && (
          <button
            className="account-btn"
            aria-label="Account"
            onClick={() => setAccountOpen(true)}
          >
            Sign in
          </button>
        )}
        <button
          className="info-btn"
          aria-label="About this app"
          onClick={() => setAboutOpen(true)}
        >
          ⓘ
        </button>
      </header>

      {aboutOpen && (
        <div className="sheet-backdrop" onClick={() => setAboutOpen(false)}>
          <div
            className="sheet about-sheet"
            role="dialog"
            aria-label="About"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-head">
              <h2>Media Intelligence Platform</h2>
              <button className="sheet-close" aria-label="Close" onClick={() => setAboutOpen(false)}>
                ×
              </button>
            </div>
            <p className="sheet-body">
              MIP tracks news stories through their full consequence arc — knowledge graph, causal
              timeline, story arcs, and the live article feed.
            </p>
            {graph && <p className="sheet-body muted">Data source: {graph.source}</p>}
          </div>
        </div>
      )}

      {moreOpen && moreEntries.length > 0 && (
        <div className="sheet-backdrop" onClick={() => setMoreOpen(false)}>
          <div
            className="sheet more-sheet"
            role="dialog"
            aria-label="More"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-head">
              <h2>More</h2>
              <button className="sheet-close" aria-label="Close" onClick={() => setMoreOpen(false)}>
                ×
              </button>
            </div>
            <div className="more-list">
              {moreEntries.map((entry) => (
                <button
                  key={entry.key}
                  className="more-item"
                  onClick={() => openFromMore(entry.key)}
                >
                  {entry.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {accountOpen && accountUi && <AccountPanel onClose={() => setAccountOpen(false)} />}

      <main className="app-main">
        {error && <div className="notice error">Failed to load graph: {error}</div>}

        {view === 'news' && (
          <NewsView
            onOpenArc={openArcInView}
            onOpenNode={openNodeInGraph}
            focusArticleId={focusArticle}
            onOpenTimeline={openEventInTimeline}
            // Pair 5 degrades honestly when the destination tab is gated off.
            onOpenComparison={sourceComparisonBeta ? openComparisonEvent : undefined}
          />
        )}

        {view === 'graph' && (
          <>
            {!graph && !error && <div className="notice">Loading graph…</div>}
            {graph && graph.nodes.length === 0 && (
              <section className="graph-empty-state" aria-labelledby="graph-empty-title">
                <h2 id="graph-empty-title">Knowledge Graph</h2>
                <p>No published graph nodes or documented relationships are available in the live sandbox yet.</p>
                <p className="muted">
                  The News Feed can contain newly ingested articles before entity-to-node resolution and
                  relationship publication are complete. This view will populate only from those published rows.
                </p>
              </section>
            )}
            {graph && graph.nodes.length > 0 && showHubList && (
              <div className="hub-list">
                <h2>Knowledge Graph</h2>
                <p className="hub-sub">
                  Start from a hub — the most connected events and actors — or open the full graph.
                </p>
                <ol className="hub-items">
                  {hubs.map(({ node, degree }, i) => (
                    <li key={node.id ?? node.slug}>
                      <button className="hub-item" onClick={() => openHub(node)}>
                        <span className="hub-rank">{i + 1}</span>
                        <span className="hub-label">{node.label}</span>
                        <span className="hub-meta">
                          {node.type} · <span className="num">{degree}</span> links
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
                <button className="hub-show-all" onClick={() => setGraphScreen('all')}>
                  Show full graph (<span className="num">{graph.nodes.length}</span> nodes)
                </button>
              </div>
            )}
            {graph && graph.nodes.length > 0 && !showHubList && (
              <div className="graph-layout">
                {/* Track B Step 2 item 1: graph chrome in normal flow —
                    toolbar on top, controls rail beside the canvas stage.
                    Nothing floats over the canvas. */}
                <div className="graph-area">
                  <div className="graph-toolbar">
                    <div className="graph-search">
                      <input
                        type="search"
                        placeholder="Search nodes…"
                        value={nodeQuery}
                        onChange={(e) => setNodeQuery(e.target.value)}
                      />
                      {nodeMatches.length > 0 && (
                        <ul className="graph-search-results">
                          {nodeMatches.map((n) => (
                            <li key={n.id ?? n.slug}>
                              <button onClick={() => pickNode(n)}>
                                <span className="graph-search-label">{n.label}</span>
                                <span className="graph-search-type">{n.type}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <button
                      type="button"
                      className="graph-toolbar-btn"
                      aria-expanded={edgeListOpen}
                      onClick={toggleRelationshipList}
                    >
                      Relationship list
                    </button>
                    <button
                      type="button"
                      className="graph-toolbar-btn"
                      aria-expanded={reviewStatusOpen}
                      onClick={toggleReviewStatus}
                    >
                      Review status
                    </button>
                    {!isMobile && desktopShowAll && focusStack.length === 0 && topHub && (
                      <button
                        type="button"
                        className="graph-toolbar-btn graph-toolbar-focus-btn"
                        title={`Return to the default focused subgraph (${topHub.label})`}
                        onClick={() => setDesktopShowAll(false)}
                      >
                        Focused view: {topHub.label}
                      </button>
                    )}
                  </div>
                  {focal && (
                    <nav className="focus-trail" aria-label="Focus path">
                      {focusStack.length > 0 && (
                        <button
                          type="button"
                          className="focus-back"
                          onClick={focusBack}
                          aria-label="Back to previous focus"
                        >
                          ←
                        </button>
                      )}
                      <ol className="focus-crumbs">
                        {focusStack.length === 0 && focal.synthetic && (
                          <li className="focus-crumb">
                            <span className="focus-crumb-static">
                              Default focus: {focal.label}
                            </span>
                          </li>
                        )}
                        {focusStack.map((crumb, i) => (
                          <li key={`${crumb.kind}-${crumb.id}-${i}`} className="focus-crumb">
                            {i > 0 && <span className="focus-sep" aria-hidden="true">›</span>}
                            <button
                              type="button"
                              className={`focus-crumb-btn${i === focusStack.length - 1 ? ' current' : ''}`}
                              onClick={() => focusTo(i)}
                              aria-current={i === focusStack.length - 1 ? 'page' : undefined}
                            >
                              {crumb.label}
                            </button>
                          </li>
                        ))}
                      </ol>
                      <button type="button" className="focus-show-all" onClick={clearFocus}>
                        Show full graph (<span className="num">{graph.nodes.length}</span> nodes)
                      </button>
                    </nav>
                  )}
                  <div className="graph-workspace-controls">
                    <div className="graph-workspace-tabs" role="tablist" aria-label="Focused Graph views">
                      {GRAPH_WORKSPACE_MODES.map((mode) => (
                        <button
                          key={mode.id}
                          type="button"
                          role="tab"
                          aria-selected={graphMode === mode.id}
                          className={`graph-workspace-tab${graphMode === mode.id ? ' active' : ''}`}
                          onClick={() => {
                            clearPrimaryGraphOverlays()
                            setGraphMode(mode.id)
                          }}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>
                    <label className="graph-region-filter">
                      <span>Region</span>
                      <select
                        value={graphRegion}
                        onChange={(event) => {
                          clearPrimaryGraphOverlays()
                          setGraphRegion(event.target.value)
                        }}
                      >
                        {regionOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label} ({option.count})
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="graph-toolbar-btn"
                      disabled={!canExpandFocus}
                      title={canExpandFocus ? 'Include one more documented relationship level' : 'No additional documented focus level is available'}
                      onClick={() => setFocusExpansion((depth) => Math.min(depth + 1, 2))}
                    >
                      Expand
                    </button>
                    <p className="graph-scope-status" aria-live="polite">{graphScopeLabel}</p>
                  </div>
                  <div className="graph-body">
                    {graphMode !== 'relationships' ? (
                      <GraphModePanel
                        mode={graphMode}
                        nodes={displayNodes}
                        onReturnToRelationships={() => setGraphMode('relationships')}
                      />
                    ) : (
                    <>
                    <div className="graph-rail">
                      <Legend />
                      <EdgeControls
                        minReliability={minReliability}
                        onMinReliabilityChange={setMinReliability}
                        showInferred={showInferred}
                        onShowInferredChange={setShowInferred}
                        inferredCount={inferredCount}
                        topicsAvailable={!!topicsData}
                          onOpenTopics={() => {
                            if (topicsOpen) {
                              setTopicsOpen(false)
                            } else {
                              clearPrimaryGraphOverlays()
                              setTopicsOpen(true)
                            }
                          }}
                      />
                      {topicsOpen && topicsData && (
                        <TopicBrowser
                          topicsData={topicsData}
                          onSelectTopic={handleSelectTopic}
                          onClose={() => setTopicsOpen(false)}
                        />
                      )}
                    </div>
                    <div className="graph-stage">
                      {isMobile && (
                        <div className="graph-mobile-bar">
                          {focusStack.length === 0 && (
                            <button
                              type="button"
                              className="graph-mode-btn"
                              onClick={() => setGraphScreen(graphScreen === 'all' ? 'hubs' : 'all')}
                            >
                              {graphScreen === 'all' ? 'Hub list' : 'Show all'}
                            </button>
                          )}
                        </div>
                      )}
                      <GraphView
                        key={focal ? `focus-${focal.kind}-${focal.id}` : 'all'}
                        nodes={displayNodes}
                        edges={displayEdges}
                        onSelect={handleSelect}
                        panelOpen={!!(selected || policyNode || edgeEvidence) && !isMobile}
                        controlsDimmed={isMobile && !!(selected || policyNode)}
                        isMobile={isMobile}
                        focusNodeId={isMobile && focal?.kind === 'node' ? focal.id : null}
                        minReliability={minReliability}
                        showInferred={showInferred}
                        onEdgeSelect={(selection) => openRelationshipEvidence(selection.edge)}
                        allNodes={graph?.nodes ?? null}
                        focused={subgraph != null}
                      />
                      {edgeListOpen && (
                        <EdgeList
                          nodes={graph.nodes}
                          edges={displayEdges ?? []}
                          minReliability={minReliability}
                          showInferred={showInferred}
                          onSelectEdge={openRelationshipEvidence}
                          onClose={() => setEdgeListOpen(false)}
                        />
                      )}
                      {reviewStatusOpen && (
                        <ReviewStatusPanel onClose={() => setReviewStatusOpen(false)} />
                      )}
                    </div>
                    {/* Item 5: docked relationship panel — flex sibling of the
                        stage on desktop (canvas shrinks beside it, never
                        covered); bottom sheet on mobile with a scrim. */}
                    {edgeEvidence && isMobile && (
                      <div className="ap-scrim" onClick={() => setEdgeEvidence(null)} aria-hidden="true" />
                    )}
                    {edgeEvidence && (
                      <RelationshipPanel
                        edge={edgeEvidence.edge}
                        sourceLabel={
                          graph.nodes.find((n) => (n.id ?? n.slug) === edgeEvidence.edge.source)?.label
                        }
                        targetLabel={
                          graph.nodes.find((n) => (n.id ?? n.slug) === edgeEvidence.edge.target)?.label
                        }
                        isMobile={isMobile}
                        onClose={() => setEdgeEvidence(null)}
                      />
                    )}
                    </>
                    )}
                  </div>
                </div>
                {/* Mobile: scrim behind the bottom sheet (tap to close). */}
                {selected && isMobile && (
                  <div className="ap-scrim" onClick={handleClose} aria-hidden="true" />
                )}
                {selected && (
                  <ArticlePanel
                    node={selected}
                    nodes={graph.nodes}
                    edges={graph.edges}
                    pinned={pinned}
                    onTogglePin={() => setPinned((p) => !p)}
                    onNavigate={handleNavigate}
                    onFocusNode={handleFocusNode}
                    onOpenConsequence={openConsequenceView}
                    onShowEdgeEvidence={openRelationshipEvidence}
                    onOpenArticle={openArticleInNews}
                    onClose={handleClose}
                    isMobile={isMobile}
                  />
                )}
                {/* Step 10 (§7.4): policy consequence view. */}
                {policyNode && isMobile && (
                  <div className="ap-scrim" onClick={closePolicyPanel} aria-hidden="true" />
                )}
                {policyNode && (
                      <PolicyPanel
                    node={policyNode}
                    nodes={graph.nodes}
                    edges={graph.edges}
                    onNavigate={handleNavigate}
                    onClose={closePolicyPanel}
                    isMobile={isMobile}
                  />
                )}
              </div>
            )}
          </>
        )}

        {view === 'timeline' && (
          <TimelineView
            onOpenArc={openArcInView}
            onOpenArticle={openArticleInNews}
            focusEventKey={focusTimelineEvent}
            focusArcKey={focusTimelineArc}
          />
        )}
        {view === 'arcs' && (
          <ArcsView
            focusArcId={focusArc}
            onOpenArticle={openArticleInNews}
            onOpenNode={openNodeInGraph}
          />
        )}
        {view === 'phase3' && phase3Beta && <Phase3View />}
        {view === 'compare' && sourceComparisonBeta && (
          <SourceComparisonView
            onOpenArticle={openArticleInNews}
            onOpenArc={openArcInView}
            onOpenTimeline={openEventInTimeline}
            focusEventId={focusComparisonEvent}
          />
        )}
      </main>

      <nav className="bottom-nav" aria-label="Primary">
        {navViews.map((v) => (
          <button
            key={v.key}
            className={`bottom-tab${(v.key === 'more' ? moreActive : view === v.key) ? ' active' : ''}`}
            onClick={() => (v.key === 'more' ? setMoreOpen(true) : setView(v.key))}
          >
            {v.shortLabel}
          </button>
        ))}
      </nav>
    </div>
  )
}
