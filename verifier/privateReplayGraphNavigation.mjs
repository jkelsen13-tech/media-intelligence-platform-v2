// Opt-in local verification of the already built protected artifact.
// Never writes private data, screenshots, source identifiers, or evidence text.
import {createServer} from 'node:http'
import {readFile} from 'node:fs/promises'
import {resolve,extname,sep} from 'node:path'
import {createHash} from 'node:crypto'
import {pathToFileURL} from 'node:url'
import assert from 'node:assert/strict'
const root=resolve('demo-preview-dist')
const asset=resolve('.private-demo/native-replay.json')
const digest=async()=>createHash('sha256').update(await readFile(asset)).digest('hex')
const before=await digest()
const {chromium}=process.argv[2]?await import(pathToFileURL(process.argv[2]).href):await import('playwright')
const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store')
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'")
  try {
    const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname)
    if(!path.startsWith(root+sep)){res.statusCode=404;res.end();return}
    res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png'})[extname(path)]??'application/octet-stream')
    res.end(await readFile(path))
  } catch {res.statusCode=404;res.end()}
})
await new Promise(r=>server.listen(0,'127.0.0.1',r))
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||undefined})
try {
  const page=await browser.newPage(),checks=[]
  let errors=0,external=0
  page.on('pageerror',()=>errors++);page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:'))external++})
  for(const width of [1440,768,390]) {
    await page.setViewportSize({width,height:1000})
    await page.goto(`http://127.0.0.1:${server.address().port}/scripts/demo-corpus-preview.html#/demo/all/graph`)
    await page.getByRole('heading',{name:'Pending analytical candidate structures',exact:true}).waitFor()
    await page.waitForFunction(()=>document.querySelector('.graph-canvas')?._cyreg?.cy?.scratch('initialFitState')==='complete')
    const cluster=page.getByRole('region',{name:'Pending graph candidate clusters'}).getByRole('button').first()
    await cluster.focus();await page.keyboard.press('Enter')
    const details=page.getByRole('region',{name:'Selected pending cluster'})
    await details.locator('summary').first().click()
    // Let initial viewport animations and cluster expansion settle before
    // installing the user's viewport, so only member navigation is measured.
    await page.waitForTimeout(500)
    await page.evaluate(()=>{
      const cy=document.querySelector('.graph-canvas')._cyreg.cy
      cy.zoom(cy.zoom()*0.9);cy.pan({x:40,y:50})
      window.__memberBaseline={cy,zoom:cy.zoom(),pan:cy.pan(),nodes:cy.nodes().length,ids:cy.nodes().map(n=>n.id()).sort().join(','),hash:location.hash}
    })
    await details.getByRole('button',{name:/Select member source/}).first().click()
    // Await route and rendered inspector identity, then an explicit post-paint
    // task so React passive effects cannot hide a destroy/recreate regression.
    await page.waitForFunction(()=>{
      const id=location.hash.split('/').at(-1)
      return location.hash!==window.__memberBaseline.hash&&!!document.querySelector(`.ws-inspector-body [data-source-capture="${id}"]`)
    })
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,120)))))
    const state=await page.evaluate(()=>{
      const cy=document.querySelector('.graph-canvas')._cyreg.cy,b=window.__memberBaseline
      return {same_instance:cy===b.cy,old_alive:!b.cy.destroyed(),zoom:cy.zoom()===b.zoom,pan:JSON.stringify(cy.pan())===JSON.stringify(b.pan),node_count:cy.nodes().length===b.nodes,node_membership:cy.nodes().map(n=>n.id()).sort().join(',')===b.ids}
    })
    assert.deepEqual(state,{same_instance:true,old_alive:true,zoom:true,pan:true,node_count:true,node_membership:true})
    checks.push({width,route_and_inspector_settled:true,...state})
  }
  assert.equal(errors,0);assert.equal(external,0);assert.equal(await digest(),before)
  console.log(JSON.stringify({private_artifact_unchanged:true,checks,browser_errors:errors,external_requests:external}))
} catch (error) {console.error('Private graph navigation verification failed; no private evidence logged.',error.name,error.stack?.match(/privateReplayGraphNavigation\.mjs:\d+:\d+/)?.[0]??'');process.exitCode=1}
finally {await browser.close();await new Promise(r=>server.close(r))}
