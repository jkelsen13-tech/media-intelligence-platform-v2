// Full production App/view/renderers/styles; explicitly synthetic backend/auth.
// Local development-transform evidence only. No physical operation or FPS claim.
import assert from 'node:assert/strict'
import {createServer} from 'vite'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {spawnSync} from 'node:child_process'
import {resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {journeys,newAcceptanceRecord,validateAcceptanceRecord} from './contract.mjs'
import {minCameraHeightMetersForPrecisionClass} from '../../src/lib/worldViewCameraState.js'

const root=fileURLToPath(new URL('../../',import.meta.url))
process.chdir(root)
const git=(...args)=>{const r=spawnSync('git',args,{encoding:'utf8'});if(r.status)throw Error(r.stderr);return r.stdout.trim()}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')
const sourcePaths=['src/App.jsx','src/views/NewsView.jsx','src/views/NewsStoryReader.jsx','src/views/WorldView.jsx','src/views/WorldMapCanvas.jsx','src/components/WorldViewBillboardOverlay.jsx','src/styles/world-view-billboard-prototype.css','src/lib/worldViewBillboardLayout.js','src/lib/worldViewBillboardPresentation.js','src/lib/worldViewCameraState.js','package-lock.json']
const hashes=async()=>Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,sha(await readFile(path))])))
const before=await hashes(),candidateCommit=git('rev-parse','HEAD'),candidateTree=git('rev-parse','HEAD^{tree}'),dirty=git('status','--porcelain')!==''
assert.ok(!dirty||process.env.MIP_DEVICE_ALLOW_DIRTY==='1','use a clean committed head, or explicitly label a development run with MIP_DEVICE_ALLOW_DIRTY=1')
const selected=(process.env.MIP_DEVICE_PROFILES??'ipad,iphone,narrow,desktop').split(',')
const cardStress=process.env.MIP_DEVICE_CARD_STRESS==='1'
const stressTitle='DEVICE_ACCEPTANCE_SYNTHETIC retained facility inspection source describing its published evidence and geographic context'
assert.equal(stressTitle.length,120)
assert.ok(selected.length&&new Set(selected).size===selected.length&&selected.every(id=>journeys.profiles.some(p=>p.id===id)))
const engine=process.env.MIP_DEVICE_BROWSER??'chromium'
assert.ok(['chromium','webkit'].includes(engine))
const modulePath=process.env.MIP_DEVICE_PLAYWRIGHT_MODULE??'/opt/codex/cua_node/lib/node_modules/playwright/index.mjs'
assert.ok(modulePath.startsWith('/'),'Playwright must be an already installed local absolute module path')
const playwright=await import(modulePath)
const output=resolve(process.env.MIP_DEVICE_OUTPUT??'/tmp/mip-device-acceptance-'+candidateCommit.slice(0,8)+'-'+engine)
assert.ok(output.startsWith('/workspace/')||output.startsWith('/tmp/'),'receipts must stay inside authorized local workspace')
await mkdir(output,{recursive:true})
const browser=await playwright[engine].launch({headless:true,...(engine==='chromium'?{executablePath:process.env.MIP_DEVICE_BROWSER_EXECUTABLE??'/usr/bin/chromium',args:['--enable-unsafe-swiftshader','--disable-dev-shm-usage']}: {})})
let server
try{server=await createServer({configFile:new URL('./vite.config.mjs',import.meta.url).pathname,plugins:cardStress?[{name:'explicit-synthetic-card-title-boundary',enforce:'pre',transform(code,id){
  if(id.split('?')[0]!==root+'scripts/device-acceptance/fixture.mjs')return
  const supplied='display_hint:`DEVICE_ACCEPTANCE_SYNTHETIC row ${i+1}`'
  assert.ok(code.includes(supplied),'stress override changes only the existing synthetic fixture title')
  return code.replace(supplied,'display_hint:'+JSON.stringify(stressTitle))
}}]:[]});await server.listen()}catch(error){await browser.close();throw error}
const origin=`http://127.0.0.1:${server.httpServer.address().port}`,base=origin+'/media-intelligence-platform-v2/'
const summary={contract:'mip-device-browser-preparation-v1',candidateCommit,candidateTree,dirty,node:process.version,engine,browserVersion:browser.version(),fixtureAuthority:'SYNTHETIC_BACKEND_AND_SESSION_ONLY',productionFileHashes:before,
  qualification:'Actual full App development transform, actual native software browser when available; synthetic backend/session/geometry, all nonlocal network blocked. No physical-device, live Auth/SQL, final appearance, FPS or thermal acceptance.',profiles:[],historicalColdPortrait:'RED: unchanged; original executable measurement boundary unrecovered'}
