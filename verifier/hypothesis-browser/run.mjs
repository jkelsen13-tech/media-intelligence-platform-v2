import {syntheticAppIsolation} from './appIsolation.mjs'
import {createHash} from 'node:crypto'
import {syntheticObservation} from '../../tests/hypothesisObservationFixture.mjs'
import {syntheticComparisonHistory} from '../../tests/hypothesisComparisonFixture.mjs'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {readFile} from 'node:fs/promises'
const require=createRequire(import.meta.url)
const {build}=createRequire(require.resolve('vite/package.json'))('esbuild')
const {chromium,webkit}=createRequire(process.env.MIP_BROWSER_PACKAGE+'/package.json')('playwright')
const bundle=await build({entryPoints:['verifier/hypothesis-browser/fixture.jsx'],bundle:true,write:false,
 // Native WebCrypto is required below; leave Node-only fallback unreachable, as Vite does.
 format:'iife',external:['node:crypto'],platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{"DEV":false,"BASE_URL":"/"}'},loader:{'.css':'empty'},plugins:[syntheticAppIsolation]})
// Actual application styles; remote font import omitted, system fallback only.
const css=(await Promise.all(['src/styles/tokens.css','src/styles/workspace.css','src/index.css','src/styles/investigation-workspace-panels.css'].map(p=>readFile(p,'utf8')))).map(s=>s.split('\n').filter(line=>!line.startsWith('@import ')).join('\n')).join('\n')
for(const [engine,launcher] of Object.entries({chromium,webkit})){
 const browser=await launcher.launch({headless:true})
 try{
  const page=await browser.newPage(),requests=[],errors=[],internalRequests=[]
  let appDenied=false,appCalls=[]
  let comparisonMode='ready',observation=null,observationCalls=[],observationDenied=false
  const sha=s=>createHash('sha256').update(s).digest('hex')
  // Intercept a reserved synthetic origin to provide a secure WebCrypto context.
  // This document is fulfilled in-process; it never reaches DNS or a server.
  await page.route('**/*',async route=>{
   if(route.request().url()==='https://mip-synthetic.invalid/'&&route.request().isNavigationRequest()&&route.request().frame()===page.mainFrame())
    return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Synthetic hypothesis inspection</title><div id="root"></div>'})
   if(route.request().url()==='https://mip-synthetic.invalid/assets/mip-mobius-logo.png')
    return route.fulfill({status:204,body:''}) // Brand bitmap excluded from synthetic layout qualification.
   if(route.request().url()==='https://mip-synthetic.invalid/app-hypotheses'){
    const request=route.request(),body=request.postDataJSON()
    assert.equal(request.method(),'POST');assert.equal(request.headers()['authorization'],'Bearer synthetic-app-browser-token')
    assert.equal(request.headers()['cookie'],undefined);assert.equal(request.headers()['referer'],undefined)
    assert.equal(body.input.investigation_id,'11111111-1111-4111-8111-111111111111')
    appCalls.push(body.action)
    const f=syntheticComparisonHistory()
    f.history.investigation_id=body.input.investigation_id;f.backlog.investigation_id=body.input.investigation_id
    for(const entry of f.history.entries)entry.assessment.question_id=body.input.investigation_id
    assert.ok(['history','backlog','review_history'].includes(body.action))
    const reviewHistory={contract_version:'mip_hypothesis_review_history_v1',investigation_id:body.input.investigation_id,
     entries:[],latest_receipt_id:null,current_user_only:true,is_approval:false,resolves_reassessment:false,publication_allowed:false}
    return route.fulfill({status:appDenied?403:200,contentType:'application/json',headers:{'cache-control':'private, no-store'},
     body:JSON.stringify(appDenied?{error:{code:'access_denied'}}:{data:body.action==='history'?f.history:body.action==='backlog'?f.backlog:reviewHistory})})
   }
   if(route.request().url()==='https://mip-synthetic.invalid/hypotheses'){
    const request=route.request(),body=request.postDataJSON()
    assert.equal(request.method(),'POST')
    assert.equal(request.headers()['authorization'],'Bearer synthetic-browser-token')
    assert.equal(request.headers()['referer'],undefined)
    assert.equal(request.headers()['cookie'],undefined)
    internalRequests.push(body.action)
    const f=syntheticComparisonHistory()
    let status=200,result
    if(comparisonMode==='denied'){status=403;result={error:{code:'access_denied'}}}
    else if(body.action==='history')result={data:f.history}
    else if(body.action==='backlog'){
     if(comparisonMode==='permission')f.backlog.causes.push({cause_id:'synthetic-permission-race',
      revision_id:'synthetic-assessment-1',kind:'permission_changed',state:'pending_explicit_reconciliation'})
     result={data:f.backlog}
    }else{status=503;result={error:{code:'service_unavailable'}}}
    return route.fulfill({status,contentType:'application/json',headers:{'cache-control':'private, no-store'},body:JSON.stringify(result)})
   }

   if(route.request().url()==='https://mip-synthetic.invalid/observations'){
    const request=route.request(),body=request.postDataJSON()
    assert.equal(request.method(),'POST');assert.equal(request.headers()['authorization'],'Bearer synthetic-browser-token')
    assert.equal(request.headers()['cookie'],undefined);assert.equal(request.headers()['referer'],undefined)
    observationCalls.push(body)
    let result
    if(body.action==='capture_observation'){
     if(!observation){observation=syntheticObservation(sha,body.input.request_id);return route.abort()}
     assert.equal(body.input.request_id,observation.receipt.observation_id)
     result={data:observation.receipt}
    }else if(body.action==='list_observations')result={data:observation.list}
    else if(body.action==='read_observation'){
     assert.equal(body.input.observation_id,observation.receipt.observation_id)
     const data=structuredClone(observation.view)
     if(observationDenied)data.entries[0]={revision_id:data.entries[0].revision_id,revision:1,status:'withheld',
      observed_status:'available',reason:'current_permission_or_binding_denied'}
     result={data}
    }else throw Error('unexpected synthetic observation action')
    return route.fulfill({status:200,contentType:'application/json',headers:{'cache-control':'private, no-store'},body:JSON.stringify(result)})
   }

   requests.push(route.request().url());return route.abort()
  })
  page.on('pageerror',e=>errors.push(e.message))
  for(const width of [1280,768,390,320]){
   comparisonMode='ready';observation=null;observationCalls=[];observationDenied=false
   await page.setViewportSize({width,height:1000})
   await page.goto('https://mip-synthetic.invalid/')
   assert.equal(await page.evaluate(()=>!!globalThis.crypto?.subtle),true)
   await page.addStyleTag({content:css})
   await page.addScriptTag({content:bundle.outputFiles[0].text})
   const region=page.getByRole('region',{name:'Hypothesis worker attempts'})
   await region.waitFor()
   assert.equal(await page.evaluate(()=>window.synthetic.calls),0)
   const inspect=region.getByRole('button',{name:'Inspect worker attempts',exact:true})
   await inspect.focus();await page.keyboard.press('Enter')
   await region.getByText('Failed; retained for reconciliation',{exact:true}).waitFor()
   assert.equal(await page.evaluate(()=>window.synthetic.calls),1)
   assert.equal(await region.locator('li').count(),3)
   assert.ok((await region.innerText()).includes('Linked fresh generation'))
   assert.ok((await region.innerText()).includes('Fresh recovery of retained generation'))
   const recover=region.getByRole('button',{name:'Prepare fresh-generation recovery',exact:true})
   assert.equal(await recover.count(),1)
   assert.ok((await recover.boundingBox()).height>=44)
   await recover.focus();await page.keyboard.press('Enter')
   assert.deepEqual(await page.evaluate(()=>window.synthetic.recoveries),['00000000-0000-4000-8000-000000000023'])
   assert.equal(await page.evaluate(()=>window.synthetic.calls),1)
   assert.equal(await region.evaluate(el=>el.scrollWidth>el.clientWidth+1),false)
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)
   if(width===390)console.log('MIP_SYNTHETIC_WORKER_LEDGER_'+engine+'='+(await page.screenshot({type:'jpeg',quality:65})).toString('base64'))
   await page.evaluate(()=>window.synthetic.mode='denied')
   await region.getByRole('button',{name:'Refresh worker attempts',exact:true}).click()
   await region.getByText('Worker attempts are unavailable under the current access context.',{exact:true}).waitFor()
   assert.equal(await region.locator('li').count(),0)
   assert.equal(await recover.count(),0)
   await page.evaluate(()=>window.renderSynthetic(null))
   await region.waitFor({state:'detached'})
   await page.evaluate(()=>window.renderSyntheticAssessment())
   const panel=page.locator('.piw-hypothesis-assessment')
   await panel.getByRole('heading',{name:'What explains the fictional contract award?',exact:true}).waitFor()
   await panel.getByText('Inferred assessment, not an established finding.',{exact:true}).waitFor()
   await panel.getByText('Saved review state: unreviewed · Private; publication disabled.',{exact:true}).waitFor()
   assert.equal(await panel.getByRole('heading',{name:'Saved revision record',exact:true}).count(),0)
   const disclosure=panel.locator('summary')
   await disclosure.focus();await page.keyboard.press('Enter')
   await panel.getByRole('heading',{name:'Saved revision record',exact:true}).waitFor()
   assert.equal(await panel.getByRole('heading',{name:'Improper influence affected the award.',exact:true}).count(),1)
   assert.equal(await panel.getByRole('heading',{name:'A legitimate selection process determined the award.',exact:true}).count(),1)
   const visible=await panel.innerText()
   assert.ok(visible.includes('Source publication: 2026-09-12 (date only)'))
   assert.ok(visible.includes('2026-09-13 10:00:00.123456 UTC'))
   assert.ok(visible.includes('Shared origins are not independent corroboration.'))
   assert.ok(visible.includes('A dependency changed. Reassessment is pending'))
   for(const title of ['Likelihood','Confidence in this likelihood assessment','Diagnostic relevance','Evidence quality','Overall assessment confidence'])
    assert.ok(visible.includes(title))
   assert.ok(!visible.includes('50%'))
   assert.equal(await panel.evaluate(el=>el.scrollWidth>el.clientWidth+1),false)
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)
   const revision=panel.getByRole('heading',{name:'Saved revision record',exact:true})
   await revision.scrollIntoViewIfNeeded()
   const box=await revision.boundingBox()
   assert.ok(box.y>=0&&box.y+box.height<=1000)
   if(width===390)console.log('MIP_SYNTHETIC_SAVED_REVISION_'+engine+'='+(await page.screenshot({type:'jpeg',quality:65})).toString('base64'))
   await panel.getByRole('heading',{name:'What explains the fictional contract award?',exact:true}).scrollIntoViewIfNeeded()
   if(width===390)console.log('MIP_SYNTHETIC_SAVED_ASSESSMENT_'+engine+'='+(await page.screenshot({type:'jpeg',quality:65})).toString('base64'))
   await disclosure.focus();await page.keyboard.press('Enter')
   await panel.getByRole('heading',{name:'Saved revision record',exact:true}).waitFor({state:'detached'})
   await page.evaluate(()=>window.renderSyntheticComposer())
   assert.equal(await page.evaluate(()=>window.composerSynthetic.contextReads),0)
   await page.getByRole('button',{name:'Write a hypothesis assessment',exact:true}).click()
   const compose=page.getByRole('region',{name:'Compose hypothesis assessment'})
   await compose.waitFor()
   await compose.getByLabel('Definition of explanation 1',{exact:true}).fill('Synthetic explanation A.')
   await compose.getByLabel('Definition of explanation 2',{exact:true}).fill('Synthetic explanation B.')
   await compose.getByLabel('Retained material',{exact:true}).selectOption('9007199254740993')
   await compose.getByLabel('Retained text field',{exact:true}).selectOption('summary')
   await page.evaluate(()=>window.composerSynthetic.mode='bad_hash')
   await compose.getByRole('button',{name:'Open retained passage',exact:true}).click()
   await compose.getByRole('alert').waitFor()
   assert.equal(await compose.getByRole('button',{name:'Link this passage',exact:true}).count(),0)
   await page.evaluate(()=>window.composerSynthetic.mode='lost_ack')
   await compose.getByRole('button',{name:'Open retained passage',exact:true}).click()
   await compose.getByRole('button',{name:'Link this passage',exact:true}).click()
   await compose.getByLabel('What evidence 1 documents, within its limits',{exact:true}).fill('Synthetic passage records a meeting, not its purpose.')
   await compose.getByRole('button',{name:'Add argument',exact:true}).click()
   await compose.getByLabel('How the evidence relates',{exact:true}).selectOption('compatible')
   await compose.getByLabel('Evidence 1',{exact:true}).check()
   await compose.getByLabel('Inferential connection for argument 1',{exact:true}).fill('The synthetic meeting fits either explanation.')
   await compose.getByLabel('Limitations of argument 1',{exact:true}).fill('The synthetic discussion is unknown.')
   await compose.getByLabel('Comparison',{exact:true}).selectOption('difficult_to_distinguish')
   await compose.getByLabel('Saved comparison rationale',{exact:true}).fill('Synthetic alternatives remain difficult to distinguish.')
   await compose.getByLabel('Main limitation',{exact:true}).fill('Synthetic evaluation record is absent.')
   await compose.getByLabel('Reason for this saved revision',{exact:true}).fill('Synthetic initial human entry.')
   const overflow=await compose.evaluate(el=>({overflow:el.scrollWidth>el.clientWidth+1,width:el.clientWidth,scroll:el.scrollWidth,
    elements:[...el.querySelectorAll('*')].filter(n=>n.scrollWidth>n.clientWidth+1||n.getBoundingClientRect().right>el.getBoundingClientRect().right+1).map(n=>({tag:n.tagName,label:n.tagName==='LABEL'?n.firstChild?.textContent:null,classes:n.className,width:n.getBoundingClientRect().width,right:n.getBoundingClientRect().right,scroll:n.scrollWidth,client:n.clientWidth,overflow:getComputedStyle(n).overflow})).slice(0,12)}))
   if(overflow.overflow)console.log('MIP_SYNTHETIC_COMPOSER_LAYOUT_FAILURE='+JSON.stringify({engine,width,...overflow}))
   if(overflow.overflow){
    await compose.getByLabel('Comparison',{exact:true}).scrollIntoViewIfNeeded()
    console.log('MIP_SYNTHETIC_COMPOSER_OVERFLOW_IMAGE_'+engine+'='+(await page.screenshot({type:'jpeg',quality:65})).toString('base64'))
    const trials=await compose.evaluate(el=>{
     const select=el.querySelector('select[aria-label="Comparison"]'),label=select.closest('label')
     const measure=()=>({form:el.scrollWidth,label:label.scrollWidth,select:select.scrollWidth,client:select.clientWidth,
      appearance:getComputedStyle(select).appearance})
     const baseline=measure(),results=[]
     for(const [name,target,styles] of [
      ['appearance_none',select,{appearance:'none'}],
      ['select_clip',select,{overflow:'hidden'}],
      ['appearance_and_clip',select,{appearance:'none',overflow:'hidden'}],
      ['select_inline_block',select,{display:'inline-block'}],
      ['label_inline_block',label,{display:'inline-block'}],
      ['label_flex',label,{display:'flex',flexDirection:'column',minWidth:'0'}],
      ['select_size_containment',select,{contain:'inline-size'}],
     ]){
      const old=target.getAttribute('style');Object.assign(target.style,styles);results.push({name,...measure()})
      if(old===null)target.removeAttribute('style');else target.setAttribute('style',old)
     }
     const optionText=[...select.options].map(o=>o.textContent)
     for(const o of select.options)o.textContent='Synthetic option'
     results.push({name:'short_option_text_diagnostic_only',...measure()})
     ;[...select.options].forEach((o,i)=>o.textContent=optionText[i])
     return{baseline,results}
    })
    console.log('MIP_SYNTHETIC_COMPOSER_LAYOUT_TRIALS='+JSON.stringify({engine,viewport:width,...trials}))
   }
   assert.equal(overflow.overflow,false)
   const saveButton=compose.getByRole('button',{name:'Save private assessment',exact:true})
   assert.ok((await saveButton.boundingBox()).height>=44)
   if(width===390){await compose.getByRole('heading',{name:'Competing explanations',exact:true}).scrollIntoViewIfNeeded();console.log('MIP_SYNTHETIC_COMPOSER_FORM_'+engine+'='+(await page.screenshot({type:'jpeg',quality:65})).toString('base64'))}
   await saveButton.click()
   const retry=page.getByRole('button',{name:'Retry the same assessment',exact:true})
   await retry.waitFor()
   assert.equal(await compose.count(),0)
   assert.equal(await page.getByText('Assessment saved privately. Human review and publication eligibility remain separate.',{exact:true}).count(),0)
   await retry.focus();await page.keyboard.press('Enter')
   await page.getByText('Assessment saved privately. Human review and publication eligibility remain separate.',{exact:true}).waitFor()
   const state=await page.evaluate(()=>window.composerSynthetic)
   assert.equal(state.contextReads,1);assert.equal(state.spanReads,2);assert.equal(state.submissions.length,2)
   assert.equal(state.commits,1);assert.deepEqual(state.submissions[0],state.submissions[1])
   const saved=state.saved.assessment
   assert.equal(saved.review_state,'unreviewed');assert.equal(saved.release_state,'private')
   assert.equal(saved.evidence[0].input_position,'9007199254740993')
   assert.equal(saved.evidence[0].source_span.end,Array.from('Synthetic meeting 🧭.').length)
   assert.ok(!JSON.stringify(state.submissions).includes('Synthetic meeting 🧭.'))
   assert.equal(saved.arguments[0].relation,'compatible')
   assert.equal(saved.arguments[0].evidence_ids[0],saved.evidence[0].id)
   assert.equal(saved.comparison.confidence.kind,'not_estimated')
   await page.evaluate(()=>window.inspectSyntheticSaved())
   await panel.getByText('Synthetic alternatives remain difficult to distinguish.',{exact:true}).waitFor()
   await panel.locator('summary').click()
   await panel.getByText('Synthetic passage records a meeting, not its purpose.',{exact:false}).waitFor()
   if(width===390)console.log('MIP_SYNTHETIC_COMPOSER_SAVED_'+engine+'='+(await page.screenshot({type:'jpeg',quality:65})).toString('base64'))
   const review=page.getByRole('region',{name:'Your hypothesis review acknowledgement'})
   await review.getByRole('button',{name:'Mark revision 1 reviewed',exact:true}).waitFor()
   assert.equal(await page.evaluate(()=>window.reviewSynthetic.submissions.length),0)
   await review.getByRole('button',{name:'Mark revision 1 reviewed',exact:true}).click()
   const retryReview=review.getByRole('button',{name:'Retry the same review acknowledgement',exact:true})
   await retryReview.waitFor()
   await retryReview.focus();await page.keyboard.press('Enter')
   await review.getByText(/You marked revision 1 reviewed at/).waitFor()
   const reviewed=await page.evaluate(()=>window.reviewSynthetic)
   assert.equal(reviewed.receipts.length,1);assert.equal(reviewed.submissions.length,2)
   assert.deepEqual(reviewed.submissions[0],reviewed.submissions[1])
   assert.deepEqual(await page.evaluate(()=>window.composerSynthetic.saved.assessment),saved)
   assert.equal(await review.getByRole('button',{name:'Mark revision 1 reviewed',exact:true}).count(),0)
   assert.equal(await review.evaluate(el=>el.scrollWidth>el.clientWidth+1),false)
   if(width===390)console.log('MIP_SYNTHETIC_REVIEW_ACK_'+engine+'='+(await page.screenshot({type:'jpeg',quality:65})).toString('base64'))
   await page.evaluate(()=>window.renderSyntheticComposer(null))
   await panel.waitFor({state:'detached'})
   await page.evaluate(()=>window.renderSyntheticComparison())
   const comparison=page.getByRole('region',{name:'Compare saved hypothesis revisions'})
   await comparison.waitFor()
   assert.equal((await comparison.innerText()).includes('Earlier synthetic reasoning'),false)
   const compareSummary=comparison.getByText('Inspect changes from revision 1',{exact:true})
   await compareSummary.focus();await page.keyboard.press('Enter')
   await comparison.getByText('Earlier synthetic reasoning: the meeting alone does not distinguish the explanations.',{exact:true}).waitFor()
   await comparison.getByText('Later synthetic reasoning: the alternatives still remain difficult to distinguish.',{exact:true}).waitFor()
   await comparison.getByText('Omitted from the selected revision; prior history remains retained.',{exact:true}).waitFor()
   const notes=comparison.getByText('Version details and interpretation',{exact:true})
   await notes.click()
   assert.ok((await comparison.innerText()).includes('does not mean deleted from MIP'))
   assert.ok((await comparison.innerText()).includes('verified historical-time view remains unavailable'))
   await notes.click()
   assert.ok((await comparison.innerText()).includes('synthetic-contract-only-v2'))
   assert.equal(await comparison.evaluate(el=>el.scrollWidth>el.clientWidth+1),false)
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)
   if(width===390){
    await comparison.locator('.piw-revision-diff-group').first().evaluate(el=>el.scrollIntoView({block:'start'}))
    console.log('MIP_SYNTHETIC_REVISION_COMPARISON_'+engine+'='+(await page.screenshot({type:'jpeg',quality:65})).toString('base64'))
   }
   comparisonMode='permission'
   await page.getByRole('button',{name:'Refresh assessment history',exact:true}).click()
   await page.getByText('Comparison unavailable: both linked revisions need current permission and a consistent saved history.',{exact:true}).waitFor()
   assert.equal(await page.getByText('Earlier synthetic reasoning: the meeting alone does not distinguish the explanations.',{exact:true}).count(),0)
   comparisonMode='denied'
   await page.getByRole('button',{name:'Refresh assessment history',exact:true}).click()
   await page.getByText('Assessment history is unavailable.',{exact:true}).waitFor()
   assert.equal(await page.getByText('Later synthetic reasoning: the alternatives still remain difficult to distinguish.',{exact:true}).count(),0)
   await page.evaluate(()=>window.renderSyntheticComparison(null))
   await page.getByRole('region',{name:'Hypothesis assessment history'}).waitFor({state:'detached'})

   await page.evaluate(()=>window.renderSyntheticObservations())
   const observations=page.getByRole('region',{name:'Saved revision views'})
   await observations.waitFor();assert.equal(observationCalls.length,0)
   const captureView=observations.getByRole('button',{name:'Record current revision view',exact:true})
   assert.ok((await captureView.boundingBox()).height>=44)
   await captureView.focus();await page.keyboard.press('Enter')
   await observations.getByRole('alert').waitFor()
   assert.equal(observationCalls.length,1)
   await observations.getByRole('button',{name:'Retry the same saved view',exact:true}).click()
   await observations.getByRole('heading',{name:'Verified saved view',exact:true}).waitFor()
   assert.deepEqual(observationCalls[0],observationCalls[1]);assert.equal(observationCalls[2].action,'read_observation')
   await observations.getByRole('heading',{name:'What explains the fictional contract award?',exact:true}).waitFor()
   assert.equal(await observations.evaluate(el=>el.scrollWidth>el.clientWidth+1),false)
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)
   const revisionControl=observations.getByRole('combobox',{name:'Revision in this view',exact:true})
   assert.equal(await revisionControl.evaluate(el=>getComputedStyle(el).appearance),'none')
   assert.ok((await revisionControl.boundingBox()).height>=44)
   await revisionControl.focus();await page.keyboard.press('ArrowUp')
   assert.equal(await revisionControl.inputValue(),observation.view.entries[0].revision_id)
   if(width===390)console.log('MIP_SYNTHETIC_OBSERVATION_'+engine+'='+(await page.screenshot({type:'jpeg',quality:65})).toString('base64'))
   // Recreate the component and transport; the simulated remote store persists.
   await page.evaluate(()=>window.renderSyntheticObservations(null))
   await observations.waitFor({state:'detached'})
   await page.evaluate(()=>window.renderSyntheticObservations())
   await observations.waitFor();assert.equal(observationCalls.length,3)
   await observations.getByRole('button',{name:'Inspect saved views',exact:true}).click()
   await observations.getByRole('button',{name:'Open saved view 1',exact:true}).click()
   await observations.getByRole('heading',{name:'Verified saved view',exact:true}).waitFor()
   assert.equal(observationCalls.filter(c=>c.action==='capture_observation').length,2)
   observationDenied=true
   await observations.getByRole('button',{name:'Inspect saved views',exact:true}).click()
   await observations.getByRole('button',{name:'Open saved view 1',exact:true}).click()
   await observations.getByText('A verified saved view is unavailable under the current configuration or access.',{exact:true}).waitFor()
   assert.equal(await observations.getByText('What explains the fictional contract award?',{exact:true}).count(),0)
   assert.deepEqual(await page.evaluate(()=>window.observationSynthetic.denials),['access_denied'])
   await page.evaluate(()=>window.renderSyntheticObservations(null))
   await observations.waitFor({state:'detached'})

   appDenied=false;appCalls=[]
   await page.evaluate(()=>window.renderSyntheticApp(false))
   await page.locator('[data-workspace-status="ready"]').waitFor()
   assert.equal(appCalls.length,0,'normal App default endpoint stays closed')
   await page.evaluate(()=>window.renderSyntheticApp(true))
   const appHistory=page.getByRole('region',{name:'Hypothesis assessment history',exact:true})
   await appHistory.getByText('Later synthetic reasoning: the alternatives still remain difficult to distinguish.',{exact:true}).waitFor()
   assert.ok(appCalls.includes('history'));assert.ok(appCalls.includes('backlog'))
   const appReason=appHistory.getByLabel('Reason for reconsideration',{exact:true})
   await appReason.selectOption('methodology')
   assert.equal(await appReason.inputValue(),'methodology')
   await appReason.focus();await page.keyboard.press('ArrowUp')
   assert.equal(await appReason.inputValue(),'shared_origin')
   assert.ok((await appReason.boundingBox()).height>=44)
   await appHistory.getByLabel('What needs reconsideration, and why?',{exact:true}).fill('Synthetic concern only; no request is submitted.')
   await appHistory.scrollIntoViewIfNeeded()
   assert.equal(await appHistory.isVisible(),true)
   const appLayout=await appHistory.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth,
    elements:[el,...el.querySelectorAll('*')].filter(n=>n.scrollWidth>n.clientWidth+1||n.getBoundingClientRect().right>el.getBoundingClientRect().right+1).map(n=>({
     tag:n.tagName,classes:n.className,text:n.textContent?.slice(0,100),width:n.clientWidth,scroll:n.scrollWidth,
     right:n.getBoundingClientRect().right,display:getComputedStyle(n).display,minWidth:getComputedStyle(n).minWidth,
     whiteSpace:getComputedStyle(n).whiteSpace,grid:getComputedStyle(n).gridTemplateColumns,position:getComputedStyle(n).position})).slice(0,20)}))
   if(appLayout.scroll>appLayout.width+1){
    console.log('MIP_SYNTHETIC_NORMAL_APP_LAYOUT_FAILURE='+JSON.stringify({engine,viewportWidth:width,...appLayout}))
    console.log('MIP_SYNTHETIC_NORMAL_APP_LAYOUT_FAILURE_IMAGE_'+engine+'='+(await page.screenshot({type:'jpeg',quality:70})).toString('base64'))
   }
   assert.equal(appLayout.scroll>appLayout.width+1,false)
   if(width===390)console.log('MIP_SYNTHETIC_NORMAL_APP_HISTORY_'+engine+'='+(await page.screenshot({type:'jpeg',quality:65})).toString('base64'))
   appDenied=true
   await appHistory.getByRole('button',{name:'Refresh assessment history',exact:true}).click()
   await page.getByRole('heading',{name:'This investigation is unavailable',exact:true}).waitFor()
   await appHistory.waitFor({state:'detached'})
   assert.equal(await page.locator('#piw-hypotheses').count(),0)
   if(width===390)console.log('MIP_SYNTHETIC_NORMAL_APP_DENIAL_'+engine+'='+(await page.screenshot({type:'jpeg',quality:65})).toString('base64'))
   await page.evaluate(()=>window.renderSyntheticApp(true,true))
   await page.getByRole('heading',{name:'Sign in to read assigned investigations',exact:true}).waitFor()
   assert.equal(await appHistory.count(),0)

  }
  assert.deepEqual(requests,[]);assert.deepEqual(errors,[])
  assert.ok(internalRequests.filter(x=>x==='history').length>=12)
  assert.ok(internalRequests.filter(x=>x==='backlog').length>=12)
  console.log('MIP_SYNTHETIC_HYPOTHESIS_BROWSER_PASS='+JSON.stringify({engine,widths:[1280,768,390,320],
   normalAppConfiguredHistoryVisible:true,normalAppDefaultClosed:true,normalAppDenialCleared:true,normalAppLogoutCleared:true,publicSurfacesIsolated:true,brandBitmapExcluded:true,committedObservationReadback:true,observationExactRetry:true,observationRestartRecovery:true,observationCurrentDenialCleared:true,configuredBrowserHttp:true,interceptedSyntheticHttpOnly:true,savedRevisionComparison:true,comparisonPermissionRaceCleared:true,comparisonNoSourceDeletionClaim:true,keyboardInspection:true,reciprocalRecoveryLinks:true,onlyUnlinkedFailureRecoverable:true,
   noAutomaticRetry:true,deniedRecordsCleared:true,logoutCleared:true,networkRequests:0,
   explicitReviewAcknowledgement:true,reviewExactRetry:true,reviewReadbackRequired:true,assessmentUnchangedByReview:true,composerExactUnicodeSpan:true,hashMismatchDenied:true,linkedReasoning:true,lostAcknowledgementExactRetry:true,syntheticReceiptOnly:true,savedRevisionReachableByScrolling:true,savedAssessmentDisclosure:true,separateMissingEstimates:true,sourceClocks:true,pendingReassessment:true,systemFontFallback:true,scope:'synthetic_ledger_saved_assessment_and_composer',productionQualified:false}))
 }finally{await browser.close()}
}
