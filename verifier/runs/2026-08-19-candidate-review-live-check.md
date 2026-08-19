# Candidate Review Live Check — 2026-08-19

The public GitHub Pages deployment at `https://jkelsen13-tech.github.io/media-intelligence-platform-v2/` was reopened after the candidate-review ledger closure. It loaded successfully from Supabase, reported a live corpus of **12,558 articles**, and exposed the News Feed, Knowledge Graph, Causal Timeline, Story Arcs, and More navigation.

The News interface rendered the source-aware controls for date, region, evidence basis, topic, source ordering, and article state. Its evidence model explicitly states that corroboration is unavailable until verified source-lineage records exist, that multiple outlets do not establish independence, and that no composite vendor or reliability score is calculated. This is consistent with the no-auto-promotion posture.

Candidate-ledger audit of the isolated sandbox found no `approved` or `pending` rows in `cross_surface_candidates`: the reviewed set comprises 18 rejected records and three `owner_hold` records. Consequently, there were no newly approved records requiring cross-surface propagation checks in this run. The three owner holds remain blocked from all propagation by the hard-stop rule.

Browser capture: `/home/ubuntu/screenshots/jkelsen13-tech_githu_2026-08-19_18-51-48_9588.webp`.

## Cross-surface smoke check

The public **Knowledge Graph** loaded after the candidate-ledger closure. It showed 47 total nodes, 15 nodes in the focused view, and 14 documented relationships. The graph retained its explicit causal-versus-sequence distinction, reliability controls, geographic overlay, and source-backed city markers. Capture: `/home/ubuntu/screenshots/jkelsen13-tech_githu_2026-08-19_18-52-56_2910.webp`.

The public **Causal Timeline** loaded after the candidate-ledger closure. The selected `Epstein Files Transparency Act — process, safeguards, and oversight` arc rendered 13 timeline records, including six News records; records were explicitly marked `Sequence only` where causality was not source-supported. The shared evidence and connection controls were present. Capture: `/home/ubuntu/screenshots/jkelsen13-tech_githu_2026-08-19_18-53-03_7197.webp`.

These are baseline live surfaces; no newly approved candidate was present because the approved count was zero. The candidate ledger's 18 rejected records and three owner-held records remain excluded from propagation.
