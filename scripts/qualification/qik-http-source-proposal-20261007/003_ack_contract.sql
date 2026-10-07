-- Pure response contract; native-testable without the HTTP extension.
CREATE FUNCTION mip_http_transport.ack_satisfies(p_mode text,p_status integer,p_preferences text[],p_body text)
 RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
 DECLARE tokens text[]; tx text[];
 BEGIN
  IF p_mode IS NULL OR p_mode NOT IN ('commit','commit-allow-override','rollback','rollback-allow-override') OR
     p_status IS DISTINCT FROM 201 OR p_body IS DISTINCT FROM '' OR
     p_mode='rollback' OR coalesce(cardinality(p_preferences),0)>1 THEN RETURN false; END IF;
  SELECT array_agg(btrim(t)) INTO tokens FROM unnest(string_to_array(lower(p_preferences[1]),',')) t;
  SELECT array_agg(t) INTO tx FROM unnest(tokens) t WHERE t LIKE 'tx=%';
  IF coalesce(cardinality(tx),0)>1 OR (tx IS NOT NULL AND tx[1]<>'tx=commit') THEN RETURN false; END IF;
  IF p_mode='rollback-allow-override' AND tx IS NULL THEN RETURN false; END IF;
  RETURN true;
 END $$;
ALTER FUNCTION mip_http_transport.ack_satisfies(text,integer,text[],text) OWNER TO mip_http_kernel;
REVOKE ALL ON FUNCTION mip_http_transport.ack_satisfies(text,integer,text[],text) FROM PUBLIC;
