# V2 Claim Auditability and Deterministic Promotion Check

This is the standing **read-only verification** for the V2 News-detail claim contract. It complements, but never replaces, the ingestion safety gates. The corresponding database promoter runs automatically after a deterministic extraction result is stored; this verifier checks the result at any time without inserting, updating, or promoting records.

## Purpose and boundaries

The check verifies that every current public `article_claims` record is either backed by an exact excerpt of V2-retained publisher text or explicitly marked `unverified_against_retained_source`. It also verifies that literal deterministic extraction output from active, non-protected articles appears on the News-detail claim surface. It does **not** create events, graph edges, timelines, Story Arc membership, geography, Legal/Policy records, Source Comparison groups, or cross-surface-candidate promotions.

| Check | Required result |
|---|---|
| Verified source span | The stored `evidence_excerpt` equals the stored source field substring at `char_start`–`char_end`. |
| Unverified disclosure | The public News projection returns a non-null auditability state rather than treating unmatched text as verified. |
| Literal deterministic promotion | Every active, permitted deterministic candidate text has a current News claim surface. |
| Protected-scope withholding | No promoted claim may contain a Document 07, Callais, or redistricting-adjacent run/content match. |
| Source Comparison isolation | Promoted literal claims retain `v2-deterministic-literal-public-claim-promotion`, never `sc-v2-event-projection`. |
| Public projection contract | `news_detail_public` returns the same number of current claim rows with an auditability state for each. |

## Running the check

Set V2-only credentials outside the repository, then run the standard command. The command requires a service-role credential solely because the verifier reads internal tables to cross-check the narrow public projection; it makes no writes.

```bash
export MIP_V2_SUPABASE_URL=https://yhbwnrtlqbjtcrrlpbge.supabase.co
export MIP_V2_SUPABASE_SERVICE_ROLE_KEY='<isolated-v2 service role only>'
npm run verify:claims
```

Set `MIP_V2_CLAIM_AUDIT_OUTPUT=/absolute/path/report.json` to save the JSON report. Any `FAIL` produces a non-zero exit status. This command must be run after every deterministic ingestion run and before public deployment of a new extraction path.

> The hard exclusion is enforced twice: first by the ingestion/extraction scope gate, then inside the database promotion function. A verifier failure cannot be fixed by restoring anonymous grants or by bypassing the protected-scope predicate.

## Data contract

| Field | Meaning |
|---|---|
| `auditability_state` | `verified_retained_source` or `unverified_against_retained_source`. |
| `evidence_source_field` | The retained `title`, `summary`, or `body_text` field when verification succeeds. |
| `evidence_excerpt` | The exact retained source substring displayed only as an auditability anchor. |
| `char_start`, `char_end` | Zero-based offsets into the declared retained source field. |
| `auditability_note` | The explicit explanation shown for an unmatched public surface. |

The anonymous application reads these fields only through `news_detail_public`, a `security_barrier` projection. Base-table anonymous SELECT privileges remain revoked.
