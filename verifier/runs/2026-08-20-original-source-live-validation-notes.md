# Original Source Import — Live Validation Notes

**Live URL:** https://jkelsen13-tech.github.io/media-intelligence-platform-v2/  
**Deployed commit:** `5253877`  
**Validation date:** 2026-08-20

| Surface | Live observation | Result |
|---|---|---|
| News | The page renders **12,558 articles** and live corpus status. | Pass |
| Knowledge Graph | The live graph renders **805 nodes**. Its focused view renders 20 nodes and 22 documented relationships. The relationship legend includes **Sequence — “happened before”** and explicitly distinguishes it from causal claims. | Pass |

The browser navigation to the live News and Knowledge Graph surfaces succeeded after the importer deployment. The database census separately confirms 447 total edges, 53 story arcs, 347 original-source events, 19 imported-source Source Comparison-eligible events, 27 policies, and one safe legal case with eight linked evidence rows.

| Causal Timeline | The Timeline opens with chronological sequence labels, date and event-type filters, the **All events (global corpus)** selector, and a 53-Arc selector that includes imported original-source arcs. | Pass |
| Story Arcs | The deployed Arc browser renders the expanded Arc list, including imported original-source arcs such as **Gary Cordery — military escalation**, **Strait of Hormuz — diplomatic talks**, and **Palestine — repression and West Bank unrest**. The selected Arc renders coverage-over-time, chronology, and Evidence summary. | Pass |

The Timeline maintains the required distinction between **sequence** and causation. The Story Arcs surface is searchable and exposes the expected chronological and evidence-oriented controls.

| Legal & Policy | The live view renders the legal-case record with supporting and contradicting evidence, and the policy change-over-time records. Database validation confirms the isolated import retained **one safe legal case with eight evidence rows**, while excluding one protected case. | Pass |

The protected-case handling was validated at both importer and rendered-surface levels: only the safe case is available to the public reader, and the import report records one exclusion.

| Source Comparison | The live route opened successfully and entered its data-loading state. A separate database check confirms **19** original-source events meet the live comparison eligibility rule (not timeline-only and at least two distinct outlets). | In progress |

| Source Comparison | The live view completed loading and renders multi-outlet coverage cards with outlet samples, publication timing, claim/evidence separation, and Arc/Timeline links. Imported Arc-linked cards are visible, including **Strait of Hormuz**, **English FA**, **Palestine**, and **Massive Attack**. | Pass |

The Source Comparison UI renders the required non-composite structure: outlet coverage remains separate from claims, evidence, timing, framing, and unverified lineage. The database census confirms **19** imported original-source events qualify for the surface, with **20** comparison-eligible events across the full Version Two corpus.
