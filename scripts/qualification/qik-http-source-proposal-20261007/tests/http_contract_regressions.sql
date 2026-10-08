-- NEW ordinary synthetic SQL regressions, not replay/authentication of the
-- private October 7 six-ABI/six-record history. No real HTTP function is loaded.
DO $$
 DECLARE mode text; item record; n integer := 0;
 BEGIN
  FOREACH mode IN ARRAY ARRAY['commit','commit-allow-override','rollback-allow-override'] LOOP
   FOR item IN SELECT header FROM (VALUES ('tx=commit'),('return=minimal, tx=commit'),
     (' Tx=COMMIT , Return=MINIMAL ')) v(header) LOOP
    IF mip_http_transport.response_shape_satisfies(mode,201,ARRAY[item.header],'') IS DISTINCT FROM true THEN
     RAISE EXCEPTION 'http_contract_shape_positive_failed';
    END IF;
    n := n+1;
   END LOOP;
   FOR item IN SELECT prefs FROM (VALUES
    (NULL::text[]),(ARRAY[]::text[]),(ARRAY[NULL]::text[]),(ARRAY['']),
    (ARRAY['return=minimal']),(ARRAY['tx=rollback']),(ARRAY['tx=unknown']),
    (ARRAY['tx=commit','tx=commit']),(ARRAY['tx=commit','tx=rollback']),
    (ARRAY['tx=commit, tx=commit']),(ARRAY['tx=commit, tx=rollback']),
    (ARRAY['tx=commit, tx=unknown']),(ARRAY['tx=commit, tx = rollback']),
    (ARRAY['tx=commit, tx=']),(ARRAY['tx=commit, return=representation']),
    (ARRAY['tx=commit, return=minimal, return=minimal']),(ARRAY['tx=commit,']),
    (ARRAY[',tx=commit']),(ARRAY[E'tx=commit\r\nInjected: marker']),
    (ARRAY['tx=commit'||repeat(' ',1025)]),
    ('[0:0]={tx=commit}'::text[]),(ARRAY[ARRAY['tx=commit']])
   ) v(prefs) LOOP
    IF mip_http_transport.response_shape_satisfies(mode,201,item.prefs,'') IS DISTINCT FROM false THEN
     RAISE EXCEPTION 'http_contract_shape_header_refusal_failed';
    END IF;
    n := n+1;
   END LOOP;
  END LOOP;
  FOR item IN SELECT status,body FROM (VALUES
   (NULL::integer,''),(200,''),(202,''),(204,''),(400,''),(500,''),
   (201,NULL::text),(201,' '),(201,E'\n'),(201,'{}'),(201,'[]'),(201,'null')
  ) v(status,body) LOOP
   IF mip_http_transport.response_shape_satisfies('commit',item.status,ARRAY['tx=commit'],item.body)
      IS DISTINCT FROM false THEN RAISE EXCEPTION 'http_contract_shape_body_status_refusal_failed'; END IF;
   n := n+1;
  END LOOP;
  FOREACH mode IN ARRAY ARRAY[NULL,'rollback','unknown','COMMIT'] LOOP
   IF mip_http_transport.response_shape_satisfies(mode,201,ARRAY['tx=commit'],'') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'http_contract_shape_mode_refusal_failed';
   END IF;
   n := n+1;
  END LOOP;
  INSERT INTO http_contract_test.results VALUES ('responseShape',n);
 END $$;

