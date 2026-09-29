# Managed installer preflight identity successor

The original three-field preflight configuration retains its NOREPLICATION assertion.
The explicit fourth field `provisioningProfile: "supabase-managed-v1"` instead binds the actual existing trusted qik postgres role with REPLICATION=true. Only expectedLogin=postgres is accepted for this profile. This metadata-only route grants no replication rights, opens no replication connection, reads no article material, and changes no database state.

Hosted run36511799907/job109225352664 at76e96de refused identity after successful connection and verified client TLS. Follow-up provider metadata confirmed postgres has REPLICATION=true, database ownership and the other expected role attributes. The original failed receipt remains failure. No password reset or full installer was attempted.

This is an explicit provider compatibility correction, not an assertion that every privileged role is safe. Auditor identities continue to require NOREPLICATION. The same exact dispatch/release, protected environment, C3 closed/empty, TLS/CA, logging, timeout and resource gates remain required. The preflight-only review is not full successor installation authority.
