-- QUALIFICATION ONLY. This is NOT real dblink and is NEVER a production sender.
-- Entire original009/logger bytes remain unchanged. Its fixed INSERT is parsed
-- into the exact five-field event; arbitrary SQL is refused, never executed.
CREATE SCHEMA qik_original_fixture;
REVOKE ALL ON SCHEMA qik_original_fixture FROM PUBLIC;
CREATE TABLE qik_original_fixture.config(id boolean PRIMARY KEY CHECK(id),ca_path text NOT NULL,bearer_token text NOT NULL,
 barrier boolean NOT NULL DEFAULT false,use_production_gate boolean NOT NULL DEFAULT false);
REVOKE ALL ON qik_original_fixture.config FROM PUBLIC;
CREATE FUNCTION qik_original_fixture.qualification_send(event jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET http.timeout_msec='1500'
 SET http.keepalive='off' AS $$
DECLARE cfg qik_original_fixture.config;resp mip_http_raw.http_response;applied text[];
BEGIN
 SELECT * INTO STRICT cfg FROM qik_original_fixture.config WHERE id;
 IF mip_http_raw.http_reset_curlopt() IS DISTINCT FROM true THEN RAISE EXCEPTION 'qualification_reset_refused'; END IF;
 IF mip_http_raw.http_set_curlopt('CURLOPT_CAINFO',cfg.ca_path) IS DISTINCT FROM true
 OR mip_http_raw.http_set_curlopt('CURLOPT_TIMEOUT_MS','1500') IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'qualification_audit_unavailable'; END IF;
 SELECT * INTO STRICT resp FROM mip_http_raw.http((
  'POST','https://audit.receiver.test/rpc/append_event',ARRAY[
   ('Authorization','Bearer '||cfg.bearer_token)::mip_http_raw.http_header,
   ('Prefer','return=minimal, tx=commit')::mip_http_raw.http_header],
  'application/json',event::text)::mip_http_raw.http_request);
 IF mip_http_raw.http_reset_curlopt() IS DISTINCT FROM true THEN RAISE EXCEPTION 'qualification_reset_refused'; END IF;
 SELECT array_agg(h.value) INTO applied FROM unnest(resp.headers) h WHERE lower(h.field)='preference-applied';
 IF mip_http_transport.response_shape_satisfies('commit-allow-override',resp.status,applied,coalesce(resp.content,'')) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'qualification_audit_unavailable'; END IF;
 IF cfg.barrier THEN PERFORM pg_catalog.pg_advisory_xact_lock(61012009); END IF;
 RETURN;
EXCEPTION WHEN query_canceled OR assert_failure THEN
 BEGIN PERFORM mip_http_raw.http_reset_curlopt();EXCEPTION WHEN OTHERS THEN NULL;END;
 RAISE;
WHEN OTHERS THEN
 IF mip_http_raw.http_reset_curlopt() IS DISTINCT FROM true THEN RAISE EXCEPTION 'qualification_session_retirement_required'; END IF;
 RAISE EXCEPTION USING MESSAGE='qualification_audit_unavailable',DETAIL='',HINT='';
END $$;
CREATE FUNCTION qik_original_fixture.transport_sql(conn text,statement text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $body$
DECLARE fields text[];event jsonb;cfg qik_original_fixture.config;
BEGIN
 IF conn IS DISTINCT FROM 'qualification-original009-http' THEN RAISE EXCEPTION 'qualification_route_refused';END IF;
 fields:=regexp_match(statement,$pattern$^insert into mip_factual\.rejection_audit\(id,explanation_id,assertion_digest,attempted_transition,rule\) values\('([a-f0-9-]{36})','([a-f0-9-]{36})','([a-f0-9]{64})','published','(provenance|human_review|source_state)'\)$pattern$);
 IF fields IS NULL THEN RAISE EXCEPTION 'qualification_statement_refused';END IF;
 event:=jsonb_build_object('id',fields[1],'explanation_id',fields[2],'assertion_digest',fields[3],
 'attempted_transition','published','rule',fields[4]);
 SELECT * INTO STRICT cfg FROM qik_original_fixture.config WHERE id;
 IF cfg.use_production_gate THEN PERFORM mip_http_transport.send(event);
 ELSE PERFORM qik_original_fixture.qualification_send(event);END IF;
 RETURN 'INSERT 0 1';
END $body$;
ALTER FUNCTION qik_original_fixture.qualification_send(jsonb) OWNER TO mip_http_kernel;
ALTER FUNCTION qik_original_fixture.transport_sql(text,text) OWNER TO mip_http_kernel;
GRANT USAGE ON SCHEMA qik_original_fixture TO mip_http_kernel,mip_factual_owner_v3;
GRANT SELECT ON qik_original_fixture.config TO mip_http_kernel;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA qik_original_fixture FROM PUBLIC;
GRANT EXECUTE ON FUNCTION qik_original_fixture.transport_sql(text,text) TO mip_factual_owner_v3;
CREATE OR REPLACE FUNCTION mip_factual_transport.dblink_exec(text,text) RETURNS text
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RETURN qik_original_fixture.transport_sql($1,$2);END $$;
