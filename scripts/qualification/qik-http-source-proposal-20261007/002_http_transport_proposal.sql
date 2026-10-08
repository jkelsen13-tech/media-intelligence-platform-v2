-- NONPRODUCTION, PREPARED ONLY. Not submitted to the shared PG17 fixture.
-- Requires the reviewed no-redirect fork of pgsql-http v1.6.3, installed in
-- mip_http_raw. Unmodified v1.6.3 cannot satisfy the no-redirect precondition.
-- Every raw function is denied to PUBLIC/publisher/auditor; the transport owner
-- alone gets exactly the needed raw functions. No live authority is supplied.
-- Apply 003_ack_contract.sql before this fragment. A future private config must
-- contain qualified_endpoint, the exact endpoint admitted by its qualification.
-- None of the prepared flags/bindings or grants constitutes that qualification.
REVOKE ALL ON SCHEMA mip_http_raw FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA mip_http_raw FROM PUBLIC;
GRANT USAGE ON SCHEMA mip_http_raw TO mip_http_kernel;
GRANT EXECUTE ON FUNCTION mip_http_raw.http(mip_http_raw.http_request),
 mip_http_raw.http_set_curlopt(varchar,varchar),mip_http_raw.http_reset_curlopt()
 TO mip_http_kernel;
CREATE OR REPLACE FUNCTION mip_http_transport.send(event jsonb) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
 SET http.timeout_msec='1500' SET http.keepalive='off'
 SET client_min_messages='warning' AS $$
 DECLARE cfg mip_http_private.endpoint_config; resp mip_http_raw.http_response;
 applied text[]; key_count integer; refusal text := 'mip_http_audit_unavailable';
 BEGIN
  SELECT * INTO STRICT cfg FROM mip_http_private.endpoint_config WHERE id;
  -- These inert false flags are intentionally not set by this prototype.
  IF cfg.qualified_no_redirect_build IS DISTINCT FROM true OR
     cfg.provider_admitted IS DISTINCT FROM true OR
     cfg.receiver_binding IS NULL OR cfg.receiver_binding !~ '^sha256:[a-f0-9]{64}$' OR
     cfg.tx_end IS NULL OR cfg.tx_end NOT IN ('commit','commit-allow-override','rollback-allow-override') OR
     mip_http_transport.inputs_satisfy(cfg.endpoint,cfg.qualified_endpoint,cfg.bearer_token,cfg.ca_path)
       IS DISTINCT FROM true THEN
   RAISE EXCEPTION USING MESSAGE='mip_http_audit_unavailable';
  END IF;
  IF jsonb_typeof(event) IS DISTINCT FROM 'object' THEN
   RAISE EXCEPTION USING MESSAGE='mip_http_audit_unavailable';
  END IF;
  SELECT count(*) INTO key_count FROM jsonb_object_keys(event);
  IF key_count<>5 OR NOT event ?& ARRAY['id','explanation_id','assertion_digest','attempted_transition','rule'] OR
     event->>'attempted_transition' IS DISTINCT FROM 'published' OR
     event->>'rule' IS NULL OR event->>'rule' NOT IN ('provenance','human_review','source_state') OR
     event->>'assertion_digest' IS NULL OR event->>'assertion_digest' !~ '^[a-f0-9]{64}$' THEN
   RAISE EXCEPTION USING MESSAGE='mip_http_audit_unavailable';
  END IF;
  IF mip_http_raw.http_reset_curlopt() IS DISTINCT FROM true THEN
   RAISE EXCEPTION USING MESSAGE='mip_http_audit_unavailable';
  END IF;
  -- Proxy/peer/hostname policy is immutable in the reviewed prepared C fork;
  -- those controls are not settable options at this boundary.
  IF mip_http_raw.http_set_curlopt('CURLOPT_CAINFO',cfg.ca_path) IS DISTINCT FROM true OR
     mip_http_raw.http_set_curlopt('CURLOPT_CONNECTTIMEOUT_MS','500') IS DISTINCT FROM true OR
     mip_http_raw.http_set_curlopt('CURLOPT_TIMEOUT_MS','1500') IS DISTINCT FROM true THEN
   RAISE EXCEPTION USING MESSAGE='mip_http_audit_unavailable';
  END IF;
  SELECT * INTO STRICT resp FROM mip_http_raw.http((
   'POST',cfg.endpoint,ARRAY[
    ('Authorization','Bearer '||cfg.bearer_token)::mip_http_raw.http_header,
    ('Prefer','return=minimal, tx=commit')::mip_http_raw.http_header],
   'application/json',event::text)::mip_http_raw.http_request);
  IF mip_http_raw.http_reset_curlopt() IS DISTINCT FROM true THEN
   RAISE EXCEPTION USING MESSAGE='mip_http_audit_unavailable';
  END IF;
  SELECT array_agg(h.value) INTO applied
   FROM unnest(resp.headers) h WHERE lower(h.field)='preference-applied';
  -- Pinned pgsql-http v1.6.3 maps a zero-length HTTP body to SQL NULL
  -- (http.c RESP_CONTENT branch). Normalize that known ABI at this boundary;
  -- the pure response-shape predicate continues to reject SQL NULL itself.
  -- Normalization can satisfy shape only, never durable commit proof.
  IF mip_http_transport.response_shape_satisfies(cfg.tx_end,resp.status,applied,coalesce(resp.content,'')) IS DISTINCT FROM true THEN
   RAISE EXCEPTION USING MESSAGE='mip_http_audit_unavailable';
  END IF;
  -- No accepted event-specific postcommit verifier is implemented here.
  -- Even 201/empty/tx=commit MUST refuse; no configuration flag can bypass it.
  -- Once POST is invoked, a valid response, local cancellation, or any error
  -- may follow a remote commit. Local abort does not unsend the request. Remote
  -- durability remains UNKNOWN; this proposal supplies no replay/COMMIT authority.
  refusal := 'mip_http_commit_unqualified';
  RAISE EXCEPTION USING MESSAGE=refusal,DETAIL='',HINT='';
 EXCEPTION WHEN query_canceled OR assert_failure THEN
  BEGIN
   PERFORM mip_http_raw.http_reset_curlopt();
  EXCEPTION WHEN query_canceled OR assert_failure THEN NULL;
   WHEN OTHERS THEN NULL;
  END;
  RAISE EXCEPTION USING MESSAGE=refusal,DETAIL='',HINT='';
 WHEN OTHERS THEN
  BEGIN
   PERFORM mip_http_raw.http_reset_curlopt();
  EXCEPTION WHEN query_canceled OR assert_failure THEN NULL;
   WHEN OTHERS THEN NULL;
  END;
  RAISE EXCEPTION USING MESSAGE=refusal,DETAIL='',HINT='';
 END $$;
ALTER FUNCTION mip_http_transport.send(jsonb) OWNER TO mip_http_kernel;
REVOKE ALL ON FUNCTION mip_http_transport.send(jsonb) FROM PUBLIC;
