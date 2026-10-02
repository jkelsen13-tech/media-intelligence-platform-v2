-- UNAPPLIED rollback; same session must load story_following_v1.catalog.sql and
-- pin original + installed raw catalogue JSON in the two expected settings.
-- Refuses populated personal/material history. Preserve that data separately
-- under exact authority; this file never erases a used Following foundation.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table mip_private.public_story_follows,mip_private.public_story_follow_events,
  mip_private.public_story_material_changes,public.articles,public.nodes in share row exclusive mode;
do $$ declare expected text:=current_setting('mip.story_following_expected_installed_catalog',true); begin
  if nullif(expected,'') is null or pg_temp.mip_story_following_catalog() is distinct from expected::jsonb then
    raise exception 'Story Following installed catalogue missing or drifted'; end if;
  if nullif(current_setting('mip.story_following_expected_catalog',true),'') is null then raise exception 'original Following catalogue missing'; end if;
  if exists(select 1 from mip_private.public_story_follows) or exists(select 1 from mip_private.public_story_follow_events)
    or exists(select 1 from mip_private.public_story_material_changes) then raise exception 'populated Following history must be preserved; rollback refused'; end if;
end $$;
drop trigger public_story_follow_article_withdrawal on public.articles;
drop trigger public_story_follow_subject_withdrawal on public.nodes;
drop trigger public_story_material_immutable on mip_private.public_story_material_changes;
drop trigger public_story_material_no_truncate on mip_private.public_story_material_changes;
drop trigger public_story_follow_event_immutable on mip_private.public_story_follow_events;
drop trigger public_story_follow_event_no_truncate on mip_private.public_story_follow_events;
drop function public.read_reviewed_public_story_context_v1(uuid,uuid);
drop function public.mip_public_story_following_v1(text,jsonb);
drop function mip_private.revoke_ineligible_story_follows();
drop function mip_private.read_public_story_follow(uuid,uuid,integer);
drop function mip_private.revoke_public_story_follow(uuid,uuid);
drop function mip_private.public_story_follow_payload(mip_private.public_story_follows);
drop function mip_private.declare_public_story_material_change_v1(jsonb);
drop function mip_private.public_story_material_payload(mip_private.public_story_material_changes);
drop function mip_private.reject_public_story_material_mutation();
alter table mip_private.public_story_follows drop constraint public_story_follow_current_event;
drop table mip_private.public_story_follow_events;
drop table mip_private.public_story_follows;
drop table mip_private.public_story_material_changes;
do $$
declare original jsonb:=current_setting('mip.story_following_expected_catalog')::jsonb; role_name text; id_acl text; had_id_select boolean:=false;
begin
  foreach role_name in array array['anon','authenticated','service_role'] loop
    if not exists(select 1 from jsonb_array_elements(original->'schema_acl') a
      where a->>'grantee'=role_name and a->>'grantor'=current_user and a->>'privilege'='USAGE') then
      execute format('revoke usage on schema mip_private from %I',role_name);
    end if;
  end loop;
  select col->>'acl' into id_acl from jsonb_array_elements(original->'relations') r,
    lateral jsonb_array_elements(r->'columns') col where r->>'identity'='public.mip_profiles' and col->>'name'='id';
  if id_acl is not null and id_acl<>'{}' then
    select exists(select 1 from aclexplode(id_acl::aclitem[]) a where a.grantee=(select oid from pg_roles where rolname='service_role')
      and a.grantor=(select oid from pg_roles where rolname=current_user) and a.privilege_type='SELECT') into had_id_select;
  end if;
  if not had_id_select then revoke select(id) on public.mip_profiles from service_role; end if;
  if pg_temp.mip_story_following_catalog() is distinct from original then raise exception 'original Following dependency catalogue not restored'; end if;
end $$;
commit;
