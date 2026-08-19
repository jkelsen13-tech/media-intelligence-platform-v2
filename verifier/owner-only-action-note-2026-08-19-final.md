# Owner-Only Action Record — 2026-08-19

## Completed Automated Work

The isolated v2 sandbox now has a provenance-first ingestion schema, approved source catalog, resumable run ledger, checkpoint table, extraction-result table, and review-gated cross-surface candidate table. The worker enforces a fixed maximum manifest size of **10**, deterministic Document 07 / Louisiana v. Callais exclusion, source-level deduplication, robots-aware publisher hydration for approved publisher feeds, literal-evidence validation, and explicit local exclusion/failure logs. It cannot write graph nodes, graph edges, timeline records, arc memberships, or geographic placements.

A narrowly scoped isolated-v2 RPC writer was added so the local worker can insert only new article URLs, candidate extraction output, citations, and `pending` cross-surface candidates without using a production database or a service-role credential. Existing articles are immutable to this worker. The writer has been exercised against two real publisher-feed manifests: **10 BBC** and **10 NPR** records were inserted, for **20 new source-mapped articles**. The source-table graph remains at **47 nodes** and **36 documented relationships**; no automated graph or timeline promotion occurred.

| Completed direct-manifest result | BBC | NPR | Combined |
|---|---:|---:|---:|
| New source-linked articles | 10 | 10 | 20 |
| Candidate extraction results | 4 | 8 | 12 |
| Failed extraction results retained for audit | 6 | 2 | 8 |
| Pending cross-surface candidates | 0 | 8 | 8 |
| Approved or live cross-surface promotions | 0 | 0 | 0 |

The current extraction behavior is intentionally conservative. It retains only claims, citations, locations, and candidate proposals whose literal evidence can be grounded unambiguously in stored publisher text. Invalid or ambiguous individual items are pruned and logged; they do not erase other valid items in the same record.

## Human Review Required

The eight newly created cross-surface candidates require a human decision before any use on live Graph, Causal Timeline, Story Arc, or geographic display surfaces. They comprise **seven geography mentions** and **one graph-node candidate**, all marked `review_state = pending`. The worker makes no relationship, event, causal, location-coordinate, or source-independence assertion.

Extraction-result rows in `failed` state should be reviewed or reprocessed only after validating a changed model/prompt/version against a bounded manifest. They are retained as audit evidence and are not presented as completed extraction.

## Backfill Blocker and Required Owner Decision

The approved bulk discovery endpoint, **GDELT DOC 2.0**, repeatedly returned HTTP `429 Too Many Requests` even after the worker was updated to honor GDELT’s reported minimum of one request every five seconds. No 10,000-record run was started after this persistent rate limit, and no unapproved alternative source endpoint was substituted.

> The currently approved BBC, NPR, and DOJ RSS endpoints do not expose a documented historic archive path in the approved source catalog sufficient to supply the requested 10,000-record chronological corpus. Introducing publisher sitemaps, web archives, commercial APIs, or a different dataset would expand source scope and requires explicit owner approval.

To resume the 10,000-record backfill, authorize **one** of the following scope changes: an approved alternate bulk discovery dataset/end point, a defined publisher sitemap/archive list, or a documented GDELT access/limit arrangement. The existing worker will continue to enforce ten-item manifests and Document 07 exclusion regardless of the selected source.

## Credential Record and Rotation

A one-purpose, locally stored ingestion RPC key was provisioned for the isolated project only. Its plaintext is stored only in the ignored local file `.mip_v2_ingestion_writer_key.local`; Supabase stores a SHA-256 hash in `ingestion_writer_credentials`. It is not a service-role key and cannot be read through the public application.

Rotate or deactivate this key before any environment sharing, host migration, or change in operator. Rotation requires generating a new local key, replacing the isolated hash, and restarting the worker with the matching local key. No production Supabase project and no Google Cloud project was accessed or modified.

## Transparent 3D Möbius Logo

No transparent 3D Möbius-strip logo was generated in this run because the connected image tooling was not a reliable free 3D modeling/export path. The recommended free workflow is **Blender** for a true transparent-background render with controllable materials and camera, followed by a PNG/WebP export with alpha. A lighter browser-based alternative is **Spline** on its free tier, subject to its current export and account limits. The design brief should preserve an alpha background, avoid a matte or colored canvas, and export a high-resolution asset plus a compressed web derivative.