DO $$
 DECLARE endpoint text := 'https://receiver.test.invalid/rest/v1/events';
 token text := 'SYNTHETIC_ONLY_opaque-._~+/=='; ca text := '/mip/trust/'||repeat('a',64)||'.pem';
 item record; n integer := 0;
 BEGIN
  IF mip_http_transport.inputs_satisfy(endpoint,endpoint,token,ca) IS DISTINCT FROM true OR
     mip_http_transport.inputs_satisfy(endpoint,endpoint,repeat('A',4096),ca) IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'http_contract_input_positive_failed';
  END IF;
  n := n+2;
  FOR item IN SELECT candidate FROM (VALUES
   (NULL::text),(''),('http://receiver.test.invalid/rest/v1/events'),
   ('https://user@receiver.test.invalid/rest/v1/events'),
   ('https://user:pass@receiver.test.invalid/rest/v1/events'),
   ('https://receiver.test.invalid:443/rest/v1/events'),
   ('https://receiver.test.invalid/rest/v1/events?x=1'),
   ('https://receiver.test.invalid/rest/v1/events#fragment'),
   ('https://127.0.0.1/rest/v1/events'),('https://2130706433/rest/v1/events'),
   ('https://[::1]/rest/v1/events'),('https://localhost/rest/v1/events'),
   ('https://api.localhost/rest/v1/events'),('https://receiver/rest/v1/events'),
   ('https://receiver.local/rest/v1/events'),('https://receiver.x/rest/v1/events'),
   ('https://receiver.com9/rest/v1/events'),('https://receiver.co-m/rest/v1/events'),
   ('https://receiver.test.invalid./rest/v1/events'),
   ('https://-receiver.test.invalid/rest/v1/events'),
   ('https://receiver-.test.invalid/rest/v1/events'),
   ('https://' || repeat('a',64) || '.test.invalid/rest/v1/events'),
   ('https://receiver.test.invalid/rest/v1/../events'),
   ('https://receiver.test.invalid/rest//events'),
   ('https://receiver.test.invalid/rest/v1/events/'),
   ('https://receiver.test.invalid/rest/v1/%0d%0aevents'),
   ('https://receiver.test.invalid/rest/v1/%250d%250aevents'),
   (E'https://receiver.test.invalid/rest\\v1/events'),
   (E'https://receiver.test.invalid/rest/v1/events\r\nInjected: marker'),
   (E'https://receiver.test.invalid/rest/v1/events\t'),
   ('https://receiver.test.invalid/' || repeat('a',2048))
  ) v(candidate) LOOP
   IF mip_http_transport.inputs_satisfy(item.candidate,item.candidate,token,ca) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'http_contract_endpoint_refusal_failed';
   END IF;
   n := n+1;
  END LOOP;
  FOR item IN SELECT bound FROM (VALUES (NULL::text),(''),
   ('https://other.test.invalid/rest/v1/events')) v(bound) LOOP
   IF mip_http_transport.inputs_satisfy(endpoint,item.bound,token,ca) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'http_contract_endpoint_binding_refusal_failed';
   END IF;
   n := n+1;
  END LOOP;
  FOR item IN SELECT candidate FROM (VALUES
   (NULL::text),(''),(repeat('A',4097)),('opaque token'),('opaque:token'),
   ('opaque,token'),('opaque;token'),(E'opaque\\token'),('opaque"token'),
   (E'opaque\r\nAuthorization: injected'),(E'opaque\t'),(chr(127)||'opaque'),('opaque=middle')
  ) v(candidate) LOOP
   IF mip_http_transport.inputs_satisfy(endpoint,endpoint,item.candidate,ca) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'http_contract_token_refusal_failed';
   END IF;
   n := n+1;
  END LOOP;
  FOR item IN SELECT candidate FROM (VALUES
   (NULL::text),(''),('relative.pem'),('/etc/passwd'),
   ('/mip/trust/../outside.pem'),('/mip/trust/'||repeat('A',64)||'.pem'),
   ('/mip/trust/'||repeat('a',63)||'.pem'),('/mip/trust/'||repeat('a',64)||'.key'),
   ('/mip/trust/'||repeat('a',300)||'.pem'),
   (E'/mip/trust/'||repeat('a',64)||E'.pem\n'),
   ('/mip/trust/%2e%2e/outside.pem')
  ) v(candidate) LOOP
   IF mip_http_transport.inputs_satisfy(endpoint,endpoint,token,item.candidate) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'http_contract_ca_refusal_failed';
   END IF;
   n := n+1;
  END LOOP;
  INSERT INTO http_contract_test.results VALUES ('inputBoundary',n);
 END $$;

