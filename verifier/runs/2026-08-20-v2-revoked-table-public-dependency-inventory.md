# V2 revoked-table public dependency inventory

**Date:** 2026-08-20  
**Scope:** V2 sandbox only. This inventory records browser-side reads of the 26 tables whose anonymous `SELECT` access was revoked. It distinguishes initial public-route blockers from on-demand or fail-closed reads.

## Method

The public browser source was traced for every `from('<table>')` reference to a directive-listed table. The V2 schema was then inspected for `articles` and `authors`, and the News rendering path was traced from `loadArticles()` through `NewsView`.

## News author finding — Path B is required

The News UI genuinely renders an author **byline/display name**. It appears in the expanded article metadata (`by <name>`) and in the publisher-record disclosure (`Byline recorded: <name>`). The base `authors` table contains analytical and profiling columns beyond the public need, including normalized name, outlet sets, beats, counts, timestamps, framing profile, and confidence. The public contract is therefore exactly:

| Public field | Purpose | Source column |
|---|---|---|
| `id` | Associates a public byline with the article's already-public `author_id` | `authors.id` |
| `name` | Renders the publisher-record byline | `authors.name` |

The initial News list was failing because `loadArticles()` embeds `authors(name)` even though the card face does not show the byline. The data is used after expansion for the author badge, and the expanded detail independently renders the same byline. Removing the join would still leave a genuine authored-byline use case, so **Path B — a narrow `authors_public` projection — is the accurate remedy**.

## All discovered V2 browser dependencies

| Surface / invocation | Revoked table(s) | Exact browser requirement | Current consequence after revocation | Proposed minimal handling |
|---|---|---|---|---|
| News initial list | `authors` | `id`, `name` via article author relationship | **Blocks the full News list** at the first failed request | Use `authors_public(id, name)` and load it separately by the article rows' public `author_id` values. |
| News expanded article detail | `authors` | `id`, `name` byline | Will fail when opening a card unless migrated with list path | Use the same narrow author projection. |
| News expanded detail | `article_claims`, `claims`, `claim_evidence_links` | Surface text, stance, loaded-language flags, claim kind/status, linked evidence URL/type | On-demand detail failure; initial News failure masks it | Requires a separately authorized narrow public detail projection or a confirmed removal of nonessential UI data. Not changed in the author-projection pass. |
| News → Source Comparison cross-link | `article_claims`, `claims` | Identifies comparison event(s) covering one article | Fails closed to no comparison chip | Can be rebuilt from `comparison_public` only; separate route migration needed. |
| Story Arcs main loader | `arc_milestones`, `pipeline_config` | Milestone status to derive public arc status; dormant-days operational setting | **Likely blocks Story Arcs** because `arc_milestones` error is thrown; config defaults to 14 days if unreadable | Public milestone status needs a narrow projection; remove the operational config dependency by retaining the already-coded `14` day default. |
| Story Arc detail | `arc_milestones` | Milestone title, status, notes, update timestamp | On-demand arc-detail failure | Requires a separate narrow public milestone projection. |
| Grouped Timeline mode | `arc_milestones`, `pipeline_config` | Milestone status plus dormant-days setting | **Likely blocks grouped timeline** if mode is entered; feature flag itself fails closed because `pipeline_config` is denied | Same milestone projection; use fixed documented default for operational config. |
| Location-corroboration badge | `pipeline_config`, `sky_verifications` | Operational feature gate then optional image-derived record | Fails closed and renders no badge; does not block page | No public route repair proposed; these fields are not required to render the News/Graph/Timeline baseline. |
| Legal/Policy loader | `pipeline_config`, `p3_legal_case`, `p3_legal_case_evidence` | Legal review and policy data | Not assessed further | Explicitly out of scope; no change. |
| Account initialization | `pipeline_config`, `mip_profiles` | Feature flag and authenticated profile | Public unauthenticated view fails closed; profile is not a public route read | No public change; the directive preserves `authenticated` access. |
| Theme and explanation flags | `pipeline_config` | Non-content feature flags | Fail closed rather than exposing operational settings | No public change proposed. |

## Result

The fresh live News reload stopped at the **first** error (`authors`), so it did not test the later dependencies at runtime. The code inventory establishes the other direct reads before changing anything. The upcoming authorized author projection addresses the initial News blocker only; it must not restore the base `authors` grant or reveal any non-byline author fields.

