import test from 'node:test'
import assert from 'node:assert/strict'
import { parseStoryReaderRoute, serializeStoryReaderRoute } from '../src/lib/storyReaderRoute.js'
const storyId = '10000000-0000-4000-8000-000000000001'
const publicVersionId = '20000000-0000-4000-8000-000000000002'
test('exact public Story version restores without substituting graph event identity', () => {
  const route = { storyId, publicVersionId }
  assert.deepEqual(parseStoryReaderRoute(serializeStoryReaderRoute(route)), route)
  assert.deepEqual(parseStoryReaderRoute('#/event/' + storyId + '/news'), { storyId: null, publicVersionId: null })
  assert.equal(serializeStoryReaderRoute({ storyId, publicVersionId: null }), '#/story/' + storyId)
})
test('Story identity refuses display text, ambiguous versions, path escapes and extra state', () => {
  for (const route of [
    '#/story/harbor-update', '#/story/%2f' + storyId,
    `#/story/${storyId}?version=${publicVersionId}&version=${publicVersionId}`,
    `#/story/${storyId}?version=latest`, `#/story/${storyId}?title=event`,
    `#/story/${storyId}/graph`, `#/story/${storyId}?version=${publicVersionId}#other`,
  ]) assert.equal(parseStoryReaderRoute(route).storyId, null, route)
  assert.equal(serializeStoryReaderRoute({ storyId: 'harbor update' }), null)
})
