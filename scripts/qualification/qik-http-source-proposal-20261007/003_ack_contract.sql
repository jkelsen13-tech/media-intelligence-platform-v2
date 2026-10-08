-- NONPRODUCTION, PREPARED ONLY. These pure predicates establish no authority,
-- receiver custody, HTTP behavior, or durable/event-specific commit proof.
-- Exactly one Preference-Applied header must explicitly apply tx=commit.
-- This restricted response contract accepts only the requested preferences.
CREATE FUNCTION mip_http_transport.response_shape_satisfies(p_mode text,p_status integer,p_preferences text[],p_body text)
 RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
 DECLARE tokens text[]; tx_count integer; distinct_count integer;
 BEGIN
  IF p_mode IS NULL OR p_mode NOT IN ('commit','commit-allow-override','rollback-allow-override') OR
     p_status IS DISTINCT FROM 201 OR p_body IS DISTINCT FROM '' OR
     cardinality(p_preferences) IS DISTINCT FROM 1 OR
     array_ndims(p_preferences) IS DISTINCT FROM 1 OR
     array_lower(p_preferences,1) IS DISTINCT FROM 1 OR
     p_preferences[1] IS NULL OR octet_length(p_preferences[1])>1024 OR
     p_preferences[1] ~ '[[:cntrl:]]' THEN RETURN false; END IF;
  SELECT array_agg(btrim(t)) INTO tokens FROM unnest(string_to_array(lower(p_preferences[1]),',')) t;
  IF tokens IS NULL OR EXISTS (SELECT 1 FROM unnest(tokens) t
    WHERE t NOT IN ('return=minimal','tx=commit')) THEN RETURN false; END IF;
  SELECT count(*) FILTER (WHERE t='tx=commit'),count(DISTINCT t)
   INTO tx_count,distinct_count FROM unnest(tokens) t;
  IF tx_count<>1 OR distinct_count<>cardinality(tokens) THEN RETURN false; END IF;
  RETURN true;
 END $$;
ALTER FUNCTION mip_http_transport.response_shape_satisfies(text,integer,text[],text) OWNER TO mip_http_kernel;
REVOKE ALL ON FUNCTION mip_http_transport.response_shape_satisfies(text,integer,text[],text) FROM PUBLIC;

-- qualified_endpoint is an exact value supplied ONLY by a future qualified
-- private configuration, never by the event/caller. No endpoint is supplied in
-- this proposal. Lexical equality is a necessary input boundary, not receiver
-- qualification; deployment must establish configuration/ACL and DNS custody.
-- The CA namespace below is a future read-only trust namespace, not a claim
-- that any file, provider, credential, or custody arrangement exists today.
CREATE FUNCTION mip_http_transport.inputs_satisfy(p_endpoint text,p_qualified_endpoint text,p_token text,p_ca_path text)
 RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
 DECLARE authority text;
 BEGIN
  IF p_endpoint IS NULL OR p_qualified_endpoint IS NULL OR
     p_endpoint IS DISTINCT FROM p_qualified_endpoint OR
     octet_length(p_endpoint)>2048 OR p_endpoint ~ '[[:cntrl:]]' OR
     p_endpoint !~ '^https://([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(/[A-Za-z0-9_-]+)+$' THEN
   RETURN false;
  END IF;
  authority := split_part(p_endpoint,'/',3);
  IF octet_length(authority)>253 OR authority='localhost' OR
     authority LIKE '%.localhost' OR authority LIKE '%.local' THEN RETURN false; END IF;
  -- Opaque: never decode, log, or treat the token as authority. Restrict the
  -- bearer transport alphabet to exclude whitespace and header delimiters.
  IF p_token IS NULL OR octet_length(p_token) NOT BETWEEN 1 AND 4096 OR
     p_token !~ '^[A-Za-z0-9._~+/-]+=*$' OR p_token ~ '[[:cntrl:]]' OR
     p_ca_path IS NULL OR octet_length(p_ca_path)>256 OR
     p_ca_path !~ '^/mip/trust/[a-f0-9]{64}\.pem$' OR
     p_ca_path ~ '[[:cntrl:]]' THEN RETURN false; END IF;
  RETURN true;
 END $$;
ALTER FUNCTION mip_http_transport.inputs_satisfy(text,text,text,text) OWNER TO mip_http_kernel;
REVOKE ALL ON FUNCTION mip_http_transport.inputs_satisfy(text,text,text,text) FROM PUBLIC;
