"""Private jfn spatial archive verification and isolated native restoration.

Only injected psycopg connections are used. No source discovery/export, DSN,
credential, environment lookup, schema creation, live spatial update or
publication decision is performed. An operator must separately authorize
access to the retained private archive and build an isolated native target.
"""
from __future__ import annotations

from collections import defaultdict
import hashlib
import heapq
import json
import re
from typing import Any

import psycopg
from psycopg import sql
from psycopg.pq import TransactionStatus

SOURCE_PROJECT = "jfnzyvzthzqtczlxhjll"
RESTORE_DATABASE = "mip_jfn_restore"
SPATIAL = (
    "spatial.assertion_revisions", "spatial.assertions", "spatial.audience_scopes",
    "spatial.break_glass_audit", "spatial.evidence_artifact_registry",
    "spatial.evidence_condition_events", "spatial.evidence_snapshots",
    "spatial.geometry_snapshots", "spatial.graph_node_authority_snapshots",
    "spatial.place_authority_snapshots", "spatial.policy_artifacts",
    "spatial.release_decisions", "spatial.review_decisions",
    "spatial.revision_evidence", "spatial.revision_lineage",
)
PARENTS = (
    "public.articles", "public.geographic_places", "public.nodes",
    "public.policy_documents", "public.source_change_events", "public.sources",
)
RELATIONS = frozenset(SPATIAL + PARENTS)
ROLES = ("anon", "authenticated", "service_role", "spatial_writer_runtime", "spatial_owner")
# Ancestors outside this 21-relation archive cannot be reconstructed here.
EXTERNAL_ANCESTOR_FIELDS = {
    "public.articles": ("outlet_id", "author_id", "arc_id"),
    "public.nodes": ("arc_id",),
    "public.policy_documents": ("policy_id",),
    "public.sources": ("arc_membership_candidate_id",),
}

# Exact 28 declared internal references from spatial_history_inventory.sql.
INTERNAL_LINKS = (
    ("spatial.assertion_revisions", "graph_node_authority_snapshot_id", "spatial.graph_node_authority_snapshots"),
    ("spatial.assertion_revisions", "internal_geometry_snapshot_id", "spatial.geometry_snapshots"),
    ("spatial.assertion_revisions", "place_authority_snapshot_id", "spatial.place_authority_snapshots"),
    ("spatial.assertion_revisions", "spatial_assertion_id", "spatial.assertions"),
    ("spatial.assertion_revisions", "temporal_policy_artifact_id", "spatial.policy_artifacts"),
    ("spatial.assertions", "scope_policy_artifact_id", "spatial.policy_artifacts"),
    ("spatial.audience_scopes", "supersedes_audience_scope_id", "spatial.audience_scopes"),
    ("spatial.break_glass_audit", "related_intent_id", "spatial.break_glass_audit"),
    ("spatial.evidence_artifact_registry", "source_node_authority_snapshot_id", "spatial.graph_node_authority_snapshots"),
    ("spatial.evidence_artifact_registry", "validation_policy_artifact_id", "spatial.policy_artifacts"),
    ("spatial.evidence_condition_events", "condition_policy_artifact_id", "spatial.policy_artifacts"),
    ("spatial.evidence_condition_events", "evidence_snapshot_id", "spatial.evidence_snapshots"),
    ("spatial.evidence_snapshots", "capture_policy_artifact_id", "spatial.policy_artifacts"),
    ("spatial.evidence_snapshots", "evidence_artifact_registry_id", "spatial.evidence_artifact_registry"),
    ("spatial.evidence_snapshots", "retention_policy_artifact_id", "spatial.policy_artifacts"),
    ("spatial.geometry_snapshots", "compatibility_policy_artifact_id", "spatial.policy_artifacts"),
    ("spatial.geometry_snapshots", "place_authority_snapshot_id", "spatial.place_authority_snapshots"),
    ("spatial.policy_artifacts", "supersedes_policy_artifact_id", "spatial.policy_artifacts"),
    ("spatial.release_decisions", "assertion_revision_id", "spatial.assertion_revisions"),
    ("spatial.release_decisions", "audience_scope_id", "spatial.audience_scopes"),
    ("spatial.release_decisions", "predecessor_release_decision_id", "spatial.release_decisions"),
    ("spatial.release_decisions", "release_policy_artifact_id", "spatial.policy_artifacts"),
    ("spatial.review_decisions", "assertion_revision_id", "spatial.assertion_revisions"),
    ("spatial.review_decisions", "review_policy_artifact_id", "spatial.policy_artifacts"),
    ("spatial.revision_evidence", "assertion_revision_id", "spatial.assertion_revisions"),
    ("spatial.revision_evidence", "evidence_snapshot_id", "spatial.evidence_snapshots"),
    ("spatial.revision_lineage", "from_revision_id", "spatial.assertion_revisions"),
    ("spatial.revision_lineage", "to_revision_id", "spatial.assertion_revisions"),
)
# Eight typed external references from spatial_parent_retention; the source
# record ancestor is handled separately by its artifact_type_code discriminator.
PARENT_LINKS = (
    ("spatial.assertion_revisions", "canonical_place_id", "public.geographic_places"),
    ("spatial.assertions", "graph_node_id", "public.nodes"),
    ("spatial.evidence_artifact_registry", "article_id", "public.articles"),
    ("spatial.evidence_artifact_registry", "policy_document_id", "public.policy_documents"),
    ("spatial.evidence_condition_events", "source_change_event_id", "public.source_change_events"),
    ("spatial.geometry_snapshots", "canonical_place_id", "public.geographic_places"),
    ("spatial.graph_node_authority_snapshots", "graph_node_id", "public.nodes"),
    ("spatial.place_authority_snapshots", "canonical_place_id", "public.geographic_places"),
)
ALL_LINKS = INTERNAL_LINKS + PARENT_LINKS + (
    ("public.sources", "node_id", "public.nodes"),
)


