# trackb3-v2 — Track B Step 3, Item 2: Policy Arc screen (Screen 4)

Date: 2026-08-18. Namespace: trackb3-v2. Branch: main.
Reference: 04_ADDENDUM_SIX_SCREEN_REFERENCE_SPEC (2026-08-17), Screen 4 —
the locked reference. Blue backgrounds in the mockups are placeholder-only;
light-theme tokens (warm off-white canvas, white surfaces) govern.

## Scope

Rebuild the Arcs detail panel (`src/views/ArcsView.jsx`) to the addendum's
Screen 4 structure, composed from the item-1 shared kit
(`src/components/`, `src/lib/epistemicModel.js`) plus two new shared pieces
(`src/components/LifecycleStrip.jsx`, `src/components/TypeIcon.jsx`) and one
new pure seam (`src/lib/policyArcModel.js`).

Live-data facts this item is built against (read-only queries,
2026-08-18, project SUPABASE_PRODUCTION_REF_REDACTED):
- story_arcs.category ∈ {unclassified 14, geopolitical_consequence 11,
  institutional_accountability 10, legislative_regulatory 10,
  economic_policy 4}.
- arc_events (70 rows): category ∈ {accountability 34, geopolitical 23,
  economic 8, legislative 5}; confidence ∈ {corroborated 66, confirmed 4};
  zero inferred, zero contested signal of any kind.
- arc_events has NO source/outlet/url/excerpt columns — source attribution
  for an arc can only come from attached articles (loadArcArticles).
- arc_milestones (35 rows): pending 34, confirmed 1 — the evidence-state
  bar's Missing count and its guardrail-4 scope copy will be exercised by
  real data, not edge-case fixtures.

## Data-mapping decisions (documented before implementation)

1. **Eyebrow.** "POLICY ARC" only when category ∈ {legislative_regulatory,
   economic_policy}; otherwise "STORY ARC". The eyebrow is a content-type
   claim; applying it to a non-policy arc would misdescribe the record.
2. **Evidence-state bar.** supporting = count of arc_events with confidence
   confirmed or corroborated (both are confirmed-grade in the G2
   vocabulary; corroborated already maps to the Confirmed badge in
   item 1's CONFIDENCE_TO_BADGE). contested = 0, ALWAYS — the schema has no
   dispute signal, and a contested count must never be fabricated; the zero
   is documented, not derived. missing = count of pending milestones
   (expected outcomes not yet reported). Three separate counts, never
   summed (Amendment A).
3. **Missing scope copy (guardrail 4).** Computed live: the pending-count
   scope states the number of tracked expected outcomes, the monitored
   period (arc start → latest milestone update), and that the check is
   against the monitored corpus. If inputs are absent the bar falls back
   to MISSING_SCOPE_FALLBACK (item 1) rather than staying silent.
4. **Trust footer.** reviewedAt = null → "Reviewed [date]" line omitted.
   story_arcs.last_update_at is a machine update timestamp, NOT a human
   review date; conflating them would be a G2 violation. The status line's
   "updated [date]" (which the addendum does specify) uses last_update_at.
5. **Lifecycle strip.** Static three-stage orientation (Legislation →
   Ruling → Enforcement), NO progress fill — the schema has no lifecycle
   position field, so position is never implied. Caption "Orientation
   only. Not a score." is hardcoded in the component (not a prop) so it
   cannot be dropped by a caller.
6. **Key developments.** From arc_events (chronological, existing loader
   order). Entry = circular type icon + blue date + title + one-line
   description + type pill. Chevron into detail is OMITTED in this item —
   the expansion engine is item 3/5; an affordance whose join does not
   resolve is never rendered (honest degradation). Type icons: only
   'legislative' maps to a load-bearing icon (scales); the other three live
   categories have no honest mapping into the addendum's
   scales/gavel/shield/mic vocabulary and render the neutral circular
   marker rather than masquerading.
7. **Remaining uncertainty.** Derived from pending milestone titles (what
   is genuinely unresolved). Block omitted when nothing is pending.
8. **Sources line.** Distinct outlets of attached articles. Omitted when
   no articles are attached (arc_events itself carries no source columns).
9. **Tabs.** Overview / Evidence ship in this item. The Timeline tab is
   added when the item-3/4 engine exists — a tab whose content does not
   exist is not rendered.
10. **Existing elements folded, not retired** (owner delegation
    2026-08-18): milestone checklist, coverage-gap bar, arc-age bar,
    attached-articles list, and the coverage-gap warning move into the
    Evidence tab; "Open root event in knowledge graph" becomes the
    "Explore connections" primary CTA (same onOpenNode join — rendered
    only when root_node_id resolves).
11. **Sidebar unchanged.** Arc list, search, focusArcId cross-view entry,
    and mobile push behavior are out of scope for this item.

## Acceptance criteria

A2.1 Eyebrow logic: legislative_regulatory/economic_policy → "POLICY ARC";
all other/unknown categories → "STORY ARC". Unit-tested.
A2.2 Status line renders dot + derived status label + "· updated [date]"
when last_update_at exists; no fabricated date when it does not.
A2.3 Standing explanation paragraph present on Overview, followed by the
arc's real summary when present.
A2.4 "Explore connections" primary CTA renders only when root_node_id and
the onOpenNode join both resolve; clicking calls onOpenNode(root_node_id).
A2.5 Lifecycle strip shows Legislation → Ruling → Enforcement with icons,
no progress fill, and the verbatim caption "Orientation only. Not a
score." The caption is hardcoded in LifecycleStrip.jsx (static guard
test); the strip component has no caption prop.
A2.6 Key developments: one row per arc_event, chronological, circular type
icon (scales only for legislative; neutral marker otherwise), blue date,
title, one-line description, type pill. No chevrons in this item.
A2.7 Chronology banner present with verbatim copy "Chronology shows
sequence. Causal links appear only when supported by evidence."
A2.8 EvidenceStateBar on Overview: supporting = confirmed+corroborated
event count; contested = 0 (documented constant, probe-tested across the
confidence vocabulary); missing = pending milestone count; three separate
counts, no total/sum anywhere; guardrail-4 scope line present whenever
missing > 0.
A2.9 RemainingUncertaintyBlock renders pending milestone titles when any
exist; omitted entirely when none do.
A2.10 Sources line lists distinct attached-article outlets; omitted when
no attached articles.
A2.11 TrustFooter renders with reviewedAt=null → no "Reviewed" line.
A2.12 Evidence tab folds in: milestone checklist (existing four-state
taxonomy), coverage-gap bar (documented proxy retained), arc-age bar,
coverage-gap warning, attached-articles list. None of these are deleted.
A2.13 Unknown/unreadable states render nothing (badge, pill, icon) —
never a masquerading default.
A2.14 All new/changed CSS is var()-token-only (no hardcoded hex); kit
hex-audit guard extended to new files.
A2.15 Full suite green (284 baseline + new item-2 tests), production
build clean, byte-verified push, CI green on the pushed commit.
