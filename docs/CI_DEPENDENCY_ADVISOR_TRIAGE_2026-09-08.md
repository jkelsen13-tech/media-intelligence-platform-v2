# Node 22/24 CI and dependency/advisor triage

Golden regression tests and production builds run on Node 22 and 24. Pages tests/build use Node 24 and locked npm ci installation. checkout 7.0.1 and setup-node 7.0.0 use the Node 24 action runtime. No runtime dependencies are upgraded in this initial change.

A Node 24 npm audit JSON report is diagnostic (continue-on-error), separately from the mandatory regression and build steps. It does not imply vulnerable packages are approved; findings are being triaged by direct/transitive dependency and production/build exposure before remediation.

Supabase security baseline: 70 INFO, 10 WARN, 6 ERROR findings. Six ERRORs concern owner-context views: spatial_projection_v1, authors_public, arc_milestones_public, graph_coverage_public, news_detail_public and comparison_public. Two WARNs concern mutable search_path on trigger functions. Six WARN entries concern anon/authenticated execute grants on three trigger functions. The remaining WARNs concern vector in public and leaked-password protection. These are existing findings, not findings introduced by PR74. Triage must inspect predicates, underlying grants and trigger return types before changing access or labeling a finding exploitable.

References: [Node release support](https://nodejs.org/en/about/previous-releases), [Supabase view advisor](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view).
