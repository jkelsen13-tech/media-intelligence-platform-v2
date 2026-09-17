// Proposal validation only. This module grants no database or publication authority.
// Deployment must reuse mip_identity.validate_review / stage_review / release_isolated.
const scope = [
  {
    "candidate_id": "f5548254-e6c4-4abd-925d-8ea6d8e076ea",
    "capture_id": "a1e37087-54c7-49a8-886d-0f7189ffbde9",
    "article_id": "44167b15-ca52-4827-be4b-50f81d384674",
    "content_hash": "d9f0ed6ccf11a673749d7ba91b34e228d3649d7b84c33b2be9a371199a939470",
    "url": "https://www.govinfo.gov/content/pkg/PLAW-119publ38/html/PLAW-119publ38.htm",
    "span_start": 0,
    "span_end": 122,
    "origin_id": "us-congress-enacted-law",
    "dependency_id": "pl119-38",
    "semantic_kind": "enacted_requirement",
    "source_field": "body_text",
    "excerpt": "All redactions must be accompanied by a written justification published in the Federal Register and submitted to Congress."
  },
  {
    "candidate_id": "dd1ef05f-dd67-4595-908f-d195671a5db5",
    "capture_id": "5a01a9c2-0f86-4757-a056-52700980d0aa",
    "article_id": "1baddfa5-9b2d-466d-8bd3-2e9a5c3702ee",
    "content_hash": "7062c77032a711a61eac7cb1071cb9c916166eba429110ebb9dfdbc2456e5a57",
    "url": "https://www.justice.gov/opa/media/1434851/dl?inline=",
    "span_start": 0,
    "span_end": 73,
    "origin_id": "doj-executive",
    "dependency_id": "doj-efta-dec19-letter",
    "semantic_kind": "agency_projection",
    "source_field": "body_text",
    "excerpt": "I anticipate this ongoing review being completed over the next two weeks."
  },
  {
    "candidate_id": "a255ffc5-2209-4e50-8fec-cf72f3f0e7eb",
    "capture_id": "225e33dc-9e67-47a0-86e4-7a75b8ff4b88",
    "article_id": "d0bf46df-efcb-4f0d-83cd-f5f60343f650",
    "content_hash": "f23bb82300d53b4870bdf8001cfb61cabc38791abaca2efc8f52cd0dfce82642",
    "url": "https://www.justice.gov/media/1426281/dl?inline=",
    "span_start": 0,
    "span_end": 127,
    "origin_id": "doj-executive",
    "dependency_id": "efta-review-protocol",
    "semantic_kind": "agency_instruction",
    "source_field": "body_text",
    "excerpt": "It is of paramount importance to the Department that this review is thorough and that victim information is properly protected."
  },
  {
    "candidate_id": "c5a7416f-2495-41cf-b3d6-8a02d3becf22",
    "capture_id": "9a898688-2f39-4a40-a1a7-0e6bb5b0f58c",
    "article_id": "e444d8ef-765a-4624-bf8b-3f2f90eab743",
    "content_hash": "f4b682cf0a6c7476aa115d1cf83dcbd35da057165821aa483dc08b08f1ddbf1a",
    "url": "https://www.justice.gov/opa/pr/department-justice-publishes-35-million-responsive-pages-compliance-epstein-files",
    "span_start": 0,
    "span_end": 123,
    "origin_id": "doj-executive",
    "dependency_id": "doj-efta-jan30-production",
    "semantic_kind": "official_claim",
    "source_field": "body_text",
    "excerpt": "Combined with prior releases, this makes the total production nearly 3.5 million pages released in compliance with the Act."
  },
  {
    "candidate_id": "f741208c-0a00-418a-afab-028f558b902b",
    "capture_id": "2c7428e6-0e4b-4dd2-af93-fca438307359",
    "article_id": "c6b19030-a485-4fd8-9e68-3674ea8bffeb",
    "content_hash": "342d4813cc6fc151b6937d20b549e76957908a4a0f70dcc2429406dddfac973a",
    "url": "https://www.justice.gov/letter-to-congress.pdf",
    "span_start": 0,
    "span_end": 87,
    "origin_id": "doj-executive",
    "dependency_id": "doj-efta-jan30-production",
    "semantic_kind": "agency_disclosure_accounting",
    "source_field": "body_text",
    "excerpt": "approximately 200,000 pages have been redacted or withheld based on various privileges."
  },
  {
    "candidate_id": "5cabcb8f-99bf-4e42-8172-473ef6c59f0f",
    "capture_id": "df6eeb70-a24a-4e3f-9ea8-55faa8fcabfd",
    "article_id": "781bf13f-f1db-4a9f-9a8d-e234a5a303d2",
    "content_hash": "b7fe286748aabbe09ad853f6abea1e8cfa3ead74dbe2eee26c0889bb343fd682",
    "url": "https://oig.justice.gov/ongoing-work/audit-department-justices-compliance-epstein-files-transparency-act",
    "span_start": 0,
    "span_end": 105,
    "origin_id": "doj-oig",
    "dependency_id": "efta-oig-audit",
    "semantic_kind": "audit_status",
    "source_field": "body_text",
    "excerpt": "The OIG is auditing the Department of Justice’s (DOJ) compliance with the Epstein Files Transparency Act."
  },
  {
    "candidate_id": "a5457418-1a23-4345-8fb7-788d07123aa8",
    "capture_id": "b556327b-1053-4ea2-bdf8-464cd3133c35",
    "article_id": "8cd6f366-1254-4ef9-97cd-f4057520bc80",
    "content_hash": "ff60158e4e80cce95b8c0dae955becc91791a536b92458fc7ce8643bac03c7b5",
    "url": "https://public-inspection.federalregister.gov/2026-17533.pdf",
    "span_start": 0,
    "span_end": 142,
    "origin_id": "doj-executive",
    "dependency_id": "efta-fr-2026-17533",
    "semantic_kind": "publication_notice",
    "source_field": "body_text",
    "excerpt": "The Department of Justice is publishing a report submitted to Congress concerning records released and withheld pursuant to Public Law 119-38."
  }
];
const fail = reason => { throw new Error('efta_review_' + reason) };
const text = x => typeof x === 'string' && x.trim().length > 0;
export const PUBLIC_RELEASE_ENABLED = false;
export function validateReviewProposal(proposal, retained, registry) {
  const expected = scope.find(r => r.candidate_id === proposal?.candidate_id);
  if (!expected) fail('outside_scope');
  for (const key of Object.keys(expected)) if (proposal[key] !== expected[key]) fail('binding_' + key);
  if (!retained || retained.candidate_id !== expected.candidate_id ||
      retained.capture_id !== expected.capture_id || retained.article_id !== expected.article_id ||
      retained.url !== expected.url || retained.content_hash !== expected.content_hash ||
      retained.current !== true || retained.replaced_by != null ||
      retained.state !== 'retained') fail('stale_or_unretained');
  if (!['title','summary','body_text'].includes(proposal.source_field)) fail('source_field');
  const content = retained.fields?.[proposal.source_field];
  if (!text(content) || !text(proposal.excerpt)) fail('missing_excerpt');
  // Offsets are Unicode code points, not JS UTF-16 offsets.
  if (Array.from(content).slice(proposal.span_start,proposal.span_end).join('') !== proposal.excerpt) fail('span');
  if (proposal.publication_allowed !== false || proposal.geography != null) fail('publication_or_geography');
  if (!text(proposal.uncertainty) || !text(proposal.reviewer) ||
      !text(proposal.reason) || proposal.action !== 'propose_review' ||
      !text(proposal.reviewed_at) || !Number.isFinite(Date.parse(proposal.reviewed_at))) fail('human_review');
  const eventTime = proposal.event_time;
  if (!eventTime || !/^\d{4}-\d{2}-\d{2}$/.test(eventTime.date ?? '') ||
      eventTime.precision !== 'day' || eventTime.reviewed !== true ||
      !text(eventTime.evidence_basis) || !text(eventTime.uncertainty) ||
      eventTime.evidence_basis === 'published_at') fail('event_time');
  if (!proposal.entity || !text(proposal.entity.namespace) || !text(proposal.entity.id)) fail('identity');
  const identities = registry.filter(r => r.namespace === proposal.entity.namespace && r.id === proposal.entity.id);
  if (identities.length !== 1 || identities[0].kind !== 'institution' ||
      identities[0].state !== 'resolved' || !text(identities[0].resolution_revision)) fail('identity');
  return structuredClone({...proposal, entity: identities[0], state:'review_proposal_only',
    publication_allowed:false, world_view:{state:'absent',reason:'No reviewed geography'}});
}
export function comparisonDependency(leftId, rightId) {
  const left=scope.find(r=>r.candidate_id===leftId),right=scope.find(r=>r.candidate_id===rightId);
  if (!left || !right || leftId === rightId) fail('comparison_scope');
  return {left:leftId,right:rightId,
    dependent:left.origin_id===right.origin_id || left.dependency_id===right.dependency_id,
    corroboration:false, interpretation:'Comparison does not establish truth or compliance'};
}
export function releasePublic() { fail('public_release_disabled') }
