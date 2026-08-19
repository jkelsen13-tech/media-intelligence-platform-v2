#!/usr/bin/env python3
"""Provenance-first MIP v2 news ingestion pipeline.

This worker is deliberately conservative. It discovers public publisher records,
hydrates only robot-permitted public HTML, produces bounded structured extraction
candidates, and writes no graph, edge, event, arc, timeline, or geography record.
Cross-surface proposals are retained as review-pending evidence-span candidates.

Operational safeguards
-----------------------
* Hard manifest ceiling: 10 articles. The CLI rejects a larger batch size.
* Doc 07 / Louisiana v. Callais exclusion: exact matches are skipped and logged;
  borderline Callais-adjacent material creates a scope hold and stops the run.
* Every skipped item is recorded in a per-run working notebook and JSONL ledger.
* Existing articles are never updated by discovery. This protects legacy records,
  including the historic RAW/INERT canary even if old run metadata is absent.
* Direct writes require the isolated-v2 public client key plus a separately
  provisioned local RPC run key. The database function cannot update historic
  articles or promote graph/timeline/arc/geography rows. Without both keys,
  spool mode creates immutable per-manifest action files and performs no writes.

Environment for --write-mode direct (never commit values):
  MIP_V2_SUPABASE_URL=https://yhbwnrtlqbjtcrrlpbge.supabase.co
  MIP_V2_SUPABASE_ANON_KEY=<isolated v2 public client key>
  MIP_V2_INGESTION_WRITER_KEY=<locally provisioned RPC run key>

The direct writer uses a narrowly scoped authenticated RPC rather than a
service-role key. The RPC accepts only new URLs, candidate extraction rows,
and review-pending cross-surface candidates.

The sandbox's OPENAI_API_KEY and OPENAI_API_BASE are used only for structured
extraction; no model output is executed as instructions.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import dataclasses
import hashlib
import html
import json
import os
import re
import sys
import time
import uuid
import xml.etree.ElementTree as ET
from collections import Counter, deque
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
RUN_ROOT = ROOT / "verifier" / "ingestion_runs"
EXCLUSION_CONFIG = ROOT / "verifier" / "doc07_canary_exclusions.json"
REDISTRICTING_EXCLUSION_CONFIG = ROOT / "verifier" / "redistricting_adjacent_exclusions.json"
ISOLATED_PROJECT_REF = "yhbwnrtlqbjtcrrlpbge"
ALGORITHM_VERSION = "provenance-first-v2.3-deterministic-literal"
# The live model proxy repeatedly produced timeout-heavy publisher batches. This
# source-bounded path uses no generated content: claims, framing markers, and
# citations are literal publisher substrings accepted only after deterministic
# span validation. It is therefore safe to run at backfill scale.
EXTRACTION_MODEL = "deterministic-literal-v1"
MAX_MANIFEST_SIZE = 10
# Hydration is network-bound and remains confined to the current <=10 manifest.
HYDRATION_MAX_WORKERS = MAX_MANIFEST_SIZE
BIGQUERY_PROJECT_ID = "mip-v2-gdelt-bigquery-sandbox"
BIGQUERY_DATASET = "gdelt-bq.gdeltv2.gkg_partitioned"
# Every discovery query is limited independently of the global sandbox allowance.
# The full 365-day dry-run measured 82.4 GB; a 1 GiB daily-query cap prevents an
# accidental unpartitioned or expanded query from consuming the free-tier quota.
BIGQUERY_MAX_BYTES_PER_QUERY = 1 * 1024 * 1024 * 1024
FAILURE_WINDOW_SIZE = 100
FAILURE_RATE_CIRCUIT_BREAKER = 0.30
# The proxy timed out when several full-schema publisher requests arrived at
# once. Process one article at a time inside the already fixed ten-item manifest;
# retries remain per article and every exhausted request is logged.
EXTRACTION_MAX_WORKERS = 1
EXTRACTION_MAX_ATTEMPTS = 2
# This is passed directly to requests, which guarantees a bounded connection and
# read wait rather than relying on an SDK transport thread to enforce a timeout.
EXTRACTION_REQUEST_TIMEOUT_SECONDS = 45
MAX_BODY_CHARS = 24_000
# A 1,500-character source window completed the full structured request shape
# within the bounded proxy deadline; larger windows repeatedly timed out and are
# recorded as an extraction-gap risk rather than silently accepted.
MAX_EXTRACTION_CHARS = 1_200
HTTP_TIMEOUT = 30
USER_AGENT = "MIPV2ProvenanceResearchBot/1.0 (+https://jkelsen13-tech.github.io/media-intelligence-platform-v2/)"

# Source endpoints are mirrored by supabase/seeds/v2_ingestion_sources_seed.sql.
# Reuters and AP are intentionally discovered via original publisher URLs in GDELT,
# not represented as direct RSS feeds.
FALLBACK_SOURCES: dict[str, dict[str, Any]] = {
    "gdelt-public-news-discovery": {
        "source_key": "gdelt-public-news-discovery",
        "label": "GDELT DOC 2.0 public-news discovery",
        "source_url": "https://api.gdeltproject.org/api/v2/doc/doc",
        "source_type": "gdelt_doc_api",
        "feed": "gdelt-public-news",
        "query": "language:english",
        "allow_body_fetch": False,
    },
    "gdelt-reuters-original-url-discovery": {
        "source_key": "gdelt-reuters-original-url-discovery",
        "label": "GDELT DOC 2.0 — Reuters original-URL discovery",
        "source_url": "https://api.gdeltproject.org/api/v2/doc/doc",
        "source_type": "gdelt_doc_api",
        "feed": "gdelt-reuters-discovery",
        "query": "domainis:reuters.com",
        "allow_body_fetch": False,
    },
    "gdelt-ap-original-url-discovery": {
        "source_key": "gdelt-ap-original-url-discovery",
        "label": "GDELT DOC 2.0 — AP original-URL discovery",
        "source_url": "https://api.gdeltproject.org/api/v2/doc/doc",
        "source_type": "gdelt_doc_api",
        "feed": "gdelt-ap-discovery",
        "query": "domainis:apnews.com",
        "allow_body_fetch": False,
    },
    "gdelt-bigquery-gkg-discovery": {
        "source_key": "gdelt-bigquery-gkg-discovery",
        "label": "GDELT BigQuery GKG original-URL discovery",
        "source_url": "bigquery://gdelt-bq.gdeltv2.gkg_partitioned",
        "source_type": "gdelt_bigquery",
        "feed": "gdelt-bigquery-gkg",
        # BigQuery is discovery metadata. The worker still fetches only public
        # publisher HTML that passes the robots gate before extraction.
        "allow_body_fetch": True,
    },
    "doj-press-release-rss": {
        "source_key": "doj-press-release-rss",
        "label": "U.S. Department of Justice Press Releases RSS",
        "source_url": "https://www.justice.gov/news/rss?type=press_release&m=1",
        "source_type": "official_feed",
        "feed": "doj-official-rss",
        "allow_body_fetch": True,
    },
    "bbc-news-rss": {
        "source_key": "bbc-news-rss",
        "label": "BBC News RSS",
        "source_url": "https://feeds.bbci.co.uk/news/rss.xml",
        "source_type": "rss",
        "feed": "bbc-news-rss",
        "allow_body_fetch": True,
    },
    "npr-news-rss": {
        "source_key": "npr-news-rss",
        "label": "NPR News RSS",
        "source_url": "https://feeds.npr.org/1001/rss.xml",
        "source_type": "rss",
        "feed": "npr-news-rss",
        "allow_body_fetch": True,
    },
}

CITATION_TYPES = {
    "court_doc",
    "agency_release",
    "named_official",
    "anonymous_official",
    "prior_reporting",
    "study",
    "other",
}
CANDIDATE_TARGETS = {
    "arc_assignment": "story_arcs",
    "timeline_assignment": "arc_events",
    "graph_node": "nodes",
    "geography_mention": "geographic_places",
}

EXTRACTION_SCHEMA = {
    "name": "mip_article_provenance_extraction",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "claims": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "kind": {"type": "string", "enum": ["substantive", "framing"]},
                        "text": {"type": "string"},
                        "start": {"type": "integer"},
                        "end": {"type": "integer"},
                        "stance": {"type": "string", "enum": ["asserts", "reports", "attributes", "disputes"]},
                        "loaded_language": {"type": "array", "items": {"type": "string"}},
                    },
                    "required": ["kind", "text", "start", "end", "stance", "loaded_language"],
                    "additionalProperties": False,
                },
            },
            "citations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "cited_entity": {"type": "string"},
                        "cited_type": {"type": "string", "enum": sorted(CITATION_TYPES)},
                        "evidence_text": {"type": "string"},
                        "start": {"type": "integer"},
                        "end": {"type": "integer"},
                    },
                    "required": ["cited_entity", "cited_type", "evidence_text", "start", "end"],
                    "additionalProperties": False,
                },
            },
            "locations": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "mention_text": {"type": "string"},
                        "start": {"type": "integer"},
                        "end": {"type": "integer"},
                        "location_role": {"type": "string", "enum": ["event", "jurisdiction", "facility", "context"]},
                    },
                    "required": ["mention_text", "start", "end", "location_role"],
                    "additionalProperties": False,
                },
            },
            "cross_surface": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "candidate_type": {"type": "string", "enum": sorted(CANDIDATE_TARGETS)},
                        "label": {"type": "string"},
                        "evidence_text": {"type": "string"},
                        "start": {"type": "integer"},
                        "end": {"type": "integer"},
                        "uncertainty": {"type": "string"},
                    },
                    "required": ["candidate_type", "label", "evidence_text", "start", "end", "uncertainty"],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["claims", "citations", "locations", "cross_surface"],
        "additionalProperties": False,
    },
}

BATCH_EXTRACTION_SCHEMA = {
    "name": "mip_batch_article_provenance_extraction",
    "strict": True,
    "schema": {
        "type": "object",
        "properties": {
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "record_url": {"type": "string"},
                        "output": EXTRACTION_SCHEMA["schema"],
                    },
                    "required": ["record_url", "output"],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["items"],
        "additionalProperties": False,
    },
}

EXTRACTION_SYSTEM = """You extract source-bounded candidates from a single stored publisher record.
Return only items whose exact evidence substring is present in the supplied text.
Do not repair, paraphrase, infer, or add context. Provide the literal substring
verbatim and keep arrays within these ceilings: at most 3 claims (including at
most one framing marker), 3 citations, 2 locations, and 2 cross-surface
candidates. Character offsets are independently
verified by the pipeline and must refer to the stored publisher text only. A
substantive claim must be a specific proposition stated or attributed by the
publisher record. A framing marker must be a literal rhetorical choice, not a
neutrality, truth, or bias conclusion. A citation is only an explicitly named
source, document, study, official, or prior reporting reference; do not turn the
publisher itself into a citation. A cross-surface item is a REVIEW-PENDING
proposal only, never an outcome, relationship, causal statement, location
resolution, or graph edge. Use empty arrays where the record has no supported
items. Never identify alleged victims, person-level allegations, private personal
data, or material connected to Louisiana v. Callais / Document 07. This model is
not an authority to authorize scope expansion."""


class ScopeHold(RuntimeError):
    """Raised when a discovered record is canary-adjacent but not clearly excluded."""


@dataclasses.dataclass(frozen=True)
class ArticleCandidate:
    source_key: str
    feed: str
    source_label: str
    url: str
    title: str
    outlet: str
    published_at: str | None
    summary: str | None
    # GDELT themes/persons/locations are transient discovery metadata. They are
    # supplied to the deterministic scope gate but intentionally never become
    # article-body text, evidence, citations, or automated cross-surface data.
    discovery_metadata: dict[str, str] = dataclasses.field(default_factory=dict, repr=False)

    def combined_text(self) -> str:
        metadata_text = " ".join(
            value[:2_000] for key, value in self.discovery_metadata.items()
            if key in {"themes", "persons", "locations"} and value
        )
        return "\n".join(part for part in (self.title, self.summary or "", self.url, metadata_text) if part)


@dataclasses.dataclass
class HydratedArticle:
    candidate: ArticleCandidate
    body_text: str | None
    author_name: str | None
    canonical_url: str | None
    status_note: str
    error: str | None = None


class Journal:
    def __init__(self, run_id: str):
        self.run_id = run_id
        self.path = RUN_ROOT / run_id
        self.path.mkdir(parents=True, exist_ok=True)
        self.exclusions = self.path / "exclusions.jsonl"
        self.failures = self.path / "failures.jsonl"
        self.notebook = self.path / "working_notebook.md"
        self.index_notebook = ROOT / "verifier" / "ingestion_working_notebook.md"
        if not self.notebook.exists():
            self.notebook.write_text(
                f"# Ingestion Working Notebook — {run_id}\n\n"
                "This run enforces a maximum of 10 articles per manifest and holds Doc 07 / Louisiana v. Callais material outside the pipeline.\n\n"
                "| Time (UTC) | Manifest | Status | Detail |\n|---|---:|---|---|\n"
            )

    def _append_jsonl(self, path: Path, value: dict[str, Any]) -> None:
        with path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(value, ensure_ascii=False, sort_keys=True) + "\n")

    def log_exclusion(self, batch: int | None, candidate: ArticleCandidate | None, reason: str, detail: str) -> None:
        row = {
            "run_id": self.run_id,
            "batch": batch,
            "recorded_at": datetime.now(UTC).isoformat(),
            "reason": reason,
            "detail": detail,
            "url": candidate.url if candidate else None,
            "title": candidate.title if candidate else None,
            "outlet": candidate.outlet if candidate else None,
            "source_key": candidate.source_key if candidate else None,
        }
        self._append_jsonl(self.exclusions, row)
        self.note(batch, "excluded", f"{reason}: {detail}")

    def log_failure(self, batch: int | None, candidate: ArticleCandidate | None, stage: str, error: str) -> None:
        self._append_jsonl(
            self.failures,
            {
                "run_id": self.run_id,
                "batch": batch,
                "recorded_at": datetime.now(UTC).isoformat(),
                "stage": stage,
                "error": error,
                "url": candidate.url if candidate else None,
                "title": candidate.title if candidate else None,
                "source_key": candidate.source_key if candidate else None,
            },
        )
        self.note(batch, "failure", f"{stage}: {error[:240]}")

    def note(self, batch: int | None, status: str, detail: str) -> None:
        now = datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%SZ")
        manifest = "—" if batch is None else str(batch)
        line = f"| {now} | {manifest} | {status} | {detail.replace('|', '/')} |\n"
        with self.notebook.open("a", encoding="utf-8") as handle:
            handle.write(line)
        with self.index_notebook.open("a", encoding="utf-8") as handle:
            handle.write(f"{self.run_id}: {line}")


class RobotGate:
    """Conservative robots.txt evaluator. Retrieval errors are a no-fetch result."""

    def __init__(self) -> None:
        self.cache: dict[str, tuple[bool, float]] = {}

    def permitted(self, url: str) -> tuple[bool, str]:
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            return False, "malformed_or_non_http_url"
        origin = f"{parsed.scheme}://{parsed.netloc}"
        cached = self.cache.get(origin)
        if cached and cached[1] > time.monotonic():
            return cached[0], "robots_cache"
        robots_url = urljoin(origin, "/robots.txt")
        try:
            response = requests.get(robots_url, headers={"User-Agent": USER_AGENT}, timeout=HTTP_TIMEOUT)
            if response.status_code >= 400:
                self.cache[origin] = (False, time.monotonic() + 3600)
                return False, f"robots_http_{response.status_code}"
            parser = RobotFileParser()
            parser.parse(response.text.splitlines())
            allowed = parser.can_fetch(USER_AGENT, url)
            self.cache[origin] = (allowed, time.monotonic() + 3600)
            return allowed, "robots_allowed" if allowed else "robots_disallow"
        except requests.RequestException as exc:
            self.cache[origin] = (False, time.monotonic() + 900)
            return False, f"robots_unavailable:{type(exc).__name__}"


def parse_time(value: str | None) -> str | None:
    if not value:
        return None
    value = value.strip()
    for pattern in ("%Y%m%dT%H%M%SZ", "%Y%m%d%H%M%S", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%SZ"):
        try:
            parsed = datetime.strptime(value, pattern)
            if parsed.tzinfo is None:
                parsed = parsed.replace(tzinfo=UTC)
            return parsed.astimezone(UTC).isoformat().replace("+00:00", "Z")
        except ValueError:
            continue
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed.astimezone(UTC).isoformat().replace("+00:00", "Z")
    except ValueError:
        return None


def clean_text(value: str | None) -> str:
    if not value:
        return ""
    value = html.unescape(value)
    return re.sub(r"\s+", " ", value).strip()


def normalize_url(value: str) -> str:
    parsed = urlparse(value.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""
    return parsed._replace(fragment="").geturl()


def outlet_from_url(url: str) -> str:
    host = urlparse(url).netloc.lower().removeprefix("www.")
    return host or "Publisher record"


def parse_gdelt_bigquery_timestamp(value: Any) -> str | None:
    """Parse the GKG `DATE` INT64 as a strictly formatted UTC timestamp.

    GDELT names this column DATE, but the verified BigQuery schema reports INT64.
    A malformed or partial value is not inferred; callers skip and journal it.
    """
    if value is None:
        return None
    digits = re.sub(r"\D", "", str(value))
    if len(digits) != 14:
        return None
    return parse_time(digits)


def source_note(source: dict[str, Any], hydrated: bool, detail: str) -> str:
    status = "publisher HTML hydrated" if hydrated else "publisher body not hydrated"
    metadata_note = ""
    if source.get("source_type") == "gdelt_bigquery":
        metadata_note = (
            " GDELT metadata was used only to discover the publisher URL, outlet, timestamp candidate, and scope-screening context; "
            "it is not stored as publisher prose, evidence, or an automatic cross-surface update."
        )
    return (
        f"Discovery provenance: {source['label']} ({source['source_key']}); original publisher URL recorded. "
        f"{status}: {detail}. This record does not establish source independence or an evidentiary conclusion.{metadata_note}"
    )


def load_canary_config() -> dict[str, Any]:
    if not EXCLUSION_CONFIG.exists():
        return {"held_run_tags": ["doc07-canary-2026-08-08"], "protected_urls": []}
    raw = json.loads(EXCLUSION_CONFIG.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError("Doc 07 exclusion configuration must be a JSON object")
    raw.setdefault("held_run_tags", ["doc07-canary-2026-08-08"])
    raw.setdefault("protected_urls", [])
    return raw


def load_redistricting_config() -> dict[str, Any]:
    if not REDISTRICTING_EXCLUSION_CONFIG.exists():
        raise ValueError("Redistricting-adjacent exclusion configuration is required for this backfill")
    raw = json.loads(REDISTRICTING_EXCLUSION_CONFIG.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError("Redistricting-adjacent exclusion configuration must be a JSON object")
    raw.setdefault("subject_patterns", ["redistrict", "gerrymander", "district map"])
    raw.setdefault("political_process_patterns", ["electoral fairness", "authoritarianism", "democratic backsliding", "voting rights"])
    raw.setdefault("figure_claim_patterns", ["said", "says", "claimed", "claims", "warned", "argued", "told", "called"])
    raw.setdefault("lead_character_limit", 1200)
    return raw


def _contains_any(text: str, patterns: Iterable[Any]) -> bool:
    return any(str(pattern).casefold() in text for pattern in patterns)


def _has_named_figure_claim(text: str, config: dict[str, Any]) -> bool:
    # A conservative proper-name pattern prevents routine election logistics from
    # being excluded merely because a generic political-process term appears.
    has_named_person = bool(re.search(r"\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){1,2}\b", text))
    return has_named_person and _contains_any(text.casefold(), config.get("figure_claim_patterns", []))


def exclusion_decision(
    candidate: ArticleCandidate,
    canary_config: dict[str, Any],
    redistricting_config: dict[str, Any],
    additional_text: str = "",
) -> tuple[str, str, bool] | None:
    """Return independent audit tag, reason, and whether owner review is required.

    Document 07 / Callais material and redistricting-adjacent material remain
    separate categories. Only their overlap is an ambiguity hold. Every other
    matching record is excluded before hydration, extraction, embedding, or write.
    """
    normalized_url = normalize_url(candidate.url)
    protected_urls = {normalize_url(str(item)) for item in canary_config.get("protected_urls", [])}
    combined = candidate.combined_text() + "\n" + additional_text
    text = combined.casefold()
    direct_callais = normalized_url in protected_urls or bool(re.search(r"\bcallais\b", text)) or "louisiana v. callais" in text

    headline = (candidate.title or "").casefold()
    lead = (candidate.summary or "").casefold() + "\n" + additional_text[:int(redistricting_config.get("lead_character_limit", 1200))].casefold()
    subject_patterns = redistricting_config.get("subject_patterns", [])
    process_patterns = redistricting_config.get("political_process_patterns", [])
    direct_redistricting_subject = _contains_any(headline, subject_patterns) or (_contains_any(lead, subject_patterns) and _contains_any(headline + "\n" + lead, process_patterns))
    political_context = headline + "\n" + lead
    named_figure_process_claim = _has_named_figure_claim((candidate.title or "") + "\n" + (candidate.summary or "") + "\n" + additional_text[:int(redistricting_config.get("lead_character_limit", 1200))], redistricting_config) and _contains_any(political_context, process_patterns) and ("vot" in political_context or _contains_any(political_context, subject_patterns))
    redistricting_adjacent = direct_redistricting_subject or named_figure_process_claim

    if direct_callais and redistricting_adjacent:
        return "ambiguous_between_categories_hold", "Potential overlap between Document 07 / Callais and redistricting-adjacent material requires direct owner review", True
    if direct_callais:
        return "callais_canary_hold", "Document 07 / Louisiana v. Callais direct match", False
    if redistricting_adjacent:
        return "redistricting_adjacent_hold", "Owner-authorized deterministic redistricting-adjacent exclusion", False
    return None


def discover_gdelt(source: dict[str, Any], day: date) -> list[ArticleCandidate]:
    params = {
        "query": source["query"],
        "mode": "artlist",
        "format": "json",
        "maxrecords": 250,
        "sort": "datedesc",
        "startdatetime": day.strftime("%Y%m%d") + "000000",
        "enddatetime": day.strftime("%Y%m%d") + "235959",
    }
    last_error: Exception | None = None
    for attempt in range(6):
        try:
            response = requests.get(source["source_url"], params=params, headers={"User-Agent": USER_AGENT}, timeout=HTTP_TIMEOUT)
            if response.status_code == 429:
                # GDELT's recorded public limit is one request every five seconds.
                # Back off from that floor rather than issuing another early retry.
                time.sleep(min(60, 5 * (attempt + 1)))
                continue
            response.raise_for_status()
            payload = response.json()
            records = payload.get("articles") or []
            out: list[ArticleCandidate] = []
            for record in records:
                url = normalize_url(str(record.get("url") or ""))
                title = clean_text(str(record.get("title") or ""))
                if not url or not title:
                    continue
                domain = clean_text(str(record.get("domain") or "")) or outlet_from_url(url)
                out.append(
                    ArticleCandidate(
                        source_key=source["source_key"],
                        feed=source["feed"],
                        source_label=source["label"],
                        url=url,
                        title=title,
                        outlet=domain,
                        published_at=parse_time(record.get("seendate")),
                        summary=None,
                    )
                )
            return out
        except (requests.RequestException, ValueError) as exc:
            last_error = exc
            time.sleep(min(30, 2 ** attempt))
    raise RuntimeError(f"GDELT discovery failed after retry budget: {last_error}")


def discover_gdelt_bigquery(source: dict[str, Any], day: date) -> list[ArticleCandidate]:
    """Discover a single physical GKG partition through the isolated project.

    The query returns discovery metadata only. It is date-partitioned, has a
    maximum-byte guard, and never reads a publisher body. Publisher hydration,
    robots checks, canary checks, extraction, and the pending-review writer remain
    in the shared pipeline path after this function returns.
    """
    try:
        from google.cloud import bigquery
    except ImportError as exc:
        raise RuntimeError(
            "GDELT BigQuery discovery requires google-cloud-bigquery. Install it in the isolated execution environment; "
            "the pipeline will not fall back to another bulk source."
        ) from exc

    day_start = datetime(day.year, day.month, day.day, tzinfo=UTC)
    day_end = day_start + timedelta(days=1)
    query = f"""
        SELECT DocumentIdentifier, SourceCommonName, DATE, Themes, Persons, Locations
        FROM `{BIGQUERY_DATASET}`
        WHERE _PARTITIONTIME >= @window_start
          AND _PARTITIONTIME < @window_end
          AND DocumentIdentifier IS NOT NULL
          AND DocumentIdentifier != ''
        ORDER BY DATE DESC
        LIMIT @record_limit
    """
    config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("window_start", "TIMESTAMP", day_start),
            bigquery.ScalarQueryParameter("window_end", "TIMESTAMP", day_end),
            bigquery.ScalarQueryParameter("record_limit", "INT64", 250),
        ],
        maximum_bytes_billed=BIGQUERY_MAX_BYTES_PER_QUERY,
        use_query_cache=False,
    )
    try:
        client = bigquery.Client(project=BIGQUERY_PROJECT_ID)
        rows = client.query(query, job_config=config, project=BIGQUERY_PROJECT_ID).result(page_size=250)
    except Exception as exc:
        raise RuntimeError(
            "GDELT BigQuery discovery failed in the isolated sandbox project; no alternate bulk source will be substituted: "
            f"{type(exc).__name__}: {str(exc)[:300]}"
        ) from exc

    out: list[ArticleCandidate] = []
    for row in rows:
        url = normalize_url(str(getattr(row, "DocumentIdentifier", "") or ""))
        if not url:
            continue
        published_at = parse_gdelt_bigquery_timestamp(getattr(row, "DATE", None))
        # A raw GDELT DATE value must not be silently converted to a present date
        # or other guessed value. `discover_until_manifest` excludes and journals
        # this candidate before any hydration or extraction when it is None.
        outlet = clean_text(str(getattr(row, "SourceCommonName", "") or "")) or outlet_from_url(url)
        metadata = {
            key: clean_text(str(getattr(row, field, "") or ""))[:4_000]
            for key, field in (("themes", "Themes"), ("persons", "Persons"), ("locations", "Locations"))
            if clean_text(str(getattr(row, field, "") or ""))
        }
        out.append(
            ArticleCandidate(
                source_key=source["source_key"],
                feed=source["feed"],
                source_label=source["label"],
                url=url,
                # A title is deliberately derived later from the publisher HTML.
                # The original URL is a truthful fallback when hydration cannot.
                title=url,
                outlet=outlet[:300],
                published_at=published_at,
                summary=None,
                discovery_metadata=metadata,
            )
        )
    return out


def xml_text(element: ET.Element, tag: str) -> str | None:
    for child in element:
        if child.tag.rsplit("}", 1)[-1] == tag:
            return clean_text(child.text)
    return None


def discover_rss(source: dict[str, Any]) -> list[ArticleCandidate]:
    response = requests.get(source["source_url"], headers={"User-Agent": USER_AGENT}, timeout=HTTP_TIMEOUT)
    response.raise_for_status()
    root = ET.fromstring(response.content)
    out: list[ArticleCandidate] = []
    for item in root.findall(".//item"):
        url = normalize_url(xml_text(item, "link") or "")
        title = xml_text(item, "title") or ""
        if not url or not title:
            continue
        description = xml_text(item, "description")
        outlet = xml_text(item, "source") or outlet_from_url(url)
        pubdate = xml_text(item, "pubDate") or xml_text(item, "date")
        out.append(
            ArticleCandidate(
                source_key=source["source_key"],
                feed=source["feed"],
                source_label=source["label"],
                url=url,
                title=title,
                outlet=outlet,
                published_at=parse_time(pubdate),
                summary=description or None,
            )
        )
    return out


def hydrate(candidate: ArticleCandidate, source: dict[str, Any], robot_gate: RobotGate) -> HydratedArticle:
    if not source.get("allow_body_fetch", False):
        return HydratedArticle(candidate, None, None, None, source_note(source, False, "source policy disables body retrieval"))
    allowed, reason = robot_gate.permitted(candidate.url)
    if not allowed:
        return HydratedArticle(candidate, None, None, None, source_note(source, False, reason), error=reason)
    try:
        response = requests.get(
            candidate.url,
            headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"},
            timeout=HTTP_TIMEOUT,
            allow_redirects=True,
        )
        content_type = response.headers.get("content-type", "").lower()
        if response.status_code >= 400:
            return HydratedArticle(candidate, None, None, None, source_note(source, False, f"publisher HTTP {response.status_code}"), error=f"publisher_http_{response.status_code}")
        if "html" not in content_type:
            return HydratedArticle(candidate, None, None, None, source_note(source, False, f"unsupported content type {content_type or 'unknown'}"), error="unsupported_content_type")
        soup = BeautifulSoup(response.text, "html.parser")
        canonical_tag = soup.select_one("link[rel='canonical']")
        canonical = normalize_url(canonical_tag.get("href", "")) if canonical_tag else None
        publisher_title = ""
        for selector, attr in (("meta[property='og:title']", "content"), ("meta[name='twitter:title']", "content"), ("title", None)):
            element = soup.select_one(selector)
            if not element:
                continue
            possible = element.get(attr) if attr else element.get_text(" ", strip=True)
            publisher_title = clean_text(possible)
            if publisher_title:
                break
        if publisher_title:
            candidate = dataclasses.replace(candidate, title=publisher_title[:500])
        author = None
        for selector, attr in (("meta[name='author']", "content"), ("meta[property='article:author']", "content"), ("[rel='author']", None)):
            element = soup.select_one(selector)
            if not element:
                continue
            possible = element.get(attr) if attr else element.get_text(" ", strip=True)
            possible = clean_text(possible)
            if possible:
                author = possible[:300]
                break
        for node in soup(["script", "style", "noscript", "svg", "nav", "footer", "aside", "form"]):
            node.decompose()
        article_node = soup.select_one("article") or soup.select_one("main") or soup.body
        if article_node is None:
            return HydratedArticle(candidate, None, author, canonical, source_note(source, False, "no readable document container"), error="no_body")
        body = clean_text(article_node.get_text(" ", strip=True))[:MAX_BODY_CHARS]
        if len(body) < 240:
            return HydratedArticle(candidate, None, author, canonical, source_note(source, False, "body below minimum readable length"), error="body_too_short")
        return HydratedArticle(candidate, body, author, canonical, source_note(source, True, reason))
    except requests.RequestException as exc:
        return HydratedArticle(candidate, None, None, None, source_note(source, False, type(exc).__name__), error=f"fetch_error:{type(exc).__name__}")


def valid_span(text: str, start: Any, end: Any, expected: str) -> bool:
    if not isinstance(start, int) or not isinstance(end, int) or start < 0 or end <= start or end > len(text):
        return False
    return clean_text(text[start:end]).casefold() == clean_text(expected).casefold()


def locate_literal_span(text: str, expected: Any) -> tuple[int, int] | None:
    """Return a source-text span only when a normalized literal occurs once.

    Model-provided coordinates are not trusted. The extraction is accepted only
    when its quoted evidence can be deterministically grounded in the exact stored
    publisher text; repeated or absent phrases remain validation failures.
    """
    needle = clean_text(str(expected or ""))
    if not needle:
        return None
    haystack = text.casefold()
    normalized_needle = needle.casefold()
    first = haystack.find(normalized_needle)
    if first < 0 or haystack.find(normalized_needle, first + 1) >= 0:
        return None
    return first, first + len(needle)


def normalize_literal_spans(text: str, output: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(output, dict):
        return output
    for key, field in (("claims", "text"), ("citations", "evidence_text"), ("locations", "mention_text"), ("cross_surface", "evidence_text")):
        rows = output.get(key)
        if not isinstance(rows, list):
            continue
        for row in rows:
            if not isinstance(row, dict):
                continue
            span = locate_literal_span(text, row.get(field))
            if span is not None:
                row["start"], row["end"] = span
    return output


def validate_extraction(text: str, output: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if not isinstance(output, dict):
        return ["response_not_object"]
    for key in ("claims", "citations", "locations", "cross_surface"):
        if not isinstance(output.get(key), list):
            errors.append(f"{key}_not_array")
    if errors:
        return errors
    if len(output["claims"]) > 8 or len(output["citations"]) > 6 or len(output["locations"]) > 4 or len(output["cross_surface"]) > 5:
        errors.append("output_exceeds_per_article_limit")
    for index, item in enumerate(output["claims"]):
        if item.get("kind") not in {"substantive", "framing"}:
            errors.append(f"claim_{index}_kind")
        if not valid_span(text, item.get("start"), item.get("end"), str(item.get("text") or "")):
            errors.append(f"claim_{index}_span")
    for index, item in enumerate(output["citations"]):
        if item.get("cited_type") not in CITATION_TYPES:
            errors.append(f"citation_{index}_type")
        if not valid_span(text, item.get("start"), item.get("end"), str(item.get("evidence_text") or "")):
            errors.append(f"citation_{index}_span")
    for index, item in enumerate(output["locations"]):
        if not valid_span(text, item.get("start"), item.get("end"), str(item.get("mention_text") or "")):
            errors.append(f"location_{index}_span")
    for index, item in enumerate(output["cross_surface"]):
        if item.get("candidate_type") not in CANDIDATE_TARGETS:
            errors.append(f"cross_surface_{index}_type")
        if not valid_span(text, item.get("start"), item.get("end"), str(item.get("evidence_text") or "")):
            errors.append(f"cross_surface_{index}_span")
    return errors


def sanitize_extraction(text: str, output: dict[str, Any]) -> tuple[dict[str, Any] | None, list[str]]:
    """Retain only individually valid, source-grounded extraction items.

    A malformed or ambiguous location/citation must not erase a separately
    grounded substantive claim. The retained output is still fully validated;
    the warning list records every pruned item for later review.
    """
    if not isinstance(output, dict):
        return None, ["response_not_object"]
    required = ("claims", "citations", "locations", "cross_surface")
    if any(not isinstance(output.get(key), list) for key in required):
        return None, [f"{key}_not_array" for key in required if not isinstance(output.get(key), list)]
    limits = {"claims": 3, "citations": 3, "locations": 2, "cross_surface": 2}
    cleaned: dict[str, list[dict[str, Any]]] = {key: [] for key in required}
    warnings: list[str] = []
    for key in required:
        for index, item in enumerate(output[key]):
            if len(cleaned[key]) >= limits[key]:
                warnings.append(f"{key}_{index}_dropped_over_limit")
                continue
            if not isinstance(item, dict):
                warnings.append(f"{key}_{index}_not_object")
                continue
            evidence_field = {"claims": "text", "citations": "evidence_text", "locations": "mention_text", "cross_surface": "evidence_text"}[key]
            if key == "claims" and item.get("kind") not in {"substantive", "framing"}:
                warnings.append(f"claim_{index}_kind")
                continue
            if key == "citations" and item.get("cited_type") not in CITATION_TYPES:
                warnings.append(f"citation_{index}_type")
                continue
            if key == "cross_surface" and item.get("candidate_type") not in CANDIDATE_TARGETS:
                warnings.append(f"cross_surface_{index}_type")
                continue
            if not valid_span(text, item.get("start"), item.get("end"), str(item.get(evidence_field) or "")):
                warnings.append(f"{key}_{index}_span")
                continue
            cleaned[key].append(item)
    validation_errors = validate_extraction(text, cleaned)
    if validation_errors:
        return None, warnings + validation_errors
    return cleaned, warnings


_FRAMING_TERMS = re.compile(
    r"\b(?:controversial|unprecedented|chaos|crisis|shocking|dramatic|radical|reckless|devastating|"
    r"blasted|slammed|attacked|praised|hailed|criticized|critics|supporters)\b",
    re.IGNORECASE,
)
_CITATION_ENTITY = re.compile(
    r"\b(?:according to|said|says|told|reported by|a report by|data from|documents from)\s+"
    r"(?:the\s+)?([A-Z][A-Za-z0-9&.'-]*(?:\s+[A-Z][A-Za-z0-9&.'-]*){0,5})",
    re.IGNORECASE,
)
_CLAIM_SIGNAL = re.compile(
    r"\b(?:is|are|was|were|has|have|had|will|would|said|says|told|reported|announced|released|"
    r"found|approved|denied|filed|ordered|ruled|sued|charged|according to)\b",
    re.IGNORECASE,
)


def sentence_spans(text: str) -> list[tuple[str, int, int]]:
    """Return normalized sentence substrings and exact offsets from publisher text."""
    out: list[tuple[str, int, int]] = []
    for match in re.finditer(r"[^.!?]+(?:[.!?]+|$)", text, flags=re.DOTALL):
        raw = match.group(0)
        leading = len(raw) - len(raw.lstrip())
        trailing = len(raw.rstrip())
        if trailing <= leading:
            continue
        start = match.start() + leading
        end = match.start() + trailing
        sentence = text[start:end]
        if sentence:
            out.append((sentence, start, end))
    return out


def deterministic_literal_extraction(hydrated: HydratedArticle) -> tuple[dict[str, Any] | None, list[str]]:
    """Produce bounded publisher-literal candidates without generative inference.

    This extractor deliberately proposes no graph, timeline, arc, or geographic
    candidate. Any cross-surface use remains a human review decision. It may return
    empty arrays when a literal source-bounded candidate is unavailable.
    """
    assert hydrated.body_text is not None
    text = hydrated.body_text[:MAX_EXTRACTION_CHARS]
    claims: list[dict[str, Any]] = []
    citations: list[dict[str, Any]] = []
    spans = sentence_spans(text)
    for sentence, start, end in spans:
        compact = clean_text(sentence)
        if len(compact) < 60:
            continue
        lower = compact.lower()
        if len(claims) < 2 and _CLAIM_SIGNAL.search(compact):
            stance = "disputes" if "denied" in lower or "disputed" in lower else (
                "reports" if re.search(r"\b(?:said|says|told|reported|according to)\b", lower) else "asserts"
            )
            claims.append(
                {"kind": "substantive", "text": sentence, "start": start, "end": end, "stance": stance, "loaded_language": []}
            )
        if not any(item["kind"] == "framing" for item in claims) and _FRAMING_TERMS.search(compact):
            claims.append(
                {
                    "kind": "framing",
                    "text": sentence,
                    "start": start,
                    "end": end,
                    "stance": "reports" if re.search(r"\b(?:said|says|told|reported|according to)\b", lower) else "asserts",
                    "loaded_language": [match.group(0) for match in _FRAMING_TERMS.finditer(compact)],
                }
            )
        citation_match = _CITATION_ENTITY.search(compact)
        if citation_match and len(citations) < 3:
            entity = citation_match.group(1)
            proper_tokens: list[str] = []
            for token in entity.split():
                if token and token[0].isupper():
                    proper_tokens.append(token)
                else:
                    break
            entity = " ".join(proper_tokens)
            if not entity:
                continue
            cited_type = "court_doc" if "court" in entity.lower() else ("study" if "study" in lower or "report" in lower else "other")
            citations.append(
                {
                    "cited_entity": entity,
                    "cited_type": cited_type,
                    "evidence_text": sentence,
                    "start": start,
                    "end": end,
                }
            )
        if len(claims) >= 3 and len(citations) >= 3:
            break
    if not any(item["kind"] == "substantive" for item in claims):
        for sentence, start, end in spans:
            if len(clean_text(sentence)) >= 60:
                claims.insert(0, {"kind": "substantive", "text": sentence, "start": start, "end": end, "stance": "reports", "loaded_language": []})
                break
    raw = {"claims": claims[:3], "citations": citations, "locations": [], "cross_surface": []}
    return sanitize_extraction(text, raw)


def run_batch_extraction(hydrated_rows: list[HydratedArticle]) -> dict[str, tuple[dict[str, Any] | None, list[str]]]:
    """Extract a single hard-capped manifest in one bounded proxy request.

    The manifest has already been capped at ten. Returning an output keyed by the
    original publisher URL preserves article-local evidence spans and means a
    transient model failure is recorded separately against each affected record.
    """
    if not hydrated_rows or len(hydrated_rows) > MAX_MANIFEST_SIZE:
        raise ValueError(f"batch extraction accepts 1..{MAX_MANIFEST_SIZE} publisher bodies")
    records = []
    by_url: dict[str, HydratedArticle] = {}
    for index, row in enumerate(hydrated_rows, start=1):
        assert row.body_text is not None
        body = row.body_text[:MAX_EXTRACTION_CHARS]
        by_url[row.candidate.url] = row
        records.append(
            f"RECORD {index}\nURL: {row.candidate.url}\nPublisher: {row.candidate.outlet}\n"
            f"Title: {row.candidate.title}\nStored publisher text (offsets reset to zero for this record):\n{body}"
        )
    prompt = (
        "Return exactly one item for every RECORD, using its URL verbatim. Evidence spans and literal text must refer "
        "only to that record's Stored publisher text. Do not combine records, infer sources, or create facts. "
        "Use empty arrays for records with no supported candidates.\n\n" + "\n\n---\n\n".join(records)
    )
    last_error: Exception | None = None
    for attempt in range(1, EXTRACTION_MAX_ATTEMPTS + 1):
        try:
            base_url = os.environ.get("OPENAI_API_BASE", "").rstrip("/")
            api_key = os.environ.get("OPENAI_API_KEY", "")
            if not base_url or not api_key:
                raise RuntimeError("missing_sandbox_llm_proxy_configuration")
            response = requests.post(
                f"{base_url}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": EXTRACTION_MODEL,
                    "messages": [
                        {"role": "system", "content": EXTRACTION_SYSTEM},
                        {"role": "user", "content": prompt},
                    ],
                    "max_completion_tokens": 1_600,
                    "reasoning": {"effort": "minimal"},
                    "response_format": {"type": "json_schema", "json_schema": BATCH_EXTRACTION_SCHEMA},
                },
                timeout=(10, 75),
            )
            response.raise_for_status()
            payload = response.json()
            content = payload["choices"][0]["message"].get("content")
            raw_items = json.loads(content or "{}").get("items")
            if not isinstance(raw_items, list):
                raise ValueError("batch_response_items_not_array")
            results: dict[str, tuple[dict[str, Any] | None, list[str]]] = {}
            for item in raw_items:
                if not isinstance(item, dict):
                    continue
                url = normalize_url(str(item.get("record_url") or ""))
                row = by_url.get(url)
                raw_output = item.get("output")
                if row is None or not isinstance(raw_output, dict):
                    continue
                assert row.body_text is not None
                results[url] = sanitize_extraction(
                    row.body_text[:MAX_EXTRACTION_CHARS],
                    normalize_literal_spans(row.body_text[:MAX_EXTRACTION_CHARS], raw_output),
                )
            for url in by_url:
                results.setdefault(url, (None, ["batch_response_missing_record_url"]))
            return results
        except Exception as exc:
            last_error = exc
            if attempt < EXTRACTION_MAX_ATTEMPTS:
                time.sleep(2 ** (attempt - 1))
    assert last_error is not None
    reason = f"batch_model_error_after_{EXTRACTION_MAX_ATTEMPTS}_attempts:{type(last_error).__name__}:{str(last_error)[:180]}"
    return {row.candidate.url: (None, [reason]) for row in hydrated_rows}


def run_extraction(hydrated: HydratedArticle) -> tuple[dict[str, Any] | None, list[str]]:
    """Extract one publisher body with a bounded retry budget.

    A transient proxy timeout must not be silently accepted as an extraction-gap.
    The retry budget is intentionally small, applies only to this one article, and
    the final structured result still records the exhausted error reason. No retry
    changes the ten-item manifest ceiling or repeats a database write.
    """
    assert hydrated.body_text is not None
    body = hydrated.body_text[:MAX_EXTRACTION_CHARS]
    prompt = (
        f"Publisher: {hydrated.candidate.outlet}\n"
        f"Title: {hydrated.candidate.title}\n"
        f"Original URL: {hydrated.candidate.url}\n\n"
        "Stored publisher text (character offsets are zero-based in this exact string):\n"
        f"{body}"
    )
    last_error: Exception | None = None
    for attempt in range(1, EXTRACTION_MAX_ATTEMPTS + 1):
        try:
            base_url = os.environ.get("OPENAI_API_BASE", "").rstrip("/")
            api_key = os.environ.get("OPENAI_API_KEY", "")
            if not base_url or not api_key:
                raise RuntimeError("missing_sandbox_llm_proxy_configuration")
            response = requests.post(
                f"{base_url}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={
                    "model": EXTRACTION_MODEL,
                    "messages": [
                        {"role": "system", "content": EXTRACTION_SYSTEM},
                        {"role": "user", "content": prompt},
                    ],
                    "max_completion_tokens": 500,
                    # Structured, literal-span extraction does not need extended
                    # deliberation. The deterministic validator remains the
                    # acceptance authority.
                    "reasoning": {"effort": "minimal"},
                    "response_format": {"type": "json_schema", "json_schema": EXTRACTION_SCHEMA},
                },
                timeout=(10, EXTRACTION_REQUEST_TIMEOUT_SECONDS),
            )
            response.raise_for_status()
            payload = response.json()
            content = payload["choices"][0]["message"].get("content")
            raw_output = normalize_literal_spans(body, json.loads(content or "{}"))
            return sanitize_extraction(body, raw_output)
        except Exception as exc:  # final failure is journaled by extract_batch
            last_error = exc
            if attempt < EXTRACTION_MAX_ATTEMPTS:
                time.sleep(2 ** (attempt - 1))
    assert last_error is not None
    return None, [
        f"model_error_after_{EXTRACTION_MAX_ATTEMPTS}_attempts:{type(last_error).__name__}:{str(last_error)[:180]}"
    ]


def normalized_claims(output: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {"kind": item["kind"], "text": item["text"], "stance": item["stance"], "loaded_language": item["loaded_language"]}
        for item in output.get("claims", [])
    ]


def input_sha(hydrated: HydratedArticle) -> str:
    assert hydrated.body_text is not None
    value = f"{ALGORITHM_VERSION}\n{hydrated.candidate.url}\n{hydrated.body_text[:MAX_EXTRACTION_CHARS]}"
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


class V2Database:
    """Constrained isolated-v2 RPC writer; no service-role or production fallback."""

    def __init__(self) -> None:
        self.base = os.environ.get("MIP_V2_SUPABASE_URL", "").rstrip("/")
        self.anon_key = os.environ.get("MIP_V2_SUPABASE_ANON_KEY", "")
        self.writer_key = os.environ.get("MIP_V2_INGESTION_WRITER_KEY", "")
        if ISOLATED_PROJECT_REF not in self.base or not self.anon_key or not self.writer_key:
            raise RuntimeError(
                "Direct writes require the isolated v2 URL, public client key, and locally provisioned ingestion writer key. "
                "No service-role, browser-key, or production fallback is permitted."
            )
        self.headers = {
            "apikey": self.anon_key,
            "Authorization": f"Bearer {self.anon_key}",
            "Content-Type": "application/json",
        }

    def _request(self, method: str, table: str, *, params: dict[str, str] | None = None) -> Any:
        response = requests.request(method, f"{self.base}/rest/v1/{table}", headers=self.headers, params=params, timeout=60)
        response.raise_for_status()
        return response.json() if response.content else None

    def _rpc(self, function: str, body: dict[str, Any]) -> Any:
        response = requests.post(f"{self.base}/rest/v1/rpc/{function}", headers=self.headers, json=body, timeout=90)
        if not response.ok:
            # Never include credentials; the response payload is retained only to
            # make schema/constraint failures auditable in the run notebook.
            raise RuntimeError(f"RPC {function} failed ({response.status_code}): {response.text[:800]}")
        return response.json() if response.content else None

    def start_run(self, run_id: str, mode: str, window_start: str, window_end: str) -> None:
        self._rpc("mip_v2_ingestion_begin_run", {
            "p_run_id": run_id,
            "p_mode": mode,
            "p_window_start": window_start,
            "p_window_end": window_end,
            "p_algorithm_version": ALGORITHM_VERSION,
            "p_model_id": EXTRACTION_MODEL,
            "p_writer_key": self.writer_key,
        })

    def finish_run(self, run_id: str, state: str, counters: dict[str, int], note: str | None = None) -> None:
        self._rpc("mip_v2_ingestion_finish_run", {
            "p_run_id": run_id,
            "p_state": state,
            "p_counters": counters,
            "p_note": note,
            "p_writer_key": self.writer_key,
        })

    def existing_urls(self, urls: list[str]) -> set[str]:
        if not urls:
            return set()
        value = "(" + ",".join(json.dumps(url) for url in urls) + ")"
        rows = self._request("GET", "articles", params={"select": "url", "url": f"in.{value}"}) or []
        return {str(row["url"]) for row in rows}

    def write_batch(self, run_id: str, batch_number: int, source_key: str, actions: list[dict[str, Any]]) -> int:
        # The database RPC independently enforces the hard <=10 ceiling, approved
        # source, immutable existing URLs, candidate extraction state, and pending
        # cross-surface review state.
        result = self._rpc("mip_v2_ingestion_write_batch", {
            "p_run_id": run_id,
            "p_source_key": source_key,
            "p_batch_number": batch_number,
            "p_actions": actions,
            "p_writer_key": self.writer_key,
        }) or {}
        return int(result.get("inserted", 0))


def build_action(hydrated: HydratedArticle, output: dict[str, Any] | None, validation_errors: list[str]) -> dict[str, Any]:
    candidate = hydrated.candidate
    article = {
        "feed": candidate.feed,
        "outlet": candidate.outlet,
        "title": candidate.title,
        "url": candidate.url,
        "summary": candidate.summary,
        "published_at": candidate.published_at,
        "body_text": hydrated.body_text,
        "claims": normalized_claims(output) if output else [],
        "unattributed": not bool(hydrated.author_name),
        "monoculture": False,
        "is_digest": False,
        "entities_extracted_at": None,
        "arc_assign_attempted_at": None,
        "ingestion_run_id": None,  # set by caller once, never copied to existing conflict rows
        "source_status": "active",
        "source_status_note": hydrated.status_note,
    }
    action: dict[str, Any] = {"article": article, "citations": [], "cross_surface_candidates": []}
    if hydrated.body_text is None:
        return action
    output_payload = output if output is not None else {"claims": [], "citations": [], "locations": [], "cross_surface": []}
    action["extraction_result"] = {
        "algorithm_version": ALGORITHM_VERSION,
        "model_id": EXTRACTION_MODEL,
        "input_sha256": input_sha(hydrated),
        "output": output_payload,
        "state": "candidate" if output is not None else "failed",
        "validation_errors": validation_errors,
    }
    if output is None:
        return action
    for citation in output["citations"]:
        # 0 records 'no documentation-strength assessment made'; UI suppresses a
        # percentage at this sentinel, avoiding a model-derived composite score.
        action["citations"].append(
            {
                "cited_entity": citation["cited_entity"],
                "cited_type": citation["cited_type"],
                "documentation_strength": 0,
                "resolved_node_id": None,
            }
        )
    for surface in output["cross_surface"]:
        action["cross_surface_candidates"].append(
            {
                "candidate_type": surface["candidate_type"],
                "target_table": CANDIDATE_TARGETS[surface["candidate_type"]],
                "target_id": None,
                "evidence_excerpt": surface["evidence_text"],
                "evidence_start": surface["start"],
                "evidence_end": surface["end"],
                "algorithm_version": ALGORITHM_VERSION,
                "review_state": "pending",
                "remaining_uncertainty": f"Candidate label: {surface['label']}. {surface['uncertainty']}",
            }
        )
    for location in output["locations"]:
        action["cross_surface_candidates"].append(
            {
                "candidate_type": "geography_mention",
                "target_table": "geographic_places",
                "target_id": None,
                "evidence_excerpt": location["mention_text"],
                "evidence_start": location["start"],
                "evidence_end": location["end"],
                "algorithm_version": ALGORITHM_VERSION,
                "review_state": "pending",
                "remaining_uncertainty": f"Literal {location['location_role']} location mention only; no coordinate or node placement has been inferred.",
            }
        )
    return action


def write_spool(journal: Journal, batch_number: int, source_key: str, actions: list[dict[str, Any]], manifest: list[ArticleCandidate]) -> Path:
    path = journal.path / f"batch-{batch_number:05d}-actions.json"
    payload = {
        "run_id": journal.run_id,
        "batch_number": batch_number,
        "source_key": source_key,
        "manifest_size": len(manifest),
        "manifest": [dataclasses.asdict(candidate) for candidate in manifest],
        "actions": actions,
        "apply_contract": {
            "isolated_project_ref": ISOLATED_PROJECT_REF,
            "maximum_manifest_size": MAX_MANIFEST_SIZE,
            "existing_articles": "DO NOTHING; no legacy record can be updated by a backfill action",
            "cross_surface": "all candidates remain review_state=pending; no graph/timeline/arc promotion",
        },
    }
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return path


def fetch_source_batch(source: dict[str, Any], day: date) -> list[ArticleCandidate]:
    if source["source_type"] == "gdelt_doc_api":
        return discover_gdelt(source, day)
    if source["source_type"] == "gdelt_bigquery":
        return discover_gdelt_bigquery(source, day)
    return discover_rss(source)


def discover_until_manifest(
    source: dict[str, Any],
    discovered_candidates: Iterable[ArticleCandidate],
    seen_urls: set[str],
    canary_config: dict[str, Any],
    redistricting_config: dict[str, Any],
    counters: Counter[str],
    journal: Journal,
    batch_number: int,
) -> list[ArticleCandidate]:
    manifest: list[ArticleCandidate] = []
    for candidate in discovered_candidates:
        if candidate.url in seen_urls:
            journal.log_exclusion(batch_number, candidate, "duplicate_discovery_url", "URL already appeared in this run")
            continue
        seen_urls.add(candidate.url)
        if candidate.source_key == "gdelt-bigquery-gkg-discovery" and candidate.published_at is None:
            journal.log_exclusion(batch_number, candidate, "malformed_bigquery_timestamp", "GKG DATE was missing or not a strict 14-digit UTC timestamp")
            continue
        decision = exclusion_decision(candidate, canary_config, redistricting_config)
        if decision:
            exclusion_tag, reason, requires_owner_review = decision
            counters[exclusion_tag] += 1
            journal.log_exclusion(batch_number, candidate, exclusion_tag, reason)
            if requires_owner_review:
                raise ScopeHold(f"{reason}: {candidate.title} — {candidate.url}")
            continue
        manifest.append(candidate)
        if len(manifest) == MAX_MANIFEST_SIZE:
            break
    return manifest


def extract_batch(hydrated: list[HydratedArticle], journal: Journal, batch_number: int) -> dict[str, tuple[dict[str, Any] | None, list[str]]]:
    eligible = [row for row in hydrated if row.body_text]
    if not eligible:
        return {}
    output = {row.candidate.url: deterministic_literal_extraction(row) for row in eligible}
    for row in eligible:
        result = output.get(row.candidate.url, (None, ["batch_worker_missing_result"]))
        output[row.candidate.url] = result
        if result[1]:
            journal.log_failure(batch_number, row.candidate, "extract_pruned_or_validate", "; ".join(result[1]))
    return output


def rolling_failure_rate(window: deque[int]) -> float:
    return (sum(window) / len(window)) if window else 0.0


def run(args: argparse.Namespace) -> int:
    if args.batch_size != MAX_MANIFEST_SIZE:
        raise ValueError(f"The batch-size ceiling is hard-coded at {MAX_MANIFEST_SIZE}; received {args.batch_size}.")
    if args.target < 1:
        raise ValueError("target must be at least 1")
    if args.window_days < 1:
        raise ValueError("window-days must be at least 1")

    run_id = args.run_id or f"mip-v2-backfill-{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}-{uuid.uuid4().hex[:8]}"
    journal = Journal(run_id)
    canary_config = load_canary_config()
    redistricting_config = load_redistricting_config()
    sources = [FALLBACK_SOURCES[key] for key in args.source] if args.source else [FALLBACK_SOURCES["gdelt-bigquery-gkg-discovery"]]
    writer = V2Database() if args.write_mode == "direct" else None
    now = datetime.now(UTC)
    window_start = (now - timedelta(days=args.window_days)).isoformat()
    if writer:
        writer.start_run(run_id, "backfill", window_start, now.isoformat())
    journal.note(None, "started", f"mode={args.mode}; target={args.target}; sources={','.join(source['source_key'] for source in sources)}; write_mode={args.write_mode}")

    counters: Counter[str] = Counter()
    seen_urls: set[str] = set()
    batch_number = 0
    day_offset = 0
    source_cursor = 0
    discovery_cache: dict[tuple[str, str], list[ArticleCandidate]] = {}
    extraction_failure_window: deque[int] = deque(maxlen=FAILURE_WINDOW_SIZE)
    circuit_breaker_note: str | None = None
    try:
        while (counters["inserted"] if writer else counters["manifested"]) < args.target and day_offset < args.window_days:
            source_index = source_cursor % len(sources)
            source = sources[source_index]
            day = (now - timedelta(days=day_offset)).date()
            source_cursor += 1
            batch_number += 1
            if args.max_manifests and batch_number > args.max_manifests:
                journal.note(batch_number, "stopped", "configured maximum manifest count reached")
                break
            try:
                cache_key = (source["source_key"], day.isoformat())
                fetched_this_cycle = cache_key not in discovery_cache
                if fetched_this_cycle:
                    discovery_cache[cache_key] = fetch_source_batch(source, day)
                manifest = discover_until_manifest(
                    source,
                    discovery_cache[cache_key],
                    seen_urls,
                    canary_config,
                    redistricting_config,
                    counters,
                    journal,
                    batch_number,
                )
            except ScopeHold as exc:
                counters["scope_holds"] += 1
                journal.note(batch_number, "scope_hold", str(exc))
                if writer:
                    writer.finish_run(run_id, "completed_with_errors", dict(counters), str(exc))
                print(json.dumps({"run_id": run_id, "state": "scope_hold", "detail": str(exc), "run_dir": str(journal.path)}, indent=2))
                return 2
            if not manifest:
                journal.note(batch_number, "empty", f"no eligible records from {source['source_key']} for {day.isoformat()}")
                # A multi-source cycle advances after its final source. A single
                # dated discovery source advances only after its date is exhausted.
                if len(sources) == 1 or source_index == len(sources) - 1:
                    day_offset += 1
                continue
            if len(manifest) > MAX_MANIFEST_SIZE:
                raise AssertionError("manifest ceiling breach")
            counters["manifested"] += len(manifest)
            journal.note(batch_number, "manifested", f"{len(manifest)} articles from {source['source_key']} for {day.isoformat()}")
            working_manifest = manifest
            if writer:
                existing_urls = writer.existing_urls([item.url for item in manifest])
                working_manifest = []
                for item in manifest:
                    if item.url in existing_urls:
                        counters["preexisting_skipped"] += 1
                        journal.log_exclusion(batch_number, item, "preexisting_article", "existing row is immutable to this backfill")
                    else:
                        working_manifest.append(item)
            if args.mode == "discover":
                actions = []
                for item in working_manifest:
                    row = HydratedArticle(item, None, None, None, source_note(source, False, "discovery-only mode"))
                    action = build_action(row, None, [])
                    action["article"]["ingestion_run_id"] = run_id
                    actions.append(action)
            else:
                if not working_manifest:
                    # Existing rows are immutable. A no-op manifest remains
                    # auditable but must not create a zero-worker executor.
                    actions = []
                else:
                    gate = RobotGate()
                    with concurrent.futures.ThreadPoolExecutor(max_workers=min(HYDRATION_MAX_WORKERS, len(working_manifest))) as executor:
                        hydration_futures = [executor.submit(hydrate, item, source, gate) for item in working_manifest]
                        hydrated = [future.result() for future in hydration_futures]
                    eligible_hydrated: list[HydratedArticle] = []
                    for row in hydrated:
                        body_scope = exclusion_decision(row.candidate, canary_config, redistricting_config, row.body_text or "")
                        if body_scope:
                            exclusion_tag, scope_reason, requires_owner_review = body_scope
                            counters[exclusion_tag] += 1
                            journal.log_exclusion(batch_number, row.candidate, exclusion_tag, scope_reason)
                            if requires_owner_review:
                                raise ScopeHold(f"{scope_reason}: {row.candidate.title} — {row.candidate.url}")
                            continue
                        if row.error:
                            counters["hydrate_skipped"] += 1
                            journal.log_exclusion(batch_number, row.candidate, "hydrate_skipped", row.error)
                        eligible_hydrated.append(row)
                    extracted = extract_batch(eligible_hydrated, journal, batch_number)
                    actions = []
                    for row in eligible_hydrated:
                        output, validation_errors = extracted.get(row.candidate.url, (None, []))
                        action = build_action(row, output, validation_errors)
                        action["article"]["ingestion_run_id"] = run_id
                        actions.append(action)
                        if output is not None:
                            counters["extracted"] += 1
                            if validation_errors:
                                counters["extraction_pruned"] += 1
                        elif row.body_text:
                            counters["extraction_failed"] += 1
                    # Only publisher bodies offered to the extractor enter the
                    # rolling quality window. Robots, canary, duplicate, and
                    # no-body skips are independently logged but cannot inflate it.
                    for row in eligible_hydrated:
                        if not row.body_text:
                            continue
                        output, _ = extracted.get(row.candidate.url, (None, []))
                        extraction_failure_window.append(0 if output is not None else 1)
            if writer:
                inserted = writer.write_batch(run_id, batch_number, source["source_key"], actions)
                counters["inserted"] += inserted
                journal.note(batch_number, "written", f"{inserted} new articles; {len(actions) - inserted} duplicate race/no-op")
            else:
                spool = write_spool(journal, batch_number, source["source_key"], actions, manifest)
                counters["spooled"] += len(actions)
                journal.note(batch_number, "spooled", f"{len(actions)} actions written to {spool.name}; no database rows written")
            if len(extraction_failure_window) == FAILURE_WINDOW_SIZE and rolling_failure_rate(extraction_failure_window) > FAILURE_RATE_CIRCUIT_BREAKER:
                rate = rolling_failure_rate(extraction_failure_window)
                circuit_breaker_note = (
                    f"quality circuit breaker paused the run: {sum(extraction_failure_window)}/{FAILURE_WINDOW_SIZE} "
                    f"publisher-body extractions failed ({rate:.1%}), exceeding the {FAILURE_RATE_CIRCUIT_BREAKER:.0%} ceiling"
                )
                counters["failure_circuit_breaker_triggered"] += 1
                journal.note(batch_number, "circuit_breaker", circuit_breaker_note)
                if writer:
                    writer.finish_run(run_id, "completed_with_errors", dict(counters), circuit_breaker_note)
                print(json.dumps({"run_id": run_id, "state": "circuit_breaker", "counters": dict(counters), "detail": circuit_breaker_note, "run_dir": str(journal.path)}, indent=2))
                return 3
            # A single GDELT source can contribute successive <=10 manifests from
            # one dated response. Advance only after its final partial manifest;
            # multi-source runs retain the one-date-per-full-source-cycle cursor.
            if (len(sources) == 1 and len(manifest) < MAX_MANIFEST_SIZE) or (len(sources) > 1 and source_index == len(sources) - 1):
                day_offset += 1
            # GDELT DOC 2.0 is rate limited. BigQuery discovery is guarded by
            # date partitions and maximum bytes billed instead; cached records are
            # independently capped at ten per database manifest in every path.
            if fetched_this_cycle and source["source_type"] == "gdelt_doc_api":
                time.sleep(args.request_interval_seconds)
        state = "completed"
        if writer:
            writer.finish_run(run_id, state, dict(counters), "Completed without auto-promoting cross-surface candidates.")
        journal.note(None, state, json.dumps(dict(counters), sort_keys=True))
        print(json.dumps({"run_id": run_id, "state": state, "counters": dict(counters), "run_dir": str(journal.path)}, indent=2))
        return 0
    except Exception as exc:
        journal.log_failure(None, None, "run", f"{type(exc).__name__}: {exc}")
        if writer:
            try:
                writer.finish_run(run_id, "failed", dict(counters), f"{type(exc).__name__}: {exc}")
            except Exception:
                pass
        raise


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=["discover", "backfill"], default="backfill")
    parser.add_argument("--target", type=int, default=10_000, help="Target new rows for direct runs or manifested rows for spool runs; no padding if fewer real records are found.")
    parser.add_argument("--window-days", type=int, default=365, help="Discover from today backwards over this many days.")
    parser.add_argument("--batch-size", type=int, default=MAX_MANIFEST_SIZE, help="Hard ceiling; values other than 10 are rejected.")
    parser.add_argument("--max-manifests", type=int, default=0, help="Optional run guard; 0 means no additional manifest cap.")
    parser.add_argument("--source", action="append", choices=sorted(FALLBACK_SOURCES), help="Restrict to one approved source key; may repeat.")
    parser.add_argument("--write-mode", choices=["spool", "direct"], default="spool", help="Spool is write-free; direct requires the isolated RPC public-key/run-key pair.")
    parser.add_argument("--request-interval-seconds", type=float, default=5.0, help="Minimum GDELT DOC 2.0 public-endpoint pacing interval; BigQuery uses partition and byte guards instead.")
    parser.add_argument("--run-id", help="Optional idempotent run label; must not be a held Doc 07 tag.")
    args = parser.parse_args(argv)
    if args.run_id and args.run_id in set(load_canary_config().get("held_run_tags", [])):
        parser.error("The requested run id is a held Doc 07 canary tag and cannot be used by this pipeline.")
    return args


if __name__ == "__main__":
    try:
        raise SystemExit(run(parse_args(sys.argv[1:])))
    except ScopeHold as exc:
        print(f"scope hold: {exc}", file=sys.stderr)
        raise SystemExit(2)
    except Exception as exc:
        print(f"pipeline failed: {type(exc).__name__}: {exc}", file=sys.stderr)
        raise SystemExit(1)
