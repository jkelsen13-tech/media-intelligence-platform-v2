import test from 'node:test'
import assert from 'node:assert/strict'
import {serializeDeepLink, hydrateDeepLink} from '../src/lib/deepLinks.js'

test('shared links retain subject type and parent across every evidence view', () => {
  for (const type of ['event','article','arc','person','organization','topic','location',null]) {
    for (const active_view of ['graph','news','world','timeline','arcs','compare']) {
      const original={canonical_subject_type:type,canonical_subject_id:'record-123',parent_event_id:'parent%2F123',active_view}
      const link=serializeDeepLink(original)
      const restored=hydrateDeepLink(link).investigationContext
      assert.equal(restored.canonical_subject_type,type)
      assert.equal(restored.canonical_subject_id,original.canonical_subject_id)
      assert.equal(restored.parent_event_id,original.parent_event_id)
      assert.equal(restored.active_view,active_view)
      assert.equal(serializeDeepLink(restored),link)
    }
  }
})

test('legacy event links remain compatible and stale selections cannot replace identity', () => {
  const old=hydrateDeepLink('#/event/record-123/news').investigationContext
  assert.equal(old.canonical_subject_type,'event')
  assert.equal(old.parent_event_id,null)
  assert.equal(serializeDeepLink({canonical_subject_id:'record-123',active_view:'news'}),'#/event/record-123/news')
  const ic={canonical_subject_id:'article-123',canonical_subject_type:'article',parent_event_id:'event-123',active_view:'news'}
  const restored=hydrateDeepLink(serializeDeepLink(ic,{subject_type:'event',parent_event:'wrong'})).investigationContext
  assert.equal(restored.canonical_subject_type,'article')
  assert.equal(restored.parent_event_id,'event-123')
})

test('invalid or conflicting identity metadata stays unknown without inventing another subject', () => {
  for(const query of ['subject_type=','subject_type=article&subject_type=event','subject_type=a%00b','subject_type='+ 'a'.repeat(65)]) {
    const restored=hydrateDeepLink('#/event/record-123/news?'+query).investigationContext
    assert.equal(restored.canonical_subject_type,null)
    assert.equal(restored.canonical_subject_id,'record-123')
  }
  for(const query of ['parent_event=a&parent_event=b','parent_event=%2Fother','parent_event=a%00b','parent_event='+ 'a'.repeat(513)]) {
    const restored=hydrateDeepLink('#/event/record-123/news?subject_type=article&'+query).investigationContext
    assert.equal(restored.parent_event_id,null)
    assert.equal(restored.canonical_subject_type,'article')
    assert.equal(restored.canonical_subject_id,'record-123')
  }
})
