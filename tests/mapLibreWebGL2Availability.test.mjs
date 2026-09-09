import test from 'node:test'
import assert from 'node:assert/strict'
import {mapLibreWebGL2Available} from '../src/lib/worldViewRendererAdapter.js'
test('MapLibre rejects missing WebGL2 before a partial renderer can block atlas fallback',()=>{
  for(const doc of [undefined,{createElement:()=>({getContext:()=>null})},{createElement:()=>({getContext:()=>{throw Error('context denied')}})}])
    assert.equal(mapLibreWebGL2Available(doc),false)
  let released=0
  const doc={createElement:()=>({getContext:kind=>{
    assert.equal(kind,'webgl2')
    return {getExtension:name=>{assert.equal(name,'WEBGL_lose_context');return {loseContext:()=>released++}}}
  }})}
  assert.equal(mapLibreWebGL2Available(doc),true)
  assert.equal(released,1,'capability probe does not retain a graphics context')
})
