-- SOURCE PROPOSAL / DISPOSABLE SYNTHETIC FIXTURE ONLY.
-- Requires receiver_fixture.sql. Not a provider migration or live authority.
-- Unnamed JSON parameter receives the sender's whole application/json body.
-- PostgREST owns transaction end and Preference-Applied. Never forge that
-- header or call COMMIT here. 201/void is shape only, not durability proof.
CREATE ROLE mip_synthetic_http_caller NOLOGIN;
CREATE SCHEMA mip_synthetic_http AUTHORIZATION mip_synthetic_receiver_owner;
REVOKE ALL ON SCHEMA mip_synthetic_http FROM PUBLIC;
GRANT USAGE ON SCHEMA mip_synthetic_http TO mip_synthetic_receiver_writer,mip_synthetic_http_caller;
CREATE FUNCTION mip_synthetic_http.append_event(jsonb) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE event jsonb := $1; field text; headers jsonb; n integer;
BEGIN
 headers := pg_catalog.current_setting('request.headers',true)::jsonb;
 IF pg_catalog.current_setting('request.method',true) IS DISTINCT FROM 'POST'
  OR headers->>'content-type' IS DISTINCT FROM 'application/json'
  OR headers->>'prefer' IS DISTINCT FROM 'return=minimal, tx=commit'
  OR pg_catalog.jsonb_typeof(event) IS DISTINCT FROM 'object'
  OR pg_catalog.octet_length(event::text)>4096
 THEN RAISE EXCEPTION 'mip_http_receiver_refused'; END IF;
 SELECT count(*) INTO n FROM pg_catalog.jsonb_object_keys(event);
 IF n<>5 OR NOT event ?& ARRAY['id','explanation_id','assertion_digest','attempted_transition','rule']
 THEN RAISE EXCEPTION 'mip_http_receiver_refused'; END IF;
 FOREACH field IN ARRAY ARRAY['id','explanation_id','assertion_digest','attempted_transition','rule'] LOOP
  IF pg_catalog.jsonb_typeof(event->field) IS DISTINCT FROM 'string'
  THEN RAISE EXCEPTION 'mip_http_receiver_refused'; END IF;
 END LOOP;
 IF event->>'id' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR event->>'explanation_id' !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  OR event->>'assertion_digest' !~ '^[a-f0-9]{64}$'
  OR event->>'attempted_transition' IS DISTINCT FROM 'published'
  OR event->>'rule' NOT IN ('provenance','human_review','source_state')
 THEN RAISE EXCEPTION 'mip_http_receiver_refused'; END IF;
 PERFORM mip_synthetic_receiver.append_event((event->>'id')::uuid,(event->>'explanation_id')::uuid,
  event->>'assertion_digest',event->>'attempted_transition',event->>'rule');
 -- Transaction-local response metadata is emitted only after append succeeds.
 -- PostgREST must independently end the request transaction. This function
 -- neither changes the server's transaction policy nor grants receiver trust.
 PERFORM pg_catalog.set_config('response.status','201',true);
 RETURN;
EXCEPTION WHEN query_canceled OR assert_failure THEN
 RAISE EXCEPTION USING MESSAGE='mip_http_receiver_refused',DETAIL='',HINT='';
WHEN OTHERS THEN
 RAISE EXCEPTION USING MESSAGE='mip_http_receiver_refused',DETAIL='',HINT='';
END $$;
ALTER FUNCTION mip_synthetic_http.append_event(jsonb) OWNER TO mip_synthetic_receiver_writer;
REVOKE ALL ON FUNCTION mip_synthetic_http.append_event(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mip_synthetic_http.append_event(jsonb) TO mip_synthetic_http_caller;
