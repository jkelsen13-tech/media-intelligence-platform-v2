"""C2 isolated installation preparation; not a live migration or activation.
Caller owns connection/environment authorization. The guard refuses missing or
changed native owners; it never recreates a missing foundation or grants access.
"""
from pathlib import Path
import hashlib
from psycopg.pq import TransactionStatus

BASE = {"evidence_pipeline.enqueue(text,jsonb)": "adcd2dcb5853c8551446fde0857fb7c43220d146002646f3899fab52a442d7cc",
        "evidence_pipeline.finish_job(uuid,uuid)": "f9b4351aa8b5ca4d9d3094dd710c7ce21842f71e223cb87eddfb1fc74660a28f"}

def install_candidate(connection, candidate_path):
    if not connection.autocommit or connection.info.transaction_status != TransactionStatus.IDLE:
        raise RuntimeError("idle autocommit migration connection required")
    data = Path(candidate_path).read_bytes()
    blob = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
    if blob != "d3bc6643998a6aa482c35fcdcc0ab754950dda5d":
        raise RuntimeError("reviewed candidate identity conflict")
    text = data.decode("utf-8")
    start = text.index("begin;") + len("begin;")
    end = text.rindex("commit;")
    body = text[start:end]
    with connection.transaction():
        connection.execute("set local lock_timeout='5s'; set local statement_timeout='30s'")
        connection.execute("lock table public.articles,evidence_pipeline.import_jobs in share row exclusive mode")
        for signature, expected in BASE.items():
            row = connection.execute(
                "select encode(sha256(convert_to(prosrc,'UTF8')),'hex'),prosecdef,proconfig,"
                "pg_get_userbyid(proowner) from pg_proc where oid=to_regprocedure(%s)", (signature,)
            ).fetchone()
            if row is None or row[0] != expected or row[1] or row[3] != "postgres":
                raise RuntimeError("native foundation definition conflict")
            if row[2] != ['search_path=""']:
                raise RuntimeError("native search_path conflict")
        default = connection.execute("select column_default from information_schema.columns where table_schema='public' and table_name='articles' and column_name='reader_state'").fetchone()
        if default != ("'pending_review'::text",):
            raise RuntimeError("pending publication default required")
        for role in ("anon","authenticated"):
            if connection.execute("select has_function_privilege(%s,'public.mip_pipeline_v1(text,jsonb)','EXECUTE')", (role,)).fetchone()[0]:
                raise RuntimeError("browser pipeline execution must remain denied")
        connection.execute(body)
    return {"state": "installed", "candidate_blob": blob, "activation": False}
