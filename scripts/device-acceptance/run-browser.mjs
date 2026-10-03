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
const sourcePaths=['src/App.jsx','src/views/NewsView.jsx','src/views/NewsStoryReader.jsx','src/views/WorldView.jsx','src/views/WorldMapCanvas.jsx','src/components/WorldViewBillboardOverlay.jsx','src/lib/worldViewBillboardPresentation.js','src/lib/worldViewCameraState.js','package-lock.json']
const hashes=async()=>Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,sha(await readFile(path))])))
const before=await hashes(),candidateCommit=git('rev-parse','HEAD'),candidateTree=git('rev-parse','HEAD^{tree}'),dirty=git('status','--porcelain')!==''
assert.ok(!dirty||process.env.MIP_DEVICE_ALLOW_DIRTY==='1','use a clean committed head, or explicitly label a development run with MIP_DEVICE_ALLOW_DIRTY=1')
const selected=(process.env.MIP_DEVICE_PROFILES??'ipad,iphone,narrow,desktop').split(',')
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
try{server=await createServer({configFile:new URL('./vite.config.mjs',import.meta.url).pathname});await server.listen()}catch(error){await browser.close();throw error}
const origin=`http://127.0.0.1:${server.httpServer.address().port}`,base=origin+'/media-intelligence-platform-v2/'
const summary={contract:'mip-device-browser-preparation-v1',candidateCommit,candidateTree,dirty,node:process.version,engine,browserVersion:browser.version(),fixtureAuthority:'SYNTHETIC_BACKEND_AND_SESSION_ONLY',productionFileHashes:before,
  qualification:'Actual full App development transform, actual native software browser when available; synthetic backend/session/geometry, all nonlocal network blocked. No physical-device, live Auth/SQL, final appearance, FPS or thermal acceptance.',profiles:[],historicalColdPortrait:'RED: unchanged; original executable measurement boundary unrecovered'}
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
      assert.ok(await page.locator('.wv-billboard-tether-anchor').count());await snap('selected-card');await page.setViewportSize(profile.rotatedViewport);await tabs.waitFor();assert.deepEqual(await current(),bound);await snap('selected-card-rotated');await page.setViewportSize(profile.viewport)
      await activate(button('Close selected card'));await tabs.waitFor({state:'hidden'});assert.deepEqual(await current(),bound);await open.focus();await open.press('Enter');await tabs.waitFor();await activate(button('Open inspector'));assert.equal(await page.evaluate(()=>window.__MIP_WORLD_VIEW_CAMERA_PROBE__.getCameraState()),before);assert.deepEqual(await current(),bound)
      const close=button('Close spatial inspector');if(await close.count())await activate(close)
      const originalRow=await page.evaluate(id=>window.__MIP_DEVICE_ACCEPTANCE__.rows.find(row=>row.subject_graph_node_id===id),bound['data-canonical-subject-id']);assert.ok(originalRow)
      record.surfaceCameraBaseline={...record.surfaceCameraBaseline,surface:'World View',renderer:await page.evaluate(()=>window.__MIP_WORLD_VIEW_CLUSTER_PROBE__.getBillboardState()?.native?'native software browser':'fallback'),canonicalSubjectId:bound['data-canonical-subject-id'],recordedTime:bound['data-as-of-time'],sourceVersionId:originalRow.revision_id,cameraJson:before,canonicalAnchor:originalRow.display_geometry.coordinates,precisionClass:originalRow.precision_class,precisionFloorMeters:floor,selectionCompatibility:'compatible',evidence:['synthetic-original-row-and-camera-observations']}
      observations.push({kind:'original-row-binding',row:originalRow,authority:summary.fixtureAuthority})
      observations.push({kind:'near-scope-observation',probe:await page.evaluate(()=>window.__MIP_WORLD_VIEW_CLUSTER_PROBE__.getBillboardState())});assert.ok(JSON.parse(before).heightMeters>=floor-0.000001)
      return 'Actual native scope reader/tether/tabs/Inspector at unchanged facility floor; physical 1,200m near band remains unsupported. Far/ribbon observations are recorded, not fabricated stage claims.'
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
