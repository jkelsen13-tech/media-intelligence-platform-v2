import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migrationDir = new URL('../supabase/migrations/', import.meta.url)
const contract = await readFile(new URL('20260826024647_timeline_v2_graph_identity_mapping_contract.sql', migrationDir), 'utf8')
const hardening = await readFile(new URL('20260826024731_timeline_v2_graph_identity_mapping_contract_hardening.sql', migrationDir), 'utf8')
const sql = `${contract}\n${hardening}`

const candidateRelation = 'timeline_v2_graph_identity_candidates'
const auditRelation = 'timeline_v2_graph_identity_audits'

function createTableBodies(source) {
  return [...source.matchAll(/CREATE TABLE public\.([a-z0-9_]+) \(([\s\S]*?)\n\);/g)].map(([, name, body]) => ({ name, body }))
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length
}

function namedConstraints(body) {
  return [...body.matchAll(/\bCONSTRAINT\s+([a-z0-9_]+)/gi)].map(([, name]) => name)
}

test('mirrors the live 20-row proposal cohort as non-claims requiring independent audit', () => {
  const seeds = contract.match(/requires_independent_audit":true/g) ?? []
  const nonClaims = contract.match(/identity_claim":false/g) ?? []
  assert.equal(seeds.length, 20)
  assert.equal(nonClaims.length, 20)
  assert.match(contract, /INSERT INTO public\.timeline_v2_graph_identity_candidates/)
  assert.doesNotMatch(contract, /INSERT INTO public\.timeline_v2_graph_identity_audits/)
})

test('keeps mapping candidates and mapping audits append-only', () => {
  assert.match(contract, new RegExp(`BEFORE DELETE OR UPDATE ON public\\.${candidateRelation}`))
  assert.match(contract, new RegExp(`BEFORE DELETE OR UPDATE ON public\\.${auditRelation}`))
  assert.match(contract, /timeline_placement_block_immutable_mutation/)
})

test('binds proposals to exact current Timeline candidate and Graph node revisions', () => {
  assert.match(contract, /candidate_revision_timestamp timestamptz NOT NULL/)
  assert.match(contract, /graph_node_revision_timestamp timestamptz NOT NULL/)
  assert.match(contract, /candidate revision timestamp is stale or mismatched/)
  assert.match(contract, /Graph node revision timestamp is stale or mismatched/)
  assert.match(contract, /timeline_event_id does not match Timeline candidate event_id/)
  assert.match(contract, /rejected or invalidated Timeline candidates cannot receive new Graph identity proposals/)
})

test('binds every audit exactly to one mapping candidate, Timeline candidate, and Graph node', () => {
  assert.match(contract, /FOREIGN KEY \(mapping_candidate_id, timeline_candidate_id, graph_node_id\)/)
  assert.match(contract, /REFERENCES public\.timeline_v2_graph_identity_candidates\(id, timeline_candidate_id, graph_node_id\)/)
  assert.match(contract, /UNIQUE \(mapping_candidate_id\)/)
  assert.match(contract, /confirmed_same_event', 'rejected_not_same_event', 'undetermined'/)
})

test('keeps internal identity relations under RLS/default deny and denies anon/authenticated', () => {
  assert.match(contract, /ALTER TABLE public\.timeline_v2_graph_identity_candidates ENABLE ROW LEVEL SECURITY/)
  assert.match(contract, /ALTER TABLE public\.timeline_v2_graph_identity_audits ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /REVOKE ALL ON TABLE public\.timeline_v2_graph_identity_candidates FROM PUBLIC, anon, authenticated/)
  assert.match(sql, /REVOKE ALL ON TABLE public\.timeline_v2_graph_identity_audits FROM PUBLIC, anon, authenticated/)
  assert.match(sql, /REVOKE ALL ON TABLE public\.timeline_v2_graph_identity_state_v1 FROM PUBLIC, anon, authenticated/)
  assert.match(sql, /REVOKE ALL ON TABLE public\.timeline_v2_graph_consumption_contract_v1 FROM PUBLIC, anon, authenticated/)
})

test('limits service role to append-only candidate/audit writes and read-only views', () => {
  assert.match(hardening, /GRANT SELECT, INSERT ON TABLE public\.timeline_v2_graph_identity_candidates TO service_role/)
  assert.match(hardening, /GRANT SELECT, INSERT ON TABLE public\.timeline_v2_graph_identity_audits TO service_role/)
  assert.match(hardening, /GRANT SELECT ON TABLE public\.timeline_v2_graph_identity_state_v1 TO service_role/)
  assert.match(hardening, /GRANT SELECT ON TABLE public\.timeline_v2_graph_consumption_contract_v1 TO service_role/)
  assert.doesNotMatch(hardening, /GRANT .*UPDATE.*timeline_v2_graph_identity/)
  assert.doesNotMatch(hardening, /GRANT .*DELETE.*timeline_v2_graph_identity/)
})

test('separates a proposal from a confirmed current identity mapping', () => {
  assert.match(hardening, /ELSE 'pending_audit_current'/)
  assert.match(hardening, /WHEN a\.audit_outcome = 'confirmed_same_event' THEN 'confirmed_current'/)
  assert.match(hardening, /WHEN a\.audit_outcome = 'rejected_not_same_event' THEN 'rejected_current'/)
  assert.match(hardening, /WHEN a\.audit_outcome = 'undetermined' THEN 'undetermined_current'/)
  assert.match(hardening, /AND a\.audit_outcome = 'confirmed_same_event'/)
})

test('invalidates current identity state when candidate or node revisions become stale', () => {
  const staleCandidate = hardening.indexOf("WHEN tc.candidate_updated_at <> m.candidate_revision_timestamp THEN 'stale_candidate_revision'")
  const staleNode = hardening.indexOf("WHEN n.updated_at <> m.graph_node_revision_timestamp THEN 'stale_graph_node_revision'")
  const confirmed = hardening.indexOf("WHEN a.audit_outcome = 'confirmed_same_event' THEN 'confirmed_current'")
  assert.ok(staleCandidate >= 0 && staleNode > staleCandidate && confirmed > staleNode)
})

test('keeps Graph consumption, overlays, and edge support separately default-denied', () => {
  assert.match(hardening, /WHERE s\.mapping_state = 'confirmed_current'/)
  assert.match(hardening, /g\.graph_consumption_enabled/)
  assert.match(hardening, /p\.status_code = g\.required_status_code/)
  assert.match(hardening, /g\.requires_edge_specific_relationship_provenance/)
  assert.match(hardening, /graph_consumption_disabled/)
  assert.match(hardening, /timeline_status_not_release_qualified/)
})

test('rejects duplicate primary keys, duplicate named constraints, and obvious malformed mirror DDL', () => {
  const tables = createTableBodies(contract)
  assert.deepEqual(tables.map(({ name }) => name), [candidateRelation, auditRelation])
  assert.equal(new Set(tables.map(({ name }) => name)).size, tables.length)

  const allConstraintNames = []
  for (const { name, body } of tables) {
    const primaryKeys = countMatches(body, /\bPRIMARY\s+KEY\b/gi)
    assert.equal(primaryKeys, 1, `${name} must declare exactly one primary key`)
    assert.doesNotMatch(body, /,\s*\n\s*\);/, `${name} must not have a dangling comma before its closing parenthesis`)
    assert.equal(countMatches(body, /\(/g), countMatches(body, /\)/g), `${name} must have balanced parentheses`)
    for (const constraint of namedConstraints(body)) allConstraintNames.push(constraint)
  }

  assert.equal(new Set(allConstraintNames).size, allConstraintNames.length, 'named constraints must be unique')
  assert.doesNotMatch(contract, /timeline_v2_graph_identity_audits_pkey\s+PRIMARY\s+KEY/i)
  assert.doesNotMatch(sql, /\bCONSTRAINT\s+[a-z0-9_]+\s*,/i)
})

test('does not alter public Timeline, existing Graph nodes or edges, or Timeline scoring/release state', () => {
  for (const forbidden of [
    /INSERT INTO public\.nodes/,
    /UPDATE public\.nodes/,
    /DELETE FROM public\.nodes/,
    /INSERT INTO public\.edges/,
    /UPDATE public\.edges/,
    /DELETE FROM public\.edges/,
    /INSERT INTO public\.timeline_placement_scores/,
    /INSERT INTO public\.timeline_placement_audits/,
    /INSERT INTO public\.timeline_placement_release_policy/,
    /CREATE .*public.*timeline.*public/i,
  ]) assert.doesNotMatch(sql, forbidden)
  assert.match(hardening, /p\.public_timeline_visibility/)
})
