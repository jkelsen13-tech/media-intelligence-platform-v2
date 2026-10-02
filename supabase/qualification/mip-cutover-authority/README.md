# Isolated `mip_*` EXECUTE-only authority design

**Not a production migration. Not deployed. Not a rename of `comparison_qualification.*`.**

This directory is the next engineering package for the owner-approved capability identities. Privileges are none until a later owner-gated provision. JWT `iss` / `aud` / `sub` values are **not** recorded here and must not be invented.

Application identities (NOLOGIN, no `BYPASSRLS`):

- `mip_collector_scheduler_v1`
- `mip_collector_worker_v1`
- `mip_comparison_producer_v1`
- `mip_comparison_worker_v1`
- `mip_projection_builder_v1`
- `mip_projection_publisher_v1`
- `mip_cutover_authority_admin_v1`
- `mip_cutover_recovery_v1`
- `mip_retention_writer_v1`
- `mip_retention_reader_v1`

Function-owner identities are `*_owner_v1` NOLOGIN without `BYPASSRLS`. Schema owner: `mip_cutover_schema_owner_v1`.

`service_role` is not the worker security boundary. Bound worker RPCs are not granted to `service_role`. Isolated `qual_*` roles stay in `comparison-generations/` and must not be copied onto live projects under these names.