-- Each named record case reaches the actual compiled proposal send() with
-- plausible pgsql-http record layout. Every acceptable shape still refuses.
DO $$
 DECLARE item record; n integer := 0;
 BEGIN
  FOR item IN SELECT name,response FROM (VALUES
   ('empty-content',ROW(201,'application/json',
      ARRAY[ROW('Preference-Applied','tx=commit')::mip_http_raw.http_header],'')::mip_http_raw.http_response),
   ('zero-length-sql-null',ROW(201,'application/json',
      ARRAY[ROW('Preference-Applied','tx=commit')::mip_http_raw.http_header],NULL)::mip_http_raw.http_response),
   ('null-content-type',ROW(201,NULL,
      ARRAY[ROW('Preference-Applied','tx=commit')::mip_http_raw.http_header],'')::mip_http_raw.http_response),
   ('case-insensitive-field',ROW(201,'text/plain',
      ARRAY[ROW('pReFeReNcE-aPpLiEd','tx=commit')::mip_http_raw.http_header],'')::mip_http_raw.http_response),
   ('unrelated-header-before',ROW(201,'application/json',
      ARRAY[ROW('Content-Length','0')::mip_http_raw.http_header,
            ROW('Preference-Applied','return=minimal, tx=commit')::mip_http_raw.http_header],'')::mip_http_raw.http_response),
   ('unrelated-header-after',ROW(201,'application/json',
      ARRAY[ROW('Preference-Applied','return=minimal, tx=commit')::mip_http_raw.http_header,
            ROW('Content-Length','0')::mip_http_raw.http_header],'')::mip_http_raw.http_response)
  ) v(name,response) LOOP
   PERFORM http_contract_test.reset_fixture();
   UPDATE http_contract_test.settings SET response=item.response;
   PERFORM http_contract_test.assert_refusal('mip_http_commit_unqualified',1,3,3);
   n := n+1;
  END LOOP;
  INSERT INTO http_contract_test.results VALUES ('recordCompatibility',n);
 END $$;

-- Six NEW injected raw SQL ABI faults: three HTTP exceptions and three
-- post-response reset exceptions. SQL control flow only; never libcurl faults.
DO $$
 DECLARE item record; n integer := 0;
 BEGIN
  FOR item IN SELECT name,phase,kind FROM (VALUES
   ('http-query-canceled','http','cancel'),('http-assert-failure','http','assert'),
   ('http-other-error','http','other'),('post-response-reset-query-canceled','reset','cancel'),
   ('post-response-reset-assert-failure','reset','assert'),
   ('post-response-reset-other-error','reset','other')
  ) v(name,phase,kind) LOOP
   PERFORM http_contract_test.reset_fixture();
   IF item.phase='http' THEN
    UPDATE http_contract_test.settings SET http_error=item.kind;
    PERFORM http_contract_test.assert_refusal('mip_http_audit_unavailable',1,3,2);
   ELSE
    UPDATE http_contract_test.settings SET reset_error=item.kind,reset_error_call=2;
    PERFORM http_contract_test.assert_refusal('mip_http_audit_unavailable',1,3,3);
   END IF;
   n := n+1;
  END LOOP;
  INSERT INTO http_contract_test.results VALUES ('syntheticAbiErrors',n);
 END $$;

