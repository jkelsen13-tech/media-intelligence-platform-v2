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
* Direct REST writes require an isolated-v2 service key. Without it, spool mode
  creates immutable per-manifest action files for review/apply through the
  isolated database control path; it does not silently target the browser key.

Environment for --write-mode direct (never commit values):
  MIP_V2_SUPABASE_URL=https://yhbwnrtlqbjtcrrlpbge.supabase.co
  MIP_V2_SERVICE_ROLE_KEY=<isolated v2 service role key>

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
from collections import Counter
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup
from openai import OpenAI

ROOT = Path(__file__).resolve().parents[1]
RUN_ROOT = ROOT / "verifier" / "ingestion_runs"
EXCLUSION_CONFIG = ROOT / "verifier" / "doc07_canary_exclusions.json"
ISOLATED_PROJECT_REF = "yhbwnrtlqbjtcrrlpbge"
ALGORITHM_VERSION = "provenance-first-v2.1"
EXTRACTION_MODEL = "gpt-5-mini"
MAX_MANIFEST_SIZE = 10
MAX_BODY_CHARS = 24_000
MAX_EXTRACTION_CHARS = 6_000
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
        "allow_body_fetch": True,
    },
    "gdelt-reuters-original-url-discovery": {
        "source_key": "gdelt-reuters-original-url-discovery",
        "label": "GDELT DOC 2.0 — Reuters original-URL discovery",
        "source_url": "https://api.gdeltproject.org/api/v2/doc/doc",
        "source_type": "gdelt_doc_api",
        "feed": "gdelt-reuters-discovery",
        "query": "domainis:reuters.com",
        "allow_body_fetch": True,
    },
    "gdelt-ap-original-url-discovery": {
        "source_key": "gdelt-ap-original-url-discovery",
        "label": "GDELT DOC 2.0 — AP original-URL discovery",
        "source_url": "https://api.gdeltproject.org/api/v2/doc/doc",
        "source_type": "gdelt_doc_api",
        "feed": "gdelt-ap-discovery",
        "query": "domainis:apnews.com",
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

EXTRACTION_SYSTEM = """You extract source-bounded candidates from a single stored publisher record.
Return only items whose exact evidence substring is present in the supplied text at
the supplied half-open character span. Do not repair, paraphrase, infer, or add
context. A substantive claim must be a specific proposition stated or attributed
by the publisher record. A framing marker must be a literal rhetorical choice,
not a neutrality, truth, or bias conclusion. A citation is only an explicitly
named source, document, study, official, or prior reporting reference; do not
turn the publisher itself into a citation. A cross-surface item is a REVIEW-PENDING
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

    def combined_text(self) -> str:
        return "\n".join(part for part in (self.title, self.summary or "", self.url) if part)


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


def source_note(source: dict[str, Any], hydrated: bool, detail: str) -> str:
    status = "publisher HTML hydrated" if hydrated else "publisher body not hydrated"
    return (
        f"Discovery provenance: {source['label']} ({source['source_key']}); original publisher URL recorded. "
        f"{status}: {detail}. This record does not establish source independence or an evidentiary conclusion."
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


def canary_decision(candidate: ArticleCandidate, config: dict[str, Any], additional_text: str = "") -> tuple[str, str] | None:
    """Return ('skip'|'hold', reason). Exact case material skips; adjacent scope holds.

    The same gate is called before discovery is manifested and again after public
    HTML hydration. A protected term in article body text therefore cannot reach
    extraction merely because it was absent from a headline or RSS description.
    """
    normalized_url = normalize_url(candidate.url)
    protected_urls = {normalize_url(str(item)) for item in config.get("protected_urls", [])}
    if normalized_url in protected_urls:
        return "skip", "Doc 07 protected URL manifest match"
    text = (candidate.combined_text() + "\n" + additional_text).casefold()
    if re.search(r"\bcallais\b", text) or "louisiana v. callais" in text:
        return "skip", "Document 07 / Louisiana v. Callais direct match"
    has_louisiana_redistricting = "louisiana" in text and "redistrict" in text
    has_vra_redistricting = ("voting rights act" in text or "vra section 2" in text) and "redistrict" in text
    if has_louisiana_redistricting or has_vra_redistricting:
        return "hold", "Canary-adjacent redistricting material requires explicit owner scope decision"
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
                time.sleep(min(60, 2 ** (attempt + 1)))
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


def run_extraction(client: OpenAI, hydrated: HydratedArticle) -> tuple[dict[str, Any] | None, list[str]]:
    assert hydrated.body_text is not None
    body = hydrated.body_text[:MAX_EXTRACTION_CHARS]
    prompt = (
        f"Publisher: {hydrated.candidate.outlet}\n"
        f"Title: {hydrated.candidate.title}\n"
        f"Original URL: {hydrated.candidate.url}\n\n"
        "Stored publisher text (character offsets are zero-based in this exact string):\n"
        f"{body}"
    )
    try:
        response = client.chat.completions.create(
            model=EXTRACTION_MODEL,
            messages=[
                {"role": "system", "content": EXTRACTION_SYSTEM},
                {"role": "user", "content": prompt},
            ],
            max_completion_tokens=1800,
            response_format={"type": "json_schema", "json_schema": EXTRACTION_SCHEMA},
        )
        content = response.choices[0].message.content
        output = json.loads(content or "{}")
        errors = validate_extraction(body, output)
        return output, errors
    except Exception as exc:  # network/model errors must become auditable failures, never implicit success
        return None, [f"model_error:{type(exc).__name__}:{str(exc)[:180]}"]


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
    """Minimal server-only REST writer. It refuses any non-isolated project URL."""

    def __init__(self) -> None:
        self.base = os.environ.get("MIP_V2_SUPABASE_URL", "").rstrip("/")
        self.key = os.environ.get("MIP_V2_SERVICE_ROLE_KEY", "")
        if ISOLATED_PROJECT_REF not in self.base or not self.key:
            raise RuntimeError(
                "Direct writes require MIP_V2_SUPABASE_URL for yhbwnrtlqbjtcrrlpbge and MIP_V2_SERVICE_ROLE_KEY. "
                "No public/production fallback is permitted."
            )
        self.headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
        }

    def _request(self, method: str, table: str, *, params: dict[str, str] | None = None, body: Any = None, prefer: str | None = None) -> Any:
        headers = dict(self.headers)
        if prefer:
            headers["Prefer"] = prefer
        response = requests.request(method, f"{self.base}/rest/v1/{table}", headers=headers, params=params, json=body, timeout=60)
        response.raise_for_status()
        if not response.content:
            return None
        return response.json()

    def start_run(self, run_id: str, mode: str, window_start: str, window_end: str) -> None:
        self._request(
            "POST",
            "ingestion_runs",
            body={
                "run_id": run_id,
                "mode": mode,
                "state": "running",
                "source_window_start": window_start,
                "source_window_end": window_end,
                "algorithm_version": ALGORITHM_VERSION,
                "model_id": EXTRACTION_MODEL,
                "counters": {},
                "notes": "Doc 07 canary exclusion and <=10 manifest ceiling enforced.",
            },
            prefer="resolution=merge-duplicates,return=minimal",
        )

    def finish_run(self, run_id: str, state: str, counters: dict[str, int], note: str | None = None) -> None:
        self._request(
            "PATCH",
            "ingestion_runs",
            params={"run_id": f"eq.{run_id}"},
            body={"state": state, "completed_at": datetime.now(UTC).isoformat(), "counters": counters, "notes": note},
            prefer="return=minimal",
        )

    def existing_urls(self, urls: list[str]) -> set[str]:
        if not urls:
            return set()
        value = "(" + ",".join(json.dumps(url) for url in urls) + ")"
        rows = self._request("GET", "articles", params={"select": "url", "url": f"in.{value}"}) or []
        return {str(row["url"]) for row in rows}

    def source_ids(self) -> dict[str, str]:
        rows = self._request("GET", "ingestion_sources", params={"select": "id,source_key", "active": "eq.true"}) or []
        return {str(row["source_key"]): str(row["id"]) for row in rows}

    def write_batch(self, run_id: str, batch_number: int, source_id: str | None, actions: list[dict[str, Any]]) -> int:
        # Only new URLs appear in actions. Discovery never updates historic rows.
        article_rows = [action["article"] for action in actions]
        inserted = self._request(
            "POST",
            "articles",
            params={"on_conflict": "url"},
            body=article_rows,
            prefer="resolution=ignore-duplicates,return=representation",
        ) or []
        inserted_by_url = {row["url"]: row["id"] for row in inserted}
        for action in actions:
            article_id = inserted_by_url.get(action["article"]["url"])
            if not article_id:
                continue
            extraction = action.get("extraction_result")
            if extraction:
                extraction["article_id"] = article_id
                self._request(
                    "POST",
                    "article_extraction_results",
                    params={"on_conflict": "article_id,algorithm_version,input_sha256"},
                    body=extraction,
                    prefer="resolution=ignore-duplicates,return=minimal",
                )
            citations = [{**citation, "article_id": article_id} for citation in action.get("citations", [])]
            if citations:
                self._request(
                    "POST",
                    "citations",
                    params={"on_conflict": "article_id,cited_entity,cited_type"},
                    body=citations,
                    prefer="resolution=ignore-duplicates,return=minimal",
                )
            candidates = [{**candidate, "article_id": article_id} for candidate in action.get("cross_surface_candidates", [])]
            if candidates:
                self._request("POST", "cross_surface_candidates", body=candidates, prefer="return=minimal")
        if source_id:
            self._request(
                "POST",
                "ingestion_checkpoints",
                params={"on_conflict": "run_id,source_id,checkpoint_key"},
                body={
                    "run_id": run_id,
                    "source_id": source_id,
                    "checkpoint_key": f"batch-{batch_number:05d}",
                    "cursor": {"batch": batch_number, "action_count": len(actions)},
                    "state": "completed",
                    "article_count": len(inserted),
                },
                prefer="resolution=merge-duplicates,return=minimal",
            )
        return len(inserted)


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
        "claims": normalized_claims(output) if output and not validation_errors else [],
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
        "state": "candidate" if not validation_errors else "failed",
        "validation_errors": validation_errors,
    }
    if validation_errors or output is None:
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
    return discover_rss(source)


def discover_until_manifest(
    source: dict[str, Any],
    day: date,
    seen_urls: set[str],
    config: dict[str, Any],
    journal: Journal,
    batch_number: int,
) -> list[ArticleCandidate]:
    manifest: list[ArticleCandidate] = []
    for candidate in fetch_source_batch(source, day):
        if candidate.url in seen_urls:
            journal.log_exclusion(batch_number, candidate, "duplicate_discovery_url", "URL already appeared in this run")
            continue
        seen_urls.add(candidate.url)
        decision = canary_decision(candidate, config)
        if decision:
            action, reason = decision
            journal.log_exclusion(batch_number, candidate, f"{action}_canary_scope", reason)
            if action == "hold":
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
    client = OpenAI()
    output: dict[str, tuple[dict[str, Any] | None, list[str]]] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=min(8, len(eligible))) as executor:
        futures = {executor.submit(run_extraction, client, row): row for row in eligible}
        for future in concurrent.futures.as_completed(futures):
            row = futures[future]
            try:
                result = future.result()
            except Exception as exc:  # defensive; run_extraction already catches expected errors
                result = (None, [f"worker_error:{type(exc).__name__}"])
            output[row.candidate.url] = result
            if result[1]:
                journal.log_failure(batch_number, row.candidate, "extract_or_validate", "; ".join(result[1]))
    return output


def run(args: argparse.Namespace) -> int:
    if args.batch_size != MAX_MANIFEST_SIZE:
        raise ValueError(f"The batch-size ceiling is hard-coded at {MAX_MANIFEST_SIZE}; received {args.batch_size}.")
    if args.target < 1:
        raise ValueError("target must be at least 1")
    if args.window_days < 1:
        raise ValueError("window-days must be at least 1")

    run_id = args.run_id or f"mip-v2-backfill-{datetime.now(UTC).strftime('%Y%m%dT%H%M%SZ')}-{uuid.uuid4().hex[:8]}"
    journal = Journal(run_id)
    config = load_canary_config()
    sources = [FALLBACK_SOURCES[key] for key in args.source] if args.source else [FALLBACK_SOURCES["gdelt-public-news-discovery"], FALLBACK_SOURCES["doj-press-release-rss"], FALLBACK_SOURCES["bbc-news-rss"], FALLBACK_SOURCES["npr-news-rss"]]
    writer = V2Database() if args.write_mode == "direct" else None
    now = datetime.now(UTC)
    window_start = (now - timedelta(days=args.window_days)).isoformat()
    if writer:
        writer.start_run(run_id, "backfill", window_start, now.isoformat())
    journal.note(None, "started", f"mode={args.mode}; target={args.target}; sources={','.join(source['source_key'] for source in sources)}; write_mode={args.write_mode}")

    counters: Counter[str] = Counter()
    seen_urls: set[str] = set()
    source_ids = writer.source_ids() if writer else {}
    batch_number = 0
    day_offset = 0
    source_cursor = 0
    try:
        while counters["manifested"] < args.target and day_offset < args.window_days:
            source = sources[source_cursor % len(sources)]
            day = (now - timedelta(days=day_offset)).date()
            if source_cursor % len(sources) == len(sources) - 1:
                day_offset += 1
            source_cursor += 1
            batch_number += 1
            if args.max_manifests and batch_number > args.max_manifests:
                journal.note(batch_number, "stopped", "configured maximum manifest count reached")
                break
            try:
                manifest = discover_until_manifest(source, day, seen_urls, config, journal, batch_number)
            except ScopeHold as exc:
                counters["scope_holds"] += 1
                journal.note(batch_number, "scope_hold", str(exc))
                if writer:
                    writer.finish_run(run_id, "completed_with_errors", dict(counters), str(exc))
                print(json.dumps({"run_id": run_id, "state": "scope_hold", "detail": str(exc), "run_dir": str(journal.path)}, indent=2))
                return 2
            if not manifest:
                journal.note(batch_number, "empty", f"no eligible records from {source['source_key']} for {day.isoformat()}")
                continue
            if len(manifest) > MAX_MANIFEST_SIZE:
                raise AssertionError("manifest ceiling breach")
            counters["manifested"] += len(manifest)
            journal.note(batch_number, "manifested", f"{len(manifest)} articles from {source['source_key']} for {day.isoformat()}")
            if args.mode == "discover":
                actions = []
                for item in manifest:
                    row = HydratedArticle(item, None, None, None, source_note(source, False, "discovery-only mode"))
                    action = build_action(row, None, [])
                    action["article"]["ingestion_run_id"] = run_id
                    actions.append(action)
            else:
                gate = RobotGate()
                hydrated = [hydrate(item, source, gate) for item in manifest]
                eligible_hydrated: list[HydratedArticle] = []
                for row in hydrated:
                    body_scope = canary_decision(row.candidate, config, row.body_text or "")
                    if body_scope:
                        scope_action, scope_reason = body_scope
                        journal.log_exclusion(batch_number, row.candidate, f"{scope_action}_canary_scope", scope_reason)
                        if scope_action == "hold":
                            raise ScopeHold(f"{scope_reason}: {row.candidate.title} — {row.candidate.url}")
                        counters["canary_body_excluded"] += 1
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
                    if output and not validation_errors:
                        counters["extracted"] += 1
                    elif row.body_text:
                        counters["extraction_failed"] += 1
            if writer:
                existing = writer.existing_urls([action["article"]["url"] for action in actions])
                new_actions = []
                for action in actions:
                    url = action["article"]["url"]
                    if url in existing:
                        counters["preexisting_skipped"] += 1
                        match = next(item for item in manifest if item.url == url)
                        journal.log_exclusion(batch_number, match, "preexisting_article", "existing row is immutable to this backfill")
                    else:
                        new_actions.append(action)
                inserted = writer.write_batch(run_id, batch_number, source_ids.get(source["source_key"]), new_actions)
                counters["inserted"] += inserted
                journal.note(batch_number, "written", f"{inserted} new articles; {len(new_actions) - inserted} duplicate race/no-op")
            else:
                spool = write_spool(journal, batch_number, source["source_key"], actions, manifest)
                counters["spooled"] += len(actions)
                journal.note(batch_number, "spooled", f"{len(actions)} actions written to {spool.name}; no database rows written")
            # GDELT is rate limited. All public endpoint calls receive an explicit pacing interval.
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
    parser.add_argument("--target", type=int, default=10_000, help="Maximum new records to manifest; no padding if fewer real records are found.")
    parser.add_argument("--window-days", type=int, default=365, help="Discover from today backwards over this many days.")
    parser.add_argument("--batch-size", type=int, default=MAX_MANIFEST_SIZE, help="Hard ceiling; values other than 10 are rejected.")
    parser.add_argument("--max-manifests", type=int, default=0, help="Optional run guard; 0 means no additional manifest cap.")
    parser.add_argument("--source", action="append", choices=sorted(FALLBACK_SOURCES), help="Restrict to one approved source key; may repeat.")
    parser.add_argument("--write-mode", choices=["spool", "direct"], default="spool", help="Spool is write-free; direct requires isolated-v2 service credentials.")
    parser.add_argument("--request-interval-seconds", type=float, default=2.0, help="Minimum public-endpoint pacing interval.")
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
