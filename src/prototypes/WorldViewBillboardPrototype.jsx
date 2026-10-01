import { useEffect, useMemo, useRef, useState } from 'react'
import WorldViewExploreShell from '../components/WorldViewExploreShell.jsx'
import WorldViewBillboardOverlay from '../components/WorldViewBillboardOverlay.jsx'
import { createWorldBillboardScene } from '../lib/worldViewBillboardScene.js'
import { layoutWorldBillboards } from '../lib/worldViewBillboardLayout.js'
import { resolveBillboardDistanceStates, updateSelectedBillboardEnvelope } from '../lib/worldViewBillboardPresentation.js'
import { buildWorldBillboardModel } from '../lib/worldViewBillboardModules.js'
import '../styles/world-view-billboard-prototype.css'
import '../styles/world-view-billboard-runtime.css'

const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value)}return value}
const families=['events','people','places','markets','environment','infrastructure','relationships']
const legacyFamilies=['events','people','markets','infrastructure','environment']
const inspection='2024-05-03T12:00:00Z',eventTime='2024-05-03T09:00:00Z',range=['2024-05-03T00:00:00Z','2024-05-04T00:00:00Z']
const moduleId={events:'event',people:'people',places:'place',markets:'market',environment:'environment',infrastructure:'infrastructure',relationships:'timelineRelationships'}
function suppliedFixture(row){return {...row,time:inspection,range,eventTime,eventTimeRange:range,relevant:row.importance>=.7,sourceRefs:['Local synthetic display fixture v2; no live evidence admission'],suppliedModules:[
 {id:'evidence',label:'Evidence',content:[{label:'Canonical location',value:row.coordinates.join(', ')},{label:'Precision',value:row.precision},{label:'Recorded event range',value:range.join(' → ')},{text:'Synthetic record. Presentation geometry cannot increase evidence precision.'}]},
 {id:'context',label:'Context',content:[{text:'This explicitly supplied fixture payload is functional test data. No proximity, company existence or display geometry establishes a fact.'}]},
 {id:'sources',label:'Sources',content:[{label:'Source',value:'Local synthetic display fixture v2'},{label:'Source background',value:'No photographic capture or admitted terrain'},{label:'Scope/date',value:`Synthetic test record ${row.key}; ${eventTime}`}]},
 {id:moduleId[row.family],label:row.family==='relationships'?'Timeline & relationships':row.family==='environment'?'Environment / hazards':row.family[0].toUpperCase()+row.family.slice(1),content:row.family==='relationships'?[{label:'Explicit supplied endpoints',value:'fixture-0 → fixture-1'},{label:'Relation',value:'Synthetic test connection; not causality or spatial inference'},{label:'Recorded relation time',value:eventTime}]:[{label:'Supplied record',value:row.label},{label:'Scope',value:'Synthetic fixture only'},{label:'Evidence date',value:eventTime},{text:row.family==='markets'?'No company-derived price, valuation or trading inference.':row.family==='people'?'No population/demographic fact supplied.':row.family==='environment'?'No current weather substitution or observed hazard claim.':'Only the explicitly supplied fixture identifier is admitted.'}]},
 ]}}
