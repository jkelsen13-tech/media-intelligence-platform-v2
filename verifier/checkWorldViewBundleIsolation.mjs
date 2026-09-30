import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ORIGIN = 'https://bundle.invalid'
const fail = message => { throw new Error('World View bundle isolation: ' + message) }

function fileName(value) {
  if (typeof value !== 'string' || !value || value.startsWith('/') || value.includes('\\')
    || value.includes('\0') || value.split('/').includes('..')) fail('invalid emitted file name')
  return value
}

function referenceFile(reference, base, parent = '', allowExternal = false) {
  const url = new URL(reference, ORIGIN + base + parent)
  if (url.origin !== ORIGIN || !url.pathname.startsWith(base)) {
    if (allowExternal && !/cesium/i.test(reference)) return null
    fail('initial dependency is outside the emitted bundle: ' + reference)
  }
  return fileName(decodeURIComponent(url.pathname.slice(base.length)))
}

function attribute(tag, name) {
  const match = tag.match(new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(?:"([^"]*)"|\\x27([^\\x27]*)\\x27|([^\\s>]+))', 'i'))
  return match ? match[1] ?? match[2] ?? match[3] : null
}

export function assertWorldViewBundleIsolation({ html, graph, readAsset }) {
  if (graph?.version !== 1 || !Array.isArray(graph.chunks)
    || typeof graph.base !== 'string' || !graph.base.startsWith('/') || !graph.base.endsWith('/')) {
    fail('missing or unsupported authoritative build graph')
  }
  const chunks = new Map()
  for (const chunk of graph.chunks) {
    const name = fileName(chunk.fileName)
    if (chunks.has(name) || !Array.isArray(chunk.imports) || !Array.isArray(chunk.dynamicImports)
      || typeof chunk.containsCesiumVendor !== 'boolean' || typeof chunk.containsGlobeAdapter !== 'boolean'
      || !Number.isInteger(chunk.moduleCount) || chunk.moduleCount < 0) fail('invalid chunk record: ' + name)
    if (typeof readAsset(name) !== 'string') fail('emitted chunk is unreadable: ' + name)
    chunks.set(name, chunk)
  }

  const entries = [], preloads = [], styles = new Set()
  for (const tag of html.replace(/<!--[\s\S]*?-->/g, '').match(/<(?:script|link)\b[^>]*>/gi) ?? []) {
    if (/^<script\b/i.test(tag) && attribute(tag, 'type')?.toLowerCase() === 'module') {
      const src = attribute(tag, 'src')
      if (!src) fail('inline module entry cannot be qualified')
      const name = referenceFile(src, graph.base)
      if (!chunks.get(name)?.isEntry) fail('HTML module entry is absent from the build graph: ' + name)
      entries.push(name)
    }
    if (/^<link\b/i.test(tag)) {
      const rel = (attribute(tag, 'rel') ?? '').toLowerCase().split(/\s+/)
      const href = attribute(tag, 'href')
      if (!href) continue
      if (rel.includes('modulepreload')) preloads.push(referenceFile(href, graph.base))
      if (rel.includes('stylesheet') || (rel.includes('preload') && attribute(tag, 'as') === 'style')) {
        const name = referenceFile(href, graph.base, '', true)
        if (name) styles.add(name)
      }
    }
  }
  if (!entries.length) fail('no actual HTML module entry')

  function reachable(roots, dynamic = false) {
    const visited = new Set(), pending = [...roots]
    while (pending.length) {
      const name = pending.pop()
      if (visited.has(name)) continue
      const chunk = chunks.get(name)
      if (!chunk) fail('dependency missing from final build graph: ' + name)
      visited.add(name)
      for (const dependency of [...chunk.imports, ...(dynamic ? chunk.dynamicImports : [])]) {
        fileName(dependency)
        if (/\.css$/i.test(dependency)) {
          if (!dynamic) styles.add(dependency)
          continue
        }
        pending.push(dependency)
      }
    }
    return visited
  }

  const initial = reachable([...entries, ...preloads])
  for (const name of initial) {
    const chunk = chunks.get(name)
    if (chunk.containsCesiumVendor || chunk.containsGlobeAdapter) fail('Cesium payload in initial static graph: ' + name)
  }

  const allReachable = reachable(entries, true)
  const adapters = graph.chunks.filter(chunk => chunk.containsGlobeAdapter)
  const vendors = graph.chunks.filter(chunk => chunk.containsCesiumVendor)
  if (!adapters.length || !vendors.length) fail('lazy globe adapter or Cesium library payload is missing')
  for (const adapter of adapters) {
    if (!allReachable.has(adapter.fileName)) fail('globe adapter is not dynamically reachable: ' + adapter.fileName)
  }
  const globeReachable = reachable(adapters.map(chunk => chunk.fileName), true)
  for (const vendor of vendors) {
    if (!globeReachable.has(vendor.fileName)) fail('Cesium library is not reachable from the globe adapter: ' + vendor.fileName)
  }

  // Inspect the actual initially linked CSS, including local @imports in
  // copied stylesheets. Application credit overrides alone are not vendor CSS.
  const checkedStyles = new Set(), pendingStyles = [...styles]
  while (pendingStyles.length) {
    const name = pendingStyles.pop()
    if (checkedStyles.has(name)) continue
    checkedStyles.add(name)
    const css = readAsset(fileName(name))
    if (typeof css !== 'string') fail('initial stylesheet is unreadable: ' + name)
    if (/(?:^|\/)cesium(?:[-/_.]|$)/i.test(name)
      || /\.cesium-(?:viewer-cesiumWidgetContainer|animation-theme|timeline-bar|baseLayerPicker-dropDown)\b/.test(css)) {
      fail('Cesium widget CSS in initial HTML dependencies: ' + name)
    }
    const imports = /@import\s+(?:url\(\s*(?:"([^"]+)"|'([^']+)'|([^)\s]+))\s*\)|"([^"]+)"|'([^']+)')/gi
    for (const match of css.matchAll(imports)) {
      const target = referenceFile(match.slice(1).find(Boolean), graph.base, name, true)
      if (target) pendingStyles.push(target)
    }
  }

  return {
    status: 'passed',
    entryChunks: [...new Set(entries)].sort(),
    initialStaticChunks: [...initial].sort(),
    initialStylesheets: [...checkedStyles].sort(),
    dynamicGlobeAdapterChunks: adapters.map(chunk => chunk.fileName).sort(),
    dynamicCesiumLibraryChunks: vendors.map(chunk => chunk.fileName).sort(),
    initialModuleCount: [...initial].reduce((sum, name) => sum + chunks.get(name).moduleCount, 0),
  }
}

// Semantic negatives reproduce the failed product artifact (including
// transitive static imports and HTML preloads); they do not inspect config text.
export function runBundleIsolationSelfTests() {
  const make = () => ({
    html: '<script type="module" src="/app/assets/index.js"></script><link rel="stylesheet" href="/app/assets/index.css">',
    graph: { version: 1, base: '/app/', chunks: [
      { fileName: 'assets/index.js', isEntry: true, imports: ['assets/shared.js'], dynamicImports: ['assets/world.js'],
        containsCesiumVendor: false, containsGlobeAdapter: false, moduleCount: 5 },
      { fileName: 'assets/shared.js', isEntry: false, imports: [], dynamicImports: [],
        containsCesiumVendor: false, containsGlobeAdapter: false, moduleCount: 2 },
      { fileName: 'assets/world.js', isEntry: false, imports: ['assets/shared.js'], dynamicImports: ['assets/adapter.js'],
        containsCesiumVendor: false, containsGlobeAdapter: false, moduleCount: 2 },
      { fileName: 'assets/adapter.js', isEntry: false, imports: ['assets/shared.js'], dynamicImports: ['assets/library.js'],
        containsCesiumVendor: false, containsGlobeAdapter: true, moduleCount: 1 },
      { fileName: 'assets/library.js', isEntry: false, imports: [], dynamicImports: [],
        containsCesiumVendor: true, containsGlobeAdapter: false, moduleCount: 100 },
    ] },
    readAsset: name => name.endsWith('.css') ? '.app{color:black}' : '/* emitted chunk */',
  })
  let passed = 0
  const good = assertWorldViewBundleIsolation(make())
  if (good.initialStaticChunks.join(',') !== 'assets/index.js,assets/shared.js') fail('self-test lost static graph traversal')
  passed++
  const rejects = (mutate, expected) => {
    const fixture = make()
    mutate(fixture)
    let error
    try { assertWorldViewBundleIsolation(fixture) } catch (caught) { error = caught }
    if (!error || !expected.test(error.message)) fail('semantic negative did not reject: ' + expected)
    passed++
  }
  rejects(f => { f.graph.chunks[0].containsCesiumVendor = true }, /initial static graph/)
  rejects(f => { f.graph.chunks[0].containsGlobeAdapter = true }, /initial static graph/)
  rejects(f => { f.graph.chunks[1].imports.push('assets/library.js') }, /initial static graph/)
  rejects(f => { f.graph.chunks[1].imports.push('assets/adapter.js') }, /initial static graph/)
  rejects(f => { f.html += '<link rel="modulepreload" href="/app/assets/library.js">' }, /initial static graph/)
  rejects(f => { f.graph.chunks[2].dynamicImports = [] }, /not dynamically reachable/)
  rejects(f => { f.graph.chunks[3].dynamicImports = [] }, /not reachable from the globe adapter/)
  rejects(f => { f.graph.chunks[1].imports.push('assets/missing.js') }, /missing from final build graph/)
  rejects(f => { f.readAsset = name => name.endsWith('.css') ? '.cesium-timeline-bar{color:black}' : '/* emitted */' }, /widget CSS/)
  rejects(f => { f.readAsset = name => name.endsWith('index.css') ? '@import "./widgets.css";'
    : name.endsWith('widgets.css') ? '.cesium-viewer-cesiumWidgetContainer{position:absolute}' : '/* emitted */' }, /widget CSS/)
  rejects(f => { f.graph.chunks = f.graph.chunks.filter(chunk => !chunk.containsCesiumVendor) }, /missing|dependency missing/)
  return { passed }
}

export function checkWorldViewBundleIsolation(directory = 'dist') {
  const root = resolve(directory)
  const readAsset = name => readFileSync(resolve(root, fileName(name)), 'utf8')
  return assertWorldViewBundleIsolation({
    html: readAsset('index.html'),
    graph: JSON.parse(readAsset('world-view-bundle-graph.json')),
    readAsset,
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const selfTests = runBundleIsolationSelfTests()
    const result = process.argv[2] === '--self-test'
      ? { status: 'passed', selfTests }
      : { ...checkWorldViewBundleIsolation(process.argv[2] ?? 'dist'), selfTests }
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
