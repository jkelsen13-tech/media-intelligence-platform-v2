import test from 'node:test'
import assert from 'node:assert/strict'
import {createCesiumOwnedHost} from '../src/lib/worldViewCesiumEllipsoidRendererAdapter.js'
test('failed Cesium construction and late teardown remove only owned DOM',()=>{
  const children=[]
  const parent={ownerDocument:{createElement:()=>({style:{},remove(){const i=children.indexOf(this);if(i>=0)children.splice(i,1)}})},
    appendChild(node){children.push(node)}}
  const first=createCesiumOwnedHost(parent)
  first.element.partialViewer={errorPanel:true}
  const fallback={mapCanvas:true}
  parent.appendChild(fallback)
  first.destroy()
  assert.deepEqual(children,[fallback],'failed constructor overlay cannot cover fallback')
  const successor=createCesiumOwnedHost(parent)
  first.destroy()
  assert.deepEqual(children,[fallback,successor.element],'late repeated cleanup preserves successor')
  successor.destroy()
  assert.deepEqual(children,[fallback])
})
