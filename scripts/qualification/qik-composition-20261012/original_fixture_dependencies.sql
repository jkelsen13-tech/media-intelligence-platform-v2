-- Disposable dependency models for executing the ENTIRE byte-pinned original009.
-- These model only columns/fences needed by009, not compiler/install/live catalog.
CREATE ROLE anon NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE authenticated NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE service_role NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE mip_cutover_schema_owner_v1 NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE ROLE mip_publication_owner_v2 NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE SCHEMA comparison_qualification;
CREATE SCHEMA mip_identity;
CREATE SCHEMA mip_cutover_authority;
CREATE TABLE mip_identity.collector_fence(id boolean PRIMARY KEY CHECK(id));
CREATE TABLE mip_cutover_authority.publication_fence(id boolean PRIMARY KEY CHECK(id));
INSERT INTO mip_identity.collector_fence VALUES(true);
INSERT INTO mip_cutover_authority.publication_fence VALUES(true);
CREATE TABLE public.articles(id uuid PRIMARY KEY,source_status text,reader_state text);
CREATE TABLE public.explanations(
 id uuid PRIMARY KEY,assertion_id text NOT NULL,version integer NOT NULL DEFAULT 1,
 is_current boolean NOT NULL DEFAULT true,state text NOT NULL DEFAULT 'ok',
 review_status text NOT NULL DEFAULT 'awaiting_review',supporting_passage text,
 falsification_condition text,archived_sources jsonb,source_ids uuid[],rule_version text
);
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.articles FORCE ROW LEVEL SECURITY;
-- Literal original dependency definition recovered from capability.sql.
create function comparison_qualification.argument_digest(p_args jsonb)
returns text language sql immutable as $$
  select encode(sha256(convert_to(coalesce(p_args,'{}'::jsonb)::text,'UTF8')),'hex');
$$;
CREATE FUNCTION comparison_qualification.reject_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'synthetic_dependency_immutable'; END $$;
-- Required rename target; release compiler/projection lane deliberately not exercised.
CREATE FUNCTION mip_identity.validate_review(uuid) RETURNS jsonb LANGUAGE sql AS $$
 SELECT '{"projection":{"explanations":[]}}'::jsonb;
$$;
REVOKE ALL ON SCHEMA comparison_qualification,mip_identity,mip_cutover_authority FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA comparison_qualification,mip_identity FROM PUBLIC;
