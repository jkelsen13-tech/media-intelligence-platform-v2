# One-shot native execution host — source only

This command runs on an already approved remote Node host. It creates no service, schedule, database role, credential, source permission, or installation. It does not invoke Edge or JWT verification. Actual hosted execution, credential delivery/rotation and permanent host operation remain unqualified.

Prerequisites: install the reviewed restricted native seam, provision a dedicated password-authenticated login inheriting only `qik_ingest_runtime`, authorize a collector token in the existing credential table, and explicitly enable the collection gate and permitted source. These owner operations are not performed by the caller. Do not supply an administrator URL or grant service_role.

The connection uses the existing authenticated PostgreSQL transport: exact qik direct endpoint or dashboard-confirmed session pooler on 5432, verified TLS, exact actual session_user, restricted role flags, and the existing credential logging guard. The caller rejects extra role memberships, effective privileges on every evidence_pipeline table/view/foreign table/sequence (including column grants), and article INSERT/UPDATE column authority. This is not an inventory of every unrelated schema or function grant; owner provisioning must still give the dedicated login only the runtime membership. It never switches roles or impersonates a session. The transport currently sets a 1000ms statement timeout; a timeout can require reconciliation.

Supply public configuration on the approved remote host:

```sh
export MIP_QIK_NATIVE_HOST_AUTHORIZATION=owner-authorized-one-shot
export MIP_QIK_NATIVE_LOGIN=<approved-runtime-login>
export MIP_QIK_NATIVE_RUN_ID=qik-host-<unique-operation-id>
export MIP_QIK_NATIVE_ALLOWED_FEEDS='["https://approved-publisher.example/feed.xml"]'
# Only when using the verified session pooler:
export MIP_QIK_NATIVE_SESSION_POOLER_HOST=aws-0-us-west-1.pooler.supabase.com
node supabase/qualification/qik-ingest/runNativeHost.mjs --execute --prompt-secrets
```

The command prompts without echo for the runtime database URL and collector token. Never place secrets in command history, checked-in files or logs. Secure pre-supplied process environment `MIP_QIK_NATIVE_DATABASE_URL` and `MIP_QIK_INGEST_RUN_KEY` is an alternative when omitting `--prompt-secrets`. The pooler username is the approved login followed by the qik project suffix; session_user must remain the approved login.

Feed URLs must exactly match the operator-provided allowlist, use HTTPS, and contain no credentials or fragment. Redirects fail. Each feed has an 8-second overall fetch deadline and a 1MiB decoded-body byte cap; oversized, unavailable or non-UTF8 feeds fail the source run. The allowlist is operator-controlled, not request-controlled. No provider credential is sent to feeds. Local HTTP is available only with both `--disposable` and the exact existing test marker.

Run IDs are mandatory, begin with `qik-host-`, and are not silently regenerated or replayed. Reusing a finished ID is refused. A lost database acknowledgement can leave an inflight run or native evidence: inspect existing run/job state before a separately authorized recovery. The caller never drops records, automatically recovers a run, or retries an ambiguous write. Terminal feed failures remain failed runs with retained observations/jobs as applicable.

The process closes its database connection on success/failure and prints only a sanitized receipt. Exit0 means acknowledged completed run and closed connection. Exit1 means configuration refusal, failed/refused run, ambiguous error or close failure. Review `needs_reconciliation`: every non-completed terminal run or nonzero unresolved/failed-job/incomplete-extraction counter sets it true. This conservatively includes feed-only failures because source failure text cannot prove that no database write had an ambiguous acknowledgement. Credentials, query errors, URLs and article bodies are not printed.

Source proof uses a real child-process command, actual PostgreSQL password authentication and a local HTTP feed server:

```sh
MIP_DISPOSABLE_POSTGRES=qik-native-caller node --test tests/qikNativeCallerAuthenticated.test.mjs
```

This is execution-host source proof, not hosted qik, live RSS, Edge gateway/JWT or permanent operations proof. The Edge candidate remains a separate service-role caller and is not silently represented as migrated.
