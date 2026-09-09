import test from 'node:test'
import assert from 'node:assert/strict'
import { sameCameraPose } from '../verifier/cameraPoseComparison.mjs'

test('camera comparison permits only machine-scale orientation normalization, never position movement',()=>{
  const before=[{x:2043716.2570129326,y:-13743169.250963883,z:12015327.491154974},
    {x:-0.1109385674530062,y:0.7460172143439084,z:-0.6566208572334797},
    {x:-0.33130241099983465,y:0.5951459518641191,z:0.7321475318851034},
    {x:0.9369799073177458,y:0.2987634714658176,z:0.18113266243425613}]
  const after=structuredClone(before)
  after[1]={x:-0.11093856745300563,y:0.7460172143439086,z:-0.6566208572334798}
  after[3]={x:0.9369799073177458,y:0.29876347146581717,z:0.1811326624342565}
  assert.equal(sameCameraPose(after,before),true)
  for(const [index,delta] of [[0,1e-8],[1,1e-12],[2,1e-12],[3,1e-12]]){
    const moved=structuredClone(before);moved[index].x+=delta
    assert.equal(sameCameraPose(moved,before),false)
  }
  const invalid=structuredClone(before);invalid[1].x=NaN
  assert.equal(sameCameraPose(invalid,before),false)
  assert.equal(sameCameraPose(null,before),false)
  assert.equal(sameCameraPose([],[]),false)
})
