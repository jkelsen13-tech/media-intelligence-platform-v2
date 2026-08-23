#!/usr/bin/env python3
"""Inspect one complete GDELT 1.0 daily event export without writing to MIP tables."""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import zipfile
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse


def clean(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "")).strip()


def valid_url(value: str | None) -> bool:
    parsed = urlparse((value or "").strip())
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    args = parser.parse_args()

    total = 0
    valid = 0
    unique_urls: set[str] = set()
    event_codes: Counter[str] = Counter()
    root_codes: Counter[str] = Counter()
    examples: list[dict[str, str]] = []

    with zipfile.ZipFile(args.input) as archive:
        names = archive.namelist()
        if len(names) != 1:
            raise RuntimeError(f"expected exactly one event TSV in archive, found {names}")
        with archive.open(names[0]) as raw:
            reader = csv.reader((line.decode("utf-8", "replace") for line in raw), delimiter="\t")
            for row in reader:
                total += 1
                if len(row) < 58:
                    continue
                source_url = clean(row[57])
                if not valid_url(source_url):
                    continue
                valid += 1
                unique_urls.add(source_url)
                event_codes[clean(row[26])] += 1
                root_codes[clean(row[28])] += 1
                if len(examples) < 5:
                    examples.append(
                        {
                            "gdelt_event_id": clean(row[0]),
                            "event_date": clean(row[1]),
                            "actor1_name": clean(row[6]),
                            "actor2_name": clean(row[16]),
                            "event_code": clean(row[26]),
                            "event_root_code": clean(row[28]),
                            "source_url": source_url,
                        }
                    )

    report = {
        "total_event_rows": total,
        "rows_with_valid_source_url": valid,
        "unique_source_urls": len(unique_urls),
        "event_code_counts": event_codes.most_common(),
        "event_root_code_counts": root_codes.most_common(),
        "examples": examples,
    }
    args.report.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
