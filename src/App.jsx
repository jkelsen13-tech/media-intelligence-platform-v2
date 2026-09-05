import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import GraphView from './graph/GraphView'
import Legend from './graph/Legend'
import EdgeControls from './graph/EdgeControls'
import GraphModePanel from './graph/GraphModePanel'
import GraphCoverageNotice from './graph/GraphCoverageNotice'
import { GRAPH_NARROW_CHROME_QUERY, graphInspectorPresentation } from './graph/graphCanvasLayout.js'
import GeographyGlobe from './graph/GeographyGlobe'
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
import WorldView from './views/WorldView'
import { loadPhase3BetaFlag } from './lib/phase3ReadPath'
import { buildNavViews, buildMoreEntries, isMoreViewKey } from './lib/navViews'
import { loadGraph, loadTopics, loadCorpusMeta, loadNodeLocations, loadGraphCoverage } from './lib/supabase'
import { loadInvestigationSurface, surfaceJoinDisclosures } from './lib/investigationSurface'
import { liveCorpusLabel } from './lib/newsFeedModel'
import { computeHubs } from './lib/hubs'
import { jumpFocusStack } from './lib/jumpReset'
import { resolveTimelineJump } from './lib/navigationContract'
import { resolveFocal, focusDepth } from './lib/desktopFocus'
import {
  emptyInvestigationContext,
  setInvestigationActiveView,
  setInvestigationAsOfTime,
  applySubject,
  subjectFromWorldViewSelection,
  subjectFromGraphNode,
  graphNodeMatchingInvestigation,
} from './lib/investigationContext'
import { commitNewSubject } from './lib/newSubjectPropagation'
import {
  emptyDeepLinkSelection,
  formatTimeQuery,
  hydrateDeepLink,
  isInvestigationDeepLink,
  parseDeepLink,
  serializeDeepLink,
  applySelectionAgainstCatalog,
} from './lib/deepLinks'
import {
  RECENT_INVESTIGATION_STORAGE_KEY,
  commitNewSubjectRememberingRecent,
  pushRecentInvestigation,
  readRecentInvestigations,
  restoreRecentInvestigation,
  snapshotRecentInvestigation,
  unauthenticatedRecentStorage,
  writeRecentInvestigations,
} from './lib/recentInvestigation'
import InvestigationContextBar from './components/InvestigationContextBar'
import {
  EXPLORE_A11Y,
  exploreFocusClose,
  exploreFocusOpen,
  handleExploreDialogKeyDown,
  shellJoinDisclosures,
} from './lib/investigationJoinState'
import {
  filterGraphRegion,
  graphRegionOptions,
  recordedGeography,
  summarizeGeography,
  GRAPH_WORKSPACE_MODES,
} from './lib/graphWorkspaceModel'
import AccountPanel from './panels/AccountPanel'
import { loadAccountUiFlag } from './lib/auth'
import InvestigationWorkspace, {
  WorkspaceAccountButton,
  WorkspaceInfoButton,
  WorkspaceNavButton,
  WorkspaceSearch,
} from './components/InvestigationWorkspace'
import {
  CALM_RELATIONSHIP_UNAVAILABLE,
  WORKSPACE_NAV_ITEMS,
  canonicalWorkspaceHeader,
  graphInspectorDismissalAfter,
  shouldRestoreGraphInspector,
  workspaceEvidenceDimensions,
} from './lib/workspacePresentation'
import WorkspaceTechnicalDisclosure from './components/WorkspaceTechnicalDisclosure'

// Nav structure lives in ./lib/navViews (Track B 6->5 restructure,
// 2026-08-16): core tabs + "More". R4 adds World View as a fifth core tab.
// Flag-gated Legal & Policy and Source Comparison stay in the More sheet.

// Mobile-first graph entry: the top N hubs by degree centrality.
const HUB_LIST_SIZE = 30

function placeKeyFromMention(row) {
  return row?.placeId ?? (row?.place != null ? `${row.place}:${row.longitude}:${row.latitude}` : null)
}

function subObjectFromUi(selected, activeLocationKey) {
  if (selected?.id != null || selected?.slug != null) {
    return { kind: 'entity', id: String(selected.id ?? selected.slug) }
  }
  if (activeLocationKey) return { kind: 'place', id: String(activeLocationKey) }
  return null
}

function readInitialDeepLink() {
  if (typeof window === 'undefined') {
    return {
      view: 'news',
      investigationContext: emptyInvestigationContext('news'),
      linkSelection: emptyDeepLinkSelection(),
      selectionFallbacks: [],
    }
  }
  const hydrated = hydrateDeepLink(window.location.hash, {
    currentIc: emptyInvestigationContext('news'),
    catalog: null,
  })
  if (!hydrated.parsed.subjectId) {
    return {
      view: 'news',
      investigationContext: emptyInvestigationContext('news'),
      linkSelection: emptyDeepLinkSelection(),
      selectionFallbacks: [],
    }
  }
  return {
    view: hydrated.investigationContext.active_view ?? hydrated.parsed.view ?? 'graph',
    investigationContext: hydrated.investigationContext,
    linkSelection: hydrated.selection,
    selectionFallbacks: hydrated.fallbacks,
  }
}

