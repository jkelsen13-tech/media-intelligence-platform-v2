-- Opt-in non-production qualification extension. Never auto-installed.
-- Binds one exact Supabase auth.sessions row to one EFTA database transaction.
begin;
do $$begin if not exists(select 1 from pg_roles where rolname='mip_efta_auth_session_owner_v1') then
 create role mip_efta_auth_session_owner_v1 nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
end if;if not exists(select 1 from pg_roles where rolname='mip_efta_authenticator_v1') then
 create role mip_efta_authenticator_v1 nologin nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls;
end if;end$$;

create table mip_identity.efta_authentication_policy_versions(
 revision uuid primary key,issuer text not null,audience text not null check(audience='authenticated'),
 algorithm text not null check(algorithm='ES256'),kid text not null,key_revision uuid not null references mip_identity.key_versions,
 jwks_sha256 text not null check(jwks_sha256~'^[0-9a-f]{64}$'),
 predecessor uuid references mip_identity.efta_authentication_policy_versions,
 state text not null check(state in('current','retired')),approval_state text not null check(approval_state in('proposed','owner_approved','revoked')),
 owner_approval_receipt_hash text not null check(owner_approval_receipt_hash~'^[0-9a-f]{64}$'),
 owner_approval_payload_hash text not null check(owner_approval_payload_hash~'^[0-9a-f]{64}$'),
 valid_from timestamptz not null,valid_until timestamptz not null,created_at timestamptz not null default clock_timestamp(),
 check(valid_until>valid_from)
);
create unique index efta_authentication_policy_successor on mip_identity.efta_authentication_policy_versions(predecessor) where predecessor is not null;
create table mip_identity.efta_authentication_policy_heads(
 policy_id text primary key,revision uuid not null references mip_identity.efta_authentication_policy_versions,active boolean not null
);
create table mip_identity.efta_live_auth_receipts(
 receipt_id uuid primary key,transaction_id text not null,auth_session_id uuid not null,subject_id uuid not null,
 authentication_revision uuid not null references mip_identity.efta_authentication_policy_versions,
 broker_session uuid not null references mip_identity.sessions,assignment_revision uuid not null references mip_identity.efta_authority_assignment_versions,
 mapping_revision uuid not null references mip_identity.mapping_versions,key_revision uuid not null references mip_identity.key_versions,
 credential_revision uuid not null references mip_identity.efta_gateway_credential_versions,
 token_binding_hash text not null check(token_binding_hash~'^[0-9a-f]{64}$'),session_observed_at timestamptz not null,
 receipt_hash text not null check(receipt_hash~'^[0-9a-f]{64}$'),database_actor text not null,recorded_at timestamptz not null default clock_timestamp(),
 unique(transaction_id,broker_session)
);
create table mip_identity.efta_live_auth_uses(
 receipt_id uuid primary key references mip_identity.efta_live_auth_receipts,used_at timestamptz not null default clock_timestamp()
);

create function mip_identity.efta_assert_live_auth_session(
 p_receipt uuid,p_auth_session uuid,p_subject uuid,p_authentication_revision uuid,
 p_broker_session uuid,p_runtime text,p_assignment uuid,p_token_binding_hash text
) returns uuid language plpgsql security definer set search_path='' as $$
declare p mip_identity.efta_authentication_policy_versions;h mip_identity.efta_authentication_policy_heads;
 a mip_identity.efta_authority_assignment_versions;ah mip_identity.efta_authority_assignment_heads;
 s mip_identity.sessions;m mip_identity.mapping_versions;k mip_identity.key_versions;
 c mip_identity.efta_gateway_credential_versions;ch mip_identity.efta_gateway_credential_heads;
 observed_subject uuid;payload jsonb;digest text;policy_payload_hash text;
