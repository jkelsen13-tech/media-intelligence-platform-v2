# Markets prerequisite contract qualification

Base: 267c36dec6c39afafbab4494efffc83d01a6a752 (PR #120).
This is server-side semantic contract preparation, not a deployed Markets endpoint,
public asset registry, new publisher or completed Markets release.

## Reconciled existing state

Read-only survivor inspection found zero public.entities rows, one public.nodes
row of type event, seven retained record versions (five article, one graph_node,
one temporal_assessment) and one supported private assessment. Node types are
event/actor/institution/document/anomaly/policy/topic; stock instruments and
cryptoassets are not yet canonical node types. Do not infer assets from ticker
text or silently treat a company, listing, network and token as the same identity.

Reuse evidence_pipeline.record_versions, exact article captures, candidate spans,
assessments, roots and dependency invalidations. Existing candidate spans use
PostgreSQL Unicode code-point offsets; the contract follows that convention.
The existing private assessment release_state is constrained to private and
read_assessment reports publicly_eligible=false. No contract flag can authorize
changing that state or making those rows available to anonymous readers.

## Qualified semantic boundary

marketsEvidenceContract.mjs is a pure server-side validator with no runtime caller.
It accepts a bounded proposed projection from a future trusted retained-record
adapter, never public request JSON as authority. It checks:

- Canonical UUID plus exact identity record version; equity issuer identity;
  crypto network plus asset identifier; namespace-qualified, half-open dated
  aliases. A symbol never becomes an identity.
- One to eight connected, acyclic, explicitly typed essential relationship hops;
  exact assessment IDs and candidate IDs, supported outcome, no stale/superseded
  decision, valid interval and explicit release eligibility.
- Every hop's exact capture/span/excerpt, article and shared root identity,
  retained payload hash, publication text, recorded timestamp and versioned
  excerpt rights/attribution. Permission loss or corrected bytes fails closed.
- Nanosecond-exact interval comparisons with explicit offsets; source publication
  text, including date-only precision, is retained without midnight invention.
- A narrow output projection that does not forward arbitrary private properties.
  No price fields, composite confidence, independent-source count or causal verdict.

The supplied at is valid/event time, not as-known-then time. Historical knowledge
must come from a retained observation; this validator does not reconstruct it.
Shared root IDs are preserved, not asserted to be independently verified.
Right/publication booleans are required adapter inputs, not security credentials
or standalone proof of publication, ownership, source authenticity or licensing.

## Release prerequisites still pending

A production integration must implement and qualify typed canonical asset history,
version/alias/source bindings, a trusted authorized reader and existing publication
decision references. Validate rights records and exact stored versions in the
database; never trust caller-supplied booleans. It must wire direct reporting,
connected developments and separately labelled broader context into shared views,
then prove stock and crypto journeys plus an indirect path on retained real data.
No parallel graph, new private-to-public shortcut or synthetic production assets.

The current snapshot has no eligible market identity/path. A new empty UI cannot
stand in for those prerequisites. No Markets tab, numerical quote feed, TradingView
embed or CoinMarketCap integration is enabled by this batch. Account-specific
rights and quota proof remain required; there are no new fees/providers.

The unit examples are explicitly synthetic and run only in CI. They establish
contract counterexamples, not real assets, relationships, reviews or publications.
All existing tests/builds and postmerge live checks remain required. Results are
recorded on the PR. Overall Markets and backend consolidation remain incomplete.
