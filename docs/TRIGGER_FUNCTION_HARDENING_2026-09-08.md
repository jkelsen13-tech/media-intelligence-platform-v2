# Trigger function hardening — 8 September 2026 UTC

This batch implements the trigger-function follow-up in [the advisor triage](CI_DEPENDENCY_ADVISOR_TRIAGE_2026-09-08.md). Five existing trigger functions get an empty search path. The three existing SECURITY DEFINER trigger functions lose EXECUTE for PUBLIC, anon and authenticated. Owner and service_role privileges remain. Function bodies, security modes, owners, trigger attachments, table grants, RLS and released views are unchanged.

The migration checks the exact pre-existing body fingerprints, owner, return type and security mode, and aborts atomically on drift. These fingerprints are compatibility guards, not security hashes. There is no data migration, account creation, job claim, publication, scheduler, provider request, new package or visible UI change.

## Verification

The disposable PGlite fixture captures the five live function and trigger definitions verbatim on 8 September UTC. Minimal synthetic tables and fixture-only DML grants isolate behavior; they are not production schema or authorization policy. Tests exercise event-node rejection, policy attribution, hostile caller search paths, MIP profile creation and conflict handling, pending arc interception, exact approved-candidate matching, and insert/update/delete invalidation with receipt exemption. They also check ACLs, body/owner/attachment preservation, repeatability and atomic drift rejection.

Trigger-returning functions are not ordinary application RPCs. Advisor wording does not establish a working remote exploit. This is defense-in-depth hardening of executable grants and name resolution. CI explicitly verifies that existing triggers continue firing for a role whose function EXECUTE privilege has been revoked. Auth tests use synthetic rows only; no real signup or email is sent.

Branch CI run 34177867184 passed 1,344 tests and production builds on Node 22 and 24. Supabase applied migration `20260908015040_trigger_function_hardening_v1.sql`; its assigned history version is used verbatim in the repository. Live catalog queries confirmed all five empty search paths, original body fingerprints/owners/security modes/trigger definitions and enabled attachments, retained service_role execution, and denied anon/authenticated execution on all three definer triggers.

Before/after fingerprints match for investigation versions, change jobs, articles, arc candidates, profiles, RLS policies and relation access configuration. The existing nine NASA/history/publication/qualification invariants also passed before deployment. Security advisors went from 72 INFO / 10 WARN / 6 ERROR to 72 INFO / 2 WARN / 6 ERROR, removing exactly eight targeted warnings with no new findings. Performance findings remain 100 INFO / 3 WARN. Vector schema placement, password protection and the six separately triaged owner-context views remain open.

Runtime behavior was exercised in disposable PostgreSQL, not by creating real users or mutating production evidence. Final-commit CI and post-merge deployment/UI checks are release gates recorded on PR #81. Remaining advisor findings stay separately triaged; this batch does not make the six owner-context views security-invoker or broaden base-table access.

## Source review and independent work

NASA POWER remains pending and is not integrated or activated. Its API access, selected dataset/product release, and upstream data rights must be reviewed separately. Before activation, verify current authoritative data-use and service terms, commercial use, citation/attribution/NOTICE obligations, retention/cache/redistribution, and rate/request limits. Record acceptable obligations in the rights registry and implement provenance/attribution. If unresolved or incompatible, evaluate the planned NOAA GHCNh route or another compatible no-fee source.

The read-only POWER review identified explicit UTC requests/normalization and modeled, grid-derived labels as requirements. Any adapter must preserve product/model, upstream provenance, units, temporal basis, spatial resolution and quality metadata. POWER's hourly documentation defaults to local solar time; meteorology documentation describes modeled grid estimates. Those observations do not constitute release-specific rights clearance. Unrelated implementation continues.

## References reviewed

- [Supabase changelog](https://supabase.com/changelog): markdown index was unavailable; HTML index reviewed. Listed GraphQL exposure and self-hosted upgrades do not alter this hosted project's existing trigger configuration. No API table or platform upgrade is introduced.
- [Supabase database functions](https://supabase.com/docs/guides/database/functions): explicit search path and execute grants.
- [PostgreSQL CREATE TRIGGER](https://www.postgresql.org/docs/current/sql-createtrigger.html): trigger creation privilege requirements.
- [POWER hourly API](https://power.larc.nasa.gov/docs/services/api/temporal/hourly/).
- [POWER meteorology methodology](https://power.larc.nasa.gov/docs/methodology/meteorology/).
- [POWER referencing](https://power.larc.nasa.gov/docs/referencing/) is a required next review, alongside exact upstream/product terms.
