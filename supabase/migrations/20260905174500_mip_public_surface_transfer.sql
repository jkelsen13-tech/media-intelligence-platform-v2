-- Historical combined draft. This version was never recorded on production.
-- Production applied the same object-creating work as six chunks:
--   20260905172453_mip_public_surface_transfer
--   20260905172517_mip_public_surface_stub_reconcile
--   20260905172527_mip_public_surface_predicates
--   20260905172543_mip_public_surface_tables
--   20260905172558_mip_public_surface_topics_rls
--   20260905172611_mip_public_surface_views
-- Isolated restore loads those recorded files. Do not replay the former
-- combined SQL, mark this version applied on production, or reset history.
-- Publication bypasses are closed by 20260905180142_mip_public_surface_publication_gates.

select 1;
