-- Synthetic PG17 SQL fixture only: no extension, sockets, HTTP, TLS, or provider.
-- These disposable roles/configurations are not deployment instructions.
SET client_min_messages=warning;
SET statement_timeout='15s';
CREATE ROLE mip_http_kernel NOLOGIN;
CREATE SCHEMA mip_http_raw;
CREATE SCHEMA mip_http_private;
CREATE SCHEMA mip_http_transport;
CREATE SCHEMA http_contract_test;
GRANT USAGE ON SCHEMA mip_http_private,mip_http_transport,http_contract_test TO mip_http_kernel;
CREATE TYPE mip_http_raw.http_header AS (field varchar,value varchar);
CREATE TYPE mip_http_raw.http_request AS
 (method varchar,uri varchar,headers mip_http_raw.http_header[],content_type varchar,content varchar);
CREATE TYPE mip_http_raw.http_response AS
 (status integer,content_type varchar,headers mip_http_raw.http_header[],content varchar);
CREATE TABLE mip_http_private.endpoint_config (
 id boolean,qualified_no_redirect_build boolean,provider_admitted boolean,
 receiver_binding text,tx_end text,endpoint text,qualified_endpoint text,bearer_token text,ca_path text
);
GRANT SELECT ON mip_http_private.endpoint_config TO mip_http_kernel;
CREATE TABLE http_contract_test.settings (
 http_error text,set_error text,reset_error text,reset_error_call integer,
 response mip_http_raw.http_response,set_result boolean,set_result_call integer,
 reset_result boolean,reset_result_call integer
);
GRANT SELECT ON http_contract_test.settings TO mip_http_kernel;
CREATE SEQUENCE http_contract_test.http_calls;
CREATE SEQUENCE http_contract_test.set_calls;
CREATE SEQUENCE http_contract_test.reset_calls;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA http_contract_test TO mip_http_kernel;
CREATE TABLE http_contract_test.results (category text PRIMARY KEY,cases integer NOT NULL);

CREATE FUNCTION http_contract_test.fail(p_kind text) RETURNS void
 LANGUAGE plpgsql SET search_path='' AS $$
 BEGIN
  IF p_kind IS NULL THEN RETURN; END IF;
  IF p_kind='cancel' THEN
   RAISE EXCEPTION USING ERRCODE='57014',MESSAGE='SYNTHETIC_PRIVATE_DIAGNOSTIC',
    DETAIL='SYNTHETIC_PRIVATE_DIAGNOSTIC',HINT='SYNTHETIC_PRIVATE_DIAGNOSTIC';
  ELSIF p_kind='assert' THEN
   RAISE EXCEPTION USING ERRCODE='P0004',MESSAGE='SYNTHETIC_PRIVATE_DIAGNOSTIC',
    DETAIL='SYNTHETIC_PRIVATE_DIAGNOSTIC',HINT='SYNTHETIC_PRIVATE_DIAGNOSTIC';
  ELSE
   RAISE EXCEPTION USING ERRCODE='XX000',MESSAGE='SYNTHETIC_PRIVATE_DIAGNOSTIC',
    DETAIL='SYNTHETIC_PRIVATE_DIAGNOSTIC',HINT='SYNTHETIC_PRIVATE_DIAGNOSTIC';
  END IF;
 END $$;
