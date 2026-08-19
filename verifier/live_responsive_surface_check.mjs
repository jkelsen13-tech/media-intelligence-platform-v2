import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'

const LIVE_URL = 'https://jkelsen13-tech.github.io/media-intelligence-platform-v2/'
const PORT = 9231
const OUT_DIR = new URL('./live_responsive_surface_check/', import.meta.url)

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

  open() {
    return new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true })
      this.ws.addEventListener('error', reject, { once: true })
    })
  }

  send(method, params = {}) {
    const id = this.nextId++
    this.ws.send(JSON.stringify({ id, method, params }))
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
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
    await sleep(200)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function startChrome() {
  const child = spawn('chromium', [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--disable-dev-shm-usage',
    `--remote-debugging-port=${PORT}`, 'about:blank',
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

const clickByText = (text) => `Array.from(document.querySelectorAll('button')).find((button) => button.textContent.trim() === ${JSON.stringify(text)})?.click()`
const viewportReport = () => `(() => ({ viewport: { width: window.innerWidth, height: window.innerHeight }, scrollWidth: document.documentElement.scrollWidth, horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1, visibleText: document.body.innerText.slice(0, 260) }))()`

async function screenshot(cdp, basename) {
  const image = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  const path = new URL(`./${basename}.png`, OUT_DIR)
  await writeFile(path, Buffer.from(image.data, 'base64'))
  return path.pathname
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
      width: 390, height: 844, deviceScaleFactor: 1, mobile: true, screenWidth: 390, screenHeight: 844,
    })
    await cdp.send('Page.navigate', { url: LIVE_URL })
    await waitFor(cdp, "Array.from(document.querySelectorAll('button')).some((button) => button.textContent.trim() === 'News Feed')", 'application shell')
    const mobileMediaQuery = await cdp.evaluate("window.matchMedia('(max-width: 767px)').matches")
    if (!mobileMediaQuery) throw new Error('Emulated viewport did not enter the mobile breakpoint')

    await cdp.evaluate(clickByText('Knowledge Graph'))
    await waitFor(cdp, "Boolean(document.querySelector('.hub-item'))", 'Knowledge Graph hub list')
    await cdp.evaluate("document.querySelector('.hub-item')?.click()")
    await waitFor(cdp, "Boolean(document.querySelector('.graph-stage'))", 'focused Knowledge Graph')
    const graphInitial = await cdp.evaluate(viewportReport())
    await cdp.evaluate("Array.from(document.querySelectorAll('button')).find((button) => button.textContent.includes('Show full graph'))?.click()")
    await sleep(800)
    const graphExpanded = await cdp.evaluate(`(() => ({ ...${viewportReport()}, activeCards: document.querySelectorAll('.graph-cards .graph-card.mobile-active').length, focusedLine: Array.from(document.querySelectorAll('*')).find((element) => element.textContent?.includes('of 47 nodes'))?.textContent?.trim() || null }))()`)
    const graphScreenshot = await screenshot(cdp, 'graph-expanded-mobile')

    await cdp.evaluate(clickByText('Causal Timeline'))
    await waitFor(cdp, "Boolean(document.querySelector('.timeline-view'))", 'Causal Timeline')
    const timeline = await cdp.evaluate(viewportReport())
    const timelineScreenshot = await screenshot(cdp, 'timeline-mobile')

    await cdp.evaluate(clickByText('Story Arcs'))
    await waitFor(cdp, "Boolean(document.querySelector('.arcs-view'))", 'Story Arcs')
    const arcs = await cdp.evaluate(viewportReport())
    const arcsScreenshot = await screenshot(cdp, 'arcs-mobile')

    const result = {
      checked_url: LIVE_URL,
      viewport: { width: 390, height: 844 },
      mobile_media_query: mobileMediaQuery,
      graph: { initial: graphInitial, expanded: graphExpanded, screenshot: graphScreenshot },
      timeline: { ...timeline, screenshot: timelineScreenshot },
      arcs: { ...arcs, screenshot: arcsScreenshot },
    }
    result.passed = result.mobile_media_query && !graphInitial.horizontalOverflow && !graphExpanded.horizontalOverflow && graphExpanded.activeCards <= 1 && !timeline.horizontalOverflow && !arcs.horizontalOverflow
    await writeFile(new URL('./result.json', OUT_DIR), JSON.stringify(result, null, 2) + '\n')
    console.log(JSON.stringify(result, null, 2))
    if (!result.passed) process.exitCode = 1
  } finally {
    cdp?.close()
    child.kill('SIGTERM')
  }
}

main().catch((error) => {
  console.error(`live responsive surface check failed: ${error.stack || error.message}`)
  process.exit(1)
})
