import assert from 'node:assert/strict'

// Mounted actual CSS/DOM hit-test contract, called by the synthetic full-App
// browser journey. This does not inspect CSS strings or mock stacking rules.
export async function assertMountedWorldViewExploreStack(page) {
  const chooser=page.locator('.wv-explore-map .wv-spatial-groups')
  const summary=chooser.locator('summary')
  const acceptsPointer=node=>{const r=node.getBoundingClientRect();return node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}
  assert.ok(await summary.evaluate(acceptsPointer),'original collapsed chooser summary must receive pointer above context')
  await summary.click()
  assert.equal(await chooser.evaluate(node=>node.open),true,'original summary opens mounted chooser')
  await summary.focus();await summary.press('Space')
  assert.equal(await chooser.evaluate(node=>node.open),false,'keyboard closes original chooser without hiding it')
  const controls=page.getByRole('navigation',{name:'Explore controls',exact:true})
  for(const name of ['Interact','Options']){
    const button=controls.getByRole('button',{name,exact:true})
    assert.ok(await button.evaluate(acceptsPointer),'collapsed chooser must not intercept '+name)
    await button.click()
    if(name==='Interact')await controls.getByRole('button',{name:'Done — scroll',exact:true}).click()
    else {assert.equal(await button.getAttribute('aria-expanded'),'true');await button.click()}
  }
}
