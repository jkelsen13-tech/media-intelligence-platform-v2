-- Supabase-supported asynchronous transport for the isolated collector shadow.
-- No cron job or active schedule is created here.
create extension if not exists pg_net with schema extensions;

comment on extension pg_net is
  'Async HTTP transport used for bounded collector-shadow probes; installation alone creates no schedule.';
