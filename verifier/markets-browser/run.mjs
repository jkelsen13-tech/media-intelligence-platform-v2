import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFile} from 'node:fs/promises'
import {syntheticAppIsolation} from './isolatedPublicSurfaces.mjs'
import {createPrivateMarketsHandler} from '../../supabase/qualification/markets-evidence/handler.mjs'
import {PRIVATE_MARKETS_SQL} from '../../supabase/qualification/markets-evidence/store.mjs'
import {marketsAuth,marketsOrigin,marketsEndpoint,marketsResult,marketScope,marketsAt} from '../../tests/privateMarketsWorkspaceFixture.mjs'
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('vite/package.json'))('esbuild')
const {chromium,webkit}=createRequire(process.env.MIP_BROWSER_PACKAGE+'/package.json')('playwright')
const bundle=await build({entryPoints:['verifier/markets-browser/fixture.jsx'],bundle:true,write:false,format:'iife',platform:'browser',
 external:['node:crypto'],jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{"DEV":false,"BASE_URL":"/"}'},
 loader:{'.css':'empty'},plugins:[syntheticAppIsolation]})
const css=(await Promise.all(['src/styles/tokens.css','src/styles/workspace.css','src/index.css','src/styles/investigation-workspace-panels.css']
 .map(path=>readFile(path,'utf8')))).map(s=>s.split('\n').filter(l=>!l.startsWith('@import ')).join('\n')).join('\n')
