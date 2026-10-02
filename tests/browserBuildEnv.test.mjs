import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { assertSafeBrowserBuildEnv, browserKeyBuildGate } from '../src/lib/browserBuildEnv.js'

const repo = fileURLToPath(new URL('../', import.meta.url))
const viteEntry = import.meta.resolve('vite')
const viteCli = join(dirname(fileURLToPath(viteEntry)), '../../bin/vite.js')
const publicKey = 'sb_publishable_controlled_build_public'
const privateKey = ['sb', 'secret', 'CONTROLLED_BUILD_PRIVATE_SENTINEL'].join('_')
const jwt = (role) => [Buffer.from('{}').toString('base64url'), Buffer.from(JSON.stringify({ role, probe: 'controlled-build-only' })).toString('base64url'), 'signature'].join('.')
const code = 'MIP_BROWSER_KEY_ENV_REFUSED'
const debugCode = 'MIP_BROWSER_BUILD_DEBUG_REFUSED'

async function files(directory) {
  const found = []
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) found.push(...await files(path))
    else if (entry.isFile()) found.push({ path, contents: await readFile(path, 'utf8') })
  }
  return found
}
async function controlledBuild(spec = {}) {
  const root = await mkdtemp(join(tmpdir(), 'mip-browser-key-build-'))
  const envDir = join(root, 'controlled-env')
  const outDir = join(root, 'publication')
  try {
    await mkdir(envDir)
    await mkdir(outDir)
    await writeFile(join(outDir, 'previous-publication.txt'), 'unchanged-publication-control')
    await writeFile(join(root, 'index.html'), '<!doctype html><title>%VITE_SUPABASE_ANON_KEY%</title><script type="module" src="/entry.js"></script>')
    await writeFile(join(root, 'entry.js'), `globalThis.directKey = import.meta.env.VITE_SUPABASE_ANON_KEY; globalThis.environment = import.meta.env;`)
    for (const [name, contents] of Object.entries(spec.envFiles ?? {})) await writeFile(join(envDir, name), contents)
    const report = join(root, 'report.json')
    const specPath = join(root, 'controlled-input.json')
    await writeFile(specPath, JSON.stringify({ ...spec, root, envDir, outDir, report }))
    const configPath = join(root, 'vite.config.mjs')
    await writeFile(configPath, `
      import production from ${JSON.stringify(new URL('../vite.config.js', import.meta.url).href)};
      import { readFileSync, writeFileSync } from 'node:fs';
      const spec = JSON.parse(readFileSync(${JSON.stringify(specPath)}, 'utf8'));
      let transformed = 0;
      const report = passed => writeFileSync(spec.report, JSON.stringify({ passed, transformed }));
      export default { ...production, root: spec.root, envDir: spec.disableEnvFiles ? false : spec.envDir,
        envPrefix: spec.envPrefix ?? 'VITE_', define: spec.define ?? {}, environments: spec.environments, logLevel: 'silent',
        plugins: [production.plugins.filter(p => ['mip-browser-key-build-gate', 'mip-world-view-bundle-graph'].includes(p?.name)),
          { name: 'controlled-transform-observer', transform() { transformed++; report(false) }, closeBundle() { report(true) } }],
        build: { ...production.build, outDir: spec.outDir, emptyOutDir: true, sourcemap: true, rollupOptions: {} },
      };
    `)
    const runner = join(root, 'run.mjs')
    await writeFile(runner, `
      import { build } from ${JSON.stringify(viteEntry)};
      import { readFileSync, writeFileSync, existsSync } from 'node:fs';
      const spec = JSON.parse(readFileSync(${JSON.stringify(specPath)}, 'utf8'));
      try { await build({ configFile: ${JSON.stringify(configPath)}, mode: spec.mode ?? 'production' }); }
      catch (error) {
        const code = ['${code}', '${debugCode}'].includes(error.message) ? error.message : 'MIP_BUILD_TEST_UNEXPECTED_ERROR';
        if (!existsSync(spec.report)) writeFileSync(spec.report, JSON.stringify({ passed: false, transformed: 0, code }));
        process.stderr.write(code + '\\n'); process.exitCode = 1;
      }
    `)
    const args = spec.cli ? [viteCli, 'build', root, '--config', configPath, '--mode', spec.mode ?? 'production', ...(spec.debug ? ['--debug'] : [])] : [runner]
    const result = await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, { cwd: repo,
        // Deliberately do not inherit or inspect the host's key/secret variables.
        env: { NODE_ENV: 'production', ...(spec.processEnv ?? {}) }, stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = '', stderr = ''
      child.stdout.on('data', data => { stdout += data })
      child.stderr.on('data', data => { stderr += data })
      child.on('error', reject)
      child.on('close', status => resolve({ status, stdout, stderr }))
    })
    return { ...result, artifacts: await files(outDir), report: await readFile(report, 'utf8').catch(() => '') }
  } finally {
    // Remove only this test's controlled synthetic inputs and output directory.
    await rm(root, { recursive: true, force: true })
  }
}
function noSentinel(result, sentinel) {
  assert.equal([result.stdout, result.stderr, result.report, ...result.artifacts.map(f => f.contents)].some(text => text.includes(sentinel)), false,
    'rejected synthetic sentinel must not appear in logs, assets, maps or reports')
}
function rejectedBeforeEmission(result, expectedCode = code) {
  assert.equal(result.status, 1, 'unsafe configuration must fail the build')
  assert.ok(result.stderr.includes(expectedCode), 'fixed refusal code must be surfaced')
  assert.deepEqual(result.artifacts.map(f => f.contents), ['unchanged-publication-control'], 'failure must preserve old output and emit no new artifact')
  if (result.report) assert.equal(JSON.parse(result.report).transformed, 0, 'failure must precede source transformation')
}
for (const [label, key] of [['secret-key', privateKey], ['service-role-JWT', jwt('service_role')]]) {
  test(`build rejects controlled ${label} before transform, emission, or existing-output mutation`, async () => {
    const result = await controlledBuild({ envFiles: { '.env.production': `VITE_SUPABASE_ANON_KEY=${key}\n` } })
    rejectedBeforeEmission(result)
    noSentinel(result, key)
  })
}

