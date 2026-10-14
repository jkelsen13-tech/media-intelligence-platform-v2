import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=process.cwd(),out=path.join(root,'evidence','independent-review');
const require=createRequire('C:/Users/joseph/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/package.json');
const {chromium}=require('playwright');
const base='http://127.0.0.1:4178/media-intelligence-platform-v2/',label='MIP - Media Intelligence Platform';
const hashes={48:'3807ae0394c05919c3785a2f1293c0d88feb16aa3d20c7e38707520b7ccef25f',96:'a9b4d19c775d221283f2391b1a32ed1bd4174df82e28914ac5eb57c4f985e101',144:'a5ec601bfee7f83622a20ad4f7952b8d80c7b6b48267b0b3a78c342a980f5bc4'};
const configs=[{name:'desktop-independent',width:1280,height:900,dpr:1},{name:'tablet-independent',width:768,height:900,dpr:2},{name:'narrow-independent',width:320,height:740,dpr:3},{name:'landscape-independent',width:740,height:390,dpr:2}];
const report={startedAt:new Date().toISOString(),scope:'Independent actual built App replay; synthetic bundled demo; remote requests aborted; physical devices not exercised',node:process.version,playwright:require('playwright/package.json').version,cases:[],status:'RUNNING'};
const save=()=>writeFile(path.join(out,'runtime-review.json'),JSON.stringify(report,null,2)+'\n');
await save();
for(const config of configs){
 const item={...config,checks:[],screenshots:[],errors:[],blockedRequests:[],status:'RUNNING'};report.cases.push(item);await save();
 let context,page;
 const check=(name,result)=>{assert.ok(result,name);item.checks.push(name)};
 const rect=loc=>loc.evaluate(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom}});
 const shot=async name=>{const file=name+'.png';await page.screenshot({path:path.join(out,file),fullPage:false});const body=await readFile(path.join(out,file));item.screenshots.push({file,bytes:body.length,sha256:createHash('sha256').update(body).digest('hex')})};
 const brandCheck=async brand=>{
  const img=brand.locator('img.ws-mobius');await img.evaluate(n=>n.decode());
  const obs=await img.evaluate(n=>{const s=getComputedStyle(n),r=n.getBoundingClientRect();return {src:n.currentSrc,w:r.width,h:r.height,flexBasis:s.flexBasis,objectFit:s.objectFit,imageRendering:s.imageRendering,alt:n.alt,ariaHidden:n.getAttribute('aria-hidden'),widthAttribute:n.getAttribute('width'),heightAttribute:n.getAttribute('height')}});
  check('fixed48 CSS-pixel reserved square',obs.w===48&&obs.h===48&&obs.widthAttribute==='48'&&obs.heightAttribute==='48'&&obs.flexBasis==='48px');
  check('normal image smoothing and contain',obs.imageRendering==='auto'&&obs.objectFit==='contain');
  check('correct density image selected',obs.src.endsWith(`MIP_B_Square_${48*config.dpr}px.png`));
  const body=await (await page.request.get(obs.src)).body();check('served density body exact immutable hash',createHash('sha256').update(body).digest('hex')===hashes[48*config.dpr]);
  const outer=await rect(brand),inner=await rect(img);check('image fits branding bounds',inner.x>=outer.x&&inner.right<=outer.right+0.5&&inner.y>=outer.y&&inner.bottom<=outer.bottom+0.5);
  check('decorative child image hidden from accessibility',obs.alt===''&&obs.ariaHidden==='true');
  const ax=await brand.ariaSnapshot();item.accessibilitySnapshot=ax;check('single named graphic semantics',ax.trim()===`- img "${label}"`);
  check('brand remains noninteractive',await brand.locator('a,button,[tabindex]').count()===0);
  const word=brand.locator('.ws-brand-wordmark');if(await word.count()&&await word.isVisible()){
   check('wordmark retains full name',await word.innerText()==='MIP\nMedia Intelligence Platform');
   check('wordmark no horizontal clipping',await word.evaluate(n=>[n,...n.children].every(c=>c.scrollWidth<=c.clientWidth+1)));
  }
  item.brandObservations??=[];item.brandObservations.push(obs);
 };
 const drawerCheck=async()=>{
  const menu=page.getByRole('button',{name:'Open investigation navigation',exact:true});await menu.focus();await page.keyboard.press('Enter');
  const drawer=page.getByRole('dialog',{name:'Investigation navigation',exact:true});await drawer.waitFor();
  await brandCheck(drawer.locator('.ws-drawer-brand'));
  const close=drawer.getByRole('button',{name:'Close navigation',exact:true});check('drawer initially focuses Close',await close.evaluate(n=>n===document.activeElement));
  const box=await rect(close);check('Close has44px target',box.width>=44&&box.height>=44);
  check('Close target clear at9 hit points',await close.evaluate(n=>{const r=n.getBoundingClientRect();return [.2,.5,.8].every(x=>[.2,.5,.8].every(y=>n.contains(document.elementFromPoint(r.x+r.width*x,r.y+r.height*y))))}));
  const buttons=drawer.locator('button');await buttons.last().focus();await page.keyboard.press('Tab');check('Tab wraps to first control',await close.evaluate(n=>n===document.activeElement));
  await page.keyboard.press('Shift+Tab');check('Shift Tab wraps to last control',await buttons.last().evaluate(n=>n===document.activeElement));
  await shot(config.name+'-drawer');await page.keyboard.press('Escape');await drawer.waitFor({state:'hidden'});check('Escape restores trigger focus',await menu.evaluate(n=>n===document.activeElement));
  await page.keyboard.press('Enter');await drawer.waitFor();await drawer.getByRole('button',{name:'Timeline',exact:true}).click();await drawer.waitFor({state:'hidden'});
  check('drawer navigation selects Timeline',await page.locator('.ws-shell').getAttribute('data-workspace-view')==='timeline');
 };
 try{
  context=await chromium.launchPersistentContext(path.join(out,'profiles',config.name),{headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',viewport:{width:config.width,height:config.height},deviceScaleFactor:config.dpr,downloadsPath:path.join(out,'downloads'),args:['--disable-background-networking']});
  report.chrome=context.browser()?.version()??'Chrome persistent context';
  await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin==='http://127.0.0.1:4178')return route.continue();item.blockedRequests.push({origin:u.origin,path:u.pathname});return route.abort()});
  page=context.pages()[0]??await context.newPage();page.on('pageerror',e=>item.errors.push(e.message));await page.goto(base,{waitUntil:'networkidle'});await page.locator('.ws-shell').waitFor({timeout:30000});
  const subject=await page.locator('.ws-canonical').getAttribute('data-canonical-subject-id');
  if(config.width>=768){
   const nav=page.locator('.ws-nav');await brandCheck(nav.locator('.ws-nav-brand'));
   item.expandedRail=await rect(nav);check('inherited rail breakpoint retained',item.expandedRail.width===(config.width<=1023?160:190));await shot(config.name+'-expanded');
   const collapse=page.getByRole('button',{name:'Collapse navigation',exact:true});await collapse.focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('.ws-shell').classList.contains('ws-nav-collapsed'));
   await brandCheck(nav.locator('.ws-nav-brand'));item.compactRail=await rect(nav);check('compact rail72px',item.compactRail.width===72);await shot(config.name+'-compact');
   const expand=page.getByRole('button',{name:'Expand navigation',exact:true});check('collapse preserves focus',await expand.evaluate(n=>n===document.activeElement));check('keyboard focus visible',await expand.evaluate(n=>getComputedStyle(n).outlineStyle!=='none'));
   await page.keyboard.press('Enter');await page.getByRole('navigation',{name:'Evidence views',exact:true}).getByRole('button',{name:'Timeline',exact:true}).click();check('rail navigation selects Timeline',await page.locator('.ws-shell').getAttribute('data-workspace-view')==='timeline');
   if(config.width===1280){await page.getByRole('button',{name:'Collapse navigation',exact:true}).click();await page.setViewportSize({width:320,height:740});await drawerCheck();check('collapsed rail to mobile drawer keeps full wordmark visible',await page.locator('.ws-shell').getAttribute('data-workspace-view')==='timeline');}
  }else {await shot(config.name+'-closed');await drawerCheck()}
  check('canonical investigation preserved',await page.locator('.ws-canonical').getAttribute('data-canonical-subject-id')===subject);
  check('no horizontal document overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));check('no App page errors',item.errors.length===0);item.status='PASS';
 }catch(e){item.status='FAIL';item.failure=e.message;if(page)try{await shot(config.name+'-failure')}catch{};}
 finally{await context?.close();await save()}
}
report.status=report.cases.every(c=>c.status==='PASS')?'PASS':'FAIL';report.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify({status:report.status,cases:report.cases.map(c=>({name:c.name,status:c.status,checks:c.checks.length,failure:c.failure}))}));
if(report.status!=='PASS')process.exitCode=1;
