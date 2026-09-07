import { newsBackendFixture } from './newsBackendFixture.mjs'
import { createPublicDataBackend } from '../src/lib/publicDataBackend.js'

// Public projection-shaped synthetic records; never written to a database.
export function comparisonRow(index = 0) {
  const key = `event-${String(index).padStart(6, '0')}`
  const articles = ['A', 'B', 'C'].map((outlet, n) => ({
    article_key: `${key}-opaque-${outlet}`, outlet: `Publisher ${outlet}`,
    article_url: `https://example.invalid/${key}/${outlet}`, published_at: `2026-08-03T1${n}:00:00Z`,
    has_extracted_claim: n < 2,
    arc_slug: n === 0 ? 'recorded-arc' : null, arc_title: n === 0 ? 'Recorded arc' : null,
    timeline_key: n === 0 ? 'recorded-event' : null,
  }))
  return { event_key: key, canonical_title: `Compared event ${index}`, occurred_at_start: '2026-08-03', occurred_at_end: null, articles,
    claims: [{ claim_key: `${key}-claim`, canonical_text: `Recorded claim ${index}`, thin_extraction: true,
      surfaces: [{ article_key: articles[0].article_key, surface_text: `Attributed framing ${index}`, loaded_language: [],
        explanation: { supporting_passage: 'Retained supporting passage', rule_version: 'fixture-rule', provenance_class: 'machine', state: 'under_review', review_status: 'awaiting_review', remaining_uncertainty: 'Grouping awaits review' } }],
      evidence_links: [{ evidence_url: 'https://example.invalid/primary', evidence_type: 'primary_document' }],
      corrections: [{ correction_text: 'Recorded correction', occurred_at: '2026-08-04' }],
    }],
  }
}
export function comparisonBackendFixture(options = {}) {
  const f = newsBackendFixture(options)
  return { ...f, backend: createPublicDataBackend(f.client) }
}