DO $$
 DECLARE item record; n integer := 0;
 BEGIN
  -- Missing/duplicate/conflicting/unknown headers, statuses, bodies, NULL record.
  FOR item IN SELECT response FROM (VALUES
   (ROW(201,NULL,NULL,'')::mip_http_raw.http_response),
   (ROW(201,NULL,ARRAY[]::mip_http_raw.http_header[],'')::mip_http_raw.http_response),
   (ROW(201,NULL,ARRAY[ROW('Preference-Applied','return=minimal')::mip_http_raw.http_header],'')::mip_http_raw.http_response),
   (ROW(201,NULL,ARRAY[ROW('Preference-Applied','tx=commit')::mip_http_raw.http_header,
     ROW('preference-applied','tx=commit')::mip_http_raw.http_header],'')::mip_http_raw.http_response),
   (ROW(201,NULL,ARRAY[ROW('Preference-Applied','tx=commit,tx=rollback')::mip_http_raw.http_header],'')::mip_http_raw.http_response),
   (ROW(201,NULL,ARRAY[ROW('Preference-Applied','tx=unknown')::mip_http_raw.http_header],'')::mip_http_raw.http_response),
   (ROW(204,NULL,ARRAY[ROW('Preference-Applied','tx=commit')::mip_http_raw.http_header],'')::mip_http_raw.http_response),
   (ROW(201,NULL,ARRAY[ROW('Preference-Applied','tx=commit')::mip_http_raw.http_header],'{}')::mip_http_raw.http_response),
   (NULL::mip_http_raw.http_response)
  ) v(response) LOOP
   PERFORM http_contract_test.reset_fixture();
   UPDATE http_contract_test.settings SET response=item.response;
   PERFORM http_contract_test.assert_refusal('mip_http_audit_unavailable',1,3,3);
   n := n+1;
  END LOOP;
  FOR item IN SELECT mode FROM (VALUES ('commit-allow-override'),('rollback-allow-override')) v(mode) LOOP
   PERFORM http_contract_test.reset_fixture();
   UPDATE mip_http_private.endpoint_config SET tx_end=item.mode;
   PERFORM http_contract_test.assert_refusal('mip_http_commit_unqualified',1,3,3);
   n := n+1;
  END LOOP;
  INSERT INTO http_contract_test.results VALUES ('senderResponseRefusals',n);
 END $$;

DO $$
 DECLARE item record; n integer := 0;
 BEGIN
  -- Rejected input/config must not invoke POST or set any curl option.
  FOR item IN SELECT name FROM (VALUES
   ('non-https'),('unbound-endpoint'),('injected-token'),('traversal-ca'),
   ('unqualified-build'),('null-build'),('unadmitted-provider'),('null-provider'),
   ('null-binding'),('unknown-binding'),('null-mode'),('rollback-mode'),('missing-config'),('duplicate-config')
  ) v(name) LOOP
   PERFORM http_contract_test.reset_fixture();
   CASE item.name
    WHEN 'non-https' THEN UPDATE mip_http_private.endpoint_config SET endpoint='http://receiver.test.invalid/rest/v1/events',
      qualified_endpoint='http://receiver.test.invalid/rest/v1/events';
    WHEN 'unbound-endpoint' THEN UPDATE mip_http_private.endpoint_config SET qualified_endpoint=NULL;
    WHEN 'injected-token' THEN UPDATE mip_http_private.endpoint_config SET bearer_token=E'opaque\r\nAuthorization: injected';
    WHEN 'traversal-ca' THEN UPDATE mip_http_private.endpoint_config SET ca_path='/mip/trust/../outside.pem';
    WHEN 'unqualified-build' THEN UPDATE mip_http_private.endpoint_config SET qualified_no_redirect_build=false;
    WHEN 'null-build' THEN UPDATE mip_http_private.endpoint_config SET qualified_no_redirect_build=NULL;
    WHEN 'unadmitted-provider' THEN UPDATE mip_http_private.endpoint_config SET provider_admitted=false;
    WHEN 'null-provider' THEN UPDATE mip_http_private.endpoint_config SET provider_admitted=NULL;
    WHEN 'null-binding' THEN UPDATE mip_http_private.endpoint_config SET receiver_binding=NULL;
    WHEN 'unknown-binding' THEN UPDATE mip_http_private.endpoint_config SET receiver_binding='unknown';
    WHEN 'null-mode' THEN UPDATE mip_http_private.endpoint_config SET tx_end=NULL;
    WHEN 'rollback-mode' THEN UPDATE mip_http_private.endpoint_config SET tx_end='rollback';
    WHEN 'missing-config' THEN DELETE FROM mip_http_private.endpoint_config;
    WHEN 'duplicate-config' THEN INSERT INTO mip_http_private.endpoint_config SELECT * FROM mip_http_private.endpoint_config;
   END CASE;
   PERFORM http_contract_test.assert_refusal('mip_http_audit_unavailable',0,0,1);
   n := n+1;
  END LOOP;
  FOR item IN SELECT event FROM (VALUES (NULL::jsonb),('null'::jsonb),('[]'::jsonb),('{}'::jsonb),
    ('{"attempted_transition":"published"}'::jsonb)) v(event) LOOP
   PERFORM http_contract_test.reset_fixture();
   PERFORM http_contract_test.assert_refusal('mip_http_audit_unavailable',0,0,1,item.event);
   n := n+1;
  END LOOP;
  INSERT INTO http_contract_test.results VALUES ('senderPreflightRefusals',n);
 END $$;

