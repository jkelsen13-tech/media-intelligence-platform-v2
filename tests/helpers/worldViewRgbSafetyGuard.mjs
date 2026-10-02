import assert from 'node:assert/strict'

const RGB_TRANSPORT_FILE = /\/src\/lib\/worldViewBoundedRgbImagery\.js$/
const APPROVED_RGB_VENDOR_LINES = Object.freeze([
  "// Cesium's public Texture upload requests flipY through WebGL.",
  "nativeTextureOrientation:'cesium-imagebitmap-preflip-y-v1',",
])
const isRgbTransport = file => RGB_TRANSPORT_FILE.test(file.replaceAll('\\', '/'))

// Exactly one reviewed comment and one pinned orientation field are labels,
// not vendor imports or handles. Remaining vendor words still reach the ban.
export function rgbVendorGuardText(file, source) {
  if (!isRgbTransport(file)) return source
  const lines = source.split('\n')
  for (const approved of APPROVED_RGB_VENDOR_LINES) {
    const index = lines.findIndex(line => line.trim() === approved)
    if (index !== -1) lines[index] = ''
  }
  return lines.join('\n')
}

export function assertBoundedRgbTransportSafety(file, source) {
  if (!isRgbTransport(file)) return
  for (const approved of APPROVED_RGB_VENDOR_LINES) {
    assert.equal(source.split('\n').filter(line => line.trim() === approved).length, 1, `${file}: exact orientation/comment contract`)
  }
  assert.doesNotMatch(source, /^\s*import\b|\b(?:import|require)\s*\(/m, `${file}: injected transport has no imports`)
  assert.doesNotMatch(source, /^\s*export\s*(?:\*|\{)[\s\S]*?\bfrom\s*['"]/m, `${file}: no imported reexports`)
  assert.doesNotMatch(source, /\b_(?:viewer|scene|imagery(?:Layers)?|textures?|gl|context)\b/, `${file}: no private vendor handles`)
  assert.doesNotMatch(source, /https?:\/\//i, `${file}: no provider URL`)
  assert.doesNotMatch(source, /api[_-]?key|apikey|accessToken\b|access[_-]?token/i, `${file}: no provider credentials`)
  assert.doesNotMatch(source, /\.(?:insert|upsert|update|delete|rpc)\s*\(/, `${file}: no upstream writes`)
  assert.doesNotMatch(source, /createClient|service_role|reader_state/, `${file}: no backend authority`)
}

// Both whole-source scans exercise their own unchanged provider/token bans.
// Exact-file normalization cannot admit siblings or further vendor references.
export function assertRgbGuardNegativeControls(assertSourceGuard, rgbSource, {paidAdapterToken = false} = {}) {
  const file = '/guard-probe/src/lib/worldViewBoundedRgbImagery.js'
  const unrelated = '/guard-probe/src/lib/unrelatedDisplay.js'
  assert.doesNotThrow(() => assertSourceGuard(file, rgbSource))
  const controls = [
    ['unrelated file', unrelated, rgbSource],
    ['sibling name', '/guard-probe/src/lib/worldViewBoundedRgbImageryOther.js', rgbSource],
    ['duplicate approved comment', file, rgbSource + '\n' + APPROVED_RGB_VENDOR_LINES[0]],
    ['duplicate orientation field', file, rgbSource + '\n' + APPROVED_RGB_VENDOR_LINES[1]],
    ['unapproved vendor handle', file, rgbSource + '\nconst extra = Cesium.Texture;'],
    ['vendor import', file, rgbSource + '\nimport {Texture} from "cesium";'],
    ['private vendor handle', file, rgbSource + '\nconst extra = renderer._texture;'],
    ['upstream mutation', file, rgbSource + '\nclient.update({reader_state:"eligible"});'],
    ['transport credentials', file, rgbSource + '\nconst accessToken = "unauthorized";'],
    ['unrelated provider', unrelated, 'const endpoint = "https://ion.cesium.com";'],
    ['unrelated token', unrelated, 'Ion.defaultAccessToken = "unauthorized";'],
    ['unrelated forbidden widget', unrelated, '// Port Meridian'],
  ]
  if (paidAdapterToken) controls.push(['existing adapter paid token', '/guard-probe/src/lib/worldViewCesiumEllipsoidRendererAdapter.js', 'const accessToken = "unauthorized";'])
  for (const [name, path, source] of controls) {
    assert.throws(() => assertSourceGuard(path, source), assert.AssertionError, name)
  }
}
