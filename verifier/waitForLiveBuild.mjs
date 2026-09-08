// Compare Pages' actual asset manifest with this release's local production build.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
const expected = await readFile('dist/index.html', 'utf8')
const assets = [...expected.matchAll(/(?:src|href)="([^"]+\/assets\/[^"]+\.(?:js|css))"/g)].map(m => m[1])
assert.ok(assets.some(a => a.endsWith('.js')) && assets.some(a => a.endsWith('.css')))
let matched = false
for (let attempt = 0; attempt < 60; attempt++) {
  const response = await fetch('https://jkelsen13-tech.github.io/media-intelligence-platform-v2/?verify=' + encodeURIComponent(process.env.GITHUB_SHA || 'release'), { cache: 'no-store' })
  if (response.ok) {
    const html = await response.text()
    matched = assets.every(asset => html.includes(asset))
    if (matched) break
  }
  await delay(2000)
}
assert.ok(matched, 'Pages must serve the exact JS/CSS assets of the verified release')
console.log('MIP_LIVE_ASSETS_PASS=' + JSON.stringify({sha:process.env.GITHUB_SHA,assets}))
