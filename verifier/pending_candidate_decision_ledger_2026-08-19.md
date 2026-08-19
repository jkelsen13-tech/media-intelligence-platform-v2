# Pending Candidate Decision Ledger — 2026-08-19

## Scope and decision standard

This ledger records the decision made for **every candidate that was pending at the start of this review** in the isolated v2 Supabase sandbox. The review uses the owner-authorized gates below. A candidate could be approved only if it had a literal span that matched stored publisher text, a resolvable primary-evidence link classified as `court_doc` or `agency_release`, no unresolved Callais or redistricting-adjacent ambiguity, and no likely duplicate of an already approved record. A primary-evidence **label** without a URL did not satisfy the link requirement. Candidate-to-candidate overlap on the same article was not treated as a duplicate when the excerpts were distinct.

> `owner_hold` is an explicit review state added only to the isolated v2 sandbox. It is reserved for scope-sensitive records whose Callais/redistricting classification is not suitable for autonomous resolution, and it does not propagate any data to live surfaces.

| Final state | Count | Cross-surface propagation |
|---|---:|---|
| Approved | 0 | None |
| Rejected | 18 | None |
| Held for owner review | 3 | None |
| **Total reviewed** | **21** | **None** |

All reviewed candidates had **multiple structured claims** on their parent article; there were no single-claim or claim-absent candidates in this review set. Exact-title and normalized-excerpt checks found **no likely duplicate of an already approved candidate**. No Callais match was found. The only hard-stop category was the three candidates from an NPR Florida-primary article whose redistricting context required owner review.

## Grouped decision rationale

| Group | Count | Criteria | Representative records | Decision |
|---|---:|---|---|---|
| Literal grounding present; no primary citation and no primary-evidence URL | 10 | Evidence excerpt exactly matched publisher body text; article had multiple claims; no `court_doc`/`agency_release` citation; no URL-shaped primary evidence; no duplicate or exclusion ambiguity | Wike / `Maitama, Abuja`; Plateau attack / `Binper community in Mangu Local Government Area of Plateau State.` | Rejected: fails required primary-evidence-link gate |
| Literal grounding present; primary citation label present but no primary-evidence URL | 6 | Evidence excerpt exactly matched publisher body text; a primary citation category existed; cited entity was a descriptive label rather than a resolvable URL; no duplicate or exclusion ambiguity | WTVM / `COLUMBUS, Ga.`; NPR AI music / `the open Internet` | Rejected: a label is not a verified evidence link |
| Literal grounding absent; primary citation label present but no URL | 1 | Excerpt `Singapore` did not equal its stored body span; primary citation label existed but no URL; no duplicate or exclusion ambiguity | Petroleum Economist / `Singapore` | Rejected: fails both literal-grounding and primary-evidence-link gates |
| Literal grounding present; primary citation label present but no URL; graph candidate | 1 | Graph-node candidate had a literal excerpt and multiple claims; its evidence reference was not a resolvable primary URL | NPR AI music / proposed AI-permission rule node | Rejected: fails primary-evidence-link gate |
| Redistricting-sensitive, literal grounding present; no evidence URL | 3 | Same NPR Florida-primary article directly discusses redistricting and revised congressional maps. It is not Callais, but autonomous redistricting-adjacent classification is owner-reserved; all three excerpts are multi-claim and literal | `Washington`; `Broward and Palm Beach Counties`; `Central Florida` | **Owner hold**: no propagation |

## Per-candidate decisions