test('resolved mode/envDir/process priorities match the actually emitted public value', async () => {
  const overridden = await controlledBuild({ mode: 'staging', envFiles: {
    '.env': `VITE_SUPABASE_ANON_KEY=${privateKey}\n`, '.env.staging': `VITE_SUPABASE_ANON_KEY=${publicKey}\n`,
  } })
  assert.equal(overridden.status, 0)
  assert.ok(overridden.artifacts.some(f => f.contents.includes(publicKey)), 'mode-specific public key must be emitted')
  noSentinel(overridden, privateKey)
  const processWins = await controlledBuild({ envFiles: { '.env.production': `VITE_SUPABASE_ANON_KEY=${publicKey}\n` }, processEnv: { VITE_SUPABASE_ANON_KEY: privateKey } })
  rejectedBeforeEmission(processWins)
  noSentinel(processWins, privateKey)
  const safeProcessWins = await controlledBuild({ envFiles: { '.env.production': `VITE_SUPABASE_ANON_KEY=${privateKey}\n` }, processEnv: { VITE_SUPABASE_ANON_KEY: publicKey } })
  assert.equal(safeProcessWins.status, 0)
  noSentinel(safeProcessWins, privateKey)
})

test('CLI mode selection and DEBUG refusal never print the rejected synthetic key', async () => {
  const mode = await controlledBuild({ cli: true, mode: 'held-stage', envFiles: { '.env': `VITE_SUPABASE_ANON_KEY=${publicKey}\n`, '.env.held-stage': `VITE_SUPABASE_ANON_KEY=${privateKey}\n` } })
  rejectedBeforeEmission(mode)
  noSentinel(mode, privateKey)
  const debug = await controlledBuild({ cli: true, debug: true, envFiles: { '.env.production': `VITE_SUPABASE_ANON_KEY=${privateKey}\n` } })
  rejectedBeforeEmission(debug, debugCode)
  noSentinel(debug, privateKey)
})