The Story Arcs/Timeline milestone and News detail/comparison dependencies are separate public-route compatibility items. They are documented here before any repeat reloads, so they can be resolved deliberately rather than through trial-and-error. The Legal/Policy paths remain untouched.

## Complete public-page sweep

The browser-app entry points and their reachable loaders were traced across News, Knowledge Graph, Causal Timeline, Story Arcs, and Source Comparison. Of the 26 revoked tables, the following are reachable from a public interaction; all other directive-listed tables have **no browser-side reference** in the public V2 application.

| Public page or interaction | Reachable revoked table | Observed or code-path behavior | Close state |
|---|---|---|---|
| News full feed | `authors` | Direct initial query blocked the full feed; repaired by `authors_public`. | Resolved and deployed. |
| News expanded detail | `article_claims`, `claims`, `claim_evidence_links` | Confirmed live: card expansion shows `permission denied for table article_claims`. | Separately authorized for a narrow News-detail projection. |
| News → Source Comparison chip | `article_claims`, `claims` | On-demand lookup silently returns no comparison chip when denied. | Separately authorized for migration to `comparison_public`. |
| Story Arcs initial list | `arc_milestones` | `loadArcs()` throws on a denied milestone read, so the public arc list cannot load. | Separately authorized for a narrow milestone projection. |
| Story Arc detail / Timeline arc scope | `arc_milestones` | `loadArcDetail()` throws on a denied milestone read; it drives the milestone checklist and derived evidence/status copy. | Separately authorized for the same milestone projection. |
| Timeline grouped-mode feature flag | `pipeline_config` | `loadTimelineGroupedBetaFlag()` catches an error and returns `false`; the optional grouped control is omitted and the existing flat timeline remains the active implementation. No retry, log, or user-visible error path exists. | Clean fail-closed behavior; no projection needed. |
| Arc status derivation | `pipeline_config` | `loadArcs()` / `loadArcGroupedTimeline()` ignore a config read error and set `dormantDays` to the literal fallback `14`. The current internal configuration is also `14`, so current output is correct. If an owner later changes the internal setting, the public UI will silently stay at 14; this is a documented semantic fallback, not an automatic confirmation of future configurability. | No current user-visible defect; do not project operational config. |
| Location-corroboration badge | `pipeline_config`, `sky_verifications` | The feature-flag read catches errors and returns `false`; no sky-verification query then occurs and no badge is rendered. | Clean fail-closed optional enhancement; no projection needed. |
| Knowledge Graph baseline / node panels | none of the remaining revoked tables required for baseline rendering | Graph boot reads `nodes` and `edges`; location mentions are separately failure-isolated. `sky_verifications` remains gated off as above. | No direct baseline dependency. |
| Source Comparison | none after prior migration | Reads only `comparison_public`. | Resolved and deployed. |

## Comparison-public reuse decision

The existing `comparison_public` projection cannot replace the News detail contract without incorrect coverage loss. It is correctly scoped to non-`timeline_only` events with at least two distinct outlets, exposes opaque `article_key` values rather than an article-ID lookup, and packages claim data by comparison event. A service-side population check found **368** articles with current reviewed claims, of which **354** occur in the multi-outlet comparison population and **14** do not. Reusing it would make those 14 News detail records appear to have no reviewed claim data and would not provide a stable direct article lookup. A separate article-keyed News-detail projection is therefore necessary and is not duplicative in purpose.

## News detail field contract

The expanded News detail renders from the three revoked base tables only: (1) claim text, via `article_claims.surface_text` with canonical text as fallback; and (2) linked-evidence URLs with their display type. `stance`, `loaded_language`, `claim_kind`, `status`, internal claim identifiers, corrections, pipeline metadata, and all author/profiling fields are not rendered by the News detail and are not candidates for the new projection.

## Story Arc milestone field contract

The Arc Overview checklist renders only `id`, `title`, `status`, `updated_at`, and optional `notes`. Derived Arc/Timeline evidence copy uses only `title`, `status`, and `updated_at`. The milestone projection should expose precisely those five fields plus the parent `arc_id` required to query them; it must not expose internal milestone metadata beyond this public display contract.

## Stop-and-flag count

There have been **three distinct compatibility stops** under the V2 hardening work: (1) the original Source Comparison base-table route; (2) the News full-feed `authors` join; and (3) the News detail’s claim/evidence reads. The latest authorization batches the fixes for the third stop together with the already-mapped milestone and News→Comparison dependencies, rather than treating the latter two as separate discovered failures.
