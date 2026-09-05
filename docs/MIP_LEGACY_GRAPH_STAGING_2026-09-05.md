# Legacy graph private staging — 2026-09-05

Private staging and reconciliation for the Manus/Original graph and its
evidence dependencies. Copying and publishing stay separate operations.

## Exact state

- Repository base at design: `2c38d7e` on `main` (tablet Graph inspector fix).
- Production: `qikvmopbtijoebdqosyq`.
- Source of graph/corpus: `yhbwnrtlqbjtcrrlpbge` (Manus).
- Original ledger source: `niejaejtbxgakyrsntxm`.
- Gate A: `jfnzyvzthzqtczlxhjll` (untouched).
- Historical import ledger is complete: 3,818 mappings and 1,504 conflicts.
  Those rows map Original → Manus. They do not prove production has the data.
- This revision does **not** apply the new migration or import live graph rows.

## Why staging is required

Production `public.nodes` (`public read nodes`) and `public.edges`
(`edges_public_read`) currently `SELECT USING (true)` for ordinary readers.
Inserting unreviewed legacy graph rows there would publish them. The Cleveland
eclipse node and the Cyclospora Source Comparison cohort stay as the only
current public graph/news readbacks.

## Implemented path

Migration `20260905203600_mip_legacy_graph_private_staging` adds schema
`legacy_graph_staging`:

- resumable jobs with leases, interruption, and dead-letter
- full original payloads plus source project/table/id, timestamps, and sha256
- pending / quarantined / gap-recorded review states only
- collision and family-mismatch conflicts
- endpoint/orphan checks that never rewrite relationship endpoints
- server-only RPC `public.mip_legacy_graph_v1`

`publish` is rejected. The migration contains no `INSERT`/`UPDATE` against
`public.nodes` or `public.edges`.

Operator module: `scripts/mipLegacyGraphStaging.mjs`. It reuses
`reconcileIdentity` from `scripts/mipIdentityReconciliation.mjs`. Default
commands are dry-run and write no database:

```bash
node scripts/mipLegacyGraphStaging.mjs manifest
node scripts/mipLegacyGraphStaging.mjs plan page.json
```

Live writes require a later reviewed apply of the migration plus a server
service role. Collected payloads and credentials stay out of Git.

## Dry-run inventory (counts only)

Manus graph core is still 949 nodes and 451 edges. 750 nodes and 411 edges
have Original ledger mappings; 199 nodes and 40 edges are Manus-native.
Source Comparison remains a separate family (13,008 events; 0 UUID overlaps
with graph nodes; 665 title overlaps, which do not establish identity).

Production readbacks at capture: 1 node, 0 edges, 3 News rows, 1 comparison,
1 spatial projection, 3 eligible articles. The eclipse node is not on Manus
and is not in the Original ledger.

See `verifier/mip_legacy_graph_staging_2026-09-05.json` for the full
dependency-group counts, unresolved cases, and publication impact.

## Out of scope

Collectors stay off. Auth and storage do not move. Spatial gates do not
change. No project is retired. Bulk article corpus transfer and public graph
promotion are later reviewed steps.
