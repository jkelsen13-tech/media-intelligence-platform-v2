# Linked investigation reasoning batch

Hypotheses now display the saved criteria that would strengthen or weaken each explanation, alongside assumptions and exact excerpts. Linked selected assessments expand to show their recorded outcome, rationale, changed-dependency notice and remaining uncertainty. Criteria describe what to look for; they do not assert that evidence was found.

Commitment stages identify each prerequisite by its position, kind, recorded status and note within the same commitment. Linked collection declarations expand in place to show search scope, timing, method and limitations. No-follow-up remains a bounded observation, never proof of no activity. Branches do not imply completion or causality.

All references resolve within the displayed bundle. Historical inspectors use the historical bundle, including its own assessments and collection declarations. Missing, future-stage and dependency-only assessment references remain explicitly unavailable. No cross-version lookup or live-data fallback is introduced.

## Backend

The additive `investigation_reference_integrity_v1` migration replaces only the existing private state validator. New writes reject duplicate assessment links within a hypothesis and duplicate prerequisite or collection links within a stage. Distinct hypotheses and branches can still share the same reference. Existing UUID format, selected scope, exact excerpt, cycle, bounded-search and size validations remain in force.

No retained rows are rewritten. The function remains stable, security invoker, with an empty search path and the existing grants. Browser roles still cannot call it. The HTTP contract and authentication flow are unchanged.

## Verification and release

- Regression tests reproduce the formerly accepted duplicate links, then verify rejection without changing the saved head or retained version.
- Tests cover shared branches, invalid references, function permissions, hypothesis criteria, collection limits and historical isolation.
- Local targeted suite: 51 passing tests. Production build succeeds with existing bundle-size and node:crypto warnings.
- Local browser verification uses synthetic fixtures only; the live investigation currently has no authored hypotheses or commitments. No example analyst records are inserted into production.
- Supabase's security advisor baseline has 86 existing notices (70 informational, 6 errors, 10 warnings), none naming the changed validator. These include existing [definer view notices](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view) and [privileged function grant notices](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable); this batch does not claim to resolve those separate findings.

Release the migration and frontend as one reviewed batch. Apply the migration to the MIP V2 Supabase project, recheck the validator and grants, then verify the merged Pages deployment. The migration is not applied by the Pages workflow.
