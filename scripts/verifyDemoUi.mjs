// Optional deterministic browser acceptance over an already-running static build.
// Usage: AGENT_BROWSER_BIN=<native CLI path> node scripts/verifyDemoUi.mjs
// No deployment, service credentials, external navigation or backend calls.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import retained from '../verifier/demo-corpus-20260916/retained-source-receipts.json' with { type: 'json' }
const bin = process.env.AGENT_BROWSER_BIN
assert.ok(bin, 'Set AGENT_BROWSER_BIN to the installed native agent-browser executable')
const base = process.env.DEMO_TEST_URL ?? 'http://127.0.0.1:4180/scripts/demo-corpus-preview.html'
assert.equal(new URL(base).hostname, '127.0.0.1', 'Only the local static preview is permitted')
const session = 'mip-static-remediation'
const report = []
const output = fileURLToPath(new URL('../tests/.compiled/', import.meta.url))
mkdirSync(output, { recursive: true })
function run(...args) {
  const response = spawnSync(bin, ['--session', session, '--json', ...args], { encoding: 'utf8', windowsHide: true, timeout: 30000 })
  assert.equal(response.status, 0, JSON.stringify(args) + ': ' + (response.stderr || response.stdout || response.error?.message))
  const parsed = JSON.parse(response.stdout)
  assert.equal(parsed.success, true, parsed.error)
  return parsed.data
}
const evaluate = script => JSON.parse(run('eval', `JSON.stringify(${script})`).result)
const graphChecks = []
function scrollToControl(selector) {
  assert.equal(evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});node.scrollIntoView({block:'center'});const r=node.getBoundingClientRect();return node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))})()`),true, selector + ' pointer target intercepted')
}
function canvasGeometry(label) {
  const geometry = evaluate(`(()=>{const node=document.querySelector('.graph-canvas');node.scrollIntoView({block:'center'});const r=node.getBoundingClientRect();return {width:r.width,height:r.height,visible:r.bottom>0&&r.top<innerHeight}})()`)
  assert.ok(geometry.width > 100 && geometry.height > 300 && geometry.visible, label + JSON.stringify(geometry))
  return geometry
}
function checkGraph(width, height) {
  visit('graph')
  const geometry = canvasGeometry(width + ' initial')
  run('screenshot', output + `${width}-graph-visible.png`)
  const edgeStyles = evaluate(`(()=>{const cy=document.querySelector('.graph-canvas')._cyreg.cy;cy.zoom(1.5);return cy.edges().map(e=>({label:e.style('label'),line:e.style('line-style'),source:e.style('source-arrow-shape'),target:e.style('target-arrow-shape')}))})()`)
  assert.equal(edgeStyles.length, 17)
  for (const edge of edgeStyles) assert.deepEqual(edge, {label:'receipt-declared provenance (unverified)',line:'dashed',source:'none',target:'none'})
  assert.match(evaluate(`document.querySelector('.demo-provenance-legend').textContent`), /Receipt-declared provenance \(unverified\)/)
  run('set','viewport',String(width-1),String(height))
  canvasGeometry(width + ' resized')
  run('set','viewport',String(width),String(height))
  scrollToControl('input[type=checkbox]')
  run('check','input[type=checkbox]')
  assert.equal(evaluate(`document.querySelector('[data-graph-node-count]').dataset.graphNodeCount`),'95')
  canvasGeometry(width + ' isolated')
  scrollToControl('input[type=checkbox]')
  run('uncheck','input[type=checkbox]')
  // This retained receipt is independently checked as absent from the connected graph before searching.
  const id = retained[0].capture_id
  assert.equal(evaluate(`document.querySelector('.graph-canvas')._cyreg.cy.nodes().some(n=>n.data('capture_id')===${JSON.stringify(id)})`), false)
  for (const method of ['pointer','keyboard']) {
    visit('graph')
    run('fill','input[aria-label="Find graph capture"]',retained[0].article_id)
    scrollToControl('.demo-graph-results button')
    if (method==='pointer') run('click','.demo-graph-results button')
    else {run('focus','.demo-graph-results button');run('press','Enter')}
    assert.ok(evaluate('location.hash').endsWith(id), width + method)
    canvasGeometry(width + method)
  }
  scrollToControl('.demo-provenance-legend button:first-of-type')
  run('click','.demo-provenance-legend button:first-of-type')
  assert.equal(evaluate(`document.activeElement?.getAttribute('aria-label')`),'Close')
  run('press','Shift+Tab')
  assert.equal(evaluate(`document.querySelector('[role=dialog]').contains(document.activeElement)`),true)
  assert.equal(evaluate(`document.activeElement===[...document.querySelectorAll('[role=dialog] button')].at(-1)`),true)
  run('press','Tab')
  assert.equal(evaluate(`document.activeElement?.getAttribute('aria-label')`),'Close')
  run('press','Escape')
  assert.equal(evaluate(`document.querySelector('[role=dialog]')===null`),true)
  assert.equal(evaluate(`document.activeElement===document.querySelector('.demo-provenance-legend button')`),true)
  graphChecks.push({width,geometry,resize:'pass',isolated_toggle:'pass',pointer:'pass',keyboard:'pass',modal:'pass',edge_styles:17})
}
const visit = surface => run('open', `${base}#/demo/all/${surface}`)
try {
  for (const [width, height] of [[1440, 900], [820, 1180], [390, 844]]) {
    run('set', 'viewport', String(width), String(height))
    for (const surface of ['context', 'news', 'compare', 'graph', 'timeline', 'arc', 'evidence', 'world']) {
      visit(surface)
      run('wait', '.demo-native-view')
      const state = evaluate(`({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,
        content:document.querySelector('.demo-native-view').textContent.length,
        capabilities:document.querySelectorAll('[data-capability]').length,
        candidates:document.querySelectorAll('[data-candidate-id]').length,
        timeline:document.querySelectorAll('.demo-receipt-timeline time').length,
        graph:document.querySelector('[data-graph-node-count]')?.dataset,
        outside:[...document.querySelectorAll('.demo-candidate-grid > article,.demo-capability-grid > details')].filter(node=>node.getBoundingClientRect().right>innerWidth+1).length,
        external:performance.getEntriesByType('resource').filter(resource=>new URL(resource.name).origin!==location.origin).map(resource=>resource.name),
        failed:performance.getEntriesByType('resource').filter(resource=>resource.responseStatus>=400).map(resource=>resource.name)})`)
      assert.equal(state.width, width)
      assert.equal(state.overflow, false, `${width} ${surface}: page overflow`)
      assert.equal(state.outside, 0, `${width} ${surface}: clipped cards`)
      assert.ok(state.content > 40)
      assert.deepEqual(state.external, [])
      assert.deepEqual(state.failed, [])
      if (surface === 'context') assert.equal(state.capabilities, 22)
      if (surface === 'compare') assert.equal(state.candidates, 93)
      if (surface === 'timeline') assert.equal(state.timeline, 92)
      if (surface === 'graph') {
        assert.equal(state.graph.graphNodeCount, '19')
        assert.equal(state.graph.graphEdgeCount, '17')
      }
      report.push({ width, height, surface, result: 'pass' })
      console.log(`PASS ${width} ${surface}`)
      if ((width === 1440 && surface === 'context') || (width === 820 && surface === 'compare') || (width === 390 && surface === 'graph')) run('screenshot', output + `${width}-${surface}.png`)
    }
    checkGraph(width, height)
    visit('context')
    for (const label of ['What Changed', 'Hypotheses', 'Commitments', 'Evidence Gaps', 'Source History', 'Source Links', 'Evidence Checks', 'Search Coverage', 'Overview']) {
      run('find', 'role', 'button', 'click', '--name', label, '--exact')
      assert.equal(evaluate(`document.querySelector('section[aria-label=${JSON.stringify(label)}]')!==null`), true, label)
    }
  }
  visit('news')
  run('fill', 'input[type=search]', retained[0].article_id)
  assert.equal(evaluate(`document.querySelectorAll('.demo-source-grid > button').length`), 1)
  assert.equal(evaluate(`document.querySelector('[data-search-outcome]')?.dataset.searchOutcome`), 'matches')
  assert.doesNotMatch(evaluate(`document.querySelector('[aria-label="Bounded search coverage"]').textContent`), /No substring match|no claim of real-world absence/)
  scrollToControl('.demo-source-grid > button')
  run('click', '.demo-source-grid > button')
  assert.ok(evaluate('location.hash').endsWith(retained[0].capture_id))
  for (const surface of ['compare', 'graph', 'timeline', 'arc', 'context', 'evidence']) {
    run('open', `${base}#/demo/all/${surface}/${retained[0].capture_id}`)
    assert.ok(evaluate('location.hash').endsWith(retained[0].capture_id))
    assert.equal(evaluate(`document.querySelector('[data-selected-capture]')?.dataset.selectedCapture`), retained[0].capture_id)
  }
  visit('graph')
  run('check', 'input[type=checkbox]')
  assert.equal(evaluate(`document.querySelector('[data-graph-node-count]').dataset.graphNodeCount`), '95')
  run('uncheck', 'input[type=checkbox]')
  run('fill', 'input[aria-label="Find graph capture"]', retained[0].article_id)
  run('click', '.demo-graph-results button')
  assert.ok(evaluate('location.hash').endsWith(retained[0].capture_id))
  assert.deepEqual(run('errors').errors, [])
  assert.deepEqual(run('console').messages, [])
  console.log(JSON.stringify({ viewport_routes: report, graph_interactions: graphChecks, native_section_checks: 27, selected_surface_checks: 6,
    global_metadata_search: 'pass', isolated_graph_search: 'pass', console_errors: 0, console_messages: 0,
    external_resource_requests: 0 }, null, 2))
} finally {
  try { run('close') } catch (error) { console.error('Browser cleanup:', error.message) }
}
