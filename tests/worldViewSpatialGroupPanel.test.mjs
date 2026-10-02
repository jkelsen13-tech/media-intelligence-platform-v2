import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { createServer } from 'vite'
import { projectionRowDisplayKey } from '../src/lib/worldViewDisplayClusters.js'

function renderedText(node) {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(renderedText).join('')
  return renderedText(node.children)
}

test('spatial groups inspect separately from exact row picks, count rows/locations, retain selected rows and discard stale inspections', async t => {
  const server = await createServer({
    configFile: false,
    esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: 'custom',
  })
  t.after(() => server.close())
  const { default: Panel, WorldViewDisplayOverlay: Overlay } = await server.ssrLoadModule('/src/components/WorldViewSpatialGroupPanel.jsx')
  const rows = Array.from({length: 25}, (_, i) => Object.freeze({
    mip_object_id: 'object-' + i, revision_id: 'revision-' + i, precision_class: 'city',
    source_native_time: Object.freeze({location_label: 'Recorded place ' + i}),
  }))
  const members = rows.map((row, i) => ({id: 'marker-' + i, row, positionIndex: 0, x: 30 + i, y: 50, selected: i === 24, visible: true}))
  members.push({...members[0], id: 'extra-location-1', positionIndex: 1})
  members.push({...members[0], id: 'extra-location-2', positionIndex: 2})
  const cluster = {id: 'group', rowMembers: rows, members, rowCount: 25, locationCount: 27, selected: true, x: 30, y: 50, anchor: members[0]}
  const singleRows = Array.from({length: 26}, (_, i) => ({mip_object_id:'single-' + i,revision_id:'single-version-' + i,precision_class:'city'}))
  const singles = singleRows.map((row,i) => ({id:'single-marker-' + i,row,positionIndex:0,x:100+i,y:100,visible:true,selected:i===25}))
  singles.push({...singles[0],id:'same-row-second-location',positionIndex:1})
  const line = {edgeIndex: 0, edge: {id:'documented-edge',type:'sequence'},type:'sequence',x1:20,y1:30,x2:70,y2:80,selected:true}
  let presentation = {width:200,height:200,layout:{clusters:[cluster],singles},relationshipSummary:{lines:[line]},relationshipLabels:new Set([0])}
  const inspections = [], memberPicks = [], singlePicks = []
  let inspectionRevision = 0
  const props = inspectedClusterId => ({
    presentation, inspectedClusterId, inspectionRevision,
    onInspectCluster:id=>inspections.push(id),
    onSelectMember:(id,key)=>memberPicks.push([id,key]),
    onSelectSingle:key=>singlePicks.push(key),
  })
  let overlay, panel
  const detailsMock = {open:false}
  let focused = 0
  await act(async () => {
    overlay = TestRenderer.create(React.createElement(Overlay,{presentation,onInspectCluster:id=>inspections.push(id)}))
    panel = TestRenderer.create(React.createElement(Panel,props(null)),{
      createNodeMock:node=>node.type==='details'?detailsMock:node.type==='h4'?{focus:()=>{focused++}}:null,
    })
  })
  t.after(()=>overlay.unmount())
  t.after(()=>panel.unmount())
  const groupName = 'Inspect group: 25 projection rows, 27 display locations'
  assert.deepEqual(overlay.root.findByProps({className:'wv-display-overlay'}).props.style,{width:'200px',height:'200px'},'the overlay uses the renderer viewport, excluding document-flow attribution')
  const overlayButton = overlay.root.findByProps({'aria-label':groupName})
  assert.equal(overlayButton.type,'button')
  assert.equal(overlayButton.props['data-cluster-id'],'group')
  assert.deepEqual(overlayButton.props.style,{left:'15%',top:'25%'})
  await act(async()=>overlayButton.props.onClick())
  assert.deepEqual(inspections,['group'])
  assert.deepEqual(memberPicks,[])
  assert.deepEqual(singlePicks,[])
  const renderedLine = overlay.root.findAll(node=>node.type==='line')[0]
  assert.equal(renderedLine.props.x1,20)
  assert.equal(renderedLine.props.y1,30)
  assert.equal(renderedLine.props.x2,70)
  assert.equal(renderedLine.props.y2,80)
  assert.ok(renderedLine.props.markerEnd)
  assert.match(renderedText(overlay.toJSON()),/sequence/)
  assert.equal(panel.root.findByProps({'aria-label':'Spatial groups'}).type,'details')
  assert.match(renderedText(panel.toJSON()),/Display groups. Counts refer to projection rows and their display locations/)
  assert.match(renderedText(panel.toJSON()),/25 rows/)
  assert.match(renderedText(panel.toJSON()),/Selected projection row: Recorded place 24/)
  assert.match(renderedText(panel.toJSON()),/26 individual rows/,'single rows must deduplicate multiple locations of one version')

  await act(async()=>panel.update(React.createElement(Panel,props('group'))))
  assert.equal(detailsMock.open,true)
  assert.equal(focused,1)
  detailsMock.open = false
  await act(async()=>panel.update(React.createElement(Panel,props('group'))))
  assert.equal(detailsMock.open,false,'an unchanged presentation cannot reopen a manually collapsed inspector')
  assert.equal(focused,1)
  inspectionRevision = 1
  await act(async()=>panel.update(React.createElement(Panel,props('group'))))
  assert.equal(detailsMock.open,true,'a deliberate repeated inspection reopens the same group')
  assert.equal(focused,2)
  const memberRegion = ()=>panel.root.findByProps({'aria-label':'Inspected group projection rows'})
  const rowButtons = root=>root.findAll(node=>node.type==='button'&&node.props['data-row-key']!=null)
  assert.equal(rowButtons(memberRegion()).length,20)
  const selectedMember = rowButtons(memberRegion())[0]
  assert.equal(selectedMember.props['aria-label'],'Select projection row: Recorded place 24')
  assert.equal(selectedMember.props.type,'button','native buttons provide keyboard activation')
  assert.equal(selectedMember.findAll(node=>node.type==='span'&&node.children.includes('Selected')).length,1)
  assert.ok(selectedMember.props['aria-describedby'])
  assert.match(renderedText(panel.toJSON()),/object-24/)
  assert.match(renderedText(panel.toJSON()),/revision-24/)
  assert.match(renderedText(panel.toJSON()),/display locations/)
  await act(async()=>selectedMember.props.onClick())
  assert.deepEqual(memberPicks,[['group',projectionRowDisplayKey(rows[24])]])
  assert.deepEqual(singlePicks,[])
  const seen = new Set(rowButtons(memberRegion()).map(button=>button.props['data-row-key']))
  const memberNext = panel.root.findByProps({'aria-label':'Inspected group row pages'}).findAll(node=>node.type==='button'&&node.children.includes('Next'))[0]
  await act(async()=>memberNext.props.onClick())
  rowButtons(memberRegion()).forEach(button=>seen.add(button.props['data-row-key']))
  assert.equal(seen.size,25)

  const individualRegion = ()=>panel.root.findByProps({'aria-label':'Individual projection rows'})
  assert.equal(rowButtons(individualRegion()).length,20)
  assert.equal(rowButtons(individualRegion())[0].props['data-row-key'],projectionRowDisplayKey(singleRows[25]))
  const singleNext = panel.root.findByProps({'aria-label':'Individual projection row pages'}).findAll(node=>node.type==='button'&&node.children.includes('Next'))[0]
  await act(async()=>singleNext.props.onClick())
  assert.equal(rowButtons(individualRegion()).length,6)

  // The same seed ID has current members only. Removed rows do not stay cached.
  presentation = {...presentation,layout:{clusters:[{...cluster,rowMembers:[rows[0]],members:[members[0]],rowCount:1,locationCount:1,selected:false}],singles:[]}}
  await act(async()=>panel.update(React.createElement(Panel,props('group'))))
  assert.equal(rowButtons(memberRegion()).length,1)
  assert.equal(rowButtons(memberRegion())[0].props['data-row-key'],projectionRowDisplayKey(rows[0]))
  assert.equal(focused,2,'renderer updates cannot repeatedly focus or choose a member')
  assert.equal(memberPicks.length,1)

  // Automatic disappearance and return of the same seed does not replay inspection.
  const currentPresentation = presentation
  detailsMock.open = false
  presentation = {...presentation,layout:{clusters:[],singles:[]}}
  await act(async()=>panel.update(React.createElement(Panel,props('group'))))
  presentation = currentPresentation
  await act(async()=>panel.update(React.createElement(Panel,props('group'))))
  assert.equal(detailsMock.open,false)
  assert.equal(focused,2,'automatic regrouping must not steal focus')

  // After a pick narrows the map, the selected original row remains deliberately pickable.
  presentation = {...presentation,layout:{clusters:[],singles:[members[24]]}}
  await act(async()=>panel.update(React.createElement(Panel,props('group'))))
  assert.equal(panel.root.findAll(node=>node.props['aria-label']==='Inspected group projection rows').length,0)
  assert.match(renderedText(panel.toJSON()),/no longer in the current display/)
  const retained = rowButtons(individualRegion())[0]
  assert.equal(retained.props['aria-label'],'Select projection row: Recorded place 24')
  await act(async()=>retained.props.onClick())
  await act(async()=>retained.props.onClick())
  assert.deepEqual(singlePicks,[projectionRowDisplayKey(rows[24]),projectionRowDisplayKey(rows[24])])
  assert.equal(memberPicks.length,1)

  presentation = {...presentation,layout:{clusters:Array.from({length:30},(_,i)=>({...cluster,id:'group-'+i,selected:false})),singles:[]}}
  await act(async()=>panel.update(React.createElement(Panel,props(null))))
  const groupButtons = ()=>panel.root.findAll(node=>node.type==='button'&&node.props['data-cluster-id']!=null)
  assert.equal(groupButtons().length,20)
  const groupNext = panel.root.findByProps({'aria-label':'Spatial group pages'}).findAll(node=>node.type==='button'&&node.children.includes('Next'))[0]
  await act(async()=>groupNext.props.onClick())
  assert.equal(groupButtons().length,10)
  assert.equal(groupButtons()[0].props['data-cluster-id'],'group-20')
  await act(async()=>groupButtons()[0].props.onClick())
  assert.equal(inspections.at(-1),'group-20')
  assert.equal(memberPicks.length,1,'inspection must never cause a row pick')
  await act(async()=>overlay.update(React.createElement(Overlay,{presentation:{...presentation,relationshipLabels:new Set()},onInspectCluster:id=>inspections.push(id)})))
  assert.equal(overlay.root.findAll(node=>node.type==='text').length,0,'suppressed relationship labels stay hidden')
})

