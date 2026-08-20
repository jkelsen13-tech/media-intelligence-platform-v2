# V2 public author projection — live validation

**Date:** 2026-08-20  
**Deployment:** commit `f8964fd` on the public V2 GitHub Pages site.

## Diagnose-first finding

The News interface renders only a public byline/display name. The private `authors` table contains additional analytical and profiling fields that are not needed for this UI. The V2 imported corpus currently has **0 author rows** and **0 articles with an `author_id`**, so no nonempty byline could be sampled today; the normal current UI state remains the existing disclosure that no author byline is stored.

## Authorized path used

**Path B — `authors_public`** was used because the public interface has a genuine author-name rendering requirement. The view is a security-barrier projection over `authors` and exposes exactly `id` and `name`; no normalized name, beats, outlet network, counts, timestamps, framing profile, confidence, or other author fields are public.

| Check | Result | Evidence |
|---|---|---|
| `authors_public` anonymous API read | Pass | Returned HTTP 200. The current view has zero rows because the base author corpus is empty. |
| Declared projection schema | Pass | `information_schema` lists only `id` (uuid) and `name` (text). |
| Direct `authors` anonymous API read | Pass | Returned HTTP 401 after the public projection was introduced. |
| Fresh live News reload | Pass | The public News route loaded **12,558 articles** with 30 initial cards and no `authors` permission error. |
| Byline data availability | Honest empty state | V2 currently has no author records or article author references, so a live populated byline cannot yet be sampled. The reader and test cover mapping when a legitimate public byline later exists. |

The direct base-table grant remains revoked. No `authors` metadata beyond the approved two-column view was restored or exposed.

## Subsequent on-demand route result

After the full feed passed, opening a live News card produced `permission denied for table article_claims`. This confirms the already-mapped, on-demand News-detail dependency on `article_claims`/`claims`/`claim_evidence_links`; it does **not** invalidate the successful author projection or full-feed reload. No grant was restored. Under the stop-and-flag requirement, a separate public detail projection (or explicit authorization to reduce the detail contract) is required before this interaction can be repaired.