REVOKE ALL ON FUNCTION http_contract_test.fail(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION http_contract_test.fail(text) TO mip_http_kernel;
CREATE FUNCTION mip_http_raw.http_reset_curlopt() RETURNS boolean
 LANGUAGE plpgsql SET search_path='' AS $$
 DECLARE n bigint; s http_contract_test.settings;
 BEGIN
  n := nextval('http_contract_test.reset_calls');
  SELECT * INTO STRICT s FROM http_contract_test.settings;
  IF s.reset_error_call=-1 OR s.reset_error_call=n THEN
   PERFORM http_contract_test.fail(s.reset_error);
  END IF;
  IF s.reset_result_call=n THEN RETURN s.reset_result; END IF;
  RETURN true;
 END $$;
CREATE FUNCTION mip_http_raw.http_set_curlopt(p_name varchar,p_value varchar) RETURNS boolean
 LANGUAGE plpgsql SET search_path='' AS $$
 DECLARE s http_contract_test.settings; n bigint;
 BEGIN
  n := nextval('http_contract_test.set_calls');
  SELECT * INTO STRICT s FROM http_contract_test.settings;
  PERFORM http_contract_test.fail(s.set_error);
  IF s.set_result_call=n THEN RETURN s.set_result; END IF;
  IF (p_name,p_value) NOT IN (
    ('CURLOPT_CAINFO','/mip/trust/'||repeat('a',64)||'.pem'),
    ('CURLOPT_CONNECTTIMEOUT_MS','500'),('CURLOPT_TIMEOUT_MS','1500')) THEN
   RAISE EXCEPTION 'http_contract_fixed_options_failed';
  END IF;
  RETURN true;
 END $$;
CREATE FUNCTION mip_http_raw.http(p_request mip_http_raw.http_request)
 RETURNS mip_http_raw.http_response LANGUAGE plpgsql SET search_path='' AS $$
 DECLARE s http_contract_test.settings;
 BEGIN
  PERFORM nextval('http_contract_test.http_calls');
  SELECT * INTO STRICT s FROM http_contract_test.settings;
  IF p_request.method IS DISTINCT FROM 'POST' OR
     p_request.uri IS DISTINCT FROM 'https://receiver.test.invalid/rest/v1/events' OR
     p_request.content_type IS DISTINCT FROM 'application/json' OR
     cardinality(p_request.headers) IS DISTINCT FROM 2 OR
     (p_request.headers[1]).field IS DISTINCT FROM 'Authorization' OR
     (p_request.headers[1]).value IS DISTINCT FROM 'Bearer SYNTHETIC_ONLY_opaque-._~+/==' OR
     (p_request.headers[2]).field IS DISTINCT FROM 'Prefer' OR
     (p_request.headers[2]).value IS DISTINCT FROM 'return=minimal, tx=commit' OR
     p_request.content::jsonb IS DISTINCT FROM jsonb_build_object('id','fixture-event','explanation_id','fixture-explanation',
       'assertion_digest',repeat('a',64),'attempted_transition','published','rule','provenance') THEN
   RAISE EXCEPTION 'http_contract_request_failed';
  END IF;
  PERFORM http_contract_test.fail(s.http_error);
  RETURN s.response;
 END $$;

CREATE FUNCTION http_contract_test.reset_fixture() RETURNS void LANGUAGE plpgsql AS $$
 BEGIN
  DELETE FROM mip_http_private.endpoint_config;
  INSERT INTO mip_http_private.endpoint_config VALUES
   (true,true,true,'sha256:'||repeat('a',64),'commit',
    'https://receiver.test.invalid/rest/v1/events','https://receiver.test.invalid/rest/v1/events',
    'SYNTHETIC_ONLY_opaque-._~+/==','/mip/trust/'||repeat('a',64)||'.pem');
  DELETE FROM http_contract_test.settings;
  INSERT INTO http_contract_test.settings VALUES
   (NULL,NULL,NULL,NULL,ROW(201,'application/json',
     ARRAY[ROW('Preference-Applied','return=minimal, tx=commit')::mip_http_raw.http_header],
     '')::mip_http_raw.http_response,true,NULL,true,NULL);
  PERFORM setval('http_contract_test.http_calls',1,false);
  PERFORM setval('http_contract_test.set_calls',1,false);
  PERFORM setval('http_contract_test.reset_calls',1,false);
 END $$;

-- Sequence increments survive the send() exception's subtransaction rollback.
-- They observe attempted calls even when the synthetic raw function raises.
CREATE FUNCTION http_contract_test.assert_refusal(p_message text,p_http integer,p_set integer,p_reset integer,
 p_event jsonb DEFAULT jsonb_build_object('id','fixture-event','explanation_id','fixture-explanation',
  'assertion_digest',repeat('a',64),'attempted_transition','published','rule','provenance'))
 RETURNS void LANGUAGE plpgsql AS $$
 DECLARE m text; d text; h text; state text; seen boolean := false; n bigint;
 BEGIN
  BEGIN
   PERFORM mip_http_transport.send(p_event);
  EXCEPTION WHEN query_canceled OR assert_failure OR OTHERS THEN
   seen := true;
   GET STACKED DIAGNOSTICS m=MESSAGE_TEXT,d=PG_EXCEPTION_DETAIL,h=PG_EXCEPTION_HINT,state=RETURNED_SQLSTATE;
   IF m IS DISTINCT FROM p_message OR d IS DISTINCT FROM '' OR h IS DISTINCT FROM '' OR state<>'P0001' THEN
    RAISE EXCEPTION 'http_contract_sanitized_refusal_failed';
   END IF;
  END;
  IF NOT seen THEN RAISE EXCEPTION 'http_contract_sender_returned'; END IF;
  SELECT CASE WHEN is_called THEN last_value ELSE 0 END INTO n FROM http_contract_test.http_calls;
  IF n<>p_http THEN RAISE EXCEPTION 'http_contract_http_count_failed'; END IF;
  SELECT CASE WHEN is_called THEN last_value ELSE 0 END INTO n FROM http_contract_test.set_calls;
  IF n<>p_set THEN RAISE EXCEPTION 'http_contract_set_count_failed'; END IF;
  SELECT CASE WHEN is_called THEN last_value ELSE 0 END INTO n FROM http_contract_test.reset_calls;
  IF n<>p_reset THEN RAISE EXCEPTION 'http_contract_reset_count_failed'; END IF;
 END $$;
