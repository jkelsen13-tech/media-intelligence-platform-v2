# Original Platform Algorithm Baseline Audit

**Date:** 2026-08-19  
**Original repository:** `jkelsen13-tech/media-intelligence-platform` at read-only local commit `b71497e`  
**Original data project:** `niejaejtbxgakyrsntxm` — **queried read-only only**  
**v2 data project:** `yhbwnrtlqbjtcrrlpbge` — the only project authorized for writes

## Audit Boundary

This audit compared the original platform’s checked-out repository and aggregate data shape against v2. It did **not** modify the original GitHub repository, its branches, or its Supabase project. The original project was used only as a behavioral and algorithmic baseline; the v2 interface remains governed exclusively by the eight screenshots designated by the owner.

## Algorithm Parity Findings

The original and v2 `src/analysis` directories are byte-equivalent. This preserves the core graph-model, deterministic layout-seed, and checkpoint algorithms used by the original platform.

The original and v2 Graph, Timeline, source-comparison, navigation, and data-read paths were then compared. Most of the algorithm modules remain unchanged. The v2-only differences are deliberate evidence-safety or user-requested functionality additions, not substitutions of the original algorithms.

| Area | Original baseline | v2 disposition |
|---|---|---|
| Analysis model and seeded layout | Existing original logic | Byte-equivalent; retained unchanged. |
| Graph data loader | Loads graph entities and relationships | Retained with the safety correction that an explicitly configured empty sandbox remains empty rather than silently displaying unrelated demo graph data. |
| News loader | Search, outlet, and status pagination | Retained and extended with real server-side Region, Evidence, Topic, and source-directory filtering. The added source-order option describes corpus representation and recorded tiers only; it does not calculate popularity or a composite reliability score. |
| Timeline engine and de-duplication | Existing original chronology and connector model | Retained; v2 changes only add bounded focused-workspace and evidence-display behavior. |
| Relationship provenance | Existing axis-based relationship evidence | Retained and strengthened so a stored graph relationship type is never erased by absent edge-specific provenance. |
| Source Comparison read model | Event, claim, source, and lineage logic | Retained and extended with per-outlet framing, reviewed date, and evidence-total fields. The added fields do not assert source independence. |
| Navigation reset contract | Existing cross-surface reset behavior | Retained and expanded to clear v2-only overlay state safely. |

## Aggregate Data Baseline

The following counts are aggregate metadata only. They are not a completeness claim and do not imply that every original record has a v2 relationship or comparison object.

| Surface input | Original platform | Isolated v2 at audit |
|---|---:|---:|
| Articles | 752 | 838 |
| Graph nodes | 750 | 47 |
| Graph edges | 411 | 36 |
| Story arcs | 49 | 4 |
| Arc events | 70 | 21 |
| Source-comparison events | 347 | 18 |
| Article citations | 38 | 9 |

The v2 article corpus is now larger because it includes the imported public-metadata reference records plus new direct-source Project 2025, Epstein-process, and February 2026 records. Its structured Graph, Story Arc, Timeline, and Source Comparison coverage remains intentionally more selective: v2 adds only source-mapped relationships and events that have a documented basis, rather than inferring edges or duplicating unsupported structure to match raw original-platform counts.

## Regression Baseline Note

The original local test command began successfully and reported 222 passing tests. Seven test files then failed because this read-only clone has no local `vite` package installed (`Cannot find module 'vite/package.json'`), not because their algorithm assertions failed. No dependency installation was performed in the original clone, preserving the audit-only boundary. The v2 suite will be executed after the current refinement pass in its configured workspace.

## Required Follow-Through

The next v2 implementation track will add a scalable geographic graph model. It must preserve the original core analysis and timeline algorithms, use recorded locations only, distinguish area-level placement from exact geolocation, preserve uncertainty when a location is unavailable or ambiguous, and avoid treating headline text or the first paragraph as verified location evidence without an explicit extraction record.
