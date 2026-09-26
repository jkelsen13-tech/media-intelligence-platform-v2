"""Source-shaped adapter from the existing publisher worker to native MIP V1.

The caller supplies a HydratedArticle from verifier/ingestion_pipeline.py and
an RPC callable bound to the private service role. Discovery, hydration, scope
gates and source authorization remain the caller's responsibility. The adapter
never promotes reader eligibility or a graph/temporal relationship.
"""
from __future__ import annotations

from contextlib import AbstractContextManager
from typing import Any, Callable

Rpc = Callable[[str, dict[str, Any]], Any]


def source_payload(hydrated: Any) -> dict[str, str | None]:
    """Only fields accepted by evidence_pipeline.enqueue; no derived judgments."""
    source = hydrated.candidate
    return {
        "url": source.url,
        "title": source.title,
        "outlet": source.outlet,
        "summary": source.summary,
        "body_text": hydrated.body_text,
        "published_at": source.published_at,
        "source_key": source.source_key,
        "source_feed": source.feed,
        "source_label": source.source_label,
    }


def enqueue_source(rpc: Rpc, run_id: str, hydrated: Any) -> Any:
    """Idempotent native job identity for one retained source version."""
    if not hydrated.candidate.source_key or not hydrated.candidate.feed:
        raise ValueError("source registry key and feed required")
    return rpc("enqueue", {"run_id": run_id, "article": source_payload(hydrated)})


def process_claim(
    rpc: Rpc,
    lease: dict[str, Any],
    pipeline: Any,
    atomic: Callable[[], AbstractContextManager[Any]],
) -> dict[str, Any]:
    """Finish a native lease and append literal candidates in ONE transaction.

    Claims are recomputed from the leased job's retained payload. This makes a
    claim safe to process by any worker after a restart, without a caller-local
    output sidecar. The supplied transaction must encompass finish and every
    candidate RPC; on failure the native lease remains for bounded recovery.
    A second finish with a stale token is refused by the native function.
    """
    if not isinstance(lease, dict) or not isinstance(lease.get("payload"), dict):
        raise ValueError("native leased job and retained payload required")
    payload = lease["payload"]
    if not all(payload.get(key) for key in ("url", "title", "outlet")):
        raise ValueError("native source identity incomplete")
    body = payload.get("body_text")
    output = None
    if body is not None:
        source = pipeline.ArticleCandidate(
            payload.get("source_key") or "legacy-unknown",
            payload.get("source_feed") or "pipeline-v1",
            payload.get("source_label") or "Native retained capture",
            payload["url"], payload["title"], payload["outlet"],
            payload.get("published_at"), payload.get("summary"),
        )
        hydrated = pipeline.HydratedArticle(source, body, None, None, "native-retained")
        output, warnings = pipeline.deterministic_literal_extraction(hydrated)
        if output is None or warnings or pipeline.validate_extraction(body, output):
            raise ValueError("literal extraction failed validation")
    with atomic():
        finished = rpc("finish", {
            "job_id": str(lease["id"]),
            "lease_token": str(lease["lease_token"]),
        })
        candidate_ids = []
        for index, claim in enumerate((output or {}).get("claims", [])):
            start, end = claim["start"], claim["end"]
            if body[start:end] != claim["text"]:
                raise ValueError("candidate is not an exact retained source span")
            candidate_ids.append(rpc("candidate", {
                "capture_id": str(finished["capture_id"]),
                "candidate_key": f"literal-{index}",
                "candidate_kind": "claim",
                "statement": claim["text"],
                "source_field": "body_text",
                "span_start": start,
                "span_end": end,
                "excerpt": claim["text"],
                "extractor_version": pipeline.ALGORITHM_VERSION,
                "remaining_uncertainty":
                    "Literal publisher text only; no truth, identity or semantic assessment.",
            }))
    return {"job": finished, "candidate_ids": candidate_ids}