export const BILLBOARD_FIXTURES=freeze([
 suppliedFixture({key:'cleveland-city',label:'Cleveland city context',family:'events',coordinates:[-81.7,41.4,0],importance:1,precision:'city'}),
 ...Array.from({length:36},(_,i)=>suppliedFixture({key:`fixture-${i}`,label:`${legacyFamilies[i%5]} fixture ${i+1}`,family:legacyFamilies[i%5],coordinates:[-81.7+(i%6-2.5)*.0017,41.4+(Math.floor(i/6)-2.5)*.0015,0],importance:i%7===0?.9:.4,precision:'synthetic point'})),
 suppliedFixture({key:'fixture-place',label:'Supplied place fixture',family:'places',coordinates:[-81.702,41.401,0],importance:.8,precision:'synthetic point'}),
 suppliedFixture({key:'fixture-relation',label:'Recorded relation fixture',family:'relationships',coordinates:[-81.702,41.401,0],importance:.8,precision:'synthetic point'}),
])
const collide=(a,b)=>a.x-a.width/2<b.x+b.width&&a.x+a.width/2>b.x&&a.y-a.height/2<b.y+b.height&&a.y+a.height/2>b.y
export default function WorldViewBillboardPrototype(){
 const host=useRef(null),scene=useRef(null),latest=useRef(null),distanceMemory=useRef(null),envelopeMemory=useRef(null),restoreRequest=useRef(null),entryCard=useRef(null),remountCamera=useRef(null)
 const [frame,setFrame]=useState(null),[error,setError]=useState(''),[selectedKey,setSelectedKey]=useState(null),[enabled,setEnabled]=useState(false)
 const [layers,setLayers]=useState(Object.fromEntries(families.map(k=>[k,true]))),[dense,setDense]=useState(true),[time,setTime]=useState(inspection),[dataset,setDataset]=useState('fixture-v2'),[focusedKey,setFocusedKey]=useState(null)
 const [inspectorRequest,setInspectorRequest]=useState(0),[active,setActive]=useState(false),[mountVersion,setMountVersion]=useState(0)
 const [renderer,setRenderer]=useState(()=>new URLSearchParams(window.location.search).get('fixtureRenderer')==='flat'?'flat':'native')
 const items=useMemo(()=>BILLBOARD_FIXTURES.filter((item,i)=>layers[item.family]&&(dense||i===0||i===1)).map(item=>({...item,focused:item.key===focusedKey})),[layers,dense,focusedKey])
 const selected=items.find(item=>item.key===selectedKey)
 const presentation=useMemo(()=>{
  if(!frame)return {markers:[],selected:null,settling:false}
  const distances=resolveBillboardDistanceStates({items:frame.items,previous:distanceMemory.current,datasetKey:dataset,selectedKey});distanceMemory.current=distances.memory
  const projected=frame.items.map(item=>({...item,presentationState:distances.states[item.key],canonicalCoordinates:item.coordinates}))
  const base=layoutWorldBillboards({items:projected,viewport:frame.viewport,selectedKey})
  const request=restoreRequest.current;restoreRequest.current=null
  const reader=updateSelectedBillboardEnvelope({selected:base.selected,previous:envelopeMemory.current,viewport:frame.viewport,cameraSignature:frame.camera,collisions:base.markers.map(m=>({x:m.x-m.width/2,y:m.y-m.height/2,width:m.width,height:m.height})),snapRestore:!!request,restoreCard:request?.card})
  envelopeMemory.current=reader.memory
  const source=projected.find(i=>i.key===selectedKey)
  const reading=reader.selected?{...reader.selected,displayOccluded:source?.occluded===true,distanceMeters:source?.distanceMeters,displayVisibility:source?.displayVisibility}:null
  return {...base,selected:reading,markers:reading?base.markers.filter(m=>!collide(m,reading.card)):base.markers,settling:reader.settling,envelopeReason:reader.reason,distanceStates:distances.states}
 },[frame,selectedKey,dataset])
 latest.current={items,selectedKey,enabled,layout:presentation,time,layers,frame,dataset,renderer}
 useEffect(()=>{
  if(renderer==='flat')return
  let dead=false,controller=null;setError('')
  createWorldBillboardScene(host.current,{items:latest.current.items,onFrame:value=>{if(!dead)setFrame(value)},onSelect:key=>{if(!dead)setSelectedKey(key)},onError:value=>{if(!dead)setError(String(value?.message??value))}}).then(value=>{controller=value;if(dead)value.dispose();else{scene.current=value;value.setItems(latest.current.items);value.setSelected(latest.current.selectedKey);value.setPresentation(latest.current.layout);if(remountCamera.current)value.setCameraState(remountCamera.current);value.setInteractionEnabled(latest.current.enabled);value.setRecordedTime(latest.current.time)}}).catch(value=>{if(!dead)setError(String(value?.message??value))})
  return()=>{dead=true;if(controller)remountCamera.current=controller.getCameraState();scene.current=null;controller?.dispose()}
 },[renderer,mountVersion])
 useEffect(()=>{scene.current?.setItems(items);if(selectedKey&&!items.some(i=>i.key===selectedKey)&&!selectedKey.startsWith('cluster'))setSelectedKey(null)},[items])
 useEffect(()=>{scene.current?.setSelected(selectedKey);scene.current?.setInteractionEnabled(enabled)},[selectedKey,enabled])
 useEffect(()=>{scene.current?.setRecordedTime(time)},[time])
 useEffect(()=>{scene.current?.setPresentation(presentation);if(presentation.settling)scene.current?.requestFrame()},[presentation])
 useEffect(()=>{
  if(renderer!=='flat')return
  const update=()=>{const width=host.current.clientWidth,height=host.current.clientHeight;setFrame({items:latest.current.items.map(item=>({...item,anchor:{x:width/2+(item.coordinates[0]+81.7)*width*70,y:height/2-(item.coordinates[1]-41.4)*height*70},distanceMeters:5000,occluded:false,canonicalOccluded:false,displayVisibility:'visible'})),viewport:{width,height},camera:null,sceneType:'explicit-2d-fixture-fallback'})}
  const observer=new ResizeObserver(update);observer.observe(host.current);update();return()=>observer.disconnect()
 },[renderer,items,mountVersion])
 const model=buildWorldBillboardModel(selected,{inspectionTime:time||null,backgroundCaptureTime:null,currentContextTime:null})
 const adapter=useMemo(()=>({getCameraState:()=>{entryCard.current=latest.current.layout.selected?.card;return scene.current?.getCameraState()},setCameraState:value=>{const accepted=scene.current?.setCameraState(value)===true;if(accepted){restoreRequest.current={card:entryCard.current};scene.current.requestFrame()}return accepted}}),[])
 useEffect(()=>{
  window.__mipBillboardPrototype={getProbe:()=>({scene:scene.current?.getProbe(),layout:latest.current.layout,selectedKey:latest.current.selectedKey,time:latest.current.time,layers:latest.current.layers,dataset:latest.current.dataset,renderer:latest.current.renderer,canonicalItems:BILLBOARD_FIXTURES,projectedItems:latest.current.frame?.items}),setPose:value=>scene.current?.setPose(value),orbit:value=>scene.current?.orbit(value),pitch:value=>scene.current?.pitch(value),pan:(x,y)=>scene.current?.pan(x,y),zoom:value=>scene.current?.zoom(value),getCamera:()=>scene.current?.getCameraState(),restoreCamera:value=>adapter.setCameraState(value),select:setSelectedKey,dismiss:()=>setSelectedKey(null),setTime,setDense,setDataset,setFocused:setFocusedKey,setLayer:(key,value)=>setLayers(old=>({...old,[key]:value})),remount:()=>{envelopeMemory.current=null;distanceMemory.current=null;setMountVersion(v=>v+1)},fallback:()=>{setFrame(null);setEnabled(false);setRenderer('flat')}}
  return()=>{delete window.__mipBillboardPrototype}
 },[adapter])
 const controls=<div className="wv-billboard-options"><fieldset><legend>Scene families</legend>{families.map(key=><label key={key}><input type="checkbox" checked={layers[key]} onChange={event=>setLayers(value=>({...value,[key]:event.target.checked}))}/>{key==='environment'?'Environment / hazards':key[0].toUpperCase()+key.slice(1)}</label>)}</fieldset>
  <label><input type="checkbox" checked={dense} onChange={event=>setDense(event.target.checked)}/>Dense synthetic scene</label>
  <label>Recorded inspection time<input aria-label="Recorded fixture time" type="datetime-local" value={time.slice(0,16)} onChange={event=>setTime(event.target.value?`${event.target.value}:00Z`:'')}/></label>
  <button onClick={()=>setDataset(value=>value==='fixture-v2'?'fixture-v2-refresh':'fixture-v2')}>Refresh synthetic dataset version</button><button disabled={!selected} onClick={()=>setFocusedKey(selectedKey)}>Focus selected fixture</button>
  <div className="wv-billboard-camera-controls">{['close','medium','city','regional','continent','occlusion'].map(pose=><button key={pose} disabled={renderer==='flat'} onClick={()=>scene.current?.setPose(pose)}>{pose}</button>)}</div>
  <button disabled={renderer==='flat'} onClick={()=>scene.current?.orbit(35)}>Orbit 35°</button><button disabled={renderer==='flat'} onClick={()=>scene.current?.pan(100,0)}>Pan east</button><button disabled={renderer==='flat'} onClick={()=>scene.current?.zoom(.65)}>Zoom closer</button><button disabled={renderer==='flat'} onClick={()=>scene.current?.pitch(10)}>Pitch 10°</button>
  <p>Display fixture only. Evidence coordinates/precision stay immutable. Event, inspection, capture and current-context clocks stay distinct.</p></div>
 const inspector=<div className="wv-billboard-deep-inspector"><h3>Deep evidence inspector</h3>{selected?<><p>{selected.label}</p><dl><dt>Canonical coordinates</dt><dd>{selected.coordinates.join(', ')}</dd><dt>Evidence precision</dt><dd>{selected.precision}</dd><dt>Event evidence time</dt><dd>{selected.eventTime}</dd><dt>Recorded inspection</dt><dd>{time||'Unavailable'}</dd><dt>Recorded event range</dt><dd>{selected.range.join(' → ')}</dd><dt>Imagery/current context</dt><dd>Unavailable; no capture/current source supplied.</dd><dt>Provenance</dt><dd>Local synthetic fixture v2; no live evidence admission.</dd></dl></>:<p>No object selected.</p>}<p>Procedural geometry is context only; no admitted Cleveland photographic mesh or terrain.</p></div>
 return <main className="wv-billboard-prototype-page"><h1>Spatial Ribbon / Editorial Placard</h1><p>Refined bounded runtime · synthetic geometry · source realism remains unqualified</p>
 <WorldViewExploreShell prototypeEnabled initialDirection="immersive" controls={controls} context={inspector} preview={<span>{selected?.label??'Select a world marker'} · {selected?.precision??'Synthetic scene'}</span>} contextRequest={inspectorRequest} contextToken={{subjectKey:selected?.key??null,version:dataset,timeToken:time}} recordedTimeLabel={`Inspection: ${time||'Unavailable'}`} cameraAdapter={adapter} interactionEnabled={enabled} onInteractionChange={setEnabled} onExploreChange={setActive} status={renderer==='flat'?'Explicit 2D fixture fallback · no imagery':'Synthetic native geometry · no source imagery'} attribution="Native credits remain accessible; paused Explore keeps shell scroll lock. Card/panels scroll independently.">
 <div className="wv-billboard-runtime" data-explore-active={active}>
  <div key={`${renderer}-${mountVersion}`} ref={host} className="wv-billboard-scene" data-interaction-enabled={enabled} aria-label={renderer==='flat'?'Explicit two dimensional fixture fallback':'Three dimensional synthetic World View'}>{renderer==='flat'&&frame?<svg width="100%" height="100%" role="img" aria-label="2D synthetic fallback; no 3D occlusion proof">{presentation.markers.map(m=><g key={m.key} role="button" tabIndex={enabled?0:-1} aria-label={m.state==='cluster'?`Inspect group of ${m.count}`:m.label} transform={`translate(${m.x} ${m.y})`} onClick={()=>enabled&&setSelectedKey(m.key)} onKeyDown={e=>{if(enabled&&['Enter',' '].includes(e.key)){e.preventDefault();setSelectedKey(m.key)}}}><rect x={-m.width/2} y={-m.height/2} width={m.width} height={m.height} rx="4" fill="#244138" stroke="#e7ebcc"/><text textAnchor="middle" fill="#e8f2df" fontSize="10" y="4">{m.state==='cluster'?m.count:m.label}</text></g>)}</svg>:null}</div>
  <div className="wv-billboard-fixture-banner">DISPLAY FIXTURE · immutable canonical evidence</div>
  {error?<div role="alert" className="wv-billboard-error">Native renderer unavailable: {error}<button onClick={()=>{setEnabled(false);setError('');setFrame(null);setRenderer('flat')}}>Use explicit 2D fixture fallback</button></div>:null}
  <WorldViewBillboardOverlay layout={presentation} items={items} selectedKey={selectedKey} model={model} onSelect={setSelectedKey} onClose={()=>setSelectedKey(null)} onInspect={()=>{setEnabled(false);setInspectorRequest(v=>v+1)}} interactionEnabled={enabled}/>
 </div></WorldViewExploreShell></main>
}
