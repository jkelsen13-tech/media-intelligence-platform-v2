"""Focused contracts for the provenance-first isolated-v2 ingestion worker."""

from __future__ import annotations

import unittest
from collections import deque
import os
from unittest.mock import patch

import ingestion_pipeline as pipeline


class IngestionPipelineContractTests(unittest.TestCase):
    def test_manifest_ceiling_is_fixed_at_ten(self) -> None:
        self.assertEqual(pipeline.MAX_MANIFEST_SIZE, 10)

    def test_gdelt_is_discovery_only_under_approved_catalog(self) -> None:
        for key in (
            "gdelt-public-news-discovery",
            "gdelt-reuters-original-url-discovery",
            "gdelt-ap-original-url-discovery",
        ):
            self.assertFalse(pipeline.FALLBACK_SOURCES[key]["allow_body_fetch"])

    def test_bigquery_source_is_publisher_hydration_capable_but_metadata_only(self) -> None:
        source = pipeline.FALLBACK_SOURCES["gdelt-bigquery-gkg-discovery"]
        self.assertEqual(source["source_type"], "gdelt_bigquery")
        self.assertTrue(source["allow_body_fetch"])
        self.assertEqual(source["source_url"], "bigquery://gdelt-bq.gdeltv2.gkg_partitioned")

    def test_bigquery_timestamp_requires_strict_gkg_shape(self) -> None:
        self.assertEqual(
            pipeline.parse_gdelt_bigquery_timestamp(20260819010203),
            "2026-08-19T01:02:03Z",
        )
        self.assertIsNone(pipeline.parse_gdelt_bigquery_timestamp("20260819"))
        self.assertIsNone(pipeline.parse_gdelt_bigquery_timestamp(None))

    def test_independent_callais_and_redistricting_exclusions_preserve_ambiguity(self) -> None:
        canary = {"protected_urls": []}
        redistricting = {
            "subject_patterns": ["redistrict", "gerrymander", "district map"],
            "political_process_patterns": ["authoritarianism", "democratic backsliding", "voting rights", "election administration"],
            "figure_claim_patterns": ["said", "says", "claimed", "claims", "warned", "argued", "told", "called"],
            "lead_character_limit": 1200,
        }

        def candidate(title: str, summary: str | None = None) -> pipeline.ArticleCandidate:
            return pipeline.ArticleCandidate(
                source_key="gdelt-bigquery-gkg-discovery",
                feed="gdelt-bigquery-gkg",
                source_label="GDELT BigQuery GKG original-URL discovery",
                url="https://example.org/" + title.lower().replace(" ", "-"),
                title=title,
                outlet="example.org",
                published_at="2026-08-19T00:00:00Z",
                summary=summary,
            )

        direct_callais = pipeline.exclusion_decision(candidate("Louisiana v. Callais court update"), canary, redistricting)
        self.assertEqual(direct_callais[0], "callais_canary_hold")
        self.assertFalse(direct_callais[2])

        redistricting_only = pipeline.exclusion_decision(candidate("State unveils new district maps", "The voting rights dispute centers on redistricting."), canary, redistricting)
        self.assertEqual(redistricting_only[0], "redistricting_adjacent_hold")
        self.assertFalse(redistricting_only[2])

        overlap = pipeline.exclusion_decision(candidate("Louisiana v. Callais district map appeal"), canary, redistricting)
        self.assertEqual(overlap[0], "ambiguous_between_categories_hold")
        self.assertTrue(overlap[2])

        routine_administration = pipeline.exclusion_decision(candidate("County announces early voting locations", "The election administrator said polling places will open on time."), canary, redistricting)
        self.assertIsNone(routine_administration)

    def test_rolling_failure_rate_uses_only_bounded_window_values(self) -> None:
        failures = deque(([1] * 31) + ([0] * 69), maxlen=pipeline.FAILURE_WINDOW_SIZE)
        self.assertEqual(len(failures), pipeline.FAILURE_WINDOW_SIZE)
        self.assertGreater(pipeline.rolling_failure_rate(failures), pipeline.FAILURE_RATE_CIRCUIT_BREAKER)
        threshold = deque(([1] * 30) + ([0] * 70), maxlen=pipeline.FAILURE_WINDOW_SIZE)
        self.assertEqual(pipeline.rolling_failure_rate(threshold), pipeline.FAILURE_RATE_CIRCUIT_BREAKER)

    def test_transient_extraction_timeout_is_retried_within_article_budget(self) -> None:
        candidate = pipeline.ArticleCandidate(
            source_key="gdelt-bigquery-gkg-discovery",
            feed="gdelt-bigquery-gkg",
            source_label="GDELT BigQuery GKG original-URL discovery",
            url="https://example.org/article",
            title="Example article",
            outlet="example.org",
            published_at="2026-08-19T00:00:00Z",
            summary=None,
        )
        hydrated = pipeline.HydratedArticle(candidate, "A source-bounded publisher body.", None, None, "test")

        class StubResponse:
            def raise_for_status(self) -> None:
                return None

            def json(self) -> dict:
                return {
                    "choices": [
                        {"message": {"content": '{"claims":[],"citations":[],"locations":[],"cross_surface":[]}'}}
                    ]
                }

        with (
            patch.dict(os.environ, {"OPENAI_API_BASE": "https://proxy.example", "OPENAI_API_KEY": "test-key"}),
            patch.object(
                pipeline.requests,
                "post",
                side_effect=[pipeline.requests.exceptions.Timeout("simulated transient timeout"), StubResponse()],
            ) as post,
            patch.object(pipeline.time, "sleep") as pause,
        ):
            output, warnings = pipeline.run_extraction(hydrated)
        self.assertEqual(post.call_count, 2)
        self.assertEqual(post.call_args.kwargs["timeout"], (10, pipeline.EXTRACTION_REQUEST_TIMEOUT_SECONDS))
        pause.assert_called_once_with(1)
        self.assertEqual(warnings, [])
        self.assertEqual(output, {"claims": [], "citations": [], "locations": [], "cross_surface": []})

    def test_batch_extraction_maps_each_record_by_exact_url(self) -> None:
        candidate = pipeline.ArticleCandidate(
            source_key="gdelt-bigquery-gkg-discovery",
            feed="gdelt-bigquery-gkg",
            source_label="GDELT BigQuery GKG original-URL discovery",
            url="https://example.org/batch-record",
            title="Batch record",
            outlet="example.org",
            published_at="2026-08-19T00:00:00Z",
            summary=None,
        )
        hydrated = pipeline.HydratedArticle(candidate, "A source-bounded publisher body.", None, None, "test")

        class StubResponse:
            def raise_for_status(self) -> None:
                return None

            def json(self) -> dict:
                return {
                    "choices": [
                        {
                            "message": {
                                "content": (
                                    '{"items":[{"record_url":"https://example.org/batch-record",'
                                    '"output":{"claims":[],"citations":[],"locations":[],"cross_surface":[]}}]}'
                                )
                            }
                        }
                    ]
                }

        with (
            patch.dict(os.environ, {"OPENAI_API_BASE": "https://proxy.example", "OPENAI_API_KEY": "test-key"}),
            patch.object(pipeline.requests, "post", return_value=StubResponse()) as post,
        ):
            results = pipeline.run_batch_extraction([hydrated])
        output, warnings = results[candidate.url]
        self.assertEqual(warnings, [])
        self.assertEqual(output, {"claims": [], "citations": [], "locations": [], "cross_surface": []})
        self.assertEqual(post.call_args.kwargs["timeout"], (10, 75))
        self.assertEqual(post.call_args.kwargs["json"]["response_format"]["json_schema"]["name"], "mip_batch_article_provenance_extraction")

    def test_deterministic_literal_extractor_keeps_supported_claim_framing_and_citation_spans(self) -> None:
        body = (
            "The National Weather Service said the unprecedented storm damaged more than 100 homes in the county. "
            "A report by the National Weather Service found that emergency crews restored power by noon."
        )
        candidate = pipeline.ArticleCandidate(
            source_key="gdelt-bigquery-gkg-discovery",
            feed="gdelt-bigquery-gkg",
            source_label="GDELT BigQuery GKG original-URL discovery",
            url="https://example.org/deterministic-record",
            title="Deterministic record",
            outlet="example.org",
            published_at="2026-08-19T00:00:00Z",
            summary=None,
        )
        hydrated = pipeline.HydratedArticle(candidate, body, None, None, "test")
        output, warnings = pipeline.deterministic_literal_extraction(hydrated)
        self.assertEqual(warnings, [])
        assert output is not None
        self.assertTrue(any(item["kind"] == "substantive" for item in output["claims"]))
        self.assertTrue(any(item["kind"] == "framing" and "unprecedented" in item["loaded_language"] for item in output["claims"]))
        self.assertEqual(output["citations"][0]["cited_entity"], "National Weather Service")
        for group, field in ((output["claims"], "text"), (output["citations"], "evidence_text")):
            for item in group:
                self.assertEqual(body[item["start"]:item["end"]], item[field])

    def test_literal_span_is_repaired_only_when_unique(self) -> None:
        body = "Alpha source sentence. Beta source sentence."
        output = {
            "claims": [{"kind": "substantive", "text": "Beta source sentence.", "start": 0, "end": 1, "stance": "reports", "loaded_language": []}],
            "citations": [],
            "locations": [],
            "cross_surface": [],
        }
        normalized = pipeline.normalize_literal_spans(body, output)
        claim = normalized["claims"][0]
        self.assertEqual(body[claim["start"]:claim["end"]], "Beta source sentence.")
        self.assertEqual(pipeline.validate_extraction(body, normalized), [])

    def test_invalid_item_is_pruned_without_erasing_grounded_claim(self) -> None:
        body = "A reviewed statement is present in the publisher record."
        output = {
            "claims": [{"kind": "substantive", "text": "A reviewed statement is present in the publisher record.", "start": 0, "end": len(body), "stance": "reports", "loaded_language": []}],
            "citations": [],
            "locations": [{"mention_text": "Absent place", "start": 0, "end": 12, "location_role": "context"}],
            "cross_surface": [],
        }
        cleaned, warnings = pipeline.sanitize_extraction(body, output)
        self.assertIsNotNone(cleaned)
        self.assertEqual(len(cleaned["claims"]), 1)
        self.assertEqual(cleaned["locations"], [])
        self.assertIn("locations_0_span", warnings)

    def test_repeated_literal_is_not_silently_grounded(self) -> None:
        body = "Repeated literal. Repeated literal."
        self.assertIsNone(pipeline.locate_literal_span(body, "Repeated literal."))

    def test_direct_call_rejects_any_other_batch_size(self) -> None:
        with self.assertRaises(ValueError):
            pipeline.run(pipeline.parse_args(["--target", "1", "--window-days", "1", "--batch-size", "9"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
