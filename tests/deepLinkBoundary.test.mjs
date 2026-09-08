import test from 'node:test'
import assert from 'node:assert/strict'
import {parseDeepLink, hydrateDeepLink, serializeDeepLink} from '../src/lib/deepLinks.js'
import {emptyInvestigationContext, applySubject} from '../src/lib/investigationContext.js'

test('malformed encoded segments never throw or commit a different subject', () => {
  const currentIc = applySubject(emptyInvestigationContext('graph'), {canonical_subject_type:'event',canonical_subject_id:'retained-subject'})
  for (const hash of ['#/event/%/world', '#/event/%E0%A4%A/world', '#/event/a/%FF',
    '#/event/a%2Fb/world', '#/event/a%5Cb/world', '#/event/a%00b/world', '#/event/a/world/extra']) {
    assert.equal(parseDeepLink(hash).subjectId, null, hash)
    const result = hydrateDeepLink(hash, {currentIc})
    assert.equal(result.committed, false)
    assert.equal(result.investigationContext.canonical_subject_id, 'retained-subject')
  }
})
test('inherited property names cannot become renderer views', () => {
  for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    const parsed = parseDeepLink('#/event/subject/' + name)
    assert.equal(parsed.subjectId, 'subject')
    assert.equal(parsed.view, null)
    assert.equal(parsed.unknownView, true)
    const result = hydrateDeepLink('#/event/subject/' + name)
    assert.equal(result.investigationContext.active_view, 'graph')
    assert.equal(serializeDeepLink({canonical_subject_id:'subject',active_view:name}), '#/event/subject/graph')
  }
})
test('duplicate supported query keys are omitted without choosing an arbitrary value', () => {
  const parsed = parseDeepLink('#/event/subject/world?entity=a&entity=b&time=2024-04-08..&source=one')
  assert.equal(parsed.selection.entity, null)
  assert.equal(parsed.selection.source, 'one')
  assert.equal(parsed.selection.time, '2024-04-08..')
  assert.equal(parsed.subjectId, 'subject')
})
test('credential and private-text query fields are excluded from route round trips', () => {
  const result = hydrateDeepLink('#/event/subject/world?access_token=synthetic-secret&refresh_token=synthetic-refresh&title=private-note&entity=subject')
  const hash = serializeDeepLink(result.investigationContext, result.selection)
  assert.doesNotMatch(hash, /synthetic-secret|synthetic-refresh|private-note|access_token|refresh_token|title/)
  assert.match(hash, /entity=subject/)
})
test('bounded routes and fields reject control characters and oversized inputs', () => {
  assert.equal(parseDeepLink('#/event/' + 'a'.repeat(513) + '/world').subjectId, null)
  assert.equal(parseDeepLink('#/event/a/world?' + 'a'.repeat(8192)).subjectId, null)
  assert.equal(parseDeepLink({toString(){throw Error('must not coerce')}}).subjectId, null)
  assert.equal(parseDeepLink('#/event/a/world?entity=x%00y').selection.entity, null)
  assert.equal(parseDeepLink('#/event/a/world?source=' + 's'.repeat(1025)).selection.source, null)
})
test('ordinary encoded identity and supported selections still round trip', () => {
  const parsed = parseDeepLink('#/event/event%3Aone/world?entity=entity%3Aone&time=2024-04-08..2024-04-09')
  assert.equal(parsed.subjectId, 'event:one')
  assert.equal(parsed.view, 'world')
  assert.equal(parsed.selection.entity, 'entity:one')
  assert.equal(parsed.selection.time, '2024-04-08..2024-04-09')
})
