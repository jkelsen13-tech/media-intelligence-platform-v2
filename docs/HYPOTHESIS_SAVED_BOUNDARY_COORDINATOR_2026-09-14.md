# Saved-boundary combined delivery: isolated candidate

Base: PR166 `406512127399e63e117f2a8e0b089f97579bd0d9`.

The previous prefix verifier proves retained integrity but cannot bind a separately configured application history adapter to its source incarnation. This candidate eliminates that independent adapter for this read. One narrow SQL function invokes the existing native source-incarnation/publication checker and current-permission history reader on the same PostgreSQL backend. Source, membership and material locks last until the enclosing transaction ends. The coordinator keeps that transaction and authenticated registration-custody exclusion open until its delivery callback completes.

Only current-permission investigation entries whose revision IDs are in the retained marker prefix reach the delivery callback. Source-wide metadata, control attestations, source UUIDs and other investigations are not returned. The SQL function is execute-only for a new NOLOGIN gateway and has no live caller or endpoint. The coordinator must receive verified identity from trusted Auth and a trusted transaction adapter that reserves one authenticated connection. Browser-supplied adapters or user IDs are forbidden.

This is a bounded saved-marker mechanism. Arbitrary wall-clock history is still unsupported, and every historical/source/user qualification flag remains false. Production custody independence, real provider/caller admission, trusted runtime deployment, source recovery admission and independent review are still absent. In particular an injected adapter interface is not evidence of a protected production coordinator. Same-session native identity checks reject mismatched postmaster/database/system identity; they do not prevent an administrator from rewriting control tables or impersonating roles.

Hosted tests exercise actual combined SQL, coordinator and custody fixture, permission/source revocation before reads and while delivery is pending, incorrect identity/terminal fields, narrow grants, material withholding and native-identity drift. Existing clone/restart tests remain inherited evidence, not new production restore qualification. The fixture's custody and source remain in the same PostgreSQL failure domain. Test results must be attached to the exact commit; no result is predeclared.

No live Supabase writes, migrations, deployments, merges, user-device project files, provider calls or publication. Root reconciliation and separate security-boundary review remain required before acceptance.
