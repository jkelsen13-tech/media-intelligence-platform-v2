// Ephemeral CI browser against the production build. Public reads only.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
const require = createRequire(process.env.MIP_BROWSER_PACKAGE + '/package.json')
const { chromium } = require('playwright')
const origin = 'http://127.0.0.1:4173/media-intelligence-platform-v2/'
const server = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173', '--strictPort'], {stdio:'ignore'})
let browser
try {
  let ready = false
  for (let i=0;i<40;i++) {
    try { ready = (await fetch(origin)).ok } catch {}
    if (ready) break
    await delay(250)
  }
  assert.ok(ready)
  browser = await chromium.launch({headless:true})
  const page = await browser.newPage({viewport:{width:1280,height:900}})
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(origin + '#/event/acc55cb2-5ac2-4aed-be36-3f576d2bc443/timeline')
  await page.locator('.ws-title').filter({hasText:'2024 Total Solar Eclipse, Cleveland, Ohio'}).waitFor({timeout:60000})
  const shell = page.locator('.ws-shell')
  const inspector = page.getByRole('complementary',{name:'Investigation inspector',exact:true})
  const toggle = inspector.getByRole('button',{name:'Investigation inspector',exact:true})
  const context = () => page.locator('.ws-canonical[data-investigation-context]').getAttribute('data-canonical-subject-id')
  const subject = await context()
  for (const width of [1280,1024,768,390,320]) {
    await page.setViewportSize({width,height:width>=768?900:844})
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click()
    await shell.evaluate(el=>{el.scrollTop=0})
    const before = await page.locator('.ws-content').boundingBox()
    const dock = await inspector.boundingBox()
    const head = await page.locator('.ws-workspace-head').boundingBox()
    assert.ok(before.width > 0 && dock.width > 0)
    assert.ok(dock.x >= 0 && dock.x+dock.width <= width+1, 'inspector fits '+width)
    if (width>=1024) {
      assert.ok(Math.abs(dock.y-head.y)<2,'inspector aligns with header '+width)
      assert.ok(before.x+before.width <= dock.x+1,'inspector does not cover evidence')
    }
    if (width<768) {
      assert.ok(before.height>=300,'phone retains full evidence reading flow')
      assert.ok(dock.y>=before.y+before.height-1,'phone inspector follows evidence')
    }
    if (width===768) {
      assert.ok(Math.abs(before.x-dock.x)<2 && Math.abs(before.width-dock.width)<2,'tablet stacks inspector')
    }
    console.log('MIP_SHELL_OPEN_'+width+'='+(await page.screenshot({type:'jpeg',quality:75})).toString('base64'))
    if (width<768) {
      const record = page.locator('.timeline-view .ep-tl-card').first()
      await record.scrollIntoViewIfNeeded()
      console.log('MIP_SHELL_PHONE_RECORD_'+width+'='+(await page.screenshot({type:'jpeg',quality:75})).toString('base64'))
    }
    await toggle.click()
    if (width>=1024) console.log('MIP_SHELL_COLLAPSED_'+width+'='+(await page.screenshot({type:'jpeg',quality:75})).toString('base64'))
    const after = await page.locator('.ws-content').boundingBox()
    if (width>=1024) assert.ok(after.width-before.width>=230,'collapse must reclaim dock width '+width)
    if (width===768) assert.ok(after.height>before.height,'tablet collapse reclaims reading height')
    assert.equal(await context(),subject,'chrome cannot change canonical subject')
    assert.equal(await toggle.getAttribute('aria-expanded'),'false')
    await toggle.focus()
    await page.keyboard.press('Enter')
    assert.equal(await toggle.getAttribute('aria-expanded'),'true','keyboard reopens inspector')
    const account = page.getByRole('button',{name:'Account',exact:true})
    await shell.evaluate(el=>{el.scrollTop=0})
    await account.click()
    await page.getByRole('heading',{name:'Account',exact:true}).waitFor()
    await page.getByRole('button',{name:'Close',exact:true}).click()
    if (width<768) {
      const menu = page.getByRole('button',{name:'Open investigation navigation',exact:true})
      await menu.click()
      await page.getByRole('dialog',{name:'Investigation navigation',exact:true}).waitFor()
      await page.keyboard.press('Escape')
      assert.equal(await menu.evaluate(el=>el===document.activeElement),true,'drawer restores focus')
    }
  }
  await page.setViewportSize({width:1280,height:900})
  await page.getByRole('button',{name:'Collapse navigation',exact:true}).click()
  const navWidth=await page.locator('.ws-nav').evaluate(el=>el.getBoundingClientRect().width)
  assert.equal(navWidth,72)
  await page.getByRole('button',{name:'Expand navigation',exact:true}).click()
  assert.equal(await context(),subject)
  assert.deepEqual(errors,[])
  console.log('MIP_SHELL_PASS='+JSON.stringify({widths:[1280,1024,768,390,320],reclaimedDock:true,tabletStack:true,account:true,keyboard:true,subjectPreserved:true,pageErrors:0}))
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
