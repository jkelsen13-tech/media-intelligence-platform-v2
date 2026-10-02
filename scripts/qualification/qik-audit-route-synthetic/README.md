# Synthetic-only audit-route qualification

`bootstrap.sql` runs only as separately authenticated bootstrap_super in a new network-none PG17.6 container. `extras.sql` supplies explicit synthetic dblink identity/TLS and trigger fixtures; it never contacts an endpoint. The runner checks held historical/proposal SHA256 and executes the exact full imported DO inside its bounded authority transaction. See ../../../../docs/qualification/qik-audit-route-maintenance-proposal-20261002.md for scope, gates and invocation.

`executed/` contains concrete executed wrapper SQL and public dummy-only receipts, with manifest hashes binding each wrapper to the historical or unchanged proposal source. These are synthetic scripts, not live maintenance instructions. The runner regenerates them from checked-in source/fixtures; no prior /workspace evidence files are required.

Review followup imports the separate pre-submit deadline fragment before each client DO submission. Inside-DO deadline setup is explicitly retained as the eight-second RED comparison; seven-second GREEN establishes the deadline before command submission, observes an aborted transaction and explicitly rolls back. Executed receipts and public synthetic fixtures contain no live credentials. The pinned proposal/historical DO bytes remain unchanged.
