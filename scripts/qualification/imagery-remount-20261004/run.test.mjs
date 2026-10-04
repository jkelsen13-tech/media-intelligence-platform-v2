import assert from 'node:assert/strict'
import test from 'node:test'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import {AUTHORITY,BASE_HEAD,BASE_TREE,loopbackBase,frozenIdentity,fixtureRows,injectTransport} from './run.mjs'

test('execution requires exact clean parent-frozen head and tree',()=>{
  const current={head:BASE_HEAD,tree:BASE_TREE,dirty:false}
  frozenIdentity(current,{expectedHead:BASE_HEAD,expectedTree:BASE_TREE})
  assert.throws(()=>frozenIdentity(current,{}))
  assert.throws(()=>frozenIdentity({...current,dirty:true},{expectedHead:BASE_HEAD,expectedTree:BASE_TREE}))
  assert.throws(()=>frozenIdentity({...current,head:'1'.repeat(40)},{expectedHead:BASE_HEAD,expectedTree:BASE_TREE}))
})
test('only explicit plain loopback application origins are accepted',()=>{
  assert.equal(loopbackBase('http://127.0.0.1:4291/media-intelligence-platform-v2/').port,'4291')
  for(const value of ['https://example.com/media-intelligence-platform-v2/','http://127.0.0.1:4291/','http://localhost:4291/media-intelligence-platform-v2/?key=fixture','http://user:fixture@localhost:4291/media-intelligence-platform-v2/'])assert.throws(()=>loopbackBase(value))
})
test('reused deterministic fixture preserves facility precision, release/time and displaced geometry',()=>{
  const rows=fixtureRows();assert.equal(rows.length,12);assert.deepEqual(rows,fixtureRows())
  assert.equal(new Set(rows.map(row=>row.revision_id)).size,12)
  for(const row of rows){assert.equal(row.precision_class,'facility');assert.equal(row.geometry_status,'coarsened_to_precision_class');assert.equal(row.release_state,'released');assert.equal(row.review_state,'reviewed');assert.equal(row.valid_from_utc,'2026-01-01T00:00:00Z');assert.ok(row.display_geometry.coordinates[0]>=-81.65-1e-10)}
  assert.equal(AUTHORITY,'SIMULATED_TEST_AUTHORITY_ONLY')
})
test('existing installed Vite transform supports one exact disposable transport seam',async()=>{
  const {transformWithEsbuild}=await import(pathToFileURL('/workspace/mip-oct03-release-dependency/node_modules/vite/dist/node/index.js').href)
  const body=await readFile('src/views/WorldView.jsx','utf8')
  const transformed=await transformWithEsbuild(body,'WorldView.jsx',{loader:'jsx',jsx:'automatic'})
  const modified=injectTransport(transformed.code,'/media-intelligence-platform-v2/')
  assert.ok(modified.includes('realismServices: window.__MIP_RGB_TEST__.services, cameraMemory: cameraMemoryRef.current,'))
  assert.ok(modified.includes('createWorldViewBoundedRgbTransport as createTestTransport'))
  assert.throws(()=>injectTransport('no existing seam','/media-intelligence-platform-v2/'))
  assert.throws(()=>injectTransport(transformed.code+transformed.code,'/media-intelligence-platform-v2/'))
  assert.throws(()=>injectTransport(transformed.code,'/other/'))
})
