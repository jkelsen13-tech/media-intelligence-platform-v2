// Package 2 item 6 — synthetic acceptance fixture only. It tests rendering and
// evidence-state semantics; it is never loaded into Supabase or presented as
// a real-world record.
export const richArcTimelineFixture = Object.freeze({
  arc: Object.freeze({
    id: 'arc-fixture-public-records',
    slug: 'fixture-public-records',
    title: 'Public-records acceptance fixture',
    category: 'institutional_accountability',
    started_at: '2026-01-10',
  }),
  evidence: Object.freeze({
    supporting: 1,
    contested: 1,
    missing: 1,
    missingScope:
      'Checked public docket releases and named agency repositories for 2026-01-10 through 2026-02-15; last checked 2026-02-16.',
    remainingUncertainty: Object.freeze([
      'The follow-on agency action has not been located in the monitored public record.',
    ]),
  }),
  entries: Object.freeze([
    Object.freeze({
      key: 'evt-fixture-order',
      date: '2026-01-10',
      type: 'ruling',
      title: 'Court order entered',
      description: 'A public court order is recorded in the fixture.',
      outlet: 'Public docket',
      articleId: 'article-fixture-order',
      badgeState: 'confirmed',
      provenance: Object.freeze({
        sourceUrl: 'https://example.test/docket/order',
        sourcePassage: 'The court entered the order on January 10.',
        authentication: 'Primary public record linked',
      }),
    }),
    Object.freeze({
      key: 'evt-fixture-response',
      date: '2026-01-17',
      type: 'policy',
      title: 'Agency response announced',
      description: 'An agency statement describes an intended response.',
      outlet: 'Agency newsroom',
      articleId: 'article-fixture-response',
      badgeState: 'inferred',
      provenance: Object.freeze({
        sourceUrl: 'https://example.test/agency/response',
        sourcePassage: 'The agency stated it would review the order.',
        authentication: 'Primary agency statement linked',
      }),
    }),
    Object.freeze({
      key: 'evt-fixture-coverage',
      date: '2026-02-02',
      type: 'coverage',
      title: 'Independent reporting describes dispute',
      description: 'Reporting records a disputed interpretation of the response.',
      outlet: 'Independent reporting',
      articleId: 'article-fixture-coverage',
      badgeState: 'contested',
      provenance: Object.freeze({
        sourceUrl: 'https://example.test/reporting/dispute',
        sourcePassage: 'The reporting describes competing interpretations.',
        authentication: 'Source link retained; corroboration incomplete',
      }),
    }),
    Object.freeze({
      key: 'evt-fixture-followup',
      date: null,
      type: 'evidence',
      title: 'Follow-on public action not yet curated',
      description: null,
      outlet: null,
      articleId: null,
      badgeState: null,
      provenance: Object.freeze({
        sourceUrl: null,
        sourcePassage: null,
        authentication: 'No source record curated',
        remainingUncertainty: 'Absence is scoped in the evidence summary, not treated as contradiction.',
      }),
    }),
  ]),
  edges: Object.freeze([
    Object.freeze({
      id: 'edge-fixture-causal',
      source: 'evt-fixture-order',
      target: 'evt-fixture-response',
      type: 'causal',
      doc_strength: 'documented',
      provenance: Object.freeze({
        supportingPassage: 'The response explicitly cites the order.',
        sourceId: 'source-fixture-order',
      }),
    }),
    Object.freeze({
      id: 'edge-fixture-sequence',
      source: 'evt-fixture-response',
      target: 'evt-fixture-coverage',
      type: 'sequence',
      doc_strength: 'documented',
      provenance: Object.freeze({
        supportingPassage: null,
        sourceId: null,
      }),
    }),
  ]),
})
