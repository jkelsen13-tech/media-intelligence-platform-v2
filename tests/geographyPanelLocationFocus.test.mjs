import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const panel = readFileSync(join(root, 'src', 'graph', 'GraphModePanel.jsx'), 'utf8')
const app = readFileSync(join(root, 'src', 'App.jsx'), 'utf8')

test('Geography mode uses the shared multi-node location focus contract', () => {
  assert.match(panel, /function locationPlaceKey\(row\)/)
  assert.match(panel, /onSelectLocation=\{onSelectLocation\}/)
  assert.match(panel, /activeNodeKey=\{activeNodeKey\}/)
  assert.match(panel, /activePlaceKey=\{activePlaceKey\}/)
  assert.match(panel, /onClick=\{\(\) => selectLocationRecord\(row\)\}/)
  assert.match(panel, /onSelectLocation\(\{ placeKey, place: row\.place, nodeKeys \}\)/)
})

test('App supplies Geography mode with the established location focus handler', () => {
  const geographyPanel = app.slice(app.indexOf('<GraphModePanel'), app.indexOf(') : (', app.indexOf('<GraphModePanel')))
  assert.match(geographyPanel, /onSelectLocation=\{handleLocationFocus\}/)
  assert.match(geographyPanel, /activeNodeKey=\{activeGraphNodeKey\}/)
  assert.match(geographyPanel, /activePlaceKey=\{activeLocationKey\}/)
})
