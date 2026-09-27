# Qik comparison source compiler — incomplete hosted integration

This directory contains a deterministic source compiler, not an installer or an activation path. Generated SQL has not been executed or qualified. Do not concatenate and apply its steps as a production migration.

The native-lineage correction is separately source-reviewed and synthetically qualified at d40e42fdc1b9b92ec6c6117597cbfd24d17906c1. This compiler pins that commit's 23 SQL input blobs, excludes source-fixture.sql, removes the exact historical EFTA scope insertion without editing its source, and explicitly maps the qualification kernel namespace and seven compatibility roles. It closes the synthetic permission fallback and synthetic source producer. Compatibility grants are closed before final 019 assertions; additional effective privilege and ownership assertions follow. The compiler returns executable:false and lists unresolved prerequisites. It performs no network, filesystem or database operation itself; its caller supplies pinned source bytes.

## Actual tests

Compiler-only tests: tests/qikComparisonAdapterSource.test.mjs. Invocation on the existing private remote Node22.14.0: node --test tests/qikComparisonAdapterSource.test.mjs. Two tests passed, checking changed-source refusal and transformation boundaries. No generated SQL executed, installed, or activated. These tests are not hosted compatibility evidence.

## Required before an installation adapter may execute

1. Verify the exact qik connection and genuine installer privileges through the approved secure operational route. Refuse pre-existing mapped schemas/roles and object collisions. Never alter an unexpectedly existing compatibility role. Compiler compatibility assertions cover five package schemas; inspect unrelated/public-schema ACLs and global/default privileges separately. The component does not claim these roles are globally privilege-free.
2. Verify existing native/public column types, extension placement, source policies and C3 baseline. Do not replay C3 or create fixture tables, rows, synthetic identities, memberships, sessions, credentials or source bindings.
3. Implement and qualify one atomic installer with a complete compiled-source digest manifest, explicit source configuration and scoped owner read policies, final effective assertions, installation receipt and uncertain-commit reconciliation. A failed installation rolls back; an ambiguous outcome requires receipt reconciliation, not teardown/retry.
4. Preserve autonomous rejection audit from 009: its audit must survive rollback of the rejected transaction. Same-qik restricted audit transport and secure credential delivery must be configured and tested. A transaction-local INSERT is not an equivalent substitute. Live metadata found dblink absent; extension installation has not occurred.
5. Bind a genuine authoritative permission reader for the exact material/version/operation/audience/domain before any real-material review. The existing generic reader recognizes synthetic fixtures; CC-definition and EFTA adapters do not authorize arbitrary DOJ feed material. Owner authorization for private DOJ RSS processing does not establish an invented legal license or public eligibility.
6. Keep runtime mappings, operating gates, publication heads and EFTA scope inactive/empty until their separate conditions pass. Preserve C3 disabled state, YHB pause and NIE hold.

## Required generated-SQL qualification — NOT RUN

Use the existing authorized synthetic PostgreSQL17.6 CI route with a separately constructed hosted-shaped native/public substrate. Exercise all mapped journal/review/reader/permission tests; reject unexpected source pins and pre-existing role/schema collisions; verify baseline native/C3 permissions survive; inject failure at each installation boundary and verify complete rollback; reject missing autonomous audit delivery and unbound real-material permissions; verify role/DB cleanup. No live qik fallback or real evidence is authorized by this component.

Secure operational configuration is currently unavailable: the expected GitHub qik-forward-controlled environment and Actions secrets/variables are absent, and the existing private remote GitHub CLI login is invalid. Re-authentication through the provider flow is pending. Credentials must never be pasted into chat/source/logs.
