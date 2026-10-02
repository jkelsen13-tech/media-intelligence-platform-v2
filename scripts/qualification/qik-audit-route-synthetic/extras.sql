GRANT UPDATE,DELETE,INSERT ON ALL TABLES IN SCHEMA mip_comparison_install,mip_native_activation TO postgres;
CREATE OR REPLACE FUNCTION mip_factual_transport_raw.dblink(uri text,query text) RETURNS SETOF record LANGUAGE plpgsql AS $$ BEGIN
 RETURN QUERY SELECT CASE WHEN current_setting('synthetic.probe_mode',true)='badidentity'
   OR split_part(split_part(uri,'@',1),'mip_native_audit_v1:',2) IS DISTINCT FROM current_setting('synthetic.expected_password',true)
   THEN 'wrong_synthetic_auditor' ELSE 'mip_native_audit_v1' END::text,
   coalesce(current_setting('synthetic.probe_mode',true),'')<>'badtls';
END $$;
CREATE FUNCTION mip_factual.synthetic_suppress() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF current_setting('synthetic.suppress_update',true)='on' THEN RETURN NULL; END IF; RETURN NEW; END $$;
CREATE TRIGGER synthetic_suppress BEFORE UPDATE ON mip_factual.audit_connection FOR EACH ROW EXECUTE FUNCTION mip_factual.synthetic_suppress();
