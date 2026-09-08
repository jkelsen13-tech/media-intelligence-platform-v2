-- Read-only verification; compare with documented before/after inventory.
select p.proname, pg_catalog.md5(p.prosrc) body_md5,
p.prosecdef, p.proconfig, pg_catalog.pg_get_userbyid(p.proowner) owner,
pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') anon_execute,
pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') authenticated_execute,
pg_catalog.has_function_privilege('service_role',p.oid,'EXECUTE') service_execute,
(select jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) order by t.tgname)
from pg_catalog.pg_trigger t where t.tgfoid=p.oid and not t.tgisinternal) triggers
from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('graph_event_article_memberships_require_event_node','handle_new_mip_user','mip_intercept_direct_arc_attachment','mip_invalidate_arc_membership_approvals','policy_edge_attributed')
order by p.proname;