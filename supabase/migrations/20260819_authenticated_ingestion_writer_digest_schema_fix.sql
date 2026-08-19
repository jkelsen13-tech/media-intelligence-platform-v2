-- Correct the authenticated writer key check for Supabase projects where pgcrypto
-- is installed in the extensions schema rather than public.

create or replace function public.mip_v2_assert_ingestion_writer_key(p_key text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  expected_hash text;
begin
  if p_key is null or length(trim(p_key)) < 32 then
    raise exception 'invalid ingestion writer key';
  end if;
  select key_hash into expected_hash
  from public.ingestion_writer_credentials
  where id = 1 and active = true;
  if expected_hash is null or encode(extensions.digest(p_key, 'sha256'), 'hex') <> expected_hash then
    raise exception 'invalid ingestion writer key';
  end if;
end;
$$;

comment on function public.mip_v2_assert_ingestion_writer_key(text) is
  'Validates the local isolated-v2 ingestion RPC key against a SHA-256 hash using extensions.digest.';