class PreservationError(RuntimeError):
    """Fail-closed condition; raw retained payload and SQL errors are omitted."""


def _ready(conn: psycopg.Connection) -> None:
    if conn.closed or conn.autocommit is not True or conn.info.transaction_status != TransactionStatus.IDLE:
        raise PreservationError("idle autocommit psycopg connection required")


def _manifest(manifest: dict[str, dict[str, Any]]) -> None:
    if not isinstance(manifest, dict) or set(manifest) != RELATIONS:
        raise PreservationError("exact 21-relation manifest required")
    for value in manifest.values():
        if not isinstance(value, dict) or set(value) != {"count", "sha256"}:
            raise PreservationError("manifest count and sha256 required")
        if isinstance(value["count"], bool) or not isinstance(value["count"], int) or value["count"] < 0:
            raise PreservationError("invalid manifest count")
        if not isinstance(value["sha256"], str) or not re.fullmatch("[0-9a-f]{64}", value["sha256"]):
            raise PreservationError("invalid manifest sha256")
    if sum(value["count"] for value in manifest.values()) > 250:
        raise PreservationError("bounded archive only")


def _archive_snapshot(conn: psycopg.Connection, manifest: dict[str, dict[str, Any]]):
    _ready(conn)
    _manifest(manifest)
    with conn.transaction():
        conn.execute("set transaction isolation level repeatable read read only")
        actual_relations = {row[0] for row in conn.execute(
            "select distinct source_relation from mip_private.spatial_row_versions where source_project=%s",
            (SOURCE_PROJECT,)).fetchall()}
        if actual_relations != {relation for relation, item in manifest.items() if item["count"]}:
            raise PreservationError("archive relation set mismatch")
        rows: dict[tuple[str, str], str] = {}
        summary = {}
        for relation in sorted(RELATIONS):
            count, identities, digest, bad_hash = conn.execute("""
                select count(*)::int, count(distinct source_key)::int,
                  encode(sha256(convert_to(coalesce(
                    string_agg(payload::text,E'\\n' order by payload::text),''),'UTF8')),'hex'),
                  count(*) filter (where jsonb_typeof(payload) is distinct from 'object'
                    or jsonb_typeof(payload->'id') is distinct from 'string'
                    or nullif(payload->>'id','') is null
                    or payload_hash is distinct from encode(sha256(convert_to(payload::text,'UTF8')),'hex')
                    or source_key is distinct from payload->>'id')::int
                from mip_private.spatial_row_versions
                where source_project=%s and source_relation=%s
            """, (SOURCE_PROJECT, relation)).fetchone()
            expected = manifest[relation]
            if count != expected["count"] or digest != expected["sha256"] or identities != count or bad_hash:
                raise PreservationError("archive count, digest, version or row hash mismatch")
            summary[relation] = {"count": count, "sha256": digest}
            for key, raw in conn.execute("""
                select source_key,payload::text
                from mip_private.spatial_row_versions
                where source_project=%s and source_relation=%s
                order by source_key
            """, (SOURCE_PROJECT, relation)).fetchall():
                rows[(relation, key)] = raw
        edges: dict[tuple[str, str], set[tuple[str, str]]] = defaultdict(set)
        indegree = {node: 0 for node in rows}
        referenced = set()
        for child_relation, field, parent_relation in ALL_LINKS:
            for child_key, parent_key in conn.execute("""
                select source_key,payload->>%s
                from mip_private.spatial_row_versions
                where source_project=%s and source_relation=%s and payload->>%s is not null
            """, (field, SOURCE_PROJECT, child_relation, field)).fetchall():
                child, parent = (child_relation, child_key), (parent_relation, parent_key)
                if parent not in rows:
                    raise PreservationError("archive dependency missing")
                referenced.add(parent)
                if child not in edges[parent]:
                    edges[parent].add(child)
                    indegree[child] += 1
        # Refuse dependencies whose native ancestor is outside this archive,
        # even when a reduced synthetic target omits the original FK.
        for relation, fields in EXTERNAL_ANCESTOR_FIELDS.items():
            for field in fields:
                if conn.execute("""
                    select 1 from mip_private.spatial_row_versions
                    where source_project=%s and source_relation=%s
                      and payload->>%s is not null limit 1
                """, (SOURCE_PROJECT, relation, field)).fetchone():
                    raise PreservationError("external ancestor outside archive")
        # Typed source ancestry is a three-way identity, not an untyped ID.
        source_nodes = dict(conn.execute("""
            select source_key,payload->>'node_id'
            from mip_private.spatial_row_versions
            where source_project=%s and source_relation='public.sources'
        """, (SOURCE_PROJECT,)).fetchall())
        authority_nodes = dict(conn.execute("""
            select source_key,payload->>'graph_node_id'
            from mip_private.spatial_row_versions
            where source_project=%s and source_relation='spatial.graph_node_authority_snapshots'
        """, (SOURCE_PROJECT,)).fetchall())
        for child_key, source_key, node_key, snapshot_key in conn.execute("""
            select source_key,payload->>'source_record_id',payload->>'source_node_id',
                   payload->>'source_node_authority_snapshot_id'
            from mip_private.spatial_row_versions
            where source_project=%s and source_relation='spatial.evidence_artifact_registry'
              and payload->>'artifact_type_code'='source_record'
        """, (SOURCE_PROJECT,)).fetchall():
            if not source_key or not node_key or not snapshot_key:
                raise PreservationError("typed source ancestor missing")
            if source_nodes.get(source_key) != node_key or authority_nodes.get(snapshot_key) != node_key:
                raise PreservationError("typed source identity mismatch")
            child = ("spatial.evidence_artifact_registry", child_key)
            for parent in (("public.sources", source_key), ("public.nodes", node_key),
                           ("spatial.graph_node_authority_snapshots", snapshot_key)):
                if parent not in rows:
                    raise PreservationError("typed source ancestor missing")
                referenced.add(parent)
                if child not in edges[parent]:
                    edges[parent].add(child)
                    indegree[child] += 1
        if any(parent not in referenced for parent in rows if parent[0] in PARENTS):
            raise PreservationError("unreferenced public parent snapshot")
        heap = [((0 if node[0] in PARENTS else 1), node) for node, n in indegree.items() if n == 0]
        heapq.heapify(heap)
        ordered = []
        while heap:
            _, node = heapq.heappop(heap)
            ordered.append(node)
            for child in sorted(edges[node]):
                indegree[child] -= 1
                if indegree[child] == 0:
                    heapq.heappush(heap, ((0 if child[0] in PARENTS else 1), child))
        if len(ordered) != len(rows):
            raise PreservationError("archive dependency cycle")
        return summary, [(node[0], node[1], rows[node]) for node in ordered], sum(map(len, edges.values()))