begin
 if p_receipt is null or p_auth_session is null or p_subject is null or p_broker_session is null
 or p_token_binding_hash !~ '^[0-9a-f]{64}$' then raise exception 'efta_live_session_bad_request';end if;
 select * into strict p from mip_identity.efta_authentication_policy_versions where revision=p_authentication_revision;
 select * into h from mip_identity.efta_authentication_policy_heads where policy_id='supabase-user-access-v1';
 policy_payload_hash:=comparison_qualification.argument_digest(jsonb_build_object(
  'revision',p.revision,'issuer',p.issuer,'audience',p.audience,'algorithm',p.algorithm,'kid',p.kid,
  'key_revision',p.key_revision,'jwks_sha256',p.jwks_sha256,'predecessor',p.predecessor,
  'state',p.state,'valid_from',p.valid_from,'valid_until',p.valid_until));
 if h.revision is distinct from p.revision or h.active is distinct from true or p.state<>'current'
 or p.approval_state<>'owner_approved' or p.issuer<>'https://qikvmopbtijoebdqosyq.supabase.co/auth/v1'
 or p.audience<>'authenticated' or p.algorithm<>'ES256'
 or p.valid_from>clock_timestamp() or p.valid_until<=clock_timestamp()
 or p.owner_approval_payload_hash is distinct from policy_payload_hash
 then raise exception 'efta_authentication_policy_not_authorized';end if;
 select * into strict k from mip_identity.key_versions where revision=p.key_revision;
 perform 1 from mip_identity.key_heads kh where kh.revision=k.revision and kh.issuer=p.issuer and kh.kid=p.kid and kh.active;
 if not found then raise exception 'efta_authentication_key_not_authorized';end if;
 select * into strict a from mip_identity.efta_authority_assignment_versions where revision=p_assignment;
 select * into ah from mip_identity.efta_authority_assignment_heads where subject_id=p_subject and database_principal=a.database_principal;
 if ah.revision is distinct from a.revision or ah.active is distinct from true or a.subject_id is distinct from p_subject
 or a.subject_principal is distinct from 'auth_user:'||p_subject::text or a.scope<>'efta-bounded-demo-v1'
 or a.approval_state<>'owner_approved' or a.key_revision is distinct from p.key_revision
 or a.valid_from>clock_timestamp() or a.valid_until<=clock_timestamp()
 then raise exception 'efta_assignment_not_authorized';end if;
 select * into strict s from mip_identity.sessions where session_id=p_broker_session;
 select * into strict m from mip_identity.mapping_versions where revision=s.mapping_revision;
 if s.token_hash is distinct from p_token_binding_hash or s.mapping_revision is distinct from a.mapping_revision
 or s.key_revision is distinct from a.key_revision or m.runtime is distinct from p_runtime
 or m.principal is distinct from a.database_principal or m.subject is distinct from a.subject_principal
 then raise exception 'efta_authenticated_subject_mismatch';end if;
 perform 1 from comparison_qualification.principal_sessions ps where ps.session_id=p_broker_session
 and ps.runtime_id=p_runtime and ps.principal=a.database_principal and ps.revoked_at is null
 and ps.expires_at>clock_timestamp() for share;
 if not found then raise exception 'mip_identity_session_revoked';end if;
 select x.user_id into observed_subject from auth.sessions x where x.id=p_auth_session and x.user_id=p_subject for key share;
 if not found or observed_subject is distinct from p_subject then raise exception 'efta_live_auth_session_invalid';end if;
 select * into strict c from mip_identity.efta_gateway_credential_versions where revision=a.credential_revision;
 select * into ch from mip_identity.efta_gateway_credential_heads where gateway_id=c.gateway_id;
 if ch.revision is distinct from c.revision or ch.active is distinct from true or c.state<>'current'
 or c.approval_state<>'owner_approved' or c.valid_from>clock_timestamp() or c.valid_until<=clock_timestamp()
 then raise exception 'efta_gateway_credential_not_authorized';end if;
 payload:=jsonb_build_object('receipt_id',p_receipt,'transaction_id',pg_current_xact_id()::text,
  'auth_session_id',p_auth_session,'subject_id',p_subject,'authentication_revision',p.revision,
  'broker_session',p_broker_session,'assignment_revision',a.revision,'mapping_revision',a.mapping_revision,
  'key_revision',a.key_revision,'credential_revision',a.credential_revision,'token_binding_hash',p_token_binding_hash,
  'database_actor',session_user);
 digest:=comparison_qualification.argument_digest(payload);
 insert into mip_identity.efta_live_auth_receipts(receipt_id,transaction_id,auth_session_id,subject_id,
  authentication_revision,broker_session,assignment_revision,mapping_revision,key_revision,credential_revision,
  token_binding_hash,session_observed_at,receipt_hash,database_actor)
 values(p_receipt,pg_current_xact_id()::text,p_auth_session,p_subject,p.revision,p_broker_session,a.revision,
  a.mapping_revision,a.key_revision,a.credential_revision,p_token_binding_hash,clock_timestamp(),digest,session_user);
 return p_receipt;
end$$;

-- Replace only the private helper. External EFTA function signatures remain unchanged.
-- Every one now requires an unconsumed live-session receipt from the same transaction.
create or replace function mip_identity.authority_context(
 p_session uuid,p_runtime text,p_assignment uuid,p_expected_principal text
) returns jsonb language plpgsql set search_path='' as $$
declare a mip_identity.efta_authority_assignment_versions;h mip_identity.efta_authority_assignment_heads;
 c mip_identity.efta_gateway_credential_versions;ch mip_identity.efta_gateway_credential_heads;
 s mip_identity.sessions;m mip_identity.mapping_versions;k mip_identity.key_versions;
 ar mip_identity.efta_live_auth_receipts;result jsonb;assignment_payload_hash text;credential_payload_hash text;