| Candidate ID | Candidate type | Parent article / evidence excerpt | Claims | Decision | Recorded rationale |
|---|---|---|---:|---|---|
| `11e8788c-2d94-4a84-917d-284d84f0cbd4` | geography_mention | 24 Killed, Many Injured In Fresh Plateau Attack / `Binper community in Mangu Local Government Area of Plateau State.` | 3 | Rejected | Literal span retained, but no machine-resolvable primary-evidence URL. |
| `6b1f11d4-fcb2-44ce-93c8-a7a61f13ccf5` | geography_mention | Congress members visit Stewart Detention Center / `COLUMBUS, Ga.` | 7 | Rejected | Literal span retained; `agency_release` label exists, but no machine-resolvable primary-evidence URL. |
| `8e1c3e95-c74a-43d3-9223-dcbb282c573f` | geography_mention | Congress members visit Stewart Detention Center / `ICE detention facility` | 7 | Rejected | Literal span retained; `agency_release` label exists, but no machine-resolvable primary-evidence URL. |
| `ec90d356-82a3-41b6-9083-20ff42c42a8c` | geography_mention | Wike / `Rivers State` | 7 | Rejected | Literal span retained, but no machine-resolvable primary-evidence URL. |
| `f3f79436-2eca-4cd9-99ac-110070535db5` | geography_mention | Wike / `Maitama, Abuja` | 7 | Rejected | Literal span retained, but no machine-resolvable primary-evidence URL. |
| `3dc68361-8e1a-45e6-9d3d-6cde27de44bb` | geography_mention | Sunita Ahuja / `Bandra Family Court` | 8 | Rejected | Literal span retained, but no machine-resolvable primary-evidence URL. |
| `45442f7a-0c1a-4200-b69f-70f9eee1f903` | geography_mention | Petroleum Economist / `Singapore` | 4 | Rejected | Excerpt does not match the stored literal span; no machine-resolvable primary-evidence URL. |
| `4dacae76-9b5e-4c45-9b7b-3234004a7e04` | geography_mention | Newtown Food Drive / `Big Y` | 5 | Rejected | Literal span retained, but no machine-resolvable primary-evidence URL. |
| `64300b5e-def6-4128-9332-39d243ea1de0` | geography_mention | Sunita Ahuja / `family court in Mumbai` | 8 | Rejected | Literal span retained, but no machine-resolvable primary-evidence URL. |
| `94642194-0b74-4848-9d42-38cebd068e47` | geography_mention | Sunita Ahuja / `Karwa Chauth` | 8 | Rejected | Literal span retained, but no machine-resolvable primary-evidence URL. |
| `ba96e6f3-2cc5-4cbb-a805-28d9bf42616d` | geography_mention | Sunita Ahuja / `Mumbai` | 8 | Rejected | Literal span retained, but no machine-resolvable primary-evidence URL. |
| `e0cc6cfc-d26c-4c58-b48b-727a58d9c9fa` | geography_mention | Petroleum Economist / `Cape of Good Hope` | 4 | Rejected | Literal span retained; `agency_release` label exists, but no machine-resolvable primary-evidence URL. |
| `e49b0182-2da9-4057-94b6-02a23350b577` | geography_mention | Newtown Food Drive / `Newtown` | 5 | Rejected | Literal span retained, but no machine-resolvable primary-evidence URL. |
| `ec72ca65-30bf-4255-a3b1-bfed74272320` | geography_mention | S. Korea stresses US alliance / `the Strait of Hormuz` | 8 | Rejected | Literal span retained, but no machine-resolvable primary-evidence URL. |
| `0f503818-670c-4f7e-99d4-f50a230d1441` | geography_mention | The grueling fight over who profits from AI music / `streaming services` | 8 | Rejected | Literal span retained; primary citation label exists, but no machine-resolvable primary-evidence URL. |
| `cc20c9ba-3e0a-403a-9a88-37c0b391d9ef` | geography_mention | The grueling fight over who profits from AI music / `the open Internet` | 8 | Rejected | Literal span retained; primary citation label exists, but no machine-resolvable primary-evidence URL. |
| `c28f1e3f-ae86-4e56-a43f-bcee68e5c67a` | geography_mention | Trump–Canada tariffs / `Ottawa` | 8 | Rejected | Literal span retained; primary citation label exists, but no machine-resolvable primary-evidence URL. |
| `3a3db262-acf4-4f0d-b020-b42ed8d3da09` | graph_node | The grueling fight over who profits from AI music / AI-permission-and-compensation rule | 8 | Rejected | Literal span retained; primary citation label exists, but no machine-resolvable primary-evidence URL. |
| `4554d8c3-af1e-4bbd-a682-cf7d04efe086` | geography_mention | Key results from Florida primaries / `Washington` | 7 | Owner hold | Article directly discusses Florida redistricting and revised maps; hard-stop owner review. |
| `79f2ca4d-8982-4bc9-96ae-d30054cceba0` | geography_mention | Key results from Florida primaries / `Broward and Palm Beach Counties` | 7 | Owner hold | Article directly discusses Florida redistricting and revised maps; hard-stop owner review. |
| `c297d5ee-0420-429b-babb-457a37597777` | geography_mention | Key results from Florida primaries / `Central Florida` | 7 | Owner hold | Article directly discusses Florida redistricting and revised maps; hard-stop owner review. |

## Database record

The isolated-v2 `cross_surface_candidates` ledger was updated with `reviewed_at`, `reviewed_by = manus_candidate_review_20260819`, the applicable state, and the concise rationale above in `remaining_uncertainty`. The `owner_hold` review state was added with a versioned sandbox migration, `20260819_candidate_owner_hold_review_state.sql`. No production Supabase project, live graph, timeline, arcs, source-comparison event, or geographic placement was modified.
