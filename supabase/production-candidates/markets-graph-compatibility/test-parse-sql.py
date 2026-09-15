"""Focused fail-closed input tests; hosted CI runs normally and with python -O."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("markets_parse_sql", ROOT / "parse-sql.py")
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


class ParserGateTests(unittest.TestCase):
    def source(self, name):
        return (ROOT / name).read_text(encoding="utf-8")

    def reject(self, name, source, message):
        with self.assertRaisesRegex(gate.CandidateError, message):
            gate.prepare_sql(name, source)

    def test_exact_candidate_parses_all_seven_files(self):
        self.assertEqual(set(gate.parse_candidate(ROOT)), set(gate.EXPECTED_SQL_FILES))
        self.assertEqual(len(gate.EXPECTED_SQL_FILES), 7)

    def test_manifest_rejects_missing_extra_and_nested_sql(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaisesRegex(gate.CandidateError, "manifest mismatch"):
                gate.candidate_files(root)
            for name in gate.EXPECTED_SQL_FILES:
                (root / name).write_text("select 1;", encoding="utf-8")
            self.assertEqual(len(gate.candidate_files(root)), 7)
            for relative in ("unexpected.sql", "nested/unexpected.sql"):
                with self.subTest(relative=relative):
                    path = root / relative
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_text("select 1;", encoding="utf-8")
                    with self.assertRaisesRegex(gate.CandidateError, "unexpected="):
                        gate.candidate_files(root)
                    path.unlink()
            (root / gate.EXPECTED_SQL_FILES[0]).unlink()
            with self.assertRaisesRegex(gate.CandidateError, "missing="):
                gate.candidate_files(root)

    def test_manifest_rejects_directory_as_sql_file(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in gate.EXPECTED_SQL_FILES:
                (root / name).write_text("select 1;", encoding="utf-8")
            path = root / gate.EXPECTED_SQL_FILES[0]
            path.unlink()
            path.mkdir()
            with self.assertRaisesRegex(gate.CandidateError, "regular"):
                gate.candidate_files(root)

    def test_manifest_rejects_symlink(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in gate.EXPECTED_SQL_FILES:
                (root / name).write_text("select 1;", encoding="utf-8")
            path = root / gate.EXPECTED_SQL_FILES[0]
            path.unlink()
            path.symlink_to(root / gate.EXPECTED_SQL_FILES[1])
            with self.assertRaisesRegex(gate.CandidateError, "non-symlink"):
                gate.candidate_files(root)

    def test_unknown_filename_fails(self):
        self.reject("unexpected.sql", "select 1;", "Unexpected SQL file")

    def test_unknown_and_cross_file_directives_fail(self):
        for directive in (r"\echo hidden", r"\! whoami", r"\ir indexes.sql",
                          r"\set ON_ERROR_STOP on", r"\gexec"):
            with self.subTest(directive=directive):
                self.reject("acl-and-absence.sql", directive, "unexpected psql")

    def test_include_targets_and_extra_tokens_fail(self):
        source = self.source("verifier.sql")
        for replacement in (r"\ir ../compatibility.sql", r"\ir /tmp/compatibility.sql",
                            r"\ir indexes.sql", r"\ir compatibility.sql extra",
                            r"\ir compatibility.sql \! whoami",
                            r"\ir 'compatibility.sql'", r"\ir " + chr(96) + "whoami" + chr(96)):
            with self.subTest(replacement=replacement):
                self.reject("verifier.sql", source.replace(r"\ir compatibility.sql", replacement),
                            "unexpected psql")

    def test_set_names_values_and_extra_tokens_fail(self):
        for replacement in (r"\set ON_ERROR_STOP off", r"\set ON_ERROR_STOP on extra",
                            r"\set OTHER on", r"\set ON_ERROR_STOP " + chr(96) + "whoami" + chr(96)):
            with self.subTest(replacement=replacement):
                self.reject("compatibility.sql",
                            self.source("compatibility.sql").replace(r"\set ON_ERROR_STOP on", replacement),
                            "unexpected psql")
        self.reject("verifier.sql",
                    self.source("verifier.sql").replace(
                        r"\set requested_index market_graph_edges_source",
                        r"\set requested_index unreviewed"),
                    "unexpected psql")

    def test_missing_duplicate_and_reordered_directives_fail(self):
        source = self.source("verifier.sql")
        self.reject("verifier.sql", source.replace(r"\ir acl-and-absence.sql", ""),
                    "missing psql")
        self.reject("verifier.sql", source.replace(r"\ir compatibility.sql",
                    "\\ir compatibility.sql\n\\ir compatibility.sql"), "unexpected psql")
        self.reject("verifier.sql", source.replace(r"\ir spatial-fixture.sql",
                    r"\ir acl-and-absence.sql"), "unexpected psql")

    def test_gexec_requires_full_exact_directive(self):
        for replacement in (r"\gexec_suffix", r"\gexec extra", r"\gexec \! whoami"):
            with self.subTest(replacement=replacement):
                self.reject("indexes.sql", self.source("indexes.sql").replace(r"\gexec", replacement),
                            "unexpected psql")

    def test_lone_dollar_delimiters_fail(self):
        for source in ("do $ begin null; end $$;", "end $;"):
            with self.subTest(source=source):
                self.reject("acl-and-absence.sql", source, "lone dollar")

    def test_placeholder_count_and_location_fail(self):
        self.reject("indexes.sql", self.source("indexes.sql").replace(":'requested_index'", "'x'"),
                    "placeholder count")
        self.reject("acl-and-absence.sql", "select :'requested_index';", "placeholder count")

    def test_invalid_outer_sql_and_empty_file_fail(self):
        for source, message in (("select from;", "outer SQL parse failed"),
                                ("-- comment only\n", "no outer SQL statements")):
            with self.subTest(source=source), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                for name in gate.EXPECTED_SQL_FILES:
                    (root / name).write_text(self.source(name), encoding="utf-8")
                (root / "acl-and-absence.sql").write_text(source, encoding="utf-8")
                with self.assertRaisesRegex(gate.CandidateError, message):
                    gate.parse_candidate(root)


if __name__ == "__main__":
    unittest.main(verbosity=2)
