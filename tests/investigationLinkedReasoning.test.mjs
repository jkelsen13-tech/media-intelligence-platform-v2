import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FIXTURE_BUNDLES, FIXTURE_USER } from '../src/lib/investigationWorkspaceFixtures.js'
import { investigationWorkspacePanels } from '../src/lib/investigationWorkspaceClient.js'
import { WORKSPACE_STATUS } from '../src/lib/investigationWorkspaceSession.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = join(root, 'tests/.compiled/LinkedReasoning.mjs')
mkdirSync(dirname(output), { recursive: true })
const require = createRequire(import.meta.url)
const esbuild = createRequire(require.resolve('vite/package.json'))('esbuild')
await esbuild.build({
  absWorkingDir: root, entryPoints: ['src/components/PrivateInvestigationWorkspace.jsx'], outfile: output,
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', external: ['react', 'react/jsx-runtime'],
  plugins: [{ name: 'skip-css', setup(build) { build.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' })) } }],
})
const { default: Workspace, PrivateInvestigationInspector: Inspector } = await import(pathToFileURL(output))
const clone = () => structuredClone(FIXTURE_BUNDLES.comparable)
function workspace(bundle, extra = {}) {
  return {
    status: WORKSPACE_STATUS.ready, userId: FIXTURE_USER.id,
    state: { bundle, panels: investigationWorkspacePanels(bundle), catalog: [], beforeBundles: {}, activeSection: 'hypotheses', ...extra },
    actions: {},
  }
}
const render = (bundle, extra = {}) => renderToStaticMarkup(createElement(Workspace, { workspace: workspace(bundle, extra) }))
const hypothesisHtml = html => html.split('data-record="hypothesis"')[1].split('</article>')[0]
const commitmentHtml = html => html.split('data-record="commitment"')[1].split('<section')[0]

test('hypotheses show discriminating criteria and the linked saved assessment with uncertainty', () => {
  const bundle = clone()
  bundle.observation.snapshot.assessments[0].stale = true
  const html = hypothesisHtml(render(bundle))
  assert.match(html, /What would strengthen this explanation/)
  assert.match(html, /An authenticated cancellation document/)
  assert.match(html, /What would weaken this explanation/)
  assert.match(html, /An authenticated implementation record/)
  assert.match(html, /do not mean that this evidence has been found/)
  assert.match(html, /Fixture only; no semantic conclusion/)
  assert.match(html, /changed dependency/)
  assert.match(html, /no calibrated confidence/)
})

test('dependency-only and missing assessments cannot be substituted for a linked selected assessment', () => {
  const bundle = clone()
  bundle.observation.snapshot.selected_assessment_ids = []
  let html = hypothesisHtml(render(bundle))
  assert.match(html, /linked selected assessment is not available/)
  assert.doesNotMatch(html, /Fixture only; no semantic conclusion/)
  bundle.observation.snapshot.assessments = []
  html = hypothesisHtml(render(bundle))
  assert.match(html, /Unavailable on this saved version/)
})

test('commitment branches name their prerequisite and expose the linked bounded search', () => {
  const bundle = clone()
  const html = commitmentHtml(render(bundle))
  assert.match(html, /Stage 1 · commitment/)
  assert.match(html, /Depends on/)
  assert.match(html, /Source reports a commitment/)
  assert.match(html, /Linked collection records/)
  assert.ok(html.includes(bundle.version.state.coverage[0].method))
  assert.ok(html.includes(bundle.version.state.coverage[0].limitations[0]))
  assert.match(html, /does not establish that nothing happened/)
})

test('missing or future prerequisite links and missing coverage stay explicitly unavailable', () => {
  const bundle = clone()
  const stage = bundle.version.state.commitments[0].stages[1]
  stage.depends_on = [stage.id, 'missing']
  stage.coverage_ids = ['missing']
  const html = commitmentHtml(render(bundle))
  assert.match(html, /Linked prerequisite unavailable/)
  assert.match(html, /Collection record unavailable on this saved version/)
})

test('before-state inspector resolves criteria, assessments and collection links only from its own version', () => {
  const current = clone(), before = clone()
  before.version.id = 'before-version'
  before.version.state.hypotheses[0].would_strengthen = ['Earlier criterion only']
  before.observation.snapshot.assessments[0].rationale = 'Earlier assessment only'
  before.version.state.coverage[0].method = 'Earlier search method only'
  current.version.state.hypotheses[0].would_strengthen = ['Current criterion sentinel']
  current.observation.snapshot.assessments[0].rationale = 'Current assessment sentinel'
  current.version.state.coverage[0].method = 'Current search sentinel'
  const html = renderToStaticMarkup(createElement(Inspector, { workspace: workspace(current, {
    beforeBundles: { 'before-version': before }, inspector: { kind: 'before-state', versionId: 'before-version' },
  }) }))
  assert.match(html, /Earlier criterion only/)
  assert.match(html, /Earlier assessment only/)
  assert.match(html, /Earlier search method only/)
  assert.doesNotMatch(html, /Current (criterion|assessment|search) sentinel/)
})
