# Run log — 2026-08-12 — Doc 15A atomic attach (verifier v6)

All SQL executed live against project SUPABASE_PRODUCTION_REF_REDACTED via the Supabase
management SQL interface; every row below records the statement's result.
Scratch fixtures: arcs 15aa0000-…-0001..0004 (T1–T4), articles
15ab0000-…-0001 (A, emb 0.04×384), -0002 (B, 0.08), -0003 (M2, 0.02),
-0004 (M3, 0.02), -0005 (M4, 0.02). T1 seeded centroid 0.01; T2/T3/T4 seeded
0.02 with their M member pre-attached.

## Baselines
- Pre-run census: articles 752, story_arcs 49, attached 189.
- Unit suite at d799503 in /tmp copy: 204/204 PASS (matches Index).

## Migration
- apply_migration `20260813_atomic_arc_attach`: success.
- pg_proc: attach_article_to_arc(uuid, uuid, vector, jsonb) present.
- First live RPC call FAILED with 42804 (vector subscripting unsupported) —
  and NOTHING landed (A.arc_id null, B.arc_id null, T1 centroid 0.01):
  incidental early proof of atomicity. Function body revised to float8[]
  text round-trip (formula unchanged); re-applied via create or replace.

## Test 1 — concurrent distinct articles, arc T1
- BEFORE (current JS sequence, interleaved at the race window):
  A: update→read(centroid 0.01, m=1)→computes 0.04;
  B: update→read(centroid 0.01, m=2)→computes 0.045; A writes, B writes last.
  FINAL centroid = 0.045. Correct = (0.04+0.08)/2 = 0.06.
  → A's contribution LOST. Premise proven. exit: FAIL (as required).
- AFTER (two RPC calls fired concurrently): results {attached, m=1} and
  {attached, m=2} (serialized on the arc row lock).
  FINAL centroid = 0.06, delta vs expected = 0, members = 2. PASS.

## Test 2 — concurrent duplicate article, arc T2 (member M2, centroid 0.02)
- BEFORE (both threads update→read→write): both see centroid 0.02, m=2; both
  compute and write 0.03 — benign in THIS interleaving (identical values).
  Recorded honestly: the duplicate-corruption mode manifests in the
  sequential ordering (Test 3), which fails before-state.
- AFTER (two concurrent RPC calls, same article): call 1 → {attached, m=2};
  call 2 → {already_attached}. FINAL centroid = 0.03, delta = 0,
  members = 2 (exactly one membership for A). PASS.

## Test 3 — sequential duplicate attach, arc T3 (member M3, centroid 0.02)
- BEFORE: attach #1 → centroid 0.03 (correct). Duplicate attach #2 re-ran the
  fold → centroid 0.035 = A counted TWICE. FAIL (as required).
- AFTER: first RPC {attached, m=2} → 0.03; second RPC {already_attached},
  centroid unchanged at 0.03. PASS.

## Test 4 — partial-failure atomicity, arc T4 (member M4, centroid 0.02)
- BEFORE: membership update landed; forced centroid-write failure
  (invalid vector literal, 22P02 — the class of error the JS try/catch
  swallows) → A attached with centroid still 0.02. ORPHANED STATE. FAIL.
- AFTER: A attached via RPC (centroid 0.03), then forced intra-function
  failure AFTER the membership write and BEFORE the centroid fold
  (null p_arc_id → step-4 `raise exception`, P0001). Result: the membership
  write rolled back — A.arc_id still T4, T4 centroid still 0.03. Neither
  direction orphaned. PASS.

## Cleanup / zero-delta
- All 5 scratch articles and 4 scratch arcs deleted.
- Post-run census: articles 752, story_arcs 49, attached 189,
  scratch rows remaining 0. Zero-delta confirmed.

## Addendum — precision probe for the float8[] text round-trip (2026-08-12)
- vector -> text -> float8[] -> text -> vector identity check across ALL live
  arcs: 49 checked, 47 identity holds; the 2 non-matches are both
  NULL-embedding arcs (identity not applicable). Round-trip is bit-exact at
  the storage type for every stored centroid.
- Reasoning: float4 stored; shortest-round-trip text print; float4->float8
  widening exact; fold arithmetic in float8 (= JS double); single narrowing
  at store, same as the old JS path. Indexing 1-based in dimension order.
