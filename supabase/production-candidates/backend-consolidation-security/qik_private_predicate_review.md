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
