-- C3 qik ingest: disabled schedule intent. FILES ONLY.
-- Documents Vault + pg_cron + pg_net names. Does not create a secret, does not
-- call cron.schedule / cron.alter_job / net.http_post / vault.create_secret.
-- pg_cron.schedule would create an ACTIVE job; that is owner-enable only.

create table if not exists qik_ingest.schedule_intent (
  jobname text primary key check (jobname = 'mip-qik-ingest-rss'),
  schedule text not null check (schedule = '*/15 * * * *'),
  active boolean not null default false check (active = false),
  edge_slug text not null check (edge_slug = 'qik-ingest-rss'),
  vault_secret_name text not null check (vault_secret_name = 'mip_qik_ingest_scheduler_token'),
  header_name text not null check (header_name = 'x-mip-qik-ingest-key'),
  env_run_key text not null check (env_run_key = 'MIP_QIK_INGEST_RUN_KEY'),
  transport text not null check (transport = 'pg_cron+pg_net+vault'),
  notes text not null
);

insert into qik_ingest.schedule_intent (
  jobname, schedule, active, edge_slug, vault_secret_name, header_name,
  env_run_key, transport, notes
) values (
  'mip-qik-ingest-rss',
  '*/15 * * * *',
  false,
  'qik-ingest-rss',
  'mip_qik_ingest_scheduler_token',
  'x-mip-qik-ingest-key',
  'MIP_QIK_INGEST_RUN_KEY',
  'pg_cron+pg_net+vault',
  'Intent only. Recreate YHB vault-backed Edge invoke on qik under new names. Default disabled. See LIVE_OPERATION_PASTE.md.'
)
on conflict (jobname) do nothing;

alter table qik_ingest.schedule_intent enable row level security;
alter table qik_ingest.schedule_intent force row level security;
revoke all on table qik_ingest.schedule_intent from public, anon, authenticated, service_role, qik_ingest_runtime;
grant select, insert, update on table qik_ingest.schedule_intent to qik_ingest_fn_owner;
drop policy if exists qik_ingest_fn_schedule_intent on qik_ingest.schedule_intent;
create policy qik_ingest_fn_schedule_intent on qik_ingest.schedule_intent
  for all to qik_ingest_fn_owner using (true) with check (true);