begin
 perform mip_identity.authorize(p_session,p_runtime,p_expected_principal);
 select * into strict a from mip_identity.efta_authority_assignment_versions where revision=p_assignment;
 select * into h from mip_identity.efta_authority_assignment_heads where subject_id=a.subject_id and database_principal=a.database_principal;
 if h.revision is distinct from a.revision or h.active is distinct from true
 or a.database_principal is distinct from p_expected_principal or a.scope<>'efta-bounded-demo-v1'
 or a.approval_state<>'owner_approved' or a.valid_from>clock_timestamp() or a.valid_until<=clock_timestamp()
 then raise exception 'efta_assignment_not_authorized';end if;
 select * into strict s from mip_identity.sessions where session_id=p_session;
 select * into strict m from mip_identity.mapping_versions where revision=s.mapping_revision;
 select * into strict k from mip_identity.key_versions where revision=s.key_revision;
 select * into strict c from mip_identity.efta_gateway_credential_versions where revision=a.credential_revision;
 select * into ch from mip_identity.efta_gateway_credential_heads where gateway_id=c.gateway_id;
 credential_payload_hash:=comparison_qualification.argument_digest(jsonb_build_object(
  'revision',c.revision,'gateway_id',c.gateway_id,'credential_fingerprint_hash',c.credential_fingerprint_hash,
  'predecessor',c.predecessor,'state',c.state,'valid_from',c.valid_from,'valid_until',c.valid_until));
 if ch.revision is distinct from c.revision or ch.active is distinct from true
 or c.approval_state<>'owner_approved' or c.state<>'current' or c.valid_from>clock_timestamp() or c.valid_until<=clock_timestamp()
 or c.owner_approval_payload_hash is distinct from credential_payload_hash
 then raise exception 'efta_gateway_credential_not_authorized';end if;
 assignment_payload_hash:=comparison_qualification.argument_digest(jsonb_build_object(
  'revision',a.revision,'subject_id',a.subject_id,'database_principal',a.database_principal,
  'scope',a.scope,'mapping_revision',a.mapping_revision,'key_revision',a.key_revision,
  'credential_revision',a.credential_revision,'predecessor',a.predecessor,
  'valid_from',a.valid_from,'valid_until',a.valid_until));
 if a.owner_approval_payload_hash is distinct from assignment_payload_hash then raise exception 'efta_assignment_receipt_payload_mismatch';end if;
 if s.mapping_revision is distinct from a.mapping_revision or s.key_revision is distinct from a.key_revision
 or m.runtime is distinct from p_runtime or m.principal is distinct from p_expected_principal
 or m.subject is distinct from a.subject_principal or m.key_revision is distinct from k.revision
 then raise exception 'efta_authenticated_subject_mismatch';end if;
 perform 1 from comparison_qualification.principal_sessions ps where ps.session_id=p_session and ps.runtime_id=p_runtime
 and ps.principal=p_expected_principal and ps.revoked_at is null and ps.expires_at>clock_timestamp();
 if not found then raise exception 'efta_authentication_session_revoked';end if;
 select * into ar from mip_identity.efta_live_auth_receipts where transaction_id=pg_current_xact_id()::text
 and broker_session=p_session and subject_id=a.subject_id and assignment_revision=a.revision
 and mapping_revision=a.mapping_revision and key_revision=a.key_revision and credential_revision=a.credential_revision
 and token_binding_hash=s.token_hash;
 if not found then raise exception 'efta_live_authentication_required';end if;
 insert into mip_identity.efta_live_auth_uses(receipt_id) values(ar.receipt_id);
 result:=jsonb_build_object('subject_id',a.subject_id,'subject_principal',a.subject_principal,
  'assignment_revision',a.revision,'authentication_revision',ar.authentication_revision,
  'auth_session_id',ar.auth_session_id,'live_auth_receipt_id',ar.receipt_id,'live_auth_receipt_hash',ar.receipt_hash,
  'broker_session',p_session,'mapping_revision',s.mapping_revision,'key_revision',s.key_revision,'runtime',p_runtime,
  'credential_revision',a.credential_revision,'credential_fingerprint_hash',c.credential_fingerprint_hash,
  'database_principal',p_expected_principal,'token_hash',s.token_hash);
 return result||jsonb_build_object('authority_receipt_hash',comparison_qualification.argument_digest(result));
end$$;

do $secure_tables$
declare t text;
begin
 foreach t in array array['efta_authentication_policy_versions','efta_authentication_policy_heads',
  'efta_live_auth_receipts','efta_live_auth_uses'] loop
  execute format('alter table mip_identity.%I owner to mip_cutover_schema_owner_v1',t);
  execute format('alter table mip_identity.%I enable row level security',t);
  execute format('alter table mip_identity.%I force row level security',t);
 end loop;
