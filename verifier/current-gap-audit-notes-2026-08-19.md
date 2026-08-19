# Current Gap Audit Notes — 2026-08-19

## Live Graph observation

The live v2 Graph is not empty. It visibly renders a focused 7-of-8-node, 6-relationship DOJ consent-decree subgraph. It includes Relationships, Geography, and Time tabs; region selection; bounded Expand; relationship list; review status; full-graph option; legend; threshold controls; hypotheses toggle; topics; Fit; and Reset. It is therefore inaccurate to describe the Graph as wholly unimplemented.

However, the view is still a small single-arc fixture. Its canvas, visual density, graph data breadth, and reference-level reader states have not been proven against the supplied screenshots. The topic control and several display modes have not yet been exercised with rich data. These are substantive remaining gaps, not completion.

## Live Timeline observation

The live v2 Timeline currently renders one selected story arc with three events. It exposes Timeline, Connections, and Evidence tabs; time and event-type filters; evidence and connections calls to action; confirmed evidence markers; and sequence-only labels. It avoids causal overstatement.

However, the content is visibly thin, with just one arc and three events. The screenshot target implies richer, denser, and more varied event/detail states. Initial screen capture showed a brief loading state and zero-count CTAs before the asynchronous data completed, then the rendered view reported 5 articles and 6 connections. This loading-to-ready behavior needs explicit visual testing under the richer intended corpus.


## Live Source Comparison observation

The live Source Comparison page is not unimplemented. It has a white-card evidence-review layout, search, grouped event cards, outlet count and date state, arc/timeline jumps, outlet source rows, publication timing, shared/unique claim labels, direct primary-document links, article/news jumps, lineage-safe attribution, and explicit single-source unavailable states.

Nevertheless, it is still materially short of the supplied rich comparison reference. Only the Norfolk event has multiple outlets; the other two events are one-source records. The outlet tier field visibly reads `not yet tiered` for every source. All three visible source rows say `No explanation object found for this grouping — treated as unverified`, so the intended claim-by-claim comparison/explanation layer is not populated. There are no curated corroborating/contested/missing claim matrices, no corrected/updated coverage treatment, no actual outlet-quality reasoning, and no demonstrated multi-event source comparison corpus. The layout is directionally closer to the reference but not a close visual or functional match.


## Source Comparison reference requirements (tiles 1–2)

The supplied reference uses a compact mobile composition with: (1) a MIP top bar with information and bookmark controls; (2) a title card, subtitle, event-type pill, event headline, exact outlet count, and date; (3) a separate missing-evidence banner; and (4) three parallel outlet rows that identify outlet and region, headline/framing, included information, and a distinct epistemic state of Confirmed, Contested, or Inferred. The current live screen does not provide this per-outlet framing/included/state structure. Its data model currently has generic article summaries, `not yet tiered` labels, and no explanation objects for the grouping.


## Source Comparison reference requirements (tile 3)

The lower reference requires a verified lineage summary with independent-origin and shared-reporting-chain counts; a precise, sample-bounded missing-evidence notice; supporting/contested/missing evidence totals; primary-filing coverage across outlets; reviewed date; and fixed five-item mobile navigation. The current live screen has lineage-not-verified wording and direct links, but does not have a persisted lineage model, counts, sample-specific missing notice, evidence totals, primary-filing coverage metric, reviewed date, or fixed mobile navigation.

## Timeline reference requirements (tile 1)

The reference uses a compact policy-over-time title card, icon-bearing Timeline/Connections/Evidence tab row, icon-bearing date and type selectors, a missing-evidence banner, a vertically connected chronological rail, a semantic event-type chip, a date treatment with emphasized year, an event title/subtitle, and a drill-in affordance. The current timeline has the title, tabs, filters, banner, and a basic rail, but its tab and filter controls lack this reference-level iconographic, card, and mobile hierarchy.