for(const [engine,launcher] of Object.entries({chromium,webkit})){
 const browser=await launcher.launch({headless:true})
 try{
  const page=await browser.newPage(),outside=[],errors=[],calls=[]
  let mode='ready'
  // Actual handler/reader/mapper; synthetic verified-Auth and database row fixture.
  // This is not native SQL, provider authentication, or production rights qualification.
  const handler=createPrivateMarketsHandler({allowedOrigins:[marketsOrigin],sourceProject:'synthetic-only',
   authenticate:async bearer=>{assert.equal(bearer,'Bearer synthetic-markets-current');return{id:marketsAuth().user.id}},
   query:async(sql,args)=>{
    assert.equal(sql,PRIVATE_MARKETS_SQL);assert.equal(args[0],marketsAuth().user.id)
    assert.deepEqual(args.slice(1,4),[marketScope.investigation,marketScope.workspace,'synthetic-only'])
    if(mode==='denied')throw Object.assign(Error('synthetic'),{code:'42501'})
    const value=marketsResult({asset_id:args[4],event_id:args[5],at:args[6]})
    if(mode==='empty')value.paths=[]
    if(mode==='mismatch')value.observation_id='00000000-0000-4000-8000-000000000099'
    return {rows:[{value}]}
   }})
  await page.route('**/*',async route=>{
   const request=route.request(),url=request.url()
   if(url===marketsOrigin+'/'&&request.isNavigationRequest()&&request.frame()===page.mainFrame())
    return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic private Markets</title><div id="root"></div>'})
   if(url===marketsOrigin+'/assets/mip-mobius-logo.png')return route.fulfill({status:204,body:''})
   if(url===marketsEndpoint){
    const headers=request.headers();assert.equal(headers.cookie,undefined);assert.equal(headers.referer,undefined)
    const input=request.postDataJSON();calls.push(input)
    assert.deepEqual(Object.keys(input).sort(),['asset_id','at','event_id','investigation_id','workspace_version_id'])
    const response=await handler(new Request(url,{method:request.method(),headers,body:request.postData()}))
    return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()})
   }
   outside.push(url);return route.abort()
  })
  page.on('pageerror',e=>errors.push(e.message))
  for(const width of [1280,768,390,320]){
   mode='ready';calls.length=0
   await page.setViewportSize({width,height:1000});await page.goto(marketsOrigin+'/')
   assert.equal(await page.evaluate(()=>!!crypto.subtle),true)
   await page.addStyleTag({content:css});await page.addScriptTag({content:bundle.outputFiles[0].text})
   await page.locator('[data-workspace-status="ready"]').waitFor()
   assert.equal(await page.getByRole('button',{name:'Open private Markets evidence',exact:true}).count(),0);assert.equal(calls.length,0)
   await page.evaluate(()=>window.renderMarketsApp())
   await page.getByRole('button',{name:'Open private Markets evidence',exact:true}).click()
   const pane=page.getByRole('region',{name:'Private Markets workspace',exact:true})
   await pane.getByRole('button',{name:'Read private evidence paths',exact:true}).click()
   await pane.getByRole('heading',{name:'Synthetic cryptoasset',exact:true}).waitFor()
   await pane.getByRole('heading',{name:'Synthetic equity instrument',exact:true}).first().waitFor()
   assert.equal(calls[0].asset_id,null);assert.equal(calls[0].event_id,marketScope.event)
   assert.ok((await pane.innerText()).includes('Synthetic intermediary'))
   assert.ok((await pane.innerText()).includes('A 😀 B'))
   assert.ok((await pane.innerText()).includes('Not available in this reader'))
   const crypto=pane.getByRole('article',{name:'Retained asset: Synthetic cryptoasset',exact:true})
   await crypto.getByRole('button',{name:'Explore this asset’s events',exact:true}).click()
   await pane.getByRole('heading',{name:'Synthetic cryptoasset',exact:true}).waitFor()
   assert.equal(calls.at(-1).event_id,null);assert.equal(calls.at(-1).asset_id,'00000000-0000-4000-8000-000000000030')
   await pane.getByRole('button',{name:'Explore this event’s assets: Synthetic retained event',exact:true}).click()
   await pane.getByRole('heading',{name:'Synthetic equity instrument',exact:true}).first().waitFor()
   await pane.getByRole('article',{name:'Retained asset: Synthetic equity instrument',exact:true}).first().getByRole('button',{name:'Explore this asset’s events',exact:true}).click()
   await pane.getByRole('button',{name:'Explore this event’s assets: Second synthetic event',exact:true}).waitFor()
   assert.equal(calls.at(-1).event_id,null);assert.equal(calls.at(-1).asset_id,'00000000-0000-4000-8000-000000000003')
   assert.ok(calls.every(c=>c.at===marketsAt&&c.workspace_version_id===marketScope.workspace))
   const details=pane.getByText('Exact retained evidence references',{exact:true}).first()
   await details.focus();await page.keyboard.press('Enter')
   assert.ok((await pane.innerText()).includes('Unicode code points [0, 5)'))
   const control=pane.getByRole('button',{name:'Read private evidence paths',exact:true})
   assert.ok((await control.boundingBox()).height>=44)
   const layout=await pane.evaluate(el=>({clientWidth:el.clientWidth,scrollWidth:el.scrollWidth,
    offenders:[...el.querySelectorAll('*')].filter(n=>n.getBoundingClientRect().right>el.getBoundingClientRect().right+1).map(n=>({tag:n.tagName,classes:n.className,width:n.clientWidth,scroll:n.scrollWidth,text:n.textContent?.slice(0,80)})).slice(0,15)}))
   if(layout.scrollWidth>layout.clientWidth+1){console.log('MIP_MARKETS_LAYOUT_FAILURE='+JSON.stringify({engine,viewportWidth:width,...layout}));console.log('MIP_MARKETS_LAYOUT_FAILURE_IMAGE_'+engine+'='+(await page.screenshot({type:'jpeg',quality:70})).toString('base64'))}
   assert.equal(layout.scrollWidth>layout.clientWidth+1,false)
   if(width===390){await pane.getByRole('heading',{name:'Synthetic equity instrument',exact:true}).first().scrollIntoViewIfNeeded();console.log('MIP_PRIVATE_MARKETS_'+engine+'='+(await page.screenshot({type:'jpeg',quality:70})).toString('base64'))}
   assert.equal(await page.evaluate(()=>/Synthetic equity|synthetic-markets|00000000-0000-4000-8000-000000000003/.test(location.href+JSON.stringify({...localStorage}))),false)
   mode='empty';await control.click()
   await pane.getByText(/No standalone asset identity is supplied/).waitFor();assert.equal(await pane.getByRole('article').count(),0)
   mode='mismatch';await control.click();await pane.getByRole('alert').waitFor();assert.equal(await pane.getByRole('article').count(),0)
   mode='ready';await control.click();await pane.getByRole('article').first().waitFor()
   mode='denied';await control.click();await page.getByRole('heading',{name:'This investigation is unavailable',exact:true}).waitFor()
   await pane.waitFor({state:'detached'});assert.equal(await page.getByRole('heading',{name:'Synthetic equity instrument',exact:true}).count(),0)
   if(width===390)console.log('MIP_PRIVATE_MARKETS_DENIAL_'+engine+'='+(await page.screenshot({type:'jpeg',quality:70})).toString('base64'))
   await page.evaluate(()=>window.renderMarketsApp({signedOut:true}))
   await page.getByRole('heading',{name:'Sign in to read assigned investigations',exact:true}).waitFor()
   if(width===390){
    mode='ready'
    await page.evaluate(()=>window.renderMarketsApp({expiresAt:Math.floor(Date.now()/1000)+3}))
    await page.locator('[data-workspace-status="ready"]').waitFor()
    await page.getByRole('button',{name:'Open private Markets evidence',exact:true}).click()
    await page.getByRole('button',{name:'Read private evidence paths',exact:true}).click()
    await page.getByRole('heading',{name:'Synthetic cryptoasset',exact:true}).waitFor()
    const beforeExpiry=calls.length
    await page.getByRole('heading',{name:'Sign in to read assigned investigations',exact:true}).waitFor()
    assert.equal(calls.length,beforeExpiry)
    assert.equal(await page.getByRole('heading',{name:'Synthetic cryptoasset',exact:true}).count(),0)
   }
  }
  assert.deepEqual(outside,[]);assert.deepEqual(errors,[])
  console.log('MIP_PRIVATE_MARKETS_BROWSER_PASS='+JSON.stringify({engine,widths:[1280,768,390,320],normalApp:true,defaultEndpointClosed:true,
   realClientHandlerReaderMapper:true,syntheticAuthAndDatabase:true,nativeSQLQualified:false,equityAndCrypto:true,indirectPath:true,twoWayNavigation:true,
   exactScopeObservationAndTime:true,emptyNoInventedCard:true,mismatchCleared:true,currentDenialCleared:true,logoutCleared:true,displayedSessionExpiryCleared:true,keyboard:true,
   horizontalOverflow:false,privateRouteOrStorageLeak:false,externalPageRequests:0,publicSurfacesIsolated:true,brandBitmapExcluded:true,productionQualified:false}))
 }finally{await browser.close()}
}
