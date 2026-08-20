# V2 local/global relevance backlog — decision-ready response

**Scope:** Answers only. No schema, ranking, profile, outlet, Legal/Policy, or public-route implementation was performed. These recommendations preserve the captured boundary against device and IP-derived location, and retain separate visible local-relevance and global-salience signals rather than a composite rank.[1]

## Current V2 facts that constrain the decision

The current V2 data model has a minimal `mip_profiles` relation: `id`, `display_name`, and `created_at`; it contains zero rows. The `outlets` relation has only five curated rows and captures `country` but no city, state/province, ZIP/postcode, media-market, or service-area attribute. In contrast, the live article corpus uses 2,573 distinct outlet labels. V2 has 25 topic rows but no `node_topics` links, and only four geographic places and four node-location mentions. These facts mean neither locality nor topic assignment currently has sufficient corpus metadata for reliable personalized ranking.[2]

| Question | Recommended answer | Reasoning and boundary |
|---|---|---|
| **Q1. Home-location granularity** | Use **optional user-declared city, state/province, and country text**, normalized to a canonical display label; do not use ZIP/postcode or a media-market list in the first design. | A ZIP is overly precise and country-specific, while a media-market vocabulary would require a new maintained mapping layer that V2 does not yet possess. City/region/country is intelligible, editable, and can remain a declaration rather than a location lookup. Store enough structured text to distinguish duplicate city names, but do not infer or resolve it from a device, IP address, or hidden geocoding service.[1] |
| **Q2. Does the corpus have reliable locality metadata?** | **No. Treat locality metadata as absent today.** | The five curated outlet records expose country only, whereas the article stream contains 2,573 distinct outlet labels. The tiny geographic inventory is node-oriented, not a source/outlet service-area taxonomy. Any local ranking would therefore require a separate ingestion and review workstream for outlet coverage area and, later, article-level locality signals. It must not be presented as reliable until that metadata coverage is measured and disclosed.[2] |
| **Q3. Starter global-salience categories and maintenance** | Start with the four categories already captured for owner review: **trade/tariff disputes, climate, AI policy, and nuclear energy**. Maintain them as a small **owner-reviewed editorial configuration** with a change log, effective date, rationale, and explicit add/remove review; do not auto-expand the list from engagement or model judgment. | This supplies a bounded, transparent first set without treating “important” as an opaque model output. It also preserves the rule that global salience is an independently visible signal, not a substitute for local relevance or a composite score.[1] |
| **Q4. No-home-location default** | Default new and anonymous users to a **neutral chronological/general feed with a separately labeled global-salience module**, not to local ranking and not to a global-salience-only feed. | This avoids silently prioritizing stories by an inferred location or hiding ordinary coverage. Users can see why a story is in the global module, while the primary feed remains neutral until they explicitly declare and retain a home location. Clearing a declared location returns to that same neutral-plus-labeled-global state.[1] |
| **Q5. Sequencing relative to in-flight V2 work** | The backlog is **independent of the completed public projection, Track 1–3, and Source Comparison work**, so it neither blocks nor needs to wait for those releases. It should be sequenced only after a dedicated metadata-readiness phase defines and measures outlet locality coverage and topic linkage coverage. | The feature does depend on new, explicitly scoped metadata work: profile schema/privacy UX, outlet service-area data, article locality evidence, and topic association coverage. Those are separate prerequisites, not a reason to reopen the current V2 access-control or propagation changes.[1] [2] |

## Recommended owner decision record

> Adopt the city/region/country declaration as the future optional home-location model; use a neutral primary feed with an explicitly labeled global-salience module when no home is declared; begin with the four named global categories under an owner-reviewed, auditable configuration; and sequence a locality/topic metadata-readiness assessment before any feature specification or implementation.

This is a decision-ready recommendation, not an authorization to alter V2. If approved later, the specification should explicitly state that lack of a local match is an **unknown coverage condition**, not evidence that a story lacks local relevance.[1]

## References

[1]: ../../../upload/Captured-Idea-Local-Global-Relevance-2026-08-20.md "Captured Idea — Local Relevance & Global Salience Filtering"
[2]: ./2026-08-20-v2-local-global-relevance-schema-census.md "V2 local/global relevance — schema and metadata census"
