import { mkdir, writeFile } from 'node:fs/promises'

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const target = await fetch('http://127.0.0.1:9223/json/new?about:blank', { method: 'PUT' }).then((r) => r.json())
const socket = new WebSocket(target.webSocketDebuggerUrl)
const pending = new Map()
let sequence = 0

function command(method, params = {}) {
  const id = ++sequence
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
}

await new Promise((resolve, reject) => {
  socket.onopen = resolve
  socket.onerror = reject
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data)
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      message.error ? reject(new Error(message.error.message)) : resolve(message.result)
    }
  }
})

await command('Page.enable')
await command('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
})
await command('Page.navigate', { url: 'https://jkelsen13-tech.github.io/media-intelligence-platform-v2/?v=75ab5f5' })
await delay(4500)
await command('Runtime.evaluate', {
  expression: `(() => {
    const more = [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'More')
    if (!more) throw new Error('More button was not found')
    more.click()
  })()`,
  awaitPromise: true,
})
await delay(400)
await command('Runtime.evaluate', {
  expression: `(() => {
    const legal = [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Legal & Policy')
    if (!legal) throw new Error('Legal & Policy entry was not found')
    legal.click()
  })()`,
  awaitPromise: true,
})
await delay(1200)
const text = await command('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true })
const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
await mkdir('/home/ubuntu/media-intelligence-platform-v2/verifier/screenshots', { recursive: true })
await writeFile('/home/ubuntu/media-intelligence-platform-v2/verifier/screenshots/live-mobile-phase3.png', Buffer.from(screenshot.data, 'base64'))
await writeFile('/home/ubuntu/media-intelligence-platform-v2/verifier/mobile-phase3-body.txt', text.result.value)
socket.close()
console.log('Captured verifier/screenshots/live-mobile-phase3.png')
