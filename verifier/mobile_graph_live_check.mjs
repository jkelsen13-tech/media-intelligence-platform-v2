import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'

const LIVE_URL = 'https://jkelsen13-tech.github.io/media-intelligence-platform-v2/'
const PORT = 9229
const OUT_DIR = new URL('./mobile_graph_live_check/', import.meta.url)

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url)
    this.nextId = 1
    this.pending = new Map()
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (!message.id) return
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      if (message.error) pending.reject(new Error(`${message.error.message} (${message.error.code})`))
      else pending.resolve(message.result)
    })
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true })
      this.ws.addEventListener('error', reject, { once: true })
    })
  }

  send(method, params = {}) {
    const id = this.nextId++
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
  }

  async evaluate(expression, awaitPromise = false) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise,
      returnByValue: true,
    })
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
    return result.result?.value
  }

  close() {
    this.ws.close()
  }
}

async function waitFor(cdp, expression, label, timeoutMs = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await cdp.evaluate(expression)) return
    await sleep(250)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function startChrome() {
  const child = spawn('chromium', [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    `--remote-debugging-port=${PORT}`,
    'about:blank',
  ], { stdio: 'ignore' })
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    try {
      const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      if (tabs[0]?.webSocketDebuggerUrl) return { child, tab: tabs[0] }
    } catch {}
    await sleep(200)
  }
  child.kill('SIGTERM')
  throw new Error('Chromium DevTools endpoint did not start')
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const { child, tab } = await startChrome()
  let cdp
  try {
    cdp = new Cdp(tab.webSocketDebuggerUrl)
    await cdp.open()
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: 375,
      screenHeight: 812,
    })
    await cdp.send('Page.navigate', { url: LIVE_URL })
    await waitFor(cdp, "document.querySelector('button')?.textContent.includes('News Feed')", 'application shell')
    await waitFor(cdp, "document.querySelectorAll('button').length > 5", 'navigation controls')
    const mobileMatch = await cdp.evaluate("window.matchMedia('(max-width: 767px)').matches")
    if (!mobileMatch) throw new Error('Emulated viewport did not enter mobile breakpoint')

    await cdp.evaluate("Array.from(document.querySelectorAll('button')).find((button) => button.textContent.trim() === 'Knowledge Graph')?.click()")
    await waitFor(cdp, "Boolean(document.querySelector('.hub-item'))", 'mobile hub list')
    const hubLabel = await cdp.evaluate("document.querySelector('.hub-item .hub-label')?.textContent?.trim() || null")
    await cdp.evaluate("document.querySelector('.hub-item')?.click()")
    await waitFor(cdp, "Boolean(document.querySelector('.graph-stage'))", 'mobile graph stage')
    await waitFor(cdp, "Boolean(document.querySelector('.graph-card.mobile-active'))", 'focused mobile graph card')
    const cardLabel = await cdp.evaluate("document.querySelector('.graph-card.mobile-active .graph-card-name')?.textContent?.trim() || null")
    await cdp.evaluate("document.querySelector('.graph-card.mobile-active')?.click()")
    await waitFor(cdp, "Boolean(document.querySelector('.article-panel.sheet-mode[role=dialog]'))", 'mobile article reader')
    const readerLabel = await cdp.evaluate("document.querySelector('.article-panel.sheet-mode')?.getAttribute('aria-label') || null")
    const image = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    const screenshotPath = new URL('./mobile_graph_reader_open.png', OUT_DIR)
    await writeFile(screenshotPath, Buffer.from(image.data, 'base64'))
    const result = {
      checked_url: LIVE_URL,
      viewport: { width: 375, height: 812 },
      mobile_media_query: mobileMatch,
      hub_label: hubLabel,
      focused_card_label: cardLabel,
      reader_label: readerLabel,
      passed: Boolean(readerLabel),
      screenshot: screenshotPath.pathname,
    }
    await writeFile(new URL('./result.json', OUT_DIR), JSON.stringify(result, null, 2) + '\n')
    console.log(JSON.stringify(result, null, 2))
    if (!result.passed) process.exitCode = 1
  } finally {
    cdp?.close()
    child.kill('SIGTERM')
  }
}

main().catch((error) => {
  console.error(`mobile graph live check failed: ${error.stack || error.message}`)
  process.exit(1)
})
