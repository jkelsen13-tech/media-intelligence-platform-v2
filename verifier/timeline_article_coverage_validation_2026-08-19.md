# Timeline Article Coverage Validation — 2026-08-19

A read-only query against the isolated v2 Supabase sandbox confirmed that all current tracked story arcs have assigned News records. The Timeline read path now represents these article assignments as explicitly labeled **News records** using their publication dates; it does not turn them into graph events or add relationships.

| Story Arc | Assigned News Articles | Recorded Arc Events |
|---|---:|---:|
| Project 2025 — DOJ Track 1 source-mapped implementation record | 60 | 4 |
| February 2026 — source-mapped public-policy watch | 8 | 7 |
| Epstein Files Transparency Act — process, safeguards, and oversight | 6 | 7 |
| Documented DOJ consent-decree actions (2025) | 2 | 3 |

The source query used only `story_arcs`, `articles`, and `arc_events` in project `yhbwnrtlqbjtcrrlpbge`. It made no writes and did not access production.
