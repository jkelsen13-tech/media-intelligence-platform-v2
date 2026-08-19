"""Focused contracts for the provenance-first isolated-v2 ingestion worker."""

from __future__ import annotations

import unittest

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
