# Arc source inventory reconciliation

The Arcs view previously retained the last arc's source array while the next request loaded and after an error. Both its Evidence cards and Overview coverage proxy could therefore describe a different arc.

The chronology backend now offers a separate availability-bearing source inventory read. It uses the existing complete, arc-filtered keyset reader and the injected browser client. A failed page withholds the whole inventory; an absent client cannot become an empty result. The older array reader remains compatible with its other consumers.

Arcs binds each response to its arc, backend client and retry attempt, with late responses discarded. Loading and unavailable source states replace source cards and the coverage proxy. A keyboard-accessible retry preserves the selected arc. Successful emptiness describes the public inventory, not all stored records.

Live catalog reconciliation on 2026-09-08: articles and story_arcs have RLS enabled and anonymous SELECT access. Public article SELECT is limited to reader_state eligible and source_status active. The UI therefore cannot assert that no records are stored merely because the public read is empty. No policy, schema, queue, function deployment or source eligibility changed.

Regression coverage exercises more than 1000 attached articles, later-page denial, recovery, empty reads, absent client, client replacement and late responses across arc changes. The live public arc inventory is empty. Browser verification first checks that baseline, then injects a synthetic arc and failed article response only inside the verifier browser. Retry performs a real public article read for the synthetic arc identity and confirms the successful empty state. No arc or article is seeded. This does not simulate a private signed-in investigation.

Backend reconciliation remains open: spatial runtime deployment artifacts, writer authorization/temporal validation and qualified producer evaluation remain separate prerequisites recorded in the spatial registration report.
