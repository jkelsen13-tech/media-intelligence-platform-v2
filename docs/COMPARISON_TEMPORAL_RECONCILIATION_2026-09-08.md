# Comparison temporal reconciliation

Source Comparison's shared public read model sorted publication/review strings
lexically and converted date-only/local values through Date. For example,
09:00-04:00 sorts before 12:00Z as text but is one hour later. The old rendering
also called rounded sub-hour differences the same hour and claimed first reporting
from a limited ingested sample.

The read model now validates with the existing retained-date contract, compares
qualified precision intervals in UTC, and preserves microseconds using integer
arithmetic. Date-only, missing, invalid and zone-free publication records cannot
establish an outlet order or a time gap. Overlapping intervals and ties do not
select an arbitrary first outlet. Gap estimates appear only when the full possible
range fits the same tenth-hour rounding bucket. Small rounded gaps are displayed
as less than one tenth of an hour, never as proof of a simultaneous publication.

The interface explicitly limits ordering to timestamps in the ingested sample.
Publication and review dates retain their original precision and UTC offset.
Latest-review selection respects qualified chronology; mixed or overlapping
precision cannot prove which review is latest. Individual explanation dates
remain visible. Review summaries fall back to recorded review states.

New tests cover offset reversal, incomplete clocks within/across outlets, tied
and overlapping precision, microseconds in distant dates, uncertain gap rounding,
review ordering, public-adapter propagation and displayed precision. Existing
ordinary-gap and retained-date tests remain in use rather than being duplicated.
Browser verification extends the existing recovery suite with an explicitly
browser-only comparison fixture, then restores the real public projection.
It never publishes fixture claims or modifies production data.

This reconciles the comparison read model and UI with existing retained-time
semantics. It is not collector cutover or single-backend completion. No worker,
scheduler, schema, access policy or publication gate changes. The outstanding
collector generation race and deployment/schema gaps remain documented in
[collector reconciliation](COLLECTOR_CONTRACT_RECONCILIATION_2026-09-08.md);
the [final consolidation gate](BACKEND_CONSOLIDATION_FINAL_GATE_2026-09-08.md)
remains INCOMPLETE and no legacy project is SAFE TO RETIRE.
