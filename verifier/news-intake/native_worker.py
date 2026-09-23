"""Bounded, imported psycopg worker for the native MIP intake boundary.

The caller supplies an already-authorized service_role connection and the
existing deterministic-literal pipeline module. This module opens no connection,
reads no credentials, discovers no sources, starts no scheduler and logs no
publisher payload. Source discovery, retention rights and scope authorization
remain with the caller before enqueue_source() is invoked.
"""
from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Any

import psycopg
from psycopg.pq import TransactionStatus
from psycopg.types.json import Jsonb


def _load_adapter() -> Any:
    path = Path(__file__).with_name("native_adapter.py")
    spec = importlib.util.spec_from_file_location("mip_native_adapter_worker", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("native adapter unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class NativeIntakeError(RuntimeError):
    """Safe operator-facing error; source payload and database details are omitted."""


class NativeIntakeWorker:
    """Bind existing native RPC and literal adapter to one transaction-capable connection."""

    _ACTIONS = frozenset({"enqueue", "claim", "finish", "candidate", "fail"})

    def __init__(self, connection: psycopg.Connection, literal_pipeline: Any) -> None:
        required = ("ArticleCandidate", "HydratedArticle", "deterministic_literal_extraction",
                    "validate_extraction", "ALGORITHM_VERSION")
        if any(not hasattr(literal_pipeline, name) for name in required):
            raise ValueError("deterministic literal pipeline required")
        self.connection = connection
        self.pipeline = literal_pipeline
        self.adapter = _load_adapter()
        self._assert_ready()

    def _assert_ready(self) -> None:
        if not callable(getattr(self.connection, "transaction", None)):
            raise RuntimeError("transaction-capable psycopg connection required")
        if self.connection.closed or self.connection.autocommit is not True:
            raise RuntimeError("open autocommit service_role connection required")
        if self.connection.info.transaction_status != TransactionStatus.IDLE:
            raise RuntimeError("connection must be outside an existing transaction")
        try:
            role = self.connection.execute("select current_user").fetchone()[0]
        except psycopg.Error:
            raise NativeIntakeError("connection_unavailable") from None
        if role != "service_role":
            raise RuntimeError("current_user must be service_role")

    def _rpc(self, action: str, payload: dict[str, Any] | None = None) -> Any:
        if action not in self._ACTIONS:
            raise ValueError("unsupported native action")
        if self.connection.execute("select current_user").fetchone()[0] != "service_role":
            raise RuntimeError("current_user must be service_role")
        return self.connection.execute(
            "select public.mip_pipeline_v1(%s,%s)",
            (action, Jsonb(payload or {})),
        ).fetchone()[0]

    def enqueue_source(self, run_id: str, hydrated_article: Any) -> Any:
        """Queue one caller-authorized retained source version; no acquisition occurs."""
        self._assert_ready()
        try:
            return self.adapter.enqueue_source(self._rpc, run_id, hydrated_article)
        except psycopg.Error:
            raise NativeIntakeError("native_enqueue_rejected") from None

    def _fail_claim(self, lease: dict[str, Any], code: str, retryable: bool) -> dict[str, Any]:
        """Native fail is token-bound. An unusable lease recovers only by expiry."""
        if self.connection.closed or self.connection.info.transaction_status != TransactionStatus.IDLE:
            return {"state": "lease_recovery_pending", "code": code}
        try:
            state = self._rpc("fail", {
                "job_id": str(lease["id"]),
                "lease_token": str(lease["lease_token"]),
                "code": code,
                "retryable": retryable,
            })
        except (psycopg.Error, KeyError, TypeError, RuntimeError):
            return {"state": "lease_recovery_pending", "code": code}
        return {"state": state, "code": code}

    def run_one(self) -> dict[str, Any]:
        """Process at most one leased native job, with bounded native retry state."""
        self._assert_ready()
        try:
            lease = self._rpc("claim")
        except psycopg.Error:
            return {"state": "claim_unavailable", "code": "native_database_error"}
        if lease is None:
            return {"state": "idle"}
        # The adapter recomputes from the job payload and atomically commits
        # finish plus every exact-span candidate on this SAME connection.
        try:
            result = self.adapter.process_claim(
                self._rpc, lease, self.pipeline, self.connection.transaction,
            )
        except (ValueError, AssertionError):
            return self._fail_claim(lease, "literal_validation_failed", False)
        except psycopg.Error:
            return self._fail_claim(lease, "native_database_error", True)
        except Exception:
            # No raw exception text or publisher material leaves this boundary.
            return self._fail_claim(lease, "worker_exception", True)
        finished = result["job"]
        return {
            "state": "completed",
            "job_id": finished["job_id"],
            "article_id": finished["article_id"],
            "capture_id": finished["capture_id"],
            "outcome": finished["outcome"],
            "candidate_count": len(result["candidate_ids"]),
        }

    def run(self, max_jobs: int = 1) -> list[dict[str, Any]]:
        """Claim no more than 1..10 jobs; the database enforces <=5 attempts each."""
        if isinstance(max_jobs, bool) or not isinstance(max_jobs, int) or not 1 <= max_jobs <= 10:
            raise ValueError("max_jobs must be an integer from 1 to 10")
        results = []
        for _ in range(max_jobs):
            item = self.run_one()
            if item["state"] == "idle":
                break
            results.append(item)
            if item["state"] in {"lease_recovery_pending", "claim_unavailable"}:
                break
        return results
