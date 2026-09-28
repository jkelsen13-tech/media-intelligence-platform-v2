CREATE OR REPLACE FUNCTION public.mip_touch_arc_membership_candidate()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$ begin new.updated_at := now(); return new; end; $function$
