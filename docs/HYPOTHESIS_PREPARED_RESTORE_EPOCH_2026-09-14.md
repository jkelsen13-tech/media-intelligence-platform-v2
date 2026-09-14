# Externally pinned observation epoch — prepared-restore boundary

The017 qualification layer requires capture/read/list to receive the expected epoch from trusted server configuration. The database's enabled marker is insufficient by itself. The handler defaults observations closed when no valid configuration is supplied; ordinary history remains independently available under existing access. Caller JSON cannot supply the epoch. The gateway's old unpinned function grants are removed; new wrappers hold the epoch row lock through the existing transaction and preserve all current access/provenance checks.

Five added native cases exercise mismatched/null pins, rejection of old unpinned calls, both epoch-change orderings, and an actual logical dump/restore using the disposable PostgreSQL17 service's matching pg_dump/psql clients. Synthetic dump text stays in remote process memory and is not printed or uploaded. The restored DB deliberately retains its old enabled marker and receipt. A new synthetic server pin, outside that restored database, rejects all observation operations without deleting the retained receipt. Three handler/store tests cover default closure, parameter binding and caller injection; worker/native integration supplies an explicit synthetic pin and retains escalation checks.

## Required preparation and explicit limits

Before a real restore/import/clone may serve observations: stop/drain or close all old observation gateways, independently advance the trusted server pin, keep the restored database closed, and qualify/reconcile its epoch/provenance and current permissions before reopening. The exact intended-host configuration and custody/authorization remain owner-gated. No production pin, credential, restore or activation is supplied by this code.

The pin is not a secret, identity attestation, automatic restore detector or completeness proof. A copied configuration or an unprepared rollback of both configuration and database is not detected by this mechanism. A compromised trusted gateway is outside the worker compromise boundary. Old in-flight calls must be fenced/drained as part of preparation; static configuration alone cannot revoke a running process. Missing legacy provenance remains denied; no old transaction IDs are relabelled.

This closes a concrete prepared-restore enforcement dependency only. It does not enable arbitrary as_known_then selection, claim wall-clock commit visibility, qualify an unknown legacy history, or complete the coherent independent-review boundary. The full temporal evidence model remains open. Epoch mismatch is a retained failure requiring explicit reconciliation, never automatic restoration or publication.

Cutover stays ON HOLD. No live writes, new infrastructure, provider activation, material retrieval, local project files, merges or history rewriting. CC stays closed3/3. Exact-candidate CI must be recorded before reporting verification.
