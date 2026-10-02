import test from 'node:test'
import assert from 'node:assert/strict'
import { buildWorldBillboardModel, suppliedWorldBillboardModules, worldBillboardModuleTabs } from '../src/lib/worldViewBillboardModules.js'

test('only exact explicit supplied module payload admits a domain tab', () => {
  const content = [{ text: 'Recorded market evidence', sourceRefs: [{ url: 'https://example.test/source' }] }]
  const record = { key:'a', family:'markets', company:'Nearby company', proximity:1, suppliedModules:[{id:'market',label:'Recorded market',content}] }
  const model = buildWorldBillboardModel(record)
  assert.deepEqual(model.moduleTabs.map(x=>x.id),['evidence','context','sources','market'])
  assert.equal(model.moduleTabs[3].content,content)
  assert.deepEqual(buildWorldBillboardModel({family:'markets',company:'Exists'}).moduleTabs.map(x=>x.id),['evidence','context','sources'])
})
test('absent, unknown, ineligible and ambiguous modules fail closed without inference', () => {
  assert.deepEqual(suppliedWorldBillboardModules([{id:'people',label:'People',content:[],eligible:false},{id:'causality',label:'Inferred cause',content:['nearby']},{id:'event',label:'Missing payload'},{id:'place',label:'First',content:[]},{id:'place',label:'Second',content:[]}]),[])
  assert.deepEqual(suppliedWorldBillboardModules(null),[])
})
test('event, inspection, imagery and current context dates remain separate with exact values', () => {
  const model=buildWorldBillboardModel({key:'a',eventTime:'2024-04',eventTimeRange:['2024-04-01','2024-05-01']},{inspectionTime:'2026-10-01T12:00:00Z',backgroundCaptureTime:'2019-10-12',currentContextTime:'2026-09-30'})
  const fields=Object.fromEntries(model.metadata.map(x=>[x.label,x.value]))
  assert.equal(fields['Event evidence time'],'2024-04')
  assert.equal(fields['Recorded inspection time'],'2026-10-01T12:00:00Z')
  assert.equal(fields['Background imagery capture'],'2019-10-12')
  assert.equal(fields['Current context reference time'],'2026-09-30')
  assert.equal(fields['Event evidence range'],'2024-04-01 → 2024-05-01')
})
test('missing event time never borrows inspection or background/current dates', () => {
  const model=buildWorldBillboardModel({eventTime:null,occurred_at:null},{inspectionTime:'2026-10-01',backgroundCaptureTime:'2019',currentContextTime:'2026'})
  assert.equal(model.metadata.find(x=>x.label==='Event evidence time').value,'Unavailable')
})

test('blank and nonfinite scalar clocks remain explicitly unavailable', () => {
  const model = buildWorldBillboardModel({ eventTime: ' ', precision: NaN, eventTimeRange: ['', '2024-04-08'] }, { inspectionTime: Infinity, currentContextTime: '' })
  const fields = Object.fromEntries(model.metadata.map(field => [field.label, field.value]))
  assert.equal(fields['Event evidence time'], 'Unavailable')
  assert.equal(fields['Recorded inspection time'], 'Unavailable')
  assert.equal(fields['Evidence precision'], 'Unavailable')
  assert.equal(fields['Current context reference time'], 'Unavailable — no current context supplied')
  assert.equal(Object.hasOwn(fields, 'Event evidence range'), false)
})
test('canonical coordinates and precision are copied exactly without elevating city evidence', () => {
  const record={key:'city',coordinates:[-81.7,41.4,0],precision:'city',suppliedModules:[{id:'place',label:'Place',content:[{text:'Explicit place evidence'}]}]}
  const before=JSON.stringify(record),model=buildWorldBillboardModel(record)
  assert.deepEqual(model.canonicalCoordinates,record.coordinates)
  assert.notEqual(model.canonicalCoordinates,record.coordinates)
  assert.equal(model.precision,'city');assert.equal(JSON.stringify(record),before)
})
test('existing three core module layouts remain compatible and first class', () => {
  const model={modules:{evidence:['e'],context:['c'],sources:['s']}}
  assert.deepEqual(worldBillboardModuleTabs(model).map(x=>[x.id,x.content]),[['evidence',['e']],['context',['c']],['sources',['s']]])
  assert.deepEqual(worldBillboardModuleTabs({moduleTabs:[{id:'event',label:'Event',content:['Supplied']}]}).map(x=>x.id),['evidence','context','sources','event'])
})

test('malformed coordinates remain unavailable and explicit canonical coordinates take precedence', () => {
  assert.equal(buildWorldBillboardModel({coordinates:[]}).canonicalCoordinates,null)
  assert.equal(buildWorldBillboardModel({coordinates:[-81.7,NaN]}).canonicalCoordinates,null)
  assert.deepEqual(buildWorldBillboardModel({canonicalCoordinates:[-81.7,41.4,0],coordinates:[0,0,18]}).canonicalCoordinates,[-81.7,41.4,0])
})
