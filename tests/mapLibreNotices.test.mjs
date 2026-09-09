import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {mapLibreNoticeAssets} from '../verifier/mapLibreNoticeAssets.mjs'
test('shipped MapLibre notices bind every locked dependency to exact installed bytes',()=>{
  const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
  const assets=mapLibreNoticeAssets(root)
  const inventory=JSON.parse(assets.find(a=>a.fileName==='licenses/maplibre/inventory.json').source)
  assert.equal(inventory.find(r=>r.path==='node_modules/maplibre-gl').version,'6.4.1')
  assert.ok(inventory.length>1,'transitive notices are required')
  for(const row of inventory){
    assert.ok(row.integrity)
    assert.ok(row.files.length)
    for(const file of row.files){
      const name=file.slice(file.lastIndexOf('/')+1)
      const emitted=assets.find(a=>a.fileName===file)
      assert.deepEqual(emitted.source,readFileSync(resolve(root,row.path,name)))
    }
  }
})
