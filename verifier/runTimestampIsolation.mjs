import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { verifyRecordedTimestampCompatibility } from './recordedTimestampCompatibility.mjs'
const require=createRequire(process.env.MIP_BROWSER_PACKAGE+'/package.json')
const {webkit}=require('playwright')
const origin='http://127.0.0.1:4173'
const server=spawn('npm',['run','preview','--','--host','127.0.0.1','--port','4173','--strictPort'],{stdio:'ignore'})
let browser
try {
  let ready=false
  for(let i=0;i<40;i++){
    try {ready=(await fetch(origin+'/media-intelligence-platform-v2/')).ok} catch {}
    if(ready)break
    await delay(250)
  }
  assert.ok(ready)
  browser=await webkit.launch({headless:true})
  for(let repetition=0;repetition<8;repetition++){
    console.log('MIP_ISOLATION_START='+JSON.stringify({application:process.env.MIP_APPLICATION_SHA,repetition}))
    await verifyRecordedTimestampCompatibility(browser,origin,'webkit')
  }
  console.log('MIP_ISOLATION_PASS='+JSON.stringify({application:process.env.MIP_APPLICATION_SHA,repetitions:8}))
} finally {
  await browser?.close()
  server.kill()
}
