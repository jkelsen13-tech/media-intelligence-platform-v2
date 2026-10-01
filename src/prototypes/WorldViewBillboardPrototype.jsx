import { useEffect, useMemo, useRef, useState } from 'react'
import WorldViewExploreShell from '../components/WorldViewExploreShell.jsx'
import WorldViewBillboardOverlay from '../components/WorldViewBillboardOverlay.jsx'
import { createWorldBillboardScene } from '../lib/worldViewBillboardScene.js'
import { layoutWorldBillboards } from '../lib/worldViewBillboardLayout.js'
import '../styles/world-view-billboard-prototype.css'
import '../styles/world-view-billboard-runtime.css'

const freeze = value => { if (value && typeof value === 'object') {Object.values(value).forEach(freeze);Object.freeze(value)} return value }
const families = ['events','people','markets','infrastructure','environment']
export const BILLBOARD_FIXTURES = freeze([
  {key:'cleveland-city',label:'Cleveland city context',family:'events',coordinates:[-81.7,41.4,0],importance:1,precision:'city',time:'2024-05-03T12:00:00Z',range:['2024-05-03T00:00:00Z','2024-05-04T00:00:00Z']},
  ...Array.from({length:36},(_,i)=>({key:`fixture-${i}`,label:`${families[i%5]} fixture ${i+1}`,family:families[i%5],coordinates:[-81.7+(i%6-2.5)*0.0017,41.4+(Math.floor(i/6)-2.5)*0.0015,0],importance:i%7===0?0.9:0.4,precision:'synthetic point',time:'2024-05-03T12:00:00Z',range:['2024-05-03T00:00:00Z','2024-05-04T00:00:00Z']})),
])