def verify_archive(conn: psycopg.Connection, manifest: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """Verify one exact source-qualified archival observation; return no payload."""
    try:
        summary, ordered, links = _archive_snapshot(conn, manifest)
    except psycopg.Error:
        raise PreservationError("archive verification unavailable") from None
    return {"source_project": SOURCE_PROJECT, "relations": summary,
            "rows": len(ordered), "dependency_links": links}


def _target_guard(conn: psycopg.Connection, isolation_token: str) -> None:
    _ready(conn)
    if isolation_token != "synthetic-isolated-restore":
        raise PreservationError("explicit isolated restore token required")
    database, socket_only = conn.execute(
        "select current_database(),inet_server_addr() is null").fetchone()
    if database != RESTORE_DATABASE or socket_only is not True:
        raise PreservationError("live or networked target refused")


def _table(relation: str):
    schema, name = relation.split(".")
    return sql.Identifier(schema, name)


def _target_digest(conn: psycopg.Connection, relation: str):
    table = _table(relation)
    query = sql.SQL("""
        select count(*)::int,
          encode(sha256(convert_to(coalesce(
            string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text),''),'UTF8')),'hex')
        from {} t
    """).format(table)
    return conn.execute(query).fetchone()


def _target_state(conn: psycopg.Connection, manifest: dict[str, dict[str, Any]]) -> str:
    counts = []
    exact = []
    for relation in sorted(RELATIONS):
        count, digest = _target_digest(conn, relation)
        counts.append(count)
        exact.append(count == manifest[relation]["count"] and digest == manifest[relation]["sha256"])
    if all(exact):
        return "identical"
    if not any(counts):
        return "empty"
    raise PreservationError("partial or divergent isolated target refused")


def _insert_raw(conn: psycopg.Connection, relation: str, raw_jsonb_text: str) -> None:
    # PostgreSQL parses its own archived JSONB text; Python never loads/dumps
    # payloads, so large integers and decimal geometry are not rounded.
    columns = {row[0] for row in conn.execute("""
        select a.attname from pg_attribute a
        where a.attrelid=%s::regclass and a.attnum>0 and not a.attisdropped
    """, (relation,)).fetchall()}
    fields = {row[0] for row in conn.execute(
        "select jsonb_object_keys(%s::jsonb)", (raw_jsonb_text,)).fetchall()}
    if not fields or not fields <= columns:
        raise PreservationError("isolated target lacks exact payload fields")
    table = _table(relation)
    names = sql.SQL(",").join(map(sql.Identifier, sorted(fields)))
    statement = sql.SQL(
        "insert into {} ({}) select {} from jsonb_populate_record(null::{},%s::jsonb)"
    ).format(table, names, names, table)
    conn.execute(statement, (raw_jsonb_text,))


def catalog_signature(conn: psycopg.Connection, *, _inside_transaction: bool = False) -> str:
    """Fingerprint native shape, spatial code, and effective authority."""
    if _inside_transaction:
        if (conn.closed or conn.autocommit is not True
                or conn.info.transaction_status != TransactionStatus.INTRANS):
            raise PreservationError("active isolated transaction required")
    else:
        _ready(conn)
    records: list[Any] = []
    role_records = conn.execute("""
        select rolname,rolcanlogin,rolbypassrls,rolsuper,rolinherit
        from pg_roles where rolname=any(%s) order by rolname
    """, (list(ROLES),)).fetchall()
    existing_roles = {row[0] for row in role_records}
    memberships = conn.execute("""
        select member.rolname,parent.rolname,m.admin_option,m.inherit_option,m.set_option
        from pg_auth_members m
        join pg_roles member on member.oid=m.member
        join pg_roles parent on parent.oid=m.roleid
        where member.rolname=any(%s) or parent.rolname=any(%s)
        order by member.rolname,parent.rolname
    """, (list(ROLES), list(ROLES))).fetchall()
    records.append(("roles", role_records, memberships))
    # Native extension identity is part of the restore authority and type shape.
    extensions = conn.execute("""
        select extname,extversion,extnamespace::regnamespace::text
        from pg_extension where extname in ('pgcrypto','vector') order by extname
    """).fetchall()
    if [row for row in extensions if row[0] == "vector"] != [("vector", "0.8.2", "public")]:
        raise PreservationError("isolated native extension mismatch")
    records.append(("extensions", extensions))
    table_privileges = ("SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER")
    column_privileges = ("SELECT", "INSERT", "UPDATE", "REFERENCES")
    for relation in sorted(RELATIONS):
        schema, table = relation.split(".")
        metadata = conn.execute("""
            select c.relkind,c.relrowsecurity,c.relforcerowsecurity,
                   pg_get_userbyid(c.relowner),c.relacl::text
            from pg_class c where c.oid=%s::regclass
        """, (relation,)).fetchone()
        columns = conn.execute("""
            select a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,
              a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid),a.attacl::text
            from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
            where a.attrelid=%s::regclass and a.attnum>0 and not a.attisdropped order by a.attnum
        """, (relation,)).fetchall()
        constraints = conn.execute("""
            select conname,pg_get_constraintdef(oid,true),condeferrable,condeferred,convalidated
            from pg_constraint where conrelid=%s::regclass order by conname
        """, (relation,)).fetchall()
        indexes = conn.execute("""
            select ci.relname,pg_get_indexdef(i.indexrelid),i.indisvalid
            from pg_index i join pg_class ci on ci.oid=i.indexrelid
            where i.indrelid=%s::regclass order by ci.relname
        """, (relation,)).fetchall()
        triggers = conn.execute("""
            select tgname,pg_get_triggerdef(oid,true),tgenabled
            from pg_trigger where tgrelid=%s::regclass and not tgisinternal order by tgname
        """, (relation,)).fetchall()
        policies = conn.execute("""
            select policyname,permissive,roles,cmd,qual,with_check
            from pg_policies where schemaname=%s and tablename=%s order by policyname
        """, (schema, table)).fetchall()
        authority = []
        for role in ROLES:
            if role not in existing_roles:
                authority.append((role, None, None))
                continue
            table_grants = tuple(bool(conn.execute(
                "select has_table_privilege(%s,%s,%s)", (role, relation, privilege)
            ).fetchone()[0]) for privilege in table_privileges)
            column_grants = []
            for column in columns:
                column_grants.append((column[0], tuple(bool(conn.execute(
                    "select has_column_privilege(%s,%s,%s,%s)",
                    (role, relation, column[0], privilege)
                ).fetchone()[0]) for privilege in column_privileges)))
            authority.append((role, table_grants, column_grants))
        records.append((relation, metadata, columns, constraints, indexes, triggers, policies, authority))
    functions = conn.execute("""
        select p.oid::regprocedure::text,pg_get_functiondef(p.oid),p.prosecdef,p.proconfig,
          pg_get_userbyid(p.proowner),p.proacl::text
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='spatial' order by p.oid::regprocedure::text
    """).fetchall()
    function_authority = []
    for signature, *_ in functions:
        grants = [(role, None if role not in existing_roles else bool(conn.execute(
            "select has_function_privilege(%s,%s,'EXECUTE')",
            (role, signature)).fetchone()[0])) for role in ROLES]
        function_authority.append((signature, grants))
    schema_authority = []
    for schema in ("spatial", "public", "extensions"):
        metadata = conn.execute("""
            select pg_get_userbyid(nspowner),nspacl::text
            from pg_namespace where nspname=%s
        """, (schema,)).fetchone()
        grants = []
        for role in ROLES:
            if metadata is None or role not in existing_roles:
                grants.append((role, None))
            else:
                grants.append((role, tuple(bool(conn.execute(
                    "select has_schema_privilege(%s,%s,%s)",
                    (role, schema, privilege)).fetchone()[0])
                    for privilege in ("USAGE", "CREATE"))))
        schema_authority.append((schema, metadata, grants))
    records.append(("spatial_functions", functions, function_authority))
    records.append(("schema_authority", schema_authority))
    return hashlib.sha256(json.dumps(records, sort_keys=True, default=str,
                                     separators=(",", ":")).encode("utf-8")).hexdigest()

def _reject_native_external_ancestors(
    conn: psycopg.Connection, ordered: list[tuple[str, str, str]]
) -> None:
    """Reject non-null FK columns whose referenced relation is not retained."""
    outside: dict[str, set[str]] = defaultdict(set)
    for relation in sorted(RELATIONS):
        for target_relation, field in conn.execute("""
            select refns.nspname||'.'||ref.relname,att.attname
            from pg_constraint co
            join pg_class ref on ref.oid=co.confrelid
            join pg_namespace refns on refns.oid=ref.relnamespace
            join lateral unnest(co.conkey) with ordinality key(attnum,ord) on true
            join pg_attribute att on att.attrelid=co.conrelid and att.attnum=key.attnum
            where co.conrelid=%s::regclass and co.contype='f'
        """, (relation,)).fetchall():
            if target_relation not in RELATIONS:
                outside[relation].add(field)
        outside[relation].update(EXTERNAL_ANCESTOR_FIELDS.get(relation, ()))
    for relation, _, raw in ordered:
        for field in outside[relation]:
            if conn.execute("select %s::jsonb->>%s", (raw, field)).fetchone()[0] is not None:
                raise PreservationError("external ancestor outside archive")


def restore_isolated(
    archive_conn: psycopg.Connection,
    target_conn: psycopg.Connection,
    manifest: dict[str, dict[str, Any]],
    expected_catalog_sha256: str,
    *,
    isolation_token: str,
) -> dict[str, Any]:
    """Restore exact archived rows into an empty or already-identical isolated DB.

    The native shape and data checks occur under 21 relation locks in the
    same transaction as all inserts. This is not a general live restore API.
    """
    if not isinstance(expected_catalog_sha256, str) or not re.fullmatch("[0-9a-f]{64}", expected_catalog_sha256):
        raise PreservationError("catalog signature required")
    if archive_conn is target_conn:
        raise PreservationError("archive and target connections must differ")
    try:
        _target_guard(target_conn, isolation_token)
        summary, ordered, links = _archive_snapshot(archive_conn, manifest)
        state = None
        with target_conn.transaction():
            target_conn.execute("set local statement_timeout='20s'")
            target_conn.execute("set local lock_timeout='3s'")
            target_conn.execute(sql.SQL("lock table {} in share row exclusive mode").format(
                sql.SQL(",").join(_table(relation) for relation in sorted(RELATIONS))))
            if catalog_signature(target_conn, _inside_transaction=True) != expected_catalog_sha256:
                raise PreservationError("isolated native catalog mismatch")
            _reject_native_external_ancestors(target_conn, ordered)
            state = _target_state(target_conn, manifest)
            if state == "empty":
                for relation, _, raw in ordered:
                    _insert_raw(target_conn, relation, raw)
                if _target_state(target_conn, manifest) != "identical":
                    raise PreservationError("isolated restore digest mismatch")
            if catalog_signature(target_conn, _inside_transaction=True) != expected_catalog_sha256:
                raise PreservationError("isolated native catalog changed")
    except psycopg.Error:
        raise PreservationError("isolated restore failed") from None
    return {"state": "verified_noop" if state == "identical" else "restored",
            "rows": len(ordered), "dependency_links": links,
            "source_project": SOURCE_PROJECT, "relations": summary}
