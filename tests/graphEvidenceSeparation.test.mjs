import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const articlePanel = readFileSync(new URL('../src/panels/ArticlePanel.jsx', import.meta.url), 'utf8')
const relationshipPanel = readFileSync(new URL('../src/panels/RelationshipPanel.jsx', import.meta.url), 'utf8')

test('node inspector labels node-attached articles and node-level source records separately', () => {
  assert.match(articlePanel, /Articles attached to this node/)
  assert.match(articlePanel, /Node-level source records/)
  assert.match(articlePanel, /loadNodeArticles\(node\.id\)/)
  assert.match(articlePanel, /loadSources\(nodeKey\)/)
})

test('relationship evidence is opened only from an explicit selected-edge action', () => {
  assert.match(articlePanel, /aria-label=\{`Evidence for connection to \$\{c\.label\}`\}/)
  assert.match(articlePanel, /onClick=\{\(\) => onShowEdgeEvidence\(c\.edge\)\}/)
  assert.match(relationshipPanel, /<h2>Relationship<\/h2>/)
  assert.match(relationshipPanel, /loadEdgeSources\(explanation\.source_ids\)/)
  assert.doesNotMatch(articlePanel, /loadEdgeSources/)
})
