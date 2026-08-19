# Reference-Only UI Contract — 2026-08-19

**Authority.** This contract is derived only from the eight screenshots designated by the owner: `IMG_2990` through `IMG_2995`, plus `IMG_3018`. No other image is a visual reference for this pass. The blue animated application background is excluded from the target; the white context cards and blue accents are in scope.

| Surface | Required hierarchy and interaction pattern |
|---|---|
| News | White card feed with blue date lead, concise source/region line, visible evidence-state treatment, three working filter controls for Region, Evidence, and Topic, and compact button controls for valid Arc/Graph destinations. Source controls must state their ordering basis rather than imply an unmeasured popularity or reliability score. |
| Knowledge Graph | Relationship / Geography / Time segmented tabs, compact region and Expand controls, white canvas card, region-level dashed boundaries, a local opaque selected-connection highlight rather than a full-canvas/whole-table outline, a compact relationship review card, and a solid blue `Open evidence` button. |
| Timeline | White policy card, icon-bearing tabs, working range/type filters, vertical event spine, clear event states, detail disclosure, source-backed causal connector only when supported, and button-like related-article/graph navigation. |
| Story Arc | White policy-arc card, blue primary `Explore connections` button, lifecycle strip, key-developments panel, visible evidence-state bar, uncertainty block, and review/source footer. Overview is for lifecycle and key developments. Attached articles are retained in the Evidence tab, not duplicated into Overview. |
| Source Comparison | White event header, blue/white notice card, outlet rows with status color, framing and included chips, lineage disclosure, missing-sample notice when applicable, evidence-state totals, and review/primary-document footer. In-app destinations are compact bordered or filled buttons, not text links. |
| Legal & Policy | White-card detail hierarchy with practical-effect card, non-advice notice, documented-claim caveat, connected-arc action button, evidence-state totals, source-rigor rows, uncertainty block, and review footer. |
| Location corroboration | No current v2 replacement is requested in this pass; any related future surface must preserve the reference's privacy-first language, clear capture steps, and separate status rows. |

## Non-negotiable semantic constraints

The implementation must not fabricate a source-popularity metric, a reliability score, independence, causal relationships, outcomes, or missing-evidence conclusions. The News source ordering will be implemented as a transparent ordering control using only available metadata; any unavailable popularity or reliability assessment will be labelled as unavailable rather than guessed. Every navigation control must render only if a live destination is available.
