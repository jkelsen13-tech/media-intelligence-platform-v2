-- ISOLATED SYNTHETIC QUALIFICATION ONLY. Never a managed-provider migration.
-- No credentials, HTTP endpoint, dblink, publication trigger or live authority.
CREATE ROLE mip_synthetic_receiver_owner NOLOGIN;
CREATE ROLE mip_synthetic_receiver_writer NOLOGIN;
CREATE ROLE mip_synthetic_receiver_observer NOLOGIN;
CREATE SCHEMA mip_synthetic_receiver AUTHORIZATION mip_synthetic_receiver_owner;
REVOKE ALL ON SCHEMA mip_synthetic_receiver FROM PUBLIC;
GRANT USAGE ON SCHEMA mip_synthetic_receiver TO mip_synthetic_receiver_writer,mip_synthetic_receiver_observer;
CREATE TABLE mip_synthetic_receiver.events (
 id uuid PRIMARY KEY,
 explanation_id uuid NOT NULL,
 assertion_digest text NOT NULL CHECK(assertion_digest ~ '^[a-f0-9]{64}$'),
 attempted_transition text NOT NULL CHECK(attempted_transition='published'),
 rule text NOT NULL CHECK(rule IN ('provenance','human_review','source_state')),
 receiver_binding text NOT NULL CHECK(receiver_binding=repeat('b',64)),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE mip_synthetic_receiver.events OWNER TO mip_synthetic_receiver_owner;
ALTER TABLE mip_synthetic_receiver.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE mip_synthetic_receiver.events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON mip_synthetic_receiver.events FROM PUBLIC,mip_synthetic_receiver_writer,mip_synthetic_receiver_observer;
CREATE POLICY synthetic_owner_insert ON mip_synthetic_receiver.events FOR INSERT TO mip_synthetic_receiver_owner WITH CHECK(true);
CREATE POLICY synthetic_owner_read ON mip_synthetic_receiver.events FOR SELECT TO mip_synthetic_receiver_owner USING(true);
CREATE POLICY synthetic_observer_read ON mip_synthetic_receiver.events FOR SELECT TO mip_synthetic_receiver_observer USING(true);
GRANT SELECT ON mip_synthetic_receiver.events TO mip_synthetic_receiver_observer;
CREATE FUNCTION mip_synthetic_receiver.append_event(p_id uuid,p_explanation uuid,p_digest text,p_transition text,p_rule text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE stored mip_synthetic_receiver.events%rowtype;
BEGIN
 IF p_id IS NULL OR p_explanation IS NULL OR p_digest IS NULL OR p_digest !~ '^[a-f0-9]{64}$'
  OR p_transition IS DISTINCT FROM 'published' OR p_rule IS NULL OR p_rule NOT IN ('provenance','human_review','source_state')
 THEN RAISE EXCEPTION 'mip_synthetic_event_refused'; END IF;
 INSERT INTO mip_synthetic_receiver.events(id,explanation_id,assertion_digest,attempted_transition,rule,receiver_binding)
 VALUES(p_id,p_explanation,p_digest,p_transition,p_rule,repeat('b',64)) ON CONFLICT(id) DO NOTHING;
 SELECT * INTO STRICT stored FROM mip_synthetic_receiver.events WHERE id=p_id;
 IF stored.explanation_id IS DISTINCT FROM p_explanation OR stored.assertion_digest IS DISTINCT FROM p_digest
  OR stored.attempted_transition IS DISTINCT FROM p_transition OR stored.rule IS DISTINCT FROM p_rule
  OR stored.receiver_binding IS DISTINCT FROM repeat('b',64)
 THEN RAISE EXCEPTION 'mip_synthetic_event_conflict'; END IF;
 -- This return is inside the transaction. It is NOT a commit acknowledgement.
 RETURN jsonb_build_object('id',stored.id,'explanation_id',stored.explanation_id,'assertion_digest',stored.assertion_digest,
  'attempted_transition',stored.attempted_transition,'rule',stored.rule,'receiver_binding',stored.receiver_binding);
END $$;
ALTER FUNCTION mip_synthetic_receiver.append_event(uuid,uuid,text,text,text) OWNER TO mip_synthetic_receiver_owner;
REVOKE ALL ON FUNCTION mip_synthetic_receiver.append_event(uuid,uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mip_synthetic_receiver.append_event(uuid,uuid,text,text,text) TO mip_synthetic_receiver_writer;
CREATE FUNCTION mip_synthetic_receiver.immutable_event() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'mip_synthetic_event_immutable'; END $$;
ALTER FUNCTION mip_synthetic_receiver.immutable_event() OWNER TO mip_synthetic_receiver_owner;
REVOKE ALL ON FUNCTION mip_synthetic_receiver.immutable_event() FROM PUBLIC;
CREATE TRIGGER synthetic_no_change BEFORE UPDATE OR DELETE ON mip_synthetic_receiver.events FOR EACH ROW EXECUTE FUNCTION mip_synthetic_receiver.immutable_event();
CREATE TRIGGER synthetic_no_truncate BEFORE TRUNCATE ON mip_synthetic_receiver.events FOR EACH STATEMENT EXECUTE FUNCTION mip_synthetic_receiver.immutable_event();
