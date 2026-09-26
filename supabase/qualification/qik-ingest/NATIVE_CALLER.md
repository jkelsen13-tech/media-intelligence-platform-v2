# Permanent native caller seam — source only

This continuation does not alter the pinned temporary qualification operation or authorize a hosted install. It installs no credentials, enables no source, and starts no recurring process.

Use `createBoundNativePipelineRpc(database, {token, runId})` with `runQikIngestCollector`. The database connection authenticates as an owner-provisioned login that inherits only `qik_ingest_runtime`. Do not grant `service_role`, `qik_ingest_fn_owner`, BYPASSRLS, or native table privileges to that login. The adapter never changes session authorization or roles. Credential delivery and execution-host provisioning remain a later separately reviewed operation.

The collector passes the retained observation ID. The new `mip_qik_ingest_native` facade validates an active token, open collection gate, running run, observation credential hash, and matching native receipt before any claim, state read, finish, or extraction. Enqueue reconstructs the article from the stored observation. Mixed authorized/foreign job lists fail before lease recovery. Candidate appends require the exact completed job/capture pair and allow only unreviewed claim fields; graph, spatial, predecessor and publication fields are excluded. Existing native span validation and idempotency remain authoritative.

The NOLOGIN `qik_ingest_fn_owner` owns this private server facade, has no BYPASSRLS, and receives explicit native function grants, lifecycle-column updates, append grants and operation-named RLS policies. History and capture rows remain append-only. Existing evidence-change triggers receive their required insert/sequence privileges when installed. The runtime receives EXECUTE only on the facade, no evidence_pipeline schema usage or table grants. Existing broad `createPipelineRpc` remains for the separately scoped temporary qualification; it is not the permanent adapter.

The operation ledger records explicit external table, column, function, sequence and schema grants from PostgreSQL ACLs. Cleanup refuses additional unledgered grants, revokes only recorded privileges, drops package policies/functions, and retains native articles, jobs, receipts, candidates and notifications. A source-only declaration is not evidence of hosted compatibility or permanent operational readiness.

Disposable command:

```sh
MIP_DISPOSABLE_POSTGRES=qik-native-caller node --test tests/qikNativeCallerAuthenticated.test.mjs
```

The test requires the existing password-authenticated local PostgreSQL endpoint on the remote host, uses a unique disposable database and actual random-password login, and does not change global logger settings. It proves denied direct tables, service-role adoption, unscoped enqueue/claim, foreign observations/jobs/captures, publication fields and unexpected cleanup grants. It also checks identical/revised collector delivery, candidate idempotency and retained residuals. Cleanup closes clients, removes its exact database/roles, and fails on leftovers. It does not prove hosted execution, gateway authentication, production credential rotation, or recurring collection.
