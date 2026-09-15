"""Outer SQL parser only; no database connections or psql execution.

Install parser-requirements.txt in the pinned hosted CI environment. This checks
the exact seven-file inventory and an intentionally strict, ordered per-file psql
directive allowlist. PL/pgSQL, generated SQL and catalog/runtime semantics still
require independent PostgreSQL qualification.
"""
from pathlib import Path
import re

EXPECTED_SQL_FILES = (
    "acl-and-absence.sql",
    "compatibility.sql",
    "index-recovery.sql",
    "indexes.sql",
    "security-fingerprint.sql",
    "spatial-fixture.sql",
    "verifier.sql",
)
EXPECTED_DIRECTIVES = {
    "acl-and-absence.sql": (),
    "compatibility.sql": (r"\set ON_ERROR_STOP on",),
    "index-recovery.sql": (r"\set ON_ERROR_STOP on", r"\gexec"),
    "indexes.sql": (r"\set ON_ERROR_STOP on", r"\gexec"),
    "security-fingerprint.sql": (),
    "spatial-fixture.sql": (),
    "verifier.sql": (
        r"\set ON_ERROR_STOP on",
        r"\ir compatibility.sql",
        r"\set requested_index market_graph_edges_source",
        r"\ir indexes.sql",
        r"\set requested_index market_graph_edges_target",
        r"\ir indexes.sql",
        r"\set requested_index market_graph_public_nodes",
        r"\ir indexes.sql",
        r"\set requested_index market_graph_citation_node",
        r"\ir indexes.sql",
        r"\set requested_index market_graph_edges_source",
        r"\ir indexes.sql",
        r"\ir spatial-fixture.sql",
        r"\ir acl-and-absence.sql",
    ),
}
INDEX_FILES = frozenset(("indexes.sql", "index-recovery.sql"))


class CandidateError(ValueError):
    """The candidate does not satisfy the parser gate's input contract."""


def candidate_files(root):
    root = Path(root)
    actual = {p.relative_to(root).as_posix() for p in root.rglob("*.sql")}
    expected = set(EXPECTED_SQL_FILES)
    if actual != expected:
        raise CandidateError(
            f"SQL manifest mismatch: missing={sorted(expected - actual)}, "
            f"unexpected={sorted(actual - expected)}"
        )
    paths = tuple(root / name for name in EXPECTED_SQL_FILES)
    for path in paths:
        if path.is_symlink() or not path.is_file():
            raise CandidateError(f"{path.name}: expected a regular, non-symlink SQL file")
    return paths


def prepare_sql(name, source):
    if name not in EXPECTED_DIRECTIVES:
        raise CandidateError(f"Unexpected SQL file: {name}")
    expected = EXPECTED_DIRECTIVES[name]
    seen = []
    prepared = []
    for number, line in enumerate(source.splitlines(), 1):
        if re.match(r"^\s*(?:do|end)\s+\$(?![\w$])", line, re.IGNORECASE):
            raise CandidateError(f"{name}:{number}: lone dollar block delimiter")
        directive = line.strip()
        if directive.startswith("\\"):
            # Full-line equality: no prefixes, comments, extra tokens, shell
            # substitutions, alternate paths, missing/repeated/reordered wiring.
            position = len(seen)
            if position >= len(expected) or directive != expected[position]:
                wanted = expected[position] if position < len(expected) else "<none>"
                raise CandidateError(
                    f"{name}:{number}: unexpected psql directive {directive!r}; "
                    f"expected {wanted!r}"
                )
            seen.append(directive)
            prepared.append(";" if directive == r"\gexec" else "")
        else:
            prepared.append(line)
    if tuple(seen) != expected:
        raise CandidateError(f"{name}: missing psql directives {expected[len(seen):]!r}")
    sql = "\n".join(prepared)
    # Only the two index scripts have this one unquoted psql parameter. This is
    # a parser placeholder, not execution of any index plan or generated DDL.
    token = ":'requested_index'"
    expected_count = 1 if name in INDEX_FILES else 0
    if sql.count(token) != expected_count:
        raise CandidateError(f"{name}: unexpected requested_index placeholder count")
    return sql.replace(token, "'market_graph_edges_source'")


def parse_candidate(root):
    from importlib.metadata import version
    from pglast import parse_sql

    if version("pglast") != "7.10":
        raise CandidateError("This gate requires pglast==7.10")
    results = {}
    for path in candidate_files(root):
        sql = prepare_sql(path.name, path.read_text(encoding="utf-8"))
        try:
            statements = parse_sql(sql)
        except Exception as error:
            raise CandidateError(f"{path.name}: outer SQL parse failed: {error}") from error
        if not statements:
            raise CandidateError(f"{path.name}: no outer SQL statements")
        results[path.name] = len(statements)
    return results


def main():
    results = parse_candidate(Path(__file__).resolve().parent)
    for name, count in results.items():
        print(f"{name}: parsed {count} outer SQL statements")
    print(
        "Outer SQL parse passed for all seven files. "
        "PL/pgSQL, psql execution, generated SQL, catalog, index and concurrency "
        "qualification remain required."
    )


if __name__ == "__main__":
    main()