end$secure_tables$;
revoke all on table mip_identity.efta_authentication_policy_versions,mip_identity.efta_authentication_policy_heads,
 mip_identity.efta_live_auth_receipts,mip_identity.efta_live_auth_uses from public,anon,authenticated,service_role,
 mip_factual_reviewer_v3,mip_projection_publisher_v1,mip_efta_reviewer_v1,mip_efta_admitter_v1,mip_efta_private_reader_v1,mip_efta_authenticator_v1;
grant select on mip_identity.efta_authentication_policy_versions,mip_identity.efta_authentication_policy_heads,
 mip_identity.efta_live_auth_receipts to mip_efta_auth_session_owner_v1,mip_efta_owner_v1;
grant insert on mip_identity.efta_live_auth_receipts to mip_efta_auth_session_owner_v1;
grant insert on mip_identity.efta_live_auth_uses to mip_efta_owner_v1;
create policy efta_auth_owner_policy_versions on mip_identity.efta_authentication_policy_versions for select to mip_efta_auth_session_owner_v1 using(true);
create policy efta_auth_owner_policy_heads on mip_identity.efta_authentication_policy_heads for select to mip_efta_auth_session_owner_v1 using(true);
create policy efta_auth_owner_receipts on mip_identity.efta_live_auth_receipts to mip_efta_auth_session_owner_v1 using(true) with check(true);
create policy efta_owner_policy_versions on mip_identity.efta_authentication_policy_versions for select to mip_efta_owner_v1 using(true);
create policy efta_owner_policy_heads on mip_identity.efta_authentication_policy_heads for select to mip_efta_owner_v1 using(true);
create policy efta_owner_auth_receipts on mip_identity.efta_live_auth_receipts for select to mip_efta_owner_v1 using(true);
create policy efta_owner_auth_uses on mip_identity.efta_live_auth_uses for insert to mip_efta_owner_v1 with check(true);
create trigger immutable_auth_policy before update or delete on mip_identity.efta_authentication_policy_versions for each row execute function comparison_qualification.reject_rewrite();
create trigger immutable_auth_receipt before update or delete on mip_identity.efta_live_auth_receipts for each row execute function comparison_qualification.reject_rewrite();
create trigger immutable_auth_use before update or delete on mip_identity.efta_live_auth_uses for each row execute function comparison_qualification.reject_rewrite();
create trigger auth_policy_retirement before insert or update or delete on mip_identity.efta_authentication_policy_heads for each row execute function mip_identity.guard_revision_reuse();
create trigger auth_policy_fence before insert or update or delete on mip_identity.efta_authentication_policy_heads for each statement execute function mip_cutover_authority.fence_publication_write();

grant usage on schema mip_identity,comparison_qualification,auth to mip_efta_auth_session_owner_v1;
grant select on mip_identity.efta_authority_assignment_versions,mip_identity.efta_authority_assignment_heads,
 mip_identity.sessions,mip_identity.mapping_versions,mip_identity.key_versions,mip_identity.key_heads,
 mip_identity.efta_gateway_credential_versions,mip_identity.efta_gateway_credential_heads to mip_efta_auth_session_owner_v1;
grant select on comparison_qualification.principal_sessions to mip_efta_auth_session_owner_v1;
grant select(id,user_id) on auth.sessions to mip_efta_auth_session_owner_v1;
alter function mip_identity.efta_assert_live_auth_session(uuid,uuid,uuid,uuid,uuid,text,uuid,text) owner to mip_efta_auth_session_owner_v1;
revoke all on function mip_identity.efta_assert_live_auth_session(uuid,uuid,uuid,uuid,uuid,text,uuid,text)
 from public,anon,authenticated,service_role,mip_factual_reviewer_v3,mip_projection_publisher_v1,
 mip_efta_reviewer_v1,mip_efta_admitter_v1,mip_efta_private_reader_v1,mip_efta_owner_v1;
grant usage on schema mip_identity to mip_efta_authenticator_v1;
grant execute on function mip_identity.efta_assert_live_auth_session(uuid,uuid,uuid,uuid,uuid,text,uuid,text) to mip_efta_authenticator_v1;
revoke all on function mip_identity.authority_context(uuid,text,uuid,text) from public,anon,authenticated,service_role,
 mip_factual_reviewer_v3,mip_projection_publisher_v1,mip_efta_reviewer_v1,mip_efta_admitter_v1,
 mip_efta_private_reader_v1,mip_efta_authenticator_v1;
grant execute on function mip_identity.authority_context(uuid,text,uuid,text) to mip_efta_owner_v1;
commit;
