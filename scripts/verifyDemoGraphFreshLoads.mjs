// Repeated real-browser acceptance against the already-running local static build.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
const bin = process.env.AGENT_BROWSER_BIN
assert.ok(bin, 'AGENT_BROWSER_BIN is required')
const base = process.env.DEMO_TEST_URL ?? 'http://127.0.0.1:4180/scripts/demo-corpus-preview.html'
assert.equal(new URL(base).hostname, '127.0.0.1')
const session = 'mip-fresh-graph-bounds'
function run(...args) {
  const result = spawnSync(bin, ['--session', session, '--json', ...args], {encoding:'utf8',windowsHide:true,timeout:30000})
  assert.equal(result.status,0, JSON.stringify(args)+': '+(result.stderr||result.stdout))
  const parsed=JSON.parse(result.stdout)
  assert.equal(parsed.success,true,parsed.error)
  return parsed.data
}
const evaluate = script => JSON.parse(run('eval', 'JSON.stringify('+script+')').result)
function bounds(label) {
  const result=evaluate(`(()=>{const cy=document.querySelector('.graph-canvas')._cyreg.cy;return {state:cy.scratch('initialFitState'),width:cy.width(),height:cy.height(),nodes:cy.nodes().map(n=>({id:n.id(),center:n.renderedPosition(),box:n.renderedBoundingBox({includeLabels:false,includeOverlays:false})}))}})()`)
  assert.equal(result.state,'complete',label)
  assert.equal(result.nodes.length,19,label)
  for(const {id,center,box} of result.nodes) {
    assert.ok(center.x>=0&&center.y>=0&&center.x<=result.width&&center.y<=result.height,label+' center '+id)
    assert.ok(box.x1>=0&&box.y1>=0&&box.x2<=result.width&&box.y2<=result.height,label+' bounds '+id+' '+JSON.stringify(box))
  }
}
const viewport = `(()=>{const cy=document.querySelector('.graph-canvas')._cyreg.cy;return {zoom:cy.zoom(),pan:cy.pan()}})()`
try {
  for(const [width,height] of [[1440,900],[820,1180],[390,844]]) {
    run('set','viewport',String(width),String(height))
    for(let iteration=0;iteration<12;iteration++) {
      // A new query forces document navigation, not a same-document hash change.
      run('open',base+'?fresh='+width+'-'+iteration+'#/demo/all/graph')
      run('wait','2200')
      bounds(width+'/'+iteration+' at 2.2s')
      run('wait','2800')
      bounds(width+'/'+iteration+' at 5s')
      if(iteration===11) {
        run('focus','.graph-canvas')
        run('press','+')
        const requested=evaluate(viewport)
        run('wait','1600')
        assert.deepEqual(evaluate(viewport),requested,'user viewport must not be refitted')
      }
      console.log('PASS fresh '+width+' #'+(iteration+1)+'; 19 centers/bounds at 2.2s and 5s')
    }
  }
  assert.deepEqual(run('errors').errors,[])
  assert.deepEqual(run('console').messages,[])
  console.log('PASS 36 fresh loads / 72 full-bound checks / user viewport preservation at 3 widths / console clean')
} finally {
  try {run('close')} catch(error) {console.error('Browser cleanup:',error.message)}
}
