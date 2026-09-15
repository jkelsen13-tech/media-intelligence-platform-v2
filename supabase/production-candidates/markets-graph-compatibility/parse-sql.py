"""Hosted-only PostgreSQL 17 SQL parse gate; performs no database operations.

Install with: python -m pip install "pglast==7.10"
Run with: python supabase/production-candidates/markets-graph-compatibility/parse-sql.py
This validates outer SQL and dollar quoting. PostgreSQL execution is still needed
for PL/pgSQL body compilation, catalog semantics, psql includes, and runtime tests.
"""
from pathlib import Path
import re
from pglast import parse_sql

root = Path(__file__).resolve().parent
files = sorted(root.glob("*.sql"))
assert files, "No candidate SQL files found"

for path in files:
    source = path.read_text(encoding="utf-8")
    # Reject the exact accidental JavaScript replacement-string failure.
    for number, line in enumerate(source.splitlines(), 1):
        if re.match(r"^\s*(?:do|end)\s+\$(?![\w$])", line, re.IGNORECASE):
            raise AssertionError(f"{path.name}:{number}: lone dollar block delimiter")
    prepared = []
    for line in source.splitlines():
        directive = line.lstrip()
        if directive.startswith("\\gexec"):
            prepared.append(";")
        elif directive.startswith(("\\set ", "\\ir ")):
            prepared.append("")
        elif directive.startswith("\\"):
            raise AssertionError(f"Unrecognized psql directive in {path.name}: {line}")
        else:
            prepared.append(line)
    # The index selector is an allowlisted psql parameter, not SQL syntax.
    sql = "\n".join(prepared).replace(":'requested_index'", "'market_graph_edges_source'")
    statements = parse_sql(sql)
    print(f"{path.name}: parsed {len(statements)} outer SQL statements")
print("Outer SQL parse passed; PL/pgSQL compilation and exact-commit database tests remain required.")
