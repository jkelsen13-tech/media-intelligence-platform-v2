# Production candidates

Files here are reviewed proposals, not migration history. They must not be
applied by automation or copied into `supabase/migrations` with an invented
timestamp. If an owner authorizes production work, first create a migration
with `supabase migration new`, copy the approved SQL into it, run the disposable
database checks below, and record the resulting migration identity.

## Public projection authority hardening

Live migrations `20260920145928_public_projection_write_revoke_v1` and
`20260920150006_postgres_public_default_acl_hardening_v1` addressed the direct
authorization finding on `qikvmopbtijoebdqosyq` without changing data or view
predicates.
Read-only catalog inspection on 2026-09-20 established that
`authors_public`, `arc_milestones_public`, and `news_detail_public` are
automatically updatable, postgres-owned, owner-authority views. `anon` and
`authenticated` hold full table ACLs. Anonymous REST reads returned HTTP 200,
and `EXPLAIN` in a read-only transaction accepted an `anon` UPDATE rewrite for
all three underlying relations. No write exploit was executed.

The applied migrations removed non-SELECT privileges from all seven reviewed
public projection views and closed permissive default table/function ACLs for
future objects created by `postgres`. Existing SELECT grants were left
untouched. They deliberately do not flip the projections to
`security_invoker`: several projections intentionally read private tables and
that change could break public output or invite unsafe base-table grants.

The remaining candidate closes the same future-object defaults for
`supabase_admin`. The connected migration session is `postgres` and is not a
member of `supabase_admin`; a transaction containing this statement was
rejected atomically. This residual platform-owner action must use an authorized
Supabase control-plane path. It must not be worked around by granting
`postgres` membership in `supabase_admin`.

Owner-gated execution prerequisites:

1. Capture `pg_class.relacl`, `pg_default_acl`, view definitions, owners, and
   `information_schema.views` updatability for the named objects.
2. Rehearse the generated migration against an isolated restore whose roles,
   owners, grants, RLS policies, and PostgREST schemas match production.
3. Reconfirm expected anonymous/authenticated SELECT parity for every
   projection and denial of all non-SELECT privileges.
4. Create representative table/view/function objects as `supabase_admin` and
   prove browser roles receive no implicit privileges.
5. Prove service RPCs, publication reads, Pages, Vercel, and the current live
   platform contracts are unchanged. The former isolated demo is not part of
   this acceptance scope.
6. Apply only with a recorded owner authorization, bounded maintenance plan,
   catalog evidence captured before/after, and a tested restoration script
   generated from the pre-apply ACL snapshot.

The restoration artifact is the exact pre-apply ACL/default-ACL snapshot, not a
generic `GRANT ALL`: restoring broad grants blindly would recreate the defect.