export default function WorldViewBillboardPrototype() {
  const host=useRef(null),scene=useRef(null),latest=useRef(null)
  const [frame,setFrame]=useState(null),[error,setError]=useState(''),[selectedKey,setSelectedKey]=useState(null)
  const [enabled,setEnabled]=useState(false),[layers,setLayers]=useState(Object.fromEntries(families.map(k=>[k,true])))
  const [dense,setDense]=useState(true),[time,setTime]=useState('2024-05-03T12:00:00Z'),[inspectorRequest,setInspectorRequest]=useState(0),[active,setActive]=useState(false)
  const items=useMemo(()=>BILLBOARD_FIXTURES.filter((item,i)=>layers[item.family]&&(dense||i===0||i===1)),[layers,dense])
  const selected=items.find(item=>item.key===selectedKey)
  const layout=useMemo(()=>frame?layoutWorldBillboards({items:frame.items.map(item=>({...item,canonicalCoordinates:item.coordinates})),viewport:frame.viewport,selectedKey}):{markers:[],selected:null},[frame,selectedKey])
  latest.current={items,selectedKey,enabled,layout,time,layers,frame}
  useEffect(()=>{
    let dead=false,controller=null
    createWorldBillboardScene(host.current,{items:latest.current.items,onFrame:value=>{if(!dead)setFrame(value)},onSelect:key=>{if(!dead)setSelectedKey(key)},onError:value=>{if(!dead)setError(String(value?.message??value))}})
      .then(value=>{controller=value;if(dead)value.dispose();else{scene.current=value;value.setInteractionEnabled(latest.current.enabled)}}).catch(value=>{if(!dead)setError(String(value?.message??value))})
    return ()=>{dead=true;scene.current=null;controller?.dispose()}
  },[])
  useEffect(()=>{scene.current?.setItems(items);if(selectedKey&&!items.some(i=>i.key===selectedKey)&&!selectedKey.startsWith('cluster'))setSelectedKey(null)},[items])
  useEffect(()=>{scene.current?.setSelected(selectedKey);scene.current?.setInteractionEnabled(enabled)},[selectedKey,enabled])
  useEffect(()=>{scene.current?.setPresentation(layout)},[layout])
  const model=selected?{
    key:selected.key,title:selected.label,chip:`${selected.precision} precision · recorded fixture range`,
    metadata:[{label:'Recorded inspection',value:time},{label:'Imagery capture',value:'Unavailable — no imagery loaded'},{label:'Status',value:'Synthetic display fixture'}],
    modules:{
      evidence:[{label:'Canonical fixture anchor',value:selected.coordinates.join(', ')},{label:'Precision',value:selected.precision},{label:'Recorded range',value:selected.range.join(' → ')},{text:'Geometry does not increase evidence precision.'}],
      context:[{label:'Eligible family',value:selected.family},{text:'Only this locally defined synthetic module is supplied. No live people, price, weather or relationship facts are inferred.'}],
      sources:[{label:'Source',value:'MIP bounded billboard fixture v1'},{label:'Scene',value:'Procedural boxes and ridge; not Cleveland source geometry'},{label:'Image',value:'No admitted photographic source'}],
    },
  }:null
  const adapter=useMemo(()=>({getCameraState:()=>scene.current?.getCameraState(),setCameraState:value=>scene.current?.setCameraState(value)===true}),[])
  useEffect(()=>{
    // Explicit prototype instrumentation only. Not attached to ordinary MIP routes.
    window.__mipBillboardPrototype={
      getProbe:()=>({scene:scene.current?.getProbe(),layout:latest.current.layout,selectedKey:latest.current.selectedKey,time:latest.current.time,layers:latest.current.layers,canonicalItems:BILLBOARD_FIXTURES,projectedItems:latest.current.frame?.items}),
      setPose:value=>scene.current?.setPose(value),orbit:value=>scene.current?.orbit(value),pan:(x,y)=>scene.current?.pan(x,y),zoom:value=>scene.current?.zoom(value),
      select:key=>setSelectedKey(key),dismiss:()=>setSelectedKey(null),setTime:value=>setTime(value),setDense:value=>setDense(value),
    }
    return ()=>{delete window.__mipBillboardPrototype}
  },[])
  const controls=<div className="wv-billboard-options">
    <fieldset><legend>Scene families</legend>{families.map(key=><label key={key}><input type="checkbox" checked={layers[key]} onChange={event=>setLayers(value=>({...value,[key]:event.target.checked}))}/>{key[0].toUpperCase()+key.slice(1)}</label>)}</fieldset>
    <label><input type="checkbox" checked={dense} onChange={event=>setDense(event.target.checked)}/>Dense synthetic scene</label>
    <label>Recorded fixture time<input aria-label="Recorded fixture time" type="datetime-local" value={time.slice(0,16)} onChange={event=>setTime(`${event.target.value}:00Z`)}/></label>
    <div className="wv-billboard-camera-controls" aria-label="Prototype camera views">{['close','city','regional','continent','occlusion'].map(pose=><button key={pose} onClick={()=>scene.current?.setPose(pose)}>{pose}</button>)}</div>
    <button onClick={()=>scene.current?.orbit(35)}>Orbit 35°</button><button onClick={()=>scene.current?.pan(100,0)}>Pan east</button><button onClick={()=>scene.current?.zoom(0.65)}>Zoom closer</button>
    <p>Camera may inspect fixture geometry closely; the Cleveland evidence remains city precision at its exact canonical city anchor.</p>
  </div>
  const inspector=<div className="wv-billboard-deep-inspector"><h3>Deep evidence inspector</h3>{selected?<><p>{selected.label}</p><dl><dt>Canonical fixture coordinates</dt><dd>{selected.coordinates.join(', ')}</dd><dt>Evidence precision</dt><dd>{selected.precision}</dd><dt>Recorded inspection</dt><dd>{time}</dd><dt>Recorded range</dt><dd>{selected.range.join(' → ')}</dd><dt>Provenance</dt><dd>Local synthetic display fixture v1. No live evidence admission.</dd></dl></>:<p>No object selected.</p>}<p>Photographic imagery and source terrain remain unavailable. Procedural geometry is visual context only.</p></div>
  return <main className="wv-billboard-prototype-page">
    <h1>Spatial Ribbon / Editorial Placard</h1><p>Bounded runtime prototype · synthetic Cleveland-like geometry · not live source qualification</p>
    <WorldViewExploreShell prototypeEnabled initialDirection="immersive" controls={controls} context={inspector}
      preview={<span>{selected?.label??'Select a world marker'} · {selected?.precision??'Synthetic scene'}</span>}
      contextRequest={inspectorRequest} contextToken={{subjectKey:selected?.key??null,version:'fixture-v1',timeToken:time}} recordedTimeLabel={`Recorded fixture time: ${time}`} cameraAdapter={adapter}
      interactionEnabled={enabled} onInteractionChange={setEnabled} onExploreChange={setActive}
      status="No source imagery · procedural fixture geometry" attribution="Native renderer credits remain accessible.">
      <div className="wv-billboard-runtime" data-explore-active={active}>
        <div ref={host} className="wv-billboard-scene" aria-label="Three dimensional synthetic World View"/>
        <div className="wv-billboard-fixture-banner">DISPLAY FIXTURE · city evidence stays city precision</div>
        {error?<p role="alert" className="wv-billboard-error">Scene unavailable: {error}</p>:null}
        <WorldViewBillboardOverlay layout={layout} items={items} selectedKey={selectedKey} model={model} onSelect={setSelectedKey} onClose={()=>setSelectedKey(null)} onInspect={()=>{setEnabled(false);setInspectorRequest(value=>value+1)}} interactionEnabled={enabled}/>
      </div>
    </WorldViewExploreShell>
  </main>
}