const INITIAL_DEEP_LINK = readInitialDeepLink()

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
  // Aggregate coverage is optional: unavailable data omits the disclosure but
  // never changes the graph itself or implies a zero count.
  const [graphCoverage, setGraphCoverage] = useState(null)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null) // selected node data
  const [pinned, setPinned] = useState(false)
  const [view, setView] = useState(INITIAL_DEEP_LINK.view)
  // R4.75 Step 1 — one shared Investigation Context. Tab switches update
  // active_view only. Explicit subject select replaces identity fields.
  const [investigationContext, setInvestigationContext] = useState(INITIAL_DEEP_LINK.investigationContext)
  // R4.75 Step 6 — hash deep-link selection + bounded recent stack.
  const [linkSelection, setLinkSelection] = useState(INITIAL_DEEP_LINK.linkSelection)
  const [selectionFallbacks, setSelectionFallbacks] = useState(INITIAL_DEEP_LINK.selectionFallbacks)
  const [recentInvestigations, setRecentInvestigations] = useState(() =>
    readRecentInvestigations(unauthenticatedRecentStorage()),
  )
  const recentRef = useRef(recentInvestigations)
  const investigationContextRef = useRef(investigationContext)
  const [nodeQuery, setNodeQuery] = useState('')
  const [aboutOpen, setAboutOpen] = useState(false)
  // Track B nav restructure: the "More" tab opens a bottom sheet listing
  // the flag-gated surfaces instead of switching views itself.
  const [moreOpen, setMoreOpen] = useState(false)
  // R4.75 Step 3 hunch: exploreOpen beside moreOpen. Header button opens
  // a sheet containing NewsView in drawer variant. Opening is NOT a view
  // change — do not changeView('news'), do not applySubject.
  const [exploreOpen, setExploreOpen] = useState(false)
  const exploreBtnRef = useRef(null)
  const exploreDialogRef = useRef(null)
  const exploreFocusPrimed = useRef(false)
  // Mobile graph entry: 'hubs' (ranked list) -> 'sub' (hub subgraph) / 'all'.
  const [graphScreen, setGraphScreen] = useState('hubs')
  // Track B Step 2 item 3: desktop defaults to the top hub's focused
  // subgraph; the full graph is an explicit opt-in (this flag). Mobile is
  // out of scope — it already enters through the hub list.
  const [desktopShowAll, setDesktopShowAll] = useState(false)
  // Screen 6 focused-Graph workspace. Geography and Time stay data-backed
  // record views; Region filters semantic clusters without fabricating links.
  const [graphMode, setGraphMode] = useState('relationships')
  // Location mentions are optional and failure-isolated. They carry explicit
  // provenance/review states; an unreadable table yields an honest empty layer.
  const [locationMentions, setLocationMentions] = useState([])
  // A selected geography marker owns an explicit Graph focus until the reader
  // chooses another node or clears focus. This makes the map an interaction
  // surface for the graph, rather than a detached visual overlay.
  const [activeLocationKey, setActiveLocationKey] = useState(null)
  // Investigation view-slice only. Not News / Explore discovery.region.
  // Changing these must not replace canonical_subject_id.
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
  // Source Comparison is publicly enabled through the narrow
  // comparison_public projection. It no longer reads pipeline_config in the
  // browser, so the operational beta flag is intentionally not public input.
  const sourceComparisonBeta = true
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
  const [graphInspectorDismissed, setGraphInspectorDismissed] = useState(false)
  const graphInspectorDismissedSubjectRef = useRef(null)

  const isMobile = useMediaQuery('(max-width: 767px)')
  const isNarrowChrome = useMediaQuery(GRAPH_NARROW_CHROME_QUERY)
  const [graphLayoutRevision, setGraphLayoutRevision] = useState(0)

  // Step 4: live-corpus header line (addendum carried-forward requirement)
  // replaces the machine-facing "data: supabase" label. Failure-isolated —
  // a corpus-meta outage must never block the graph load.
  const [corpusMeta, setCorpusMeta] = useState(null)
  const [investigationSurface, setInvestigationSurface] = useState(null)
  useEffect(() => {
    loadCorpusMeta().then(setCorpusMeta).catch(() => {})
  }, [])
  const corpusLine = liveCorpusLabel(corpusMeta?.count, corpusMeta?.latestFetchedAt, Date.now())

  // Canonical graph/event state loads once. Lens / tab changes must not
  // re-fetch the entire graph (Step 7 §14).
  useEffect(() => {
    loadGraph().then(setGraph).catch((err) => setError(err.message))
    loadGraphCoverage().then(setGraphCoverage).catch(() => setGraphCoverage(null))
    loadNodeLocations().then(setLocationMentions).catch(() => setLocationMentions([]))
    loadTopics()
      .then((data) => {
        // Only expose the affordance when the tables exist AND carry data.
        if (data && data.topics.length > 0) setTopicsData(data)
      })
      .catch(() => {})
    loadPhase3BetaFlag()
      .then((on) => setPhase3Beta(on === true))
      .catch(() => setPhase3Beta(false))
    loadAccountUiFlag()
      .then((on) => setAccountUi(on === true))
      .catch(() => setAccountUi(false))
  }, [])

  useEffect(() => {
    investigationContextRef.current = investigationContext
  }, [investigationContext])

  useEffect(() => {
    recentRef.current = recentInvestigations
    writeRecentInvestigations(unauthenticatedRecentStorage(), recentInvestigations)
  }, [recentInvestigations])

  const deepLinkCatalog = useMemo(() => {
    if (!graph) return null
    return {
      entity: (graph.nodes ?? []).map((node) => node.id ?? node.slug).filter(Boolean),
      place: (locationMentions ?? []).map(placeKeyFromMention).filter(Boolean),
      claim: [],
      source: [],
    }
  }, [graph, locationMentions])

  const rememberPriorSubject = useCallback((priorIc, nextId) => {
    if (!priorIc?.canonical_subject_id || nextId == null) return
    if (String(priorIc.canonical_subject_id) === String(nextId)) return
    const nextStack = pushRecentInvestigation(
      recentRef.current,
      snapshotRecentInvestigation(priorIc, subObjectFromUi(selected, activeLocationKey)),
    )
    recentRef.current = nextStack
    setRecentInvestigations(nextStack)
  }, [selected, activeLocationKey])

  const commitNewSubjectFromApp = useCallback((ic, payload, options) => {
    const result = commitNewSubjectRememberingRecent(
      ic,
      payload,
      options,
      recentRef.current,
      subObjectFromUi(selected, activeLocationKey),
    )
    recentRef.current = result.recentInvestigations
    setRecentInvestigations(result.recentInvestigations)
    return result.investigationContext
  }, [selected, activeLocationKey])

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
    setActiveLocationKey(null)
    setDesktopShowAll(true)
  }, [])

  const handleSelect = useCallback(
    (data) => {
      // Edge taps and canvas taps clear the panel unless it is pinned.
      if (!data || data.source) {
        if (!pinned) {
          setSelected(null)
          const next = graphInspectorDismissalAfter({
            action: 'dismiss',
            canonicalSubjectId: investigationContextRef.current?.canonical_subject_id,
          })
          setGraphInspectorDismissed(next.dismissed)
          graphInspectorDismissedSubjectRef.current = next.dismissedSubjectId
        }
        return
      }
      // A node inspector is the one primary overlay. Lists, review panels,
      // topic browser, and prior relationship evidence close before it opens.
      setGraphInspectorDismissed(false)
      graphInspectorDismissedSubjectRef.current = null
      setEdgeEvidence(null)
      setEdgeListOpen(false)
      setReviewStatusOpen(false)
      setTopicsOpen(false)
      setActiveLocationKey(null)
      // Step 10: policy nodes open the Consequence view instead of the
      // article panel; everything else keeps the existing behavior.
      if (data.type === 'policy') {
        setSelected(null)
        setPinned(false)
        setPolicyNode(data)
        setInvestigationContext((ic) => {
          const subject = subjectFromGraphNode(data)
          rememberPriorSubject(ic, subject.canonical_subject_id)
          return applySubject(ic, subject)
        })
      } else {
        setPolicyNode(null)
        setSelected(data)
        setInvestigationContext((ic) => {
          const subject = subjectFromGraphNode(data)
          rememberPriorSubject(ic, subject.canonical_subject_id)
          return applySubject(ic, subject)
        })
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
        setGraphInspectorDismissed(false)
        graphInspectorDismissedSubjectRef.current = null
        setEdgeEvidence(null)
        setEdgeListOpen(false)
        setReviewStatusOpen(false)
        setTopicsOpen(false)
        setActiveLocationKey(null)
        if (next.type === 'policy') {
          setSelected(null)
          setPolicyNode(next)
        } else {
          setSelected(next)
          setPolicyNode(null)
          setInvestigationContext((ic) => {
            const subject = subjectFromGraphNode(next)
            rememberPriorSubject(ic, subject.canonical_subject_id)
            return applySubject(ic, subject)
          })
        }
        pushFocus(next)
      }
    },
    [graph, pushFocus],
  )

  // A location marker focuses the complete documented set at that place.
  // The canvas uses the same member list, so a multi-node city marker is not
  // reduced to an arbitrary first node.
  const handleLocationFocus = useCallback(
    ({ placeKey, place, nodeKeys }) => {
      if (!graph) return
      const members = (nodeKeys ?? [])
        .map((key) => graph.nodes.find((node) => (node.id ?? node.slug) === key))
        .filter(Boolean)
      if (members.length === 0) return
      setEdgeEvidence(null)
      setEdgeListOpen(false)
      setReviewStatusOpen(false)
      setTopicsOpen(false)
      setPolicyNode(null)
      setPinned(false)
      setSelected(members[0])
      setActiveLocationKey(placeKey)
      setGraphMode('relationships')
      setGraphScreen('all')
      setFocusStack([{ kind: 'location', id: placeKey, label: `Location: ${place}`, memberIds: members.map((node) => node.id ?? node.slug) }])
    },
    [graph],
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
    const next = graphInspectorDismissalAfter({
      action: 'dismiss',
      canonicalSubjectId: investigationContextRef.current?.canonical_subject_id,
    })
    setGraphInspectorDismissed(next.dismissed)
    graphInspectorDismissedSubjectRef.current = next.dismissedSubjectId
  }, [])

  // World View Map / Graph / Split share App's selected-node seam
  // (mip_object_id / subject_graph_node_id). A projection stub is used only
  // when the live graph has not published that node yet.
  // Map pick commits through commitNewSubject → applySubject (one identity).
  // Entering World View does not clear Investigation Context.
  const handleSelectProjection = useCallback(
    (node, row) => {
      if (!node) return
      setPolicyNode(null)
      setActiveLocationKey(null)
      setPinned(false)
      setGraphInspectorDismissed(false)
      graphInspectorDismissedSubjectRef.current = null
      const seedNode =
        node.fromSpatialProjection && graph?.source === 'supabase' && node.subject_graph_node_id
          ? graph.nodes.find((n) => (n.id ?? n.slug) === node.subject_graph_node_id) ?? node
          : node
      setInvestigationContext((ic) => {
        const subject = subjectFromWorldViewSelection({ node: seedNode, row })
        return commitNewSubjectFromApp(
          ic,
          {
            ...subject,
            node: seedNode,
            row,
            fromSpatialProjection: Boolean(seedNode?.fromSpatialProjection || row),
          },
          { landingView: 'world' },
        )
      })
      if (node.fromSpatialProjection) {
        const liveKey = node.subject_graph_node_id
        const live =
          graph?.source === 'supabase' && liveKey
            ? graph.nodes.find((n) => (n.id ?? n.slug) === liveKey)
            : null
        if (live) {
          setSelected(live)
          pushFocus(live)
          return
        }
        setSelected(node)
        return
      }
      setSelected(node)
      pushFocus(node)
    },
    [graph, pushFocus, commitNewSubjectFromApp],
  )

  const handleInvestigationAsOfTime = useCallback((iso) => {
    setInvestigationContext((ic) => setInvestigationAsOfTime(ic, iso))
  }, [])

  // Ordinary nav tab switch — MUST NOT JUMP_CLEARS or replace the subject.
  const changeView = useCallback((key) => {
    setView(key)
    setInvestigationContext((ic) => setInvestigationActiveView(ic, key))
  }, [])

  // Opening Explore is NOT a view change. Do not call changeView('news').
  const openExplore = useCallback(() => {
    setMoreOpen(false)
    setExploreOpen(true)
  }, [])

  const closeExplore = useCallback(() => {
    setExploreOpen(false)
  }, [])

  // §14: predictable focus — search (or dialog) on open, trigger on close.
  useEffect(() => {
    if (exploreOpen) {
      exploreFocusPrimed.current = true
      exploreFocusOpen(exploreDialogRef.current)
      return
    }
    if (exploreFocusPrimed.current) {
      exploreFocusPrimed.current = false
      exploreFocusClose(exploreBtnRef.current)
    }
  }, [exploreOpen])

  // Explicit result select from the drawer: close overlay, then the News
  // jump handler (commitNewSubject — R4.75 Step 5). Browse / filter /
  // preview / dismiss never reach this wrapper.
  const closeExploreThen = useCallback((handler) => {
    if (!handler) return undefined
    return (...args) => {
      setExploreOpen(false)
      handler(...args)
    }
  }, [])

  // One overlay at a time. Opening More via the existing nav onClick
  // (setMoreOpen(true) — do not rewrite that seam) dismisses Explore.
  useEffect(() => {
    if (moreOpen) setExploreOpen(false)
  }, [moreOpen])

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

  // Escape closes Explore first (dismiss only — IC unchanged), then
  // article / policy / relationship overlays (§4.4 close affordance).
  useEffect(() => {
    if (!exploreOpen && !selected && !policyNode && !edgeEvidence && !edgeListOpen && !reviewStatusOpen && !topicsOpen) return
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (exploreOpen) {
        setExploreOpen(false)
        return
      }
      handleClose()
      closePolicyPanel()
      setEdgeEvidence(null)
      setEdgeListOpen(false)
      setReviewStatusOpen(false)
      setTopicsOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [exploreOpen, selected, policyNode, edgeEvidence, edgeListOpen, reviewStatusOpen, topicsOpen, handleClose, closePolicyPanel])

  // --- Cross-view navigation ---
  // Package 1 item 1 (22_NOTE action 1): a cross-view jump REPLACES context.
  // Every handler below routes through this reset so no endpoint, source,
  // excerpt, or uncertainty from a prior relationship/panel can survive into
  // the destination surface (see src/lib/jumpReset.js — JUMP_CLEARS).
  // R4.75 Step 5: Explore / News explicit select commits one new IC via
  // commitNewSubject, then clears only invalid prior-subject leftovers.
  const resetJumpContext = useCallback(() => {
    clearPrimaryGraphOverlays()
    // Cross-view navigation replaces the old graph focal context rather than
    // appending to it. A graph-target jump installs its own one-crumb root.
    setFocusStack([])
  }, [clearPrimaryGraphOverlays])

  // R4.75 Step 5: prior-subject leftovers that JUMP_CLEARS does not cover.
  // Discovery filters stay in NewsView — they are not investigation evidence.
  const clearInvalidNewSubjectSubSelections = useCallback(() => {
    setFocusArc(null)
    setFocusArticle(null)
    setFocusTimelineEvent(null)
    setFocusTimelineArc(null)
    setFocusComparisonEvent(null)
    setActiveLocationKey(null)
  }, [])

  const openNodeInGraph = useCallback(
    (nodeKey) => {
      if (!graph) return
      resetJumpContext()
      clearInvalidNewSubjectSubSelections()
      const next = graph.nodes.find((n) => (n.id ?? n.slug) === nodeKey)
      setGraphScreen('all')
      setView('graph')
      if (next) {
        setGraphInspectorDismissed(false)
        graphInspectorDismissedSubjectRef.current = null
        setSelected(next)
        // Reset — never append: the jump target becomes the new root crumb,
        // so no stale focus path from a prior arc's exploration remains.
        const key = next.id ?? next.slug
        setFocusStack(jumpFocusStack('node', key, next.label ?? key))
        setInvestigationContext((ic) => commitNewSubjectFromApp(ic, next, { landingView: 'graph' }))
      } else if (nodeKey) {
        // Caller-supplied id only. Do not invent a live node or a type.
        setInvestigationContext((ic) => commitNewSubjectFromApp(ic, { id: nodeKey }, { landingView: 'graph' }))
      } else {
        setInvestigationContext((ic) => setInvestigationActiveView(ic, 'graph'))
      }
    },
    [graph, resetJumpContext, clearInvalidNewSubjectSubSelections, commitNewSubjectFromApp],
  )

  const openArcInView = useCallback((arcKey) => {
    resetJumpContext()
    clearInvalidNewSubjectSubSelections()
    setFocusArc(arcKey)
    setView('arcs')
    setInvestigationContext((ic) =>
      commitNewSubjectFromApp(ic, { type: 'arc', id: arcKey }, { landingView: 'arcs' }),
    )
  }, [resetJumpContext, clearInvalidNewSubjectSubSelections, commitNewSubjectFromApp])

  const openArticleInNews = useCallback((articleId) => {
    resetJumpContext()
    clearInvalidNewSubjectSubSelections()
    setFocusArticle(articleId)
    setView('news')
    setInvestigationContext((ic) =>
      commitNewSubjectFromApp(ic, { type: 'article', id: articleId }, { landingView: 'news' }),
    )
  }, [resetJumpContext, clearInvalidNewSubjectSubSelections, commitNewSubjectFromApp])

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
    clearInvalidNewSubjectSubSelections()
    setFocusTimelineEvent(resolved.eventKey)
    setFocusTimelineArc(resolved.scope === 'arc' ? resolved.arcId : null)
    setView('timeline')
    const payload = resolved.eventKey
      ? {
          type: 'event',
          id: resolved.eventKey,
          parentEventId: resolved.scope === 'arc' ? resolved.arcId : null,
        }
      : { type: 'arc', id: resolved.arcId }
    setInvestigationContext((ic) => commitNewSubjectFromApp(ic, payload, { landingView: 'timeline' }))
  }, [resetJumpContext, clearInvalidNewSubjectSubSelections, commitNewSubjectFromApp])

  // Doc 05 pair 5 destination: focus an event in Source Comparison.
  const openComparisonEvent = useCallback((eventId) => {
    resetJumpContext()
    clearInvalidNewSubjectSubSelections()
    setFocusComparisonEvent(eventId)
    setView('compare')
    setInvestigationContext((ic) =>
      commitNewSubjectFromApp(ic, { type: 'event', id: eventId }, { landingView: 'compare' }),
    )
  }, [resetJumpContext, clearInvalidNewSubjectSubSelections, commitNewSubjectFromApp])

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
    setActiveLocationKey(null)
    setGraphInspectorDismissed(false)
    graphInspectorDismissedSubjectRef.current = null
    setSelected(node)
    setNodeQuery('')
    pushFocus(node)
    setInvestigationContext((ic) => {
      const subject = subjectFromGraphNode(node)
      rememberPriorSubject(ic, subject.canonical_subject_id)
      return applySubject(ic, subject)
    })
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
    if (focal.kind === 'topic' || focal.kind === 'location') {
      return topicSubgraph(graph.nodes, graph.edges, focal.memberIds)
    }
    return localSubgraph(graph.nodes, graph.edges, focal.id, focusDepth(isMobile) + focusExpansion)
  }, [graph, focal, isMobile, focusExpansion])

  const activeGraphNodeKey = selected
    ? selected.id ?? selected.slug
    : policyNode
      ? policyNode.id ?? policyNode.slug
      : focal?.kind === 'node'
        ? focal.id
        : null

  const openHub = useCallback((node) => {
    setEdgeEvidence(null)
    setEdgeListOpen(false)
    setReviewStatusOpen(false)
    setTopicsOpen(false)
    setPolicyNode(null)
    setActiveLocationKey(null)
    setFocusStack([{ kind: 'node', id: node.id ?? node.slug, label: node.label }])
    setGraphScreen('all')
    setSelected(null)
    setPinned(false)
    setInvestigationContext((ic) => {
      const subject = subjectFromGraphNode(node)
      rememberPriorSubject(ic, subject.canonical_subject_id)
      return applySubject(ic, subject)
    })
  }, [rememberPriorSubject])

  const focusedNodes = subgraph ? subgraph.nodes : graph?.nodes ?? []
  const focusedEdges = subgraph ? subgraph.edges : graph?.edges ?? []
  const regionOptions = useMemo(() => graphRegionOptions(focusedNodes), [focusedNodes])
  const regionScopedGraph = useMemo(
    () => filterGraphRegion(focusedNodes, focusedEdges, graphRegion),
    [focusedNodes, focusedEdges, graphRegion],
  )
  const displayNodes = regionScopedGraph.nodes
  const displayEdges = regionScopedGraph.edges
  // The canvas overlay uses the same provenance filter as Geography mode.
  // It never derives locations from labels or article text in the browser.
  const graphLocationSummary = useMemo(
    () => summarizeGeography(displayNodes, recordedGeography(displayNodes, locationMentions)),
    [displayNodes, locationMentions],
  )
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

  // Nav entries — Source Comparison is backed by its narrow public projection;
  // Legal & Policy retains its independent, separately governed flag.
  const navViews = buildNavViews({ phase3Beta, sourceComparisonBeta })
  const moreEntries = buildMoreEntries({ phase3Beta, sourceComparisonBeta })
  // The More tab shows active while one of its member views is on screen.
  const moreActive = isMoreViewKey(view)

  const openFromMore = (key) => {
    changeView(key)
    setMoreOpen(false)
  }

  const restoreRecentItem = useCallback((item) => {
    const current = investigationContextRef.current
    rememberPriorSubject(current, item?.canonical_subject_id)
    resetJumpContext()
    clearInvalidNewSubjectSubSelections()
    const restored = restoreRecentInvestigation(item, {
      currentIc: current,
      catalog: deepLinkCatalog,
    })
    setInvestigationContext(restored.investigationContext)
    setView(restored.investigationContext.active_view ?? item?.active_view ?? 'news')
    setLinkSelection(restored.selection)
    setSelectionFallbacks(restored.fallbacks)
    if (restored.selection.place) setActiveLocationKey(restored.selection.place)
    else setActiveLocationKey(null)
  }, [rememberPriorSubject, resetJumpContext, clearInvalidNewSubjectSubSelections, deepLinkCatalog])

  // Re-validate pending deep-link sub-selections once live catalogs exist.
  useEffect(() => {
    if (!deepLinkCatalog) return
    const parsed = parseDeepLink(typeof window !== 'undefined' ? window.location.hash : '')
    const incoming = parsed.subjectId ? parsed.selection : linkSelection
    const parentId = parsed.subjectId ?? investigationContext.canonical_subject_id
    const applied = applySelectionAgainstCatalog(incoming, deepLinkCatalog, parentId)
    setLinkSelection(applied.selection)
    setSelectionFallbacks(applied.fallbacks)
    if (applied.selection.place) setActiveLocationKey(applied.selection.place)
  }, [deepLinkCatalog])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const nextHash = serializeDeepLink(investigationContext, {
      ...linkSelection,
      entity: selected ? String(selected.id ?? selected.slug) : linkSelection.entity,
      place: activeLocationKey ?? linkSelection.place,
      time: formatTimeQuery(investigationContext.as_of_time, investigationContext.selected_time_range),
    })
    const desired = `${window.location.pathname}${window.location.search}${nextHash}`
    const current = `${window.location.pathname}${window.location.search}${window.location.hash || ''}`
    if (desired === current) return
    window.history.replaceState(null, '', desired)
  }, [investigationContext, selected, activeLocationKey, linkSelection])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onHash = () => {
      const hash = window.location.hash
      if (!isInvestigationDeepLink(hash) && parseDeepLink(hash).subjectId == null) {
        return
      }
      const current = investigationContextRef.current
      const hydrated = hydrateDeepLink(hash, { currentIc: current, catalog: deepLinkCatalog })
      if (hydrated.parsed.subjectId) {
        rememberPriorSubject(current, hydrated.parsed.subjectId)
      }
      setInvestigationContext(hydrated.investigationContext)
      if (hydrated.investigationContext.active_view) setView(hydrated.investigationContext.active_view)
      setLinkSelection(hydrated.selection)
      setSelectionFallbacks(hydrated.fallbacks)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [deepLinkCatalog, rememberPriorSubject])

  useEffect(() => {
    const subjectId = investigationContext.canonical_subject_id
    if (!subjectId || investigationContext.canonical_subject_type !== 'event') {
      setInvestigationSurface(null)
      return
    }
    let cancelled = false
    loadInvestigationSurface(subjectId)
      .then((row) => {
        if (!cancelled) setInvestigationSurface(row)
      })
      .catch(() => {
        if (!cancelled) setInvestigationSurface(null)
      })
    return () => {
      cancelled = true
    }
  }, [investigationContext.canonical_subject_id, investigationContext.canonical_subject_type])

  const joinDisclosures = useMemo(
    () => [
      ...shellJoinDisclosures({
        investigationContext,
        view,
        selectionFallbacks,
        graphError: error,
        edgesUnavailable: graph?.edgesUnavailable ?? null,
        nodeCount: graph?.nodes?.length ?? null,
      }),
      ...surfaceJoinDisclosures(investigationSurface, {
        view,
        subjectType: investigationContext.canonical_subject_type,
      }),
    ],
    [investigationContext, view, selectionFallbacks, error, graph, investigationSurface],
  )

  // Returning to Graph restores a live matching node from IC. No node → no
  // invented subject. Tab switch never clears IC. A valid entity sub-selection
  // from the deep link is preferred; stale ids already fell back to parent.
  useEffect(() => {
    if (view !== 'graph' || !graph?.nodes?.length) return
    const canRestore = shouldRestoreGraphInspector({
      dismissed: graphInspectorDismissed,
      dismissedSubjectId: graphInspectorDismissedSubjectRef.current,
      canonicalSubjectId: investigationContext.canonical_subject_id,
    })
    if (!canRestore) return
    if (graphInspectorDismissed) {
      setGraphInspectorDismissed(false)
      graphInspectorDismissedSubjectRef.current = null
    }
    if (linkSelection.entity) {
      const entityNode = graph.nodes.find((node) => String(node.id ?? node.slug) === String(linkSelection.entity))
      if (entityNode) {
        const selectedKey = selected ? selected.id ?? selected.slug ?? selected.subject_graph_node_id : null
        if (selectedKey && String(selectedKey) === String(entityNode.id ?? entityNode.slug)) return
        setSelected(entityNode)
        return
      }
    }
    const match = graphNodeMatchingInvestigation(graph.nodes, investigationContext)
    if (!match) return
    const selectedKey = selected ? selected.id ?? selected.slug ?? selected.subject_graph_node_id : null
    if (selectedKey && String(selectedKey) === String(match.id ?? match.slug)) return
    setSelected(match)
  }, [view, graph, investigationContext, selected, linkSelection.entity, graphInspectorDismissed])

  const canonicalNode = useMemo(
    () => graphNodeMatchingInvestigation(graph?.nodes ?? [], investigationContext),
    [graph, investigationContext],
  )
  const workspaceHeader = useMemo(
    () =>
      canonicalWorkspaceHeader({
        investigationContext,
        canonicalNode,
        selectedChild: selected,
      }),
    [investigationContext, canonicalNode, selected],
  )
  const nodeDimensions = selected
    ? workspaceEvidenceDimensions(selected, { forNode: true })
    : null
  const workspaceNavItems = WORKSPACE_NAV_ITEMS.filter((item) => {
    if (item.key === 'phase3') return phase3Beta
    if (item.key === 'compare') return sourceComparisonBeta
    return true
  })
  const inspectorOccupied = view === 'graph' && !!(selected || policyNode || edgeEvidence) && !isMobile
  const hasNativeInspector = view === 'world'
  const graphInspectorMode = graphInspectorPresentation({
    selected,
    policyNode,
    edgeEvidence,
    isMobile,
    isNarrowChrome,
  })
  const graphInspectorOverlay = graphInspectorMode === 'drawer'
  const graphInspectorDocked = graphInspectorMode === 'docked'

  return (
    <div className="app ws-app">
      <InvestigationWorkspace
        view={view}
        onChangeView={changeView}
        investigationContext={investigationContext}
        header={workspaceHeader}
        nodeDimensions={nodeDimensions}
        selectedChild={selected}
        inspectorOccupied={inspectorOccupied}
        hasNativeInspector={hasNativeInspector}
        onChangeInvestigation={openExplore}
        onChromeChange={() => setGraphLayoutRevision((n) => n + 1)}
        corpusLine={corpusLine}
        searchSlot={
          <WorkspaceSearch
            exploreBtnRef={exploreBtnRef}
            exploreOpen={exploreOpen}
            onOpenExplore={openExplore}
            dialogId={EXPLORE_A11Y.dialogId}
          />
        }
        accountSlot={
          <WorkspaceAccountButton
            enabled={accountUi}
            onClick={() => (accountUi ? setAccountOpen(true) : setAboutOpen(true))}
          />
        }
        infoSlot={<WorkspaceInfoButton onClick={() => setAboutOpen(true)} />}
        leftNav={
          <>
            {workspaceNavItems.map((v) => (
              <WorkspaceNavButton
                key={v.key}
                item={v}
                active={v.key === 'more' ? moreActive : view === v.key}
                onClick={() => (v.key === 'more' ? setMoreOpen(true) : changeView(v.key))}
              />
            ))}
          </>
        }
        details={
          <details className="ws-details">
            <summary>Investigation details & recent history</summary>
            <InvestigationContextBar
              investigationContext={investigationContext}
              recentInvestigations={recentInvestigations}
              onRestoreRecent={restoreRecentItem}
              selectionFallbacks={selectionFallbacks}
              joinDisclosures={joinDisclosures}
              storageKey={RECENT_INVESTIGATION_STORAGE_KEY}
            />
          </details>
        }
      >
      <header className="app-header">
        <h1>MIP</h1>
        <span className="subtitle">Media Intelligence Platform</span>
        <nav className="app-nav" aria-label="Primary">
          {navViews.map((v) => (
            <button
              key={v.key}
              className={`nav-tab${(v.key === 'more' ? moreActive : view === v.key) ? ' active' : ''}`}
              aria-current={(v.key === 'more' ? moreActive : view === v.key) ? 'page' : undefined}
              onClick={() => (v.key === 'more' ? setMoreOpen(true) : changeView(v.key))}
            >
              {v.label}
            </button>
          ))}
        </nav>
        <button
          type="button"
          className="explore-btn"
          aria-label="Explore / Change Topic"
          aria-haspopup="dialog"
          aria-expanded={exploreOpen}
          aria-controls={EXPLORE_A11Y.dialogId}
          data-explore-trigger="true"
          onClick={openExplore}
        >
          Explore / Change Topic
        </button>
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

      {exploreOpen && (
        <div className="sheet-backdrop" onClick={closeExplore}>
          <div
            id={EXPLORE_A11Y.dialogId}
            ref={exploreDialogRef}
            className="sheet explore-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Explore / Change Topic"
            tabIndex={-1}
            data-explore-dialog="true"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) =>
              handleExploreDialogKeyDown(e, { dialogEl: exploreDialogRef.current, onDismiss: closeExplore })
            }
          >
            <div className="sheet-head">
              <h2>Explore / Change Topic</h2>
              <button className="sheet-close" aria-label={EXPLORE_A11Y.closeLabel} onClick={closeExplore}>
                ×
              </button>
            </div>
            <p className="sheet-body">
              Browse the live feed. Search, discovery filters, and preview stay local — they do
              not change the current investigation. Selecting a result replaces it.
            </p>
            <NewsView
              variant="drawer"
              onOpenArc={closeExploreThen(openArcInView)}
              onOpenNode={closeExploreThen(openNodeInGraph)}
              onOpenTimeline={closeExploreThen(openEventInTimeline)}
              onOpenComparison={sourceComparisonBeta ? closeExploreThen(openComparisonEvent) : undefined}
            />
          </div>
        </div>
      )}

      {accountOpen && accountUi && <AccountPanel onClose={() => setAccountOpen(false)} />}

      <main className="app-main">
        {error && view === 'graph' && (
          <WorkspaceTechnicalDisclosure banner={CALM_RELATIONSHIP_UNAVAILABLE}>
            Graph load failed. {error}
          </WorkspaceTechnicalDisclosure>
        )}
        {graph?.edgesUnavailable && view === 'graph' && (
          <WorkspaceTechnicalDisclosure banner={CALM_RELATIONSHIP_UNAVAILABLE}>
            public.edges is unavailable ({graph.edgesUnavailable}). Nodes may still render; no relationships are invented.
          </WorkspaceTechnicalDisclosure>
        )}

        {view === 'news' && (
          <NewsView
            onOpenArc={openArcInView}
            onOpenNode={openNodeInGraph}
            focusArticleId={focusArticle}
            onOpenTimeline={openEventInTimeline}
            // Pair 5 degrades honestly when the destination tab is gated off.
            onOpenComparison={sourceComparisonBeta ? openComparisonEvent : undefined}
            investigationContext={investigationContext}
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
              <div className={`graph-layout${graphInspectorOverlay ? ' inspector-overlay' : ''}`}>
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
                            // Lens change only — do not loadGraph / refetch canonical event state.
                            clearPrimaryGraphOverlays()
                            setGraphMode(mode.id)
                          }}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>
                    <div
                      className="graph-investigation-filters"
                      data-filter-family="investigation"
                      aria-label="Investigation filters"
                    >
                      <span className="filter-family-label">Investigation filters</span>
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
                    </div>
                    <p className="graph-scope-status" aria-live="polite">{graphScopeLabel}</p>
                  </div>
                  {graphCoverage && (
                    <GraphCoverageNotice
                      coverage={graphCoverage}
                      shownNodeCount={displayNodes.length}
                      totalNodeCount={graphCoverage.publishedNodeCount ?? graph.nodes.length}
                      onToggle={() => setGraphLayoutRevision((n) => n + 1)}
                    />
                  )}
                  <div className="graph-body">
                    {graphMode !== 'relationships' ? (
                      <GraphModePanel
                        mode={graphMode}
                        nodes={displayNodes}
                        locationMentions={locationMentions}
                        onReturnToRelationships={() => setGraphMode('relationships')}
                        onSelectNode={(nodeId) => {
                          const node = (graph?.nodes ?? []).find((candidate) => (candidate.id ?? candidate.slug) === nodeId)
                          if (!node) return
                          setGraphMode('relationships')
                          pickNode(node)
                        }}
                        onSelectLocation={handleLocationFocus}
                        activeNodeKey={activeGraphNodeKey}
                        activePlaceKey={activeLocationKey}
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
                    <div className="graph-stage" data-graph-stage="true">
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
                        panelOpen={graphInspectorDocked}
                        layoutRevision={graphLayoutRevision}
                        controlsDimmed={isMobile && !!(selected || policyNode)}
                        isMobile={isMobile}
                        focusNodeId={isMobile && focal?.kind === 'node' ? focal.id : null}
                        minReliability={minReliability}
                        showInferred={showInferred}
                        onEdgeSelect={(selection) => {
                          if (!selection?.edge) {
                            setEdgeEvidence(null)
                            return
                          }
                          openRelationshipEvidence(selection.edge)
                        }}
                        allNodes={graph?.nodes ?? null}
                        focused={subgraph != null}
                      />
                      {!selected && !policyNode && !edgeEvidence && graphLocationSummary.confirmedMappable.length > 0 && (
                        <aside className="graph-geography-overlay" aria-label="Source-backed location context">
                          <GeographyGlobe
                            variant="overlay"
                            locations={graphLocationSummary.confirmedMappable}
                            onSelectNode={handleNavigate}
                            onSelectLocation={handleLocationFocus}
                            activeNodeKey={activeGraphNodeKey}
                            activePlaceKey={activeLocationKey}
                          />
                        </aside>
                      )}
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
                    {edgeEvidence && (isMobile || graphInspectorOverlay) && (
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
                {selected && (isMobile || graphInspectorOverlay) && (
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
                {policyNode && (isMobile || graphInspectorOverlay) && (
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
            investigationContext={investigationContext}
          />
        )}
        {view === 'arcs' && (
          <ArcsView
            focusArcId={focusArc}
            onOpenArticle={openArticleInNews}
            onOpenNode={openNodeInGraph}
            investigationContext={investigationContext}
          />
        )}
        {view === 'phase3' && phase3Beta && <Phase3View />}
        {view === 'compare' && sourceComparisonBeta && (
          <SourceComparisonView
            onOpenArticle={openArticleInNews}
            onOpenArc={openArcInView}
            onOpenTimeline={openEventInTimeline}
            focusEventId={focusComparisonEvent}
            investigationContext={investigationContext}
          />
        )}
        {view === 'world' && (
          <WorldView
            graph={graph}
            graphError={error}
            selected={selected}
            onSelectProjection={handleSelectProjection}
            onSelectGraphNode={handleSelect}
            investigationContext={investigationContext}
            onInvestigationAsOfTime={handleInvestigationAsOfTime}
          />
        )}
      </main>
      </InvestigationWorkspace>

      <nav className="bottom-nav" aria-label="Primary">
        {navViews.map((v) => (
          <button
            key={v.key}
            className={`bottom-tab${(v.key === 'more' ? moreActive : view === v.key) ? ' active' : ''}`}
            aria-current={(v.key === 'more' ? moreActive : view === v.key) ? 'page' : undefined}
            onClick={() => (v.key === 'more' ? setMoreOpen(true) : changeView(v.key))}
          >
            {v.shortLabel}
          </button>
        ))}
      </nav>
    </div>
  )
}
