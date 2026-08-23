#!/usr/bin/env python3
"""Build deterministic MIP v2 GDELT staging batches from one daily Event export."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import zipfile
from collections import OrderedDict
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlparse, urlunparse

PROJECT_ID = "yhbwnrtlqbjtcrrlpbge"
SOURCE_ID = "gdelt-event-daily-export"


def clean(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "")).strip()


def normalize_url(value: str) -> str:
    parsed = urlparse(value.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return ""
    host = parsed.netloc.lower()
    if host.startswith("www."):
        host = host[4:]
    path = parsed.path or "/"
    return urlunparse((parsed.scheme.lower(), host, path, parsed.params, parsed.query, ""))


def source_domain(url: str) -> str:
    return urlparse(url).netloc.lower().removeprefix("www.")


def is_scope_excluded(row: list[str]) -> bool:
    # The source export has structured metadata only, so preserve the existing
    # hard direct exclusion posture without pretending it is a complete article
    # text review. A true match is withheld rather than materialized.
    haystack = " ".join(clean(row[index]) for index in (6, 16, 57) if index < len(row)).casefold()
    return "callais" in haystack or "louisiana-v-callais" in haystack


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--source-uri", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--batch-size", type=int, required=True)
    parser.add_argument("--offset", type=int, default=0)
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()
    if not 1 <= args.batch_size <= 1000:
        raise SystemExit("batch-size must be 1..1000")
    if args.offset < 0 or args.limit < 0:
        raise SystemExit("offset and limit must be non-negative")

    archive_digest = hashlib.sha256(args.input.read_bytes()).hexdigest()
    fetched_at = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    deduped: OrderedDict[str, dict[str, object]] = OrderedDict()
    excluded_direct = 0

    with zipfile.ZipFile(args.input) as archive:
        names = archive.namelist()
        if len(names) != 1:
            raise RuntimeError(f"expected one TSV member, found {names}")
        with archive.open(names[0]) as raw:
            reader = csv.reader((line.decode("utf-8", "replace") for line in raw), delimiter="\t")
            for row in reader:
                if len(row) < 58 or is_scope_excluded(row):
                    if len(row) >= 58 and is_scope_excluded(row):
                        excluded_direct += 1
                    continue
                event_id = clean(row[0])
                event_date = clean(row[1])
                url = normalize_url(clean(row[57]))
                if not event_id or not url:
                    continue
                item = deduped.get(url)
                if item is None:
                    item = {
                        "gdelt_event_id": event_id,
                        "gdelt_event_date": event_date,
                        "source_url": url,
                        "source_domain": source_domain(url),
                        "actor1_name": clean(row[6]) or None,
                        "actor2_name": clean(row[16]) or None,
                        "event_code": clean(row[26]) or None,
                        "event_root_code": clean(row[28]) or None,
                        "provenance": {
                            "source_id": SOURCE_ID,
                            "source_uri": args.source_uri,
                            "archive_sha256": archive_digest,
                            "fetched_at": fetched_at,
                            "related_gdelt_event_ids": [event_id],
                            "event_export_schema": "GDELT 1.0 Events 58-column TSV",
                        },
                    }
                    deduped[url] = item
                else:
                    related = item["provenance"]["related_gdelt_event_ids"]  # type: ignore[index]
                    if event_id not in related and len(related) < 20:
                        related.append(event_id)

    records = list(deduped.values())
    total = len(records)
    records = records[args.offset:]
    if args.limit:
        records = records[:args.limit]
    args.out_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        "run_id": args.run_id,
        "source_id": SOURCE_ID,
        "source_uri": args.source_uri,
        "archive_sha256": archive_digest,
        "fetched_at": fetched_at,
        "unique_source_urls": total,
        "direct_scope_excluded_event_rows": excluded_direct,
        "offset": args.offset,
        "selected": len(records),
        "batch_size": args.batch_size,
    }
    (args.out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    for number, start in enumerate(range(0, len(records), args.batch_size), start=1):
        chunk = records[start:start + args.batch_size]
        run_literal = "'" + args.run_id.replace("'", "''") + "'"
        records_literal = "'" + json.dumps(chunk, separators=(",", ":"), ensure_ascii=False).replace("'", "''") + "'::jsonb"
        query = "select public.mip_v2_gdelt_stage_batch(" + run_literal + ", " + records_literal + ") as result limit 1;"
        payload = {"project_id": PROJECT_ID, "query": query}
        (args.out_dir / f"stage-{number:04d}.json").write_text(json.dumps(payload, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
