-- TEST-ONLY recovered producer. Never a migration or production deployment.
CREATE OR REPLACE FUNCTION public.mip_queue_source_comparison_enrichment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$ begin if new.comparison_validation_state is distinct from old.comparison_validation_state then insert into public.source_comparison_enrichment_queue(event_id, state, enqueued_at, processed_at, error_note) values (new.id, 'pending', now(), null, null) on conflict (event_id) do update set state = 'pending', enqueued_at = excluded.enqueued_at, processed_at = null, error_note = null; end if; return new; end; $function$
