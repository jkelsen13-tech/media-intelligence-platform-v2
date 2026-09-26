# qik private predicates — KEEP_WITH_JUSTIFICATION

Project: `qikvmopbtijoebdqosyq`. This is a bounded interface review, not a
system-wide security approval. The original revoke remains held and unchanged.

The current boolean predicates are required by public-read dependency chains.
Browser EXECUTE by itself does not demonstrate an authorization defect. Removing
it breaks policy/view evaluation on populated data; an empty live table is not
a compatibility test.

| Definition | SHA-256 of current definition |
|---|---|
| mip_private.arc_event_candidate_is_approved(uuid) | 1114353076ac65f2398afd1d045cd74a3bda0a441d4d544c36ee85bc955eca63 |
| mip_private.arc_has_approved_membership(uuid) | d8191f4ad3a849e5df6605e98960bda4975978e2eba9178fa0b46c735a2dcbed |

Recorded ACL: explicit EXECUTE to postgres, anon, authenticated and service_role,
grantor postgres, no grant options, no PUBLIC grant. Relevant schema usage exists.
Consumers include `arc_events_public_algorithmic_read` (anon/authenticated),
`arc_milestones_public_algorithmic_read` (authenticated) and
`arc_milestones_public`. Keep their limited approval predicates rather than
granting direct private-table reads or replacing them with a broader wrapper.

The existing isolated diagnostic preserves the failure: a populated approved/
unapproved fixture reads successfully before the original candidate and fails
with permission denied after it. Its predicate bodies are synthetic; it proves
the dependency regression, not the native approval algorithm.

Required native qualification matrix, before any proposed interface correction:
empty/populated inputs; approved/unapproved/nonexistent identifiers; anon and
authenticated policy/view reads; unauthorized/cross-scope cases; schema exposure,
search path and returned-information review. No new live correction is justified
solely to remove browser EXECUTE or silence an advisory. Any established
information-disclosure defect requires its own minimal candidate and owner gate.

The embedded original rollback would add PUBLIC access absent from the recorded
pre-state. It must not be used. Since no qik change is proposed, no restoration
is needed; any future inverse must derive from that action's immediate ACLs.

Native source inspection confirms both are STABLE SQL SECURITY DEFINER functions
with fixed `search_path=public, pg_catalog`, fully qualified reads of
`public.arc_membership_candidates`, UUID equality, and `state='approved'`.
The event predicate additionally rejects null candidate IDs. They return only
approval-existence booleans, execute no dynamic SQL or mutators, and expose no
review payload. This is global public-approval metadata, not a per-user private
lookup contract; unrelated pending, rejected, nonexistent and wrong-ID inputs
must remain false. A future product shift to private approval state requires a
separate rights/interface review.

The successor qualification harness now additionally executes the exact native
predicate definitions, verifies both SHA-256 values, and uses observed policy
expressions and the public milestones view projection against skeletal tables.
It tests empty, NULL, nonexistent, approved, pending, rejected and invalidated
inputs, candidate/arc identifier separation, both browser roles, denied direct
candidate-row reads and retained service_role access. The existing NULL candidate
policy OR branch remains visible independently of the predicate; this is an
existing policy contract requiring its own review if challenged. Synthetic rows
and a bounded policy subset are used; the complete native policy set, constraints
and full live behavior are not claimed. Consult the commit's CI result before
calling this matrix passed. The original failing revoke test remains separate.