test('public publishable and legacy anon keys, missing and empty configuration still build', async () => {
  for (const key of [publicKey, jwt('anon'), undefined, '']) {
    const result = await controlledBuild({ envFiles: key === undefined ? {} : { '.env.production': `VITE_SUPABASE_ANON_KEY=${key}\n` } })
    assert.equal(result.status, 0)
    assert.ok(result.artifacts.some(f => f.path.endsWith('.js')), 'positive build must emit an entry')
    assert.ok(result.artifacts.some(f => f.path.endsWith('.map')), 'sourcemap control must be exercised')
    assert.ok(JSON.parse(result.report).transformed > 0, 'positive control proves transformation observer was registered')
    assert.equal(result.artifacts.some(f => f.contents.includes(code)), false, 'build guard stays outside client bundle')
    if (key) assert.ok(result.artifacts.some(f => f.contents.includes(key)))
  }
})

test('envPrefix and disabled envDir preserve Vite exposure semantics without reading hidden values', async () => {
  const hidden = await controlledBuild({ envPrefix: 'PUBLIC_', envFiles: { '.env.production': `VITE_SUPABASE_ANON_KEY=${privateKey}\n` } })
  assert.equal(hidden.status, 0)
  noSentinel(hidden, privateKey)
  const exposed = await controlledBuild({ envPrefix: ['PUBLIC_', 'VITE_'], envFiles: { '.env.production': `VITE_SUPABASE_ANON_KEY=${privateKey}\n` } })
  rejectedBeforeEmission(exposed)
  noSentinel(exposed, privateKey)
  const disabled = await controlledBuild({ disableEnvFiles: true, envFiles: { '.env.production': `VITE_SUPABASE_ANON_KEY=${privateKey}\n` } })
  assert.equal(disabled.status, 0)
  noSentinel(disabled, privateKey)
})

test('named define overrides cannot bypass the env guard; whole env replacement is unsupported', async () => {
  const unsafe = await controlledBuild({ define: { 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(privateKey) } })
  rejectedBeforeEmission(unsafe)
  noSentinel(unsafe, privateKey)
  const invalidExpression = await controlledBuild({ define: { 'import.meta.env.VITE_SUPABASE_ANON_KEY': 'unknownRuntimeIdentifier' } })
  rejectedBeforeEmission(invalidExpression)
  const whole = await controlledBuild({ define: { 'import.meta.env': '{}' } })
  rejectedBeforeEmission(whole)
  const safe = await controlledBuild({ define: { 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(publicKey) } })
  assert.equal(safe.status, 0)
  assert.ok(safe.artifacts.some(f => f.contents.includes(publicKey)))
  const htmlUnsafe = await controlledBuild({ envFiles: { '.env.production': `VITE_SUPABASE_ANON_KEY=${privateKey}\n` },
    define: { 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(publicKey) } })
  rejectedBeforeEmission(htmlUnsafe)
  noSentinel(htmlUnsafe, privateKey)
  const clientUnsafe = await controlledBuild({ environments: { client: { define: {
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(privateKey),
  } } } })
  rejectedBeforeEmission(clientUnsafe)
  noSentinel(clientUnsafe, privateKey)
})

test('mode-local priority and dotenv expansion resolve before the guard validates the emitted value', async () => {
  const localUnsafe = await controlledBuild({ envFiles: {
    '.env.production': `VITE_SUPABASE_ANON_KEY=${publicKey}\n`, '.env.production.local': `VITE_SUPABASE_ANON_KEY=${privateKey}\n`,
  } })
  rejectedBeforeEmission(localUnsafe)
  noSentinel(localUnsafe, privateKey)
  const expandedUnsafe = await controlledBuild({ envFiles: { '.env.production':
    `CONTROLLED_TEST_VALUE=${privateKey}\nVITE_SUPABASE_ANON_KEY=$CONTROLLED_TEST_VALUE\n` } })
  rejectedBeforeEmission(expandedUnsafe)
  noSentinel(expandedUnsafe, privateKey)
})

test('guard errors contain only fixed codes and the plugin is limited to builds', () => {
  for (const config of [{ env: { VITE_SUPABASE_ANON_KEY: privateKey } },
    { define: { 'import.meta.env.VITE_SUPABASE_ANON_KEY': 'broken-expression' } },
    { define: { 'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(jwt('service_role')) } }]) {
    assert.throws(() => assertSafeBrowserBuildEnv(config), error => error.message === code && error.stack === code
      && !Object.hasOwn(error, 'cause') && !JSON.stringify(error).includes(privateKey))
  }
  assert.equal(browserKeyBuildGate().apply, 'build')
})