if(cardStress)summary.syntheticTitleStress={title:stressTitle,characters:stressTitle.length,authority:summary.fixtureAuthority}
let failed=false
try{
for(const profile of journeys.profiles.filter(p=>selected.includes(p.id))){
  const context=await browser.newContext({viewport:profile.viewport,hasTouch:profile.hasTouch,isMobile:profile.isMobile,deviceScaleFactor:1,serviceWorkers:'block'})
  const page=await context.newPage(),errors=[],blocked=[],record=newAcceptanceRecord(),observations=[]
  page.setDefaultTimeout(10000)
  record.recordId=`${candidateCommit.slice(0,8)}-${engine}-${profile.id}`;record.evidenceKind='browser_emulation';record.recordedAt=new Date().toISOString();record.operator='automated local browser harness'
  record.device={class:profile.deviceClass,model:'browser viewport emulation',os:process.platform,osVersion:null,physicalEvidence:[]}
  record.browser={engine,name:engine,version:browser.version(),userAgent:null};record.orientation={name:profile.viewport.width>profile.viewport.height?'landscape':'portrait',viewportCssPixels:profile.viewport,devicePixelRatio:1}
  record.input={kind:profile.input,coarsePointer:profile.hasTouch,touchEvidence:[]};record.network={kind:'local_only_synthetic',cacheState:'fresh_browser_context',conditions:'All nonlocal HTTP(S) blocked; synthetic backend methods run inside browser.',evidence:['browser-network-block']}
  record.account={kind:'synthetic_session',alias:'A/B disposable fixture aliases',sessionReady:true,evidence:['fixture-actor-readiness-and-logout']}
  record.source={...record.source,candidateCommit,candidateTree,dirty,harnessSha256:sha(await readFile(new URL(import.meta.url))),fixtureAuthority:summary.fixtureAuthority,productionFileHashes:before,requirementBindings:journeys.requirementBindings}
  for(const admission of Object.values(record.admissions))admission.status='synthetic'
  record.visual.status='preliminary_browser_only';record.limitations=[summary.qualification,'Background is scripted visibilitychange, not physical app-switch or OS suspension.','Original portrait cold 14 to 26 and unchanged delta-under-12 budget remain RED; unit/trace/window/readiness unrecovered.','Actual installed source/backend and original hardware acceptance are separate gates.']
  page.on('pageerror',e=>errors.push(e.message))
  await context.addInitScript(()=>{window.__MIP_DEVICE_GEOLOCATION_CALLS__=0;for(const name of ['getCurrentPosition','watchPosition'])if(navigator.geolocation)navigator.geolocation[name]=()=>{window.__MIP_DEVICE_GEOLOCATION_CALLS__++;throw Error('Physical/device geolocation forbidden in acceptance fixture')}})
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin||['data:','blob:'].includes(u.protocol))return route.continue();blocked.push({origin:u.origin,path:u.pathname,method:route.request().method()});return route.abort()})
  const activate=async locator=>{if(profile.hasTouch){await locator.tap();record.input.touchEvidence.push('Playwright touchscreen delivery; no physical touch claim')}else await locator.click()}
  const button=name=>page.getByRole('button',{name,exact:true})
  const nav=async name=>{const sidebar=page.locator('.ws-nav-links').getByRole('button',{name,exact:true});if(await sidebar.isVisible())return activate(sidebar);const menu=button('Open investigation navigation');if(await menu.isVisible()){await activate(menu);return activate(page.getByRole('dialog',{name:'Investigation navigation',exact:true}).getByRole('button',{name,exact:true}))}const tab=page.getByRole('navigation',{name:'Evidence views',exact:true}).getByRole('button',{name,exact:true});assert.equal(await tab.isVisible(),true,`visible navigation ${name}`);await activate(tab)}
  const current=()=>page.locator('[data-investigation-context]').first().evaluate(n=>Object.fromEntries([...n.attributes].filter(a=>a.name.startsWith('data-')).map(a=>[a.name,a.value]))).catch(()=>page.locator('.wv-view').evaluate(n=>Object.fromEntries([...n.attributes].filter(a=>a.name.startsWith('data-')).map(a=>[a.name,a.value]))))
  const snap=async label=>{const path=`${profile.id}-${label}.png`;await page.screenshot({path:output+'/'+path,fullPage:false});record.artifacts.push({path,sha256:sha(await readFile(output+'/'+path)),kind:'screenshot'});return path}
  const cardGeometry=async label=>{
    const geometry=await page.locator('.wv-billboard-card').evaluate(card=>{
      const rect=node=>{const r=node.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height,clientWidth:node.clientWidth,clientHeight:node.clientHeight}}
      const control=node=>{
        const points=[.1,.5,.9].flatMap(x=>[.1,.5,.9].map(y=>{const r=node.getBoundingClientRect(),px=r.left+r.width*x,py=r.top+r.height*y,hit=document.elementFromPoint(px,py);return {x:px,y:py,reachable:node===hit||node.contains(hit),hit:hit&&{tag:hit.tagName,className:typeof hit.className==='string'?hit.className:hit.className?.baseVal,ariaLabel:hit.getAttribute('aria-label'),text:hit.textContent.slice(0,100)}}}))
        return {rect:rect(node),hits:points.map(point=>point.reachable),points}
      }
      const overlay=card.closest('.wv-billboard-overlay'),panel=card.closest('.wv-map-panel'),canvas=panel?.querySelector('canvas')
      const body=card.querySelector('.wv-billboard-module-body')
      return {card:rect(card),overlay:rect(overlay),panel:panel&&rect(panel),canvas:canvas&&rect(canvas),body:{...rect(body),scrollHeight:body.scrollHeight,scrollTop:body.scrollTop},
        headerParts:[...card.querySelectorAll('h3,.wv-billboard-eyebrow,.wv-billboard-scope-cue,.wv-billboard-stem-cue,.wv-billboard-occlusion-cue')].map(node=>({text:node.textContent,heading:node.tagName==='H3',tabIndex:node.tabIndex,overflowY:getComputedStyle(node).overflowY,rect:rect(node),clientHeight:node.clientHeight,scrollHeight:node.scrollHeight})),
        tabButtons:[...card.querySelectorAll('[role="tab"]')].map(node=>({text:node.textContent,rect:rect(node)})),
        close:control(card.querySelector('[aria-label="Close selected card"]')),inspect:control(card.querySelector('.wv-billboard-inspect')),
        ancestors:[...function*(node){while(node){const s=getComputedStyle(node);yield {className:node.className,rect:rect(node),position:s.position,overflow:s.overflow,transform:s.transform};node=node.parentElement}}(card)],animations:card.getAnimations().map(a=>({playState:a.playState,currentTime:a.currentTime,properties:a.effect.getKeyframes()}))}
    })
    observations.push({kind:'selected-card-dom-geometry',label,viewport:page.viewportSize(),geometry});return geometry
  }
  const assertCardGeometry=(geometry,label)=>{
    const contains=(outer,inner)=>inner.left>=outer.left-.5&&inner.right<=outer.right+.5&&inner.top>=outer.top-.5&&inner.bottom<=outer.bottom+.5
    assert.ok(contains(geometry.overlay,geometry.card),label+': selected card stays inside overlay')
    assert.ok(contains(geometry.canvas,geometry.card),label+': selected card stays inside actual canvas')
    for(const name of ['close','inspect'])assert.ok(contains(geometry.card,geometry[name].rect),label+': '+name+' stays inside selected card')
    for(const part of geometry.headerParts){
      assert.ok(contains(geometry.card,part.rect),label+': title and precision disclosures stay inside selected card')
      if(part.heading&&part.scrollHeight>part.clientHeight+1)assert.ok(part.tabIndex===0&&part.overflowY==='auto',label+': overflowing full source title remains keyboard-scrollable')
      else assert.ok(part.scrollHeight<=part.clientHeight+1,label+': precision/status text remains untruncated')
    }
    assert.ok(geometry.headerParts.some(part=>part.text.includes('facility scope · not exact position')),label+': precision disclosure remains supplied')
    assert.ok(geometry.headerParts.some(part=>/Display marker (visible|occluded)/.test(part.text)),label+': display-marker disclosure remains supplied')
    if(profile.hasTouch)for(const tab of geometry.tabButtons)assert.ok(tab.rect.height>=44,label+': coarse tabs retain44px height')
  }
  const paintedFrames=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))))
  const prepareReader=async label=>{
    // Ordinary page flow can retain a prior scroll position or sit under the
    // workspace header. Prepare a visible reader explicitly; raw unprepared
    // samples remain distinct from canvas/card clipping observations.
    await page.locator('.wv-billboard-card').evaluate(n=>n.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}))
    await paintedFrames()
    const geometry=await cardGeometry(label)
    assertCardGeometry(geometry,label)
    assert.ok(geometry.body.height>0,label+': module retains a content scroll viewport')
    return geometry
  }
  const prepareControl=async(label,name)=>{
    const preparation=await page.locator('.wv-billboard-card').evaluate((card,name)=>{
      const control=card.querySelector(name==='close'?'[aria-label="Close selected card"]':'.wv-billboard-inspect'),r=control.getBoundingClientRect(),view={width:innerWidth,height:innerHeight}
      const blockers=[...document.querySelectorAll('body *')].filter(node=>!node.contains(card)&&!card.contains(node)&&['fixed','sticky'].includes(getComputedStyle(node).position)).map(node=>{
        const rect=node.getBoundingClientRect();return {className:typeof node.className==='string'?node.className:'',left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom}
      }).filter(rect=>rect.right>r.left&&rect.left<r.right&&rect.bottom>0&&rect.top<view.height&&rect.bottom>rect.top)
      const clippingAncestors=[]
      for(let node=card.parentElement;node;node=node.parentElement){
        const style=getComputedStyle(node)
        if(!/auto|scroll|hidden|clip/.test(style.overflowY))continue
        const rect=node.getBoundingClientRect(),top=rect.top+node.clientTop
        clippingAncestors.push({className:node.className,overflowY:style.overflowY,top,bottom:top+node.clientHeight})
      }
      const top=Math.max(0,...clippingAncestors.map(rect=>rect.top),...blockers.filter(rect=>rect.top<view.height/2&&rect.bottom<view.height*.75).map(rect=>rect.bottom))
      const bottom=Math.min(view.height,...clippingAncestors.map(rect=>rect.bottom),...blockers.filter(rect=>rect.top>=view.height/2).map(rect=>rect.top))
      if(bottom-top<r.height)throw Error('Actual scrollport cannot expose the complete '+name+' control')
      let scroller=card.parentElement
      while(scroller&&!(scroller.scrollHeight>scroller.clientHeight&&/auto|scroll/.test(getComputedStyle(scroller).overflowY)))scroller=scroller.parentElement
      scroller??=document.scrollingElement
      const before=scroller.scrollTop,delta=(r.top+r.bottom)/2-(top+bottom)/2
      scroller.scrollBy({top:delta,behavior:'instant'})
      return {control:name,window:{top,bottom},clippingAncestors,blockers,scrollOwner:scroller.className,before,requestedDelta:delta,after:scroller.scrollTop}
    },name)
    await paintedFrames();const geometry=await cardGeometry(label+'-'+name+'-visible')
    observations.push({kind:'selected-card-control-scroll-preparation',label,preparation})
    assertCardGeometry(geometry,label)
    assert.ok(geometry[name].hits.every(Boolean),label+': all nine '+name+' points reach the control after ordinary page scroll')
    const r=geometry[name].rect,view=page.viewportSize()
    assert.ok(r.left>=0&&r.top>=0&&r.right<=view.width&&r.bottom<=view.height,label+': '+name+' is fully visible in browser viewport')
    await snap('selected-card-'+label+'-'+name+'-visible')
    return geometry
  }
  const activatePaintedControl=async(geometry,name)=>{
    const r=geometry[name].rect,x=(r.left+r.right)/2,y=(r.top+r.bottom)/2
    // Direct screen coordinates cannot silently scroll a clipped target into
    // view, unlike locator.tap/click's automatic scroll preparation.
    if(profile.hasTouch){await page.touchscreen.tap(x,y);record.input.touchEvidence.push('Direct Playwright touchscreen '+name+' at painted viewport coordinates; no physical touch claim')}
    else await page.mouse.click(x,y)
  }
  const check=async(id,run)=>{try{const observation=await run();const bound=await current(),primary=await snap(id+'-'+record.functional.checks.length);await page.setViewportSize(profile.rotatedViewport);await page.waitForTimeout(100);assert.deepEqual(await current(),bound,'orientation retains context at '+id);const rotated=await snap(id+'-rotated-'+record.functional.checks.length);await page.setViewportSize(profile.viewport);record.functional.checks.push({journeyId:id,status:'passed',observation:observation+' Both viewport orientations retain context.',evidence:[primary,rotated]})}catch(e){record.functional.checks.push({journeyId:id,status:'failed',observation:e.stack??String(e),evidence:[await snap('failure').catch(()=> 'failure-screenshot-unavailable')]});throw e}}
  try{
    await page.goto(base+'?worldViewPrototype=1#/story/00000000-0000-4000-8000-000000000002?version=00000000-0000-4000-8000-000000000203')
    await page.getByRole('region',{name:'Story reader',exact:true}).getByRole('heading',{name:'Retained source headline',exact:true}).first().waitFor()
    record.browser.userAgent=await page.evaluate(()=>navigator.userAgent)
    await check('news-story',async()=>{await page.getByText('Version and review details',{exact:true}).click();assert.match(await page.getByRole('region',{name:'Story reader',exact:true}).innerText(),/00000000-0000-4000-8000-000000000203/);assert.match(page.url(),/version=00000000-0000-4000-8000-000000000203/);return 'Actual Story reader displays exact normalized fixture collection/version and separate recorded clocks.'})
    await check('following-account',async()=>{
      await activate(button('Follow story'));await page.getByText(/^Following this story\./).waitFor();await activate(button('Acknowledge displayed story version'));await page.getByText(/^Following this story\./).waitFor()
      await page.evaluate(()=>window.__MIP_DEVICE_ACCEPTANCE__.hold('read'));await activate(button('Reload story Following'));await page.waitForFunction(()=>window.__MIP_DEVICE_ACCEPTANCE__.stats().held===1)
      await page.evaluate(()=>window.__MIP_DEVICE_ACCEPTANCE__.actor('00000000-0000-4000-8000-000000009002'));await page.getByText('You are not following this story.',{exact:true}).waitFor();await page.evaluate(()=>window.__MIP_DEVICE_ACCEPTANCE__.release());await page.getByText('You are not following this story.',{exact:true}).waitFor()
      await page.evaluate(()=>window.__MIP_DEVICE_ACCEPTANCE__.actor(null));await page.getByText('Sign in to follow this story and see material updates in the app.',{exact:true}).waitFor()
      await page.evaluate(()=>window.__MIP_DEVICE_ACCEPTANCE__.actor('00000000-0000-4000-8000-000000009001',false));await page.getByText('Checking your account…',{exact:true}).waitFor();await page.evaluate(()=>window.__MIP_DEVICE_ACCEPTANCE__.actor('00000000-0000-4000-8000-000000009001'))
      await page.getByText(/^Following this story\./).waitFor();await activate(button('Back to news'));await activate(button('Following'));await page.getByRole('region',{name:'Following stories',exact:true}).getByText('0 unread material updates',{exact:true}).waitFor()
      await activate(button('Open DEVICE_ACCEPTANCE_SYNTHETIC followed story'));await page.getByRole('region',{name:'Story reader',exact:true}).waitFor();return 'Displayed-version follow/acknowledge, Following list, delayed A read→B, logout and readiness exercised through production hooks; session changes are synthetic.'
    })
    await check('search-preview',async()=>{const before=await current();const opener=button('Explore / Change Topic');await opener.focus();await opener.press('Enter');const dialog=page.getByRole('dialog',{name:'Explore / Change Topic',exact:true});await dialog.waitFor();await dialog.getByRole('searchbox').first().fill('Retained');await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.deepEqual(await current(),before);assert.equal(await opener.evaluate(n=>document.activeElement===n),true);return 'Production global discovery query and Escape retain investigation context and return keyboard focus to trigger.'})
    await activate(button('Investigate in graph'));await page.locator('[data-workspace-view="graph"]').waitFor();const graphContext=await current()
    if(await button('Close panel').isVisible()){await activate(button('Close panel'));assert.deepEqual(await current(),graphContext,'closing Graph inspector preserves investigation before navigation')}
    await nav('World View');await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_CLUSTER_PROBE__?.getState()?.layout?.stats?.inputCount>=1,{},{timeout:60000})
    observations.push({kind:'selected-fixture-projection-count',state:await page.evaluate(()=>window.__MIP_WORLD_VIEW_CLUSTER_PROBE__.getState())})
    const modes=page.getByRole('tablist',{name:'World View mode',exact:true})
    await check('navigation-context',async()=>{for(const mode of ['Graph','Split','Map']){await activate(modes.getByRole('tab',{name:mode,exact:true}));assert.equal((await current())['data-canonical-subject-id'],graphContext['data-canonical-subject-id'])}const prior=await current();const time=page.getByRole('slider',{name:'Recorded time',exact:true});await time.focus();await time.press('ArrowLeft');observations.push({kind:'explicit_recorded_slider_selection',before:prior,after:await current()});assert.equal((await current())['data-canonical-subject-id'],graphContext['data-canonical-subject-id']);return 'Actual Graph→World View Graph/Map/Split preserves selected canonical identity; explicit recorded-time slider selects a recorded stamp inside source validity. Unsupported selection is separately observed on startup fallback.'})
    await check('billboard-reader',async()=>{
      await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__?.getCameraState(),{},{timeout:60000})
      const floor=minCameraHeightMetersForPrecisionClass('facility')
      const set=async height=>{await page.evaluate(height=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.setCameraState(JSON.stringify({version:1,lon:-81.7,lat:41.4,heightMeters:height,headingDegrees:0,pitchDegrees:-90,rollDegrees:0})),height);await page.waitForTimeout(350)}
      await set(100000);observations.push({kind:'far-native-observation',probe:await page.evaluate(()=>window.__MIP_WORLD_VIEW_CLUSTER_PROBE__.getBillboardState())})
      await set(10000);observations.push({kind:'approach-native-observation',probe:await page.evaluate(()=>window.__MIP_WORLD_VIEW_CLUSTER_PROBE__.getBillboardState())})
      await set(floor);await activate(button('Explore World View'));await activate(button('Close Explore World View'))
      const open=page.getByRole('button',{name:/^Open selected record card:/});await open.waitFor();await open.focus();await open.press('Enter')
      const tabs=page.getByRole('tablist',{name:'Selected record modules',exact:true});await tabs.waitFor();const before=await page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState()),bound=await current()
      for(const tab of ['Context','Sources','Evidence'])await activate(tabs.getByRole('tab',{name:tab,exact:true}))
      if(cardStress){
        await page.setViewportSize(profile.rotatedViewport);await paintedFrames();await page.waitForTimeout(300)
        const titleGeometry=await cardGeometry('120-character-title-rotated-settled');await snap('title-stress-rotated')
        // A second native observation retains the same canonical row/time but
        // explicitly moves the synthetic camera behind its ground anchor.
        await page.evaluate(()=>{const camera=JSON.parse(window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState());camera.lon=98.3;window.__MIP_WORLD_VIEW_CAMERA_PROBE__.setCameraState(JSON.stringify(camera))})
        await page.waitForTimeout(350);const occluded=await cardGeometry('120-character-title-canonical-occlusion');await snap('title-stress-occluded')
        assert.deepEqual(await current(),bound,'stress camera never changes canonical selection/time')
        assertCardGeometry(titleGeometry,'120-character-title');assertCardGeometry(occluded,'120-character-title and occlusion disclosure')
        assert.equal(await page.locator('.wv-billboard-card h3').textContent(),stressTitle,'stress title retains every supplied character')
        const heading=page.locator('.wv-billboard-card h3');await heading.focus();await heading.press('End')
        await page.waitForFunction(()=>document.querySelector('.wv-billboard-card h3')?.scrollTop>0)
        observations.push({kind:'selected-card-title-scroll',title:stressTitle,characters:stressTitle.length,heading:await heading.evaluate(n=>({scrollTop:n.scrollTop,scrollHeight:n.scrollHeight,clientHeight:n.clientHeight})),input:'keyboard End in full supplied title'})
        await heading.press('Home');await page.waitForFunction(()=>document.querySelector('.wv-billboard-card h3')?.scrollTop===0)
        await page.evaluate(camera=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.setCameraState(camera),before);await page.waitForTimeout(350)
        // The hidden-anchor diagnostic removes the original keyboard opener.
        // Reopen from its current extant successor before testing focus return.
        await button('Close selected card').press('Enter');await tabs.waitFor({state:'hidden'})
        await open.focus();await open.press('Enter');await tabs.waitFor();await page.waitForTimeout(250)
      }
      assert.ok(await page.locator('.wv-billboard-tether-anchor').count())
      for(const [index,view] of [profile.viewport,profile.rotatedViewport,profile.viewport,profile.rotatedViewport,profile.viewport].entries()){
        const label=(index%2?'rotated':'primary')+'-'+index
        await page.setViewportSize(view);await paintedFrames();assert.deepEqual(await current(),bound,label+': resize retains canonical/time context')
        assertCardGeometry(await cardGeometry(label+'-immediate'),label+'-immediate')
        await page.waitForTimeout(300);assertCardGeometry(await cardGeometry(label+'-settled'),label+'-settled')
        let geometry=await prepareReader(label+'-visible');await snap('selected-card-'+label)
        const body=page.locator('.wv-billboard-module-body');await body.focus();await body.press('End')
        await page.waitForFunction(()=>document.querySelector('.wv-billboard-module-body')?.scrollTop>0)
        observations.push({kind:'selected-card-content-scroll',label,body:await body.evaluate(n=>({scrollTop:n.scrollTop,scrollHeight:n.scrollHeight,clientHeight:n.clientHeight})),input:'keyboard End in actual module scroll owner'})
        await body.press('Home');await page.waitForFunction(()=>document.querySelector('.wv-billboard-module-body')?.scrollTop===0)
        const camera=await page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState())
        assert.equal(camera,before,label+': orientation retains exact camera')
        geometry=await prepareControl(label,'close');await activatePaintedControl(geometry,'close');await tabs.waitFor({state:'hidden'});assert.deepEqual(await current(),bound)
        assert.equal(await open.evaluate(n=>document.activeElement===n),true,label+': Close restores keyboard opener focus')
        await open.press('Enter');await tabs.waitFor();await page.waitForTimeout(250)
        geometry=await prepareReader(label+'-reopened')
        // Keyboard tabs and both explicit controls remain usable in the
        // rotated state before any restoration of the primary orientation.
        const evidence=tabs.getByRole('tab',{name:'Evidence',exact:true});await evidence.focus();await evidence.press('ArrowRight')
        assert.equal(await tabs.getByRole('tab',{name:'Context',exact:true}).getAttribute('aria-selected'),'true')
        await tabs.getByRole('tab',{name:'Context',exact:true}).press('Home')
        assert.equal(await evidence.getAttribute('aria-selected'),'true')
        await prepareControl(label+'-keyboard','close');await button('Close selected card').focus();await button('Close selected card').press('Enter');await tabs.waitFor({state:'hidden'})
        await open.press('Enter');await tabs.waitFor();await page.waitForTimeout(250);geometry=await prepareReader(label+'-inspector-ready')
        geometry=await prepareControl(label,'inspect');await activatePaintedControl(geometry,'inspect');await tabs.waitFor({state:'hidden'});assert.deepEqual(await current(),bound)
        assert.equal(await page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState()),before)
        const inspector=page.getByRole('complementary',{name:'Selected-event inspector',exact:true});await inspector.waitFor()
        assert.equal(await inspector.evaluate(n=>document.activeElement===n),true,label+': direct Inspector action focuses the existing inspector')
        await open.focus();await open.press('Enter');await tabs.waitFor();await page.waitForTimeout(250);await prepareReader(label+'-keyboard-inspector-ready')
        await prepareControl(label+'-keyboard','inspect');await button('Open inspector').focus();await button('Open inspector').press('Enter');await tabs.waitFor({state:'hidden'});await inspector.waitFor()
        assert.equal(await inspector.evaluate(n=>document.activeElement===n),true,label+': keyboard Inspector action focuses the existing inspector')
        assert.deepEqual(await current(),bound);assert.equal(await page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState()),before)
        observations.push({kind:'selected-card-orientation-controls',label,viewport:view,directClose:true,directInspector:true,keyboardClose:true,keyboardInspector:true,keyboardTabs:true,canonicalContext:bound,cameraJson:before})
        if(index<4){await open.focus();await open.press('Enter');await tabs.waitFor();await page.waitForTimeout(250)}
      }
      const originalRow=await page.evaluate(id=>window.__MIP_DEVICE_ACCEPTANCE__.rows.find(row=>row.subject_graph_node_id===id),bound['data-canonical-subject-id']);assert.ok(originalRow)
      record.surfaceCameraBaseline={...record.surfaceCameraBaseline,surface:'World View',renderer:await page.evaluate(()=>window.__MIP_WORLD_VIEW_CLUSTER_PROBE__.getBillboardState()?.native?'native software browser':'fallback'),canonicalSubjectId:bound['data-canonical-subject-id'],recordedTime:bound['data-as-of-time'],sourceVersionId:originalRow.revision_id,cameraJson:before,canonicalAnchor:originalRow.display_geometry.coordinates,precisionClass:originalRow.precision_class,precisionFloorMeters:floor,selectionCompatibility:'compatible',evidence:['synthetic-original-row-and-camera-observations']}
      observations.push({kind:'original-row-binding',row:originalRow,authority:summary.fixtureAuthority})
      observations.push({kind:'near-scope-observation',probe:await page.evaluate(()=>window.__MIP_WORLD_VIEW_CLUSTER_PROBE__.getBillboardState())});assert.ok(JSON.parse(before).heightMeters>=floor-0.000001)
      return 'Actual native scope reader at unchanged facility floor; five alternating primary/rotated states assert painted card/canvas/control containment, explicitly scroll each control into the measured free workspace window, and directly activate Close/Inspector plus keyboard controls before restoring orientation. Nine-point hit tests and control-specific screenshots distinguish sticky page chrome from card clipping. Exact canonical context/camera remain unchanged; physical 1,200m near band remains unsupported.'
    })
    await check('orientation',async()=>{const bound=await current();await page.setViewportSize(profile.rotatedViewport);await page.waitForTimeout(250);assert.deepEqual(await current(),bound);await snap('rotated-world');await page.setViewportSize(profile.viewport);assert.deepEqual(await current(),bound);return 'Both CSS viewport orientations preserve exact canonical/time attributes. This is browser viewport resize, not physical rotation.'})
    await check('background-remount',async()=>{const bound=await current(),camera=await page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState());await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))});await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'))});await activate(modes.getByRole('tab',{name:'Graph',exact:true}));await activate(modes.getByRole('tab',{name:'Map',exact:true}));await page.waitForFunction(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__?.getCameraState(),{},{timeout:60000});assert.deepEqual(await current(),bound);observations.push({kind:'remount-camera',before:camera,after:await page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState())});return 'Scripted hidden/resume and actual Map→Graph→Map remount retain context; before/after camera recorded. Physical background suspension remains unmeasured.'})
    await nav('Feed');await page.getByRole('region',{name:'Story reader',exact:true}).waitFor()
    await check('network-loss',async()=>{await page.evaluate(()=>window.__MIP_DEVICE_ACCEPTANCE__.offline(true));await activate(button('Reload story Following'));await page.getByText('Story Following is unavailable. Reload to check its current state.',{exact:true}).waitFor();await page.evaluate(()=>window.__MIP_DEVICE_ACCEPTANCE__.offline(false));await activate(button('Reload story Following'));await page.getByText(/^Following this story\./).waitFor();return 'Synthetic local transport failure clears current personal payload, discloses unavailable and explicitly reloads. Actual radio/network loss is owner checklist scope.'})
    await check('publication-failure',async()=>{await page.evaluate(()=>window.__MIP_DEVICE_ACCEPTANCE__.publication(false));await page.evaluate(()=>{location.hash='#/story/00000000-0000-4000-8000-000000000002?version=00000000-0000-4000-8000-000000000204'});await page.getByText('This exact story version is unavailable. No latest-version or private-source fallback is displayed.',{exact:true}).waitFor();assert.equal(await page.getByRole('region',{name:'Story reader',exact:true}).getByText('Retained source headline',{exact:true}).count(),0);await page.evaluate(()=>window.__MIP_DEVICE_ACCEPTANCE__.publication(true));await page.goBack();await page.getByRole('region',{name:'Story reader',exact:true}).getByRole('heading',{name:'Retained source headline',exact:true}).first().waitFor();assert.match(page.url(),/version=00000000-0000-4000-8000-000000000203/);observations.push({kind:'browser-back-url',url:page.url()});return 'Unavailable explicit Story version withholds prior source and latest/private fallback; actual browser Back returns to exact original collection version.'})
    record.functional.status='partial';record.functional.checks.push({journeyId:'keyboard-density',status:'blocked',observation:'Owner assesses information density and physical keyboard/accessibility; browser focus checks occur in Search and selected-card paths.',evidence:[]})
    assert.equal(await page.evaluate(()=>window.__MIP_DEVICE_GEOLOCATION_CALLS__),0,'device geolocation never requested')
    observations.push({kind:'geolocation-policy',deviceGeolocationCalls:0,userDeclaredCoarseLocation:'Owner checklist only where existing App supports it; no new UI or location inference.'})
  }catch(error){failed=true;record.functional.status='failed';observations.push({failure:error.stack??String(error),fixtureStats:await page.evaluate(()=>window.__MIP_DEVICE_ACCEPTANCE__?.stats()).catch(()=>null),bodyText:await page.locator('body').innerText().catch(()=>null)})}
  finally{
    // Separate startup fallback page: no genuine provider or GPU failure claim.
    const fallback=await context.newPage();await fallback.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){return /webgl/i.test(kind)?null:get.call(this,kind,...args)}})
    try{await fallback.goto(base+'?worldViewPrototype=1#/event/00000000-0000-4000-8000-000000000001/world?time=2026-01-01T12%3A00%3A00.000Z&entity=00000000-0000-4000-8000-000000009999');await fallback.locator('.wv-map-svg').waitFor({timeout:60000});await fallback.locator('[data-deep-link-fallback]').waitFor({state:'attached'});const disclosure=await fallback.locator('[data-deep-link-fallback]').textContent();const retained=await fallback.locator('.wv-view').getAttribute('data-canonical-subject-id');assert.equal(retained,'00000000-0000-4000-8000-000000000001');observations.push({kind:'unsupported-selection',selectionCompatibility:'unsupported',fallbackDisclosure:disclosure,retainedCanonicalSubjectId:retained});record.functional.checks.push({journeyId:'webgl-fallback',status:'passed',observation:'Actual startup without WebGL renders Atlas; unsupported entity deep link discloses parent fallback with canonical subject retained. Physical GPU/context loss not asserted.',evidence:['startup-no-webgl-atlas']});const path=profile.id+'-no-webgl-atlas.png';await fallback.screenshot({path:output+'/'+path});record.artifacts.push({path,sha256:sha(await readFile(output+'/'+path)),kind:'screenshot'})}catch(e){failed=true;record.functional.checks.push({journeyId:'webgl-fallback',status:'failed',observation:String(e),evidence:[]})}
    if(errors.length){failed=true;record.functional.status='failed'}
    const validation=validateAcceptanceRecord(record);assert.equal(validation.valid,true,JSON.stringify(validation.errors))
    const receipt={profile,record,observations,pageErrors:errors,blockedRequests:blocked,cleanup:'Browser context closed after receipt snapshot; server/browser closed in outer finally.'}
    await writeFile(output+'/'+profile.id+'-receipt.json',JSON.stringify(receipt,null,2)+'\n');summary.profiles.push({id:profile.id,status:record.functional.status,checks:record.functional.checks.map(c=>({id:c.journeyId,status:c.status})),receipt:profile.id+'-receipt.json',screenshots:record.artifacts.length,errors})
    await context.close()
  }
}
}finally{await browser.close();await server.close();assert.deepEqual(await hashes(),before);assert.equal(git('rev-parse','HEAD'),candidateCommit);await writeFile(output+'/summary.json',JSON.stringify(summary,null,2)+'\n')}
console.log(JSON.stringify({candidateCommit,candidateTree,dirty,engine,profiles:summary.profiles,output},null,2))
if(failed)process.exitCode=1
