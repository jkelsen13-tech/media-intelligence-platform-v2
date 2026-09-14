# Registered native boundary integration v2 — isolated candidate

This candidate adds an actual source-authorized marker issuance, source capture, independently retained delivery, custody-bound permit preparation and native advancement path. It is synthetic qualification only; production admission and a physically independent custodian are not configured.

The v1 SQL functions/contracts remain unchanged. The additive 022 uses separate entrypoints, a registered exact two-table publication contract, per-binding marker filter, and the existing immutable capture/permit/checkpoint chain primitives. V2 registrations explicitly pin the contract digest. The fixture forwards all incarnation and contract arguments unchanged to source SQL.

The source assigns marker epoch/xid and admits only the currently authorized binding and incarnation. A marker issuance transaction must commit before capture; capture consumes the next published transaction, including preceding revision transactions, without skipping. Marker tuples are matched to the committed source issue. The consumer retains and reads back the complete source transcript and typed delivery, validates the full bootstrap evidence, and advances through current external custody and source authority. All historical_time_qualified fields remain false.

Source and external journal fixtures are separately authenticated capabilities but share the disposable PostgreSQL physical restore domain. This is NOT physical independence. No real source identity, production credentials, deployment or live Supabase changes are authorized by these tests.

Implementation/verification status: initial testable remote increment. Hosted native/golden results must be inspected before freezing. Additional adversarial cases and failures will be retained in GitHub history. The final report must distinguish proven native integration from remaining production custody, provisioning, retention/scheduling and independent audit gates.
