\set ON_ERROR_STOP on
-- Disposable NIE-source catalog fixture. The data and identities are synthetic.
create table public.events (
  id uuid primary key, canonical_title text, occurred_at_start timestamptz,
  occurred_at_end timestamptz, location_text text, arc_id uuid, arc_event_id uuid,
  status text, rule_version text, created_at timestamptz,
  unrelated_private_field text);
create table public.articles (
  id uuid primary key, feed text, outlet text, title text, url text,
  summary text, published_at timestamptz, fetched_at timestamptz,
  outlet_id uuid, author_id uuid, body_text text, embedding text, claims jsonb,
  arc_id uuid, unattributed boolean, monoculture boolean, is_digest boolean,
  image_url text, image_alt text, entities_extracted_at timestamptz,
  arc_assign_attempted_at timestamptz, arc_assignment_evidence jsonb,
  source_status text, source_status_changed_at timestamptz,
  source_status_note text, ingestion_run_id text, is_pre_ruling boolean,
  different_causal_chain boolean, unrelated_private_field text);
create table public.event_articles (
  event_id uuid not null, article_id uuid not null,
  private_review_note text, primary key (event_id,article_id));
create schema private_auth_fixture;
create table private_auth_fixture.users (id uuid primary key, secret text);
alter table public.events enable row level security;
alter table public.articles enable row level security;
alter table public.event_articles enable row level security;
create policy existing_public_event_read on public.events for select to public using (true);
create policy existing_public_article_read on public.articles for select to public using (true);
create policy existing_public_membership_read on public.event_articles for select to public using (true);
insert into public.events (id,canonical_title,status,rule_version,created_at,unrelated_private_field)
values ('11111111-1111-4111-8111-111111111111','Synthetic Αθηνα 🛰️','active','v1',now(),'hidden'),
       ('22222222-2222-4222-8222-222222222222','Unrelated synthetic','active','v1',now(),'hidden');
insert into public.articles (id,title,embedding,claims,unrelated_private_field)
values ('33333333-3333-4333-8333-333333333333','Approved article','[0.125,0.5]',
        '{"score":0.125,"revisions":null}'::jsonb,'hidden'),
       ('44444444-4444-4444-8444-444444444444','Unrelated article',null,null,'hidden');
insert into public.event_articles(event_id,article_id,private_review_note)
values ('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','hidden'),
       ('11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444','hidden'),
       ('22222222-2222-4222-8222-222222222222','44444444-4444-4444-8444-444444444444','hidden');
insert into private_auth_fixture.users values ('55555555-5555-4555-8555-555555555555','hidden');
\i /repo/supabase/qualification/nie-parent-custody/003_nie_source_read_candidate.sql
create role nie_source_fixture_login login noinherit nobypassrls;
alter role nie_source_fixture_login password :'fixture_password';
grant connect on database nie_source_synthetic to nie_source_fixture_login;
grant nie_parent_source_read to nie_source_fixture_login with inherit true, set false;
insert into nie_parent_access.operations
  (login_name,operation_id,source_project_ref,expires_at)
values ('nie_source_fixture_login','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'niejaejtbxgakyrsntxm',clock_timestamp()+interval '1 hour');
insert into nie_parent_access.allowed_source_ids
  (login_name,operation_id,source_project_ref,source_table,source_id,expires_at)
values
  ('nie_source_fixture_login','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'niejaejtbxgakyrsntxm','events','11111111-1111-4111-8111-111111111111',
   clock_timestamp()+interval '1 hour'),
  ('nie_source_fixture_login','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
   'niejaejtbxgakyrsntxm','articles','33333333-3333-4333-8333-333333333333',
   clock_timestamp()+interval '1 hour');

\connect nie_source_synthetic nie_source_fixture_login 127.0.0.1
begin isolation level repeatable read read only;
select (current_setting('transaction_isolation')='repeatable read'
  and current_setting('transaction_read_only')='on'
  and session_user='nie_source_fixture_login') as snapshot_identity \gset
\if :snapshot_identity
\else
  \quit 1
\endif
select ((select count(*) from public.events)=1
  and (select count(*) from public.articles)=1
  and (select count(*) from public.event_articles)=1
  and (select count(*) from public.events
    where id='22222222-2222-4222-8222-222222222222')=0
  and (select count(*) from public.articles
    where id='44444444-4444-4444-8444-444444444444')=0)
  as scoped_rows_only \gset
\if :scoped_rows_only
\else
  \quit 1
\endif
select ((select row_to_json(t)::text from
  (select id,canonical_title,occurred_at_start from public.events
   where id='11111111-1111-4111-8111-111111111111') t) like '%🛰️%'
  and (select claims->>'score' from public.articles
    where id='33333333-3333-4333-8333-333333333333')='0.125'
  and (select claims ? 'revisions' from public.articles
    where id='33333333-3333-4333-8333-333333333333'))
  as typed_unicode_null_read \gset
\if :typed_unicode_null_read
\else
  \quit 1
\endif
select ((nie_parent_access.full_parent_inventory()->>'event_count')::int=1
  and (nie_parent_access.full_parent_inventory()->>'article_count')::int=1
  and (nie_parent_access.full_parent_inventory()->>'membership_count')::int=2
  and (nie_parent_access.full_parent_inventory()->>'unapproved_membership_count')::int=1
  and nie_parent_access.full_parent_inventory()->>'event_keys_sha256'=
    'c2e1405db2f9b352ad9c28f5337c92b9d471d2a0903e9eadb7057ecdec6081e6'
  and nie_parent_access.full_parent_inventory()->>'article_keys_sha256'=
    'fc6d4bdfc822036c8f1b152d651c4e33e1b915d1f28f6215b74ec10370fb3b2b'
  and nie_parent_access.full_parent_inventory()->>'membership_keys_sha256'=
    '9e42f936c62f91883486f392c83add17d51adf19043f3ebd83717522cf7ffef9')
  as hidden_row_closure_detected \gset
\if :hidden_row_closure_detected
\else
  \quit 1
\endif
commit;
do $$
declare denied boolean;
begin
  denied := false;
  begin perform unrelated_private_field from public.events;
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'unlisted source field readable'; end if;

  denied := false;
  begin perform * from private_auth_fixture.users;
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'Auth rows readable'; end if;

  denied := false;
  begin update public.events set status='altered';
  exception when insufficient_privilege then denied := true; end;
  if not denied then raise exception 'source write allowed'; end if;

end $$;
select (not pg_has_role('nie_source_fixture_login','service_role','MEMBER'))
  as no_service_role_membership \gset
\if :no_service_role_membership
\else
  \quit 1
\endif
\connect nie_source_synthetic postgres 127.0.0.1

-- Admin revocation blocks subsequent statements/sessions. For immediate
-- revocation of an already-pinned RR transaction, terminate its backend too.
update nie_parent_access.operations set expires_at=clock_timestamp()-interval '1 second'
where login_name='nie_source_fixture_login';
\connect nie_source_synthetic nie_source_fixture_login 127.0.0.1
select ((select count(*) from public.events)=0 and
  (select count(*) from public.articles)=0 and
  (select count(*) from public.event_articles)=0) as expired_scope_denied \gset
\if :expired_scope_denied
\else
  \quit 1
\endif
do $$
declare denied boolean := false;
begin
  begin perform nie_parent_access.full_parent_inventory();
  exception when others then denied := true; end;
  if not denied then raise exception 'expired inventory allowed'; end if;
end $$;
\connect nie_source_synthetic postgres 127.0.0.1
select 'NIE_SOURCE_NATIVE_PASS' as status;