DO $$
 DECLARE kind text; n integer := 0;
 BEGIN
  FOREACH kind IN ARRAY ARRAY['cancel','assert','other'] LOOP
   -- Setup error, initial reset error, and failures of the cleanup reset itself.
   PERFORM http_contract_test.reset_fixture();
   UPDATE http_contract_test.settings SET set_error=kind;
   PERFORM http_contract_test.assert_refusal('mip_http_audit_unavailable',0,1,2);
   n := n+1;
   PERFORM http_contract_test.reset_fixture();
   UPDATE http_contract_test.settings SET reset_error=kind,reset_error_call=1;
   PERFORM http_contract_test.assert_refusal('mip_http_audit_unavailable',0,0,2);
   n := n+1;
   PERFORM http_contract_test.reset_fixture();
   UPDATE http_contract_test.settings SET reset_error=kind,reset_error_call=3;
   PERFORM http_contract_test.assert_refusal('mip_http_commit_unqualified',1,3,3);
   n := n+1;
   PERFORM http_contract_test.reset_fixture();
   UPDATE http_contract_test.settings SET http_error='other',reset_error=kind,reset_error_call=2;
   PERFORM http_contract_test.assert_refusal('mip_http_audit_unavailable',1,3,2);
   n := n+1;
  END LOOP;
  INSERT INTO http_contract_test.results VALUES ('senderResetErrors',n);
 END $$;

-- False/NULL raw boolean results must refuse rather than fall through to POST
-- or response acceptance, even under a synthetically mismatched extension ABI.
DO $$
 DECLARE outcome boolean; call_number integer; n integer := 0;
 BEGIN
  FOREACH outcome IN ARRAY ARRAY[false,NULL]::boolean[] LOOP
   FOR call_number IN 1..3 LOOP
    PERFORM http_contract_test.reset_fixture();
    UPDATE http_contract_test.settings SET set_result=outcome,set_result_call=call_number;
    PERFORM http_contract_test.assert_refusal('mip_http_audit_unavailable',0,call_number,2);
    n := n+1;
   END LOOP;
   FOR call_number IN 1..2 LOOP
    PERFORM http_contract_test.reset_fixture();
    UPDATE http_contract_test.settings SET reset_result=outcome,reset_result_call=call_number;
    IF call_number=1 THEN
     PERFORM http_contract_test.assert_refusal('mip_http_audit_unavailable',0,0,2);
    ELSE
     PERFORM http_contract_test.assert_refusal('mip_http_audit_unavailable',1,3,3);
    END IF;
    n := n+1;
   END LOOP;
  END LOOP;
  INSERT INTO http_contract_test.results VALUES ('senderBooleanRefusals',n);
 END $$;

-- Actual prepared role/ACL properties in the synthetic catalog only.
DO $$
 BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p
    CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    WHERE p.pronamespace='mip_http_transport'::regnamespace
      AND p.proname IN ('send','response_shape_satisfies','inputs_satisfy')
      AND a.grantee=0 AND a.privilege_type='EXECUTE') THEN
   RAISE EXCEPTION 'http_contract_public_acl_failed';
  END IF;
  IF (SELECT rolcanlogin OR rolsuper FROM pg_roles WHERE rolname='mip_http_kernel') THEN
   RAISE EXCEPTION 'http_contract_kernel_role_failed';
  END IF;
  INSERT INTO http_contract_test.results VALUES ('preparedAcl',4);
 END $$;

SELECT json_build_object('serverMajor',current_setting('server_version_num')::integer/10000,
 'cases',(SELECT json_object_agg(category,cases ORDER BY category) FROM http_contract_test.results),
 'total',(SELECT sum(cases) FROM http_contract_test.results));
