import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import TestRenderer, { act } from 'react-test-renderer'
import { savedAssessmentTrail, selectedContextUsers, retainedInputDates, retainedDateLabel, retainedDateDisplay, exactInputPosition } from '../src/lib/investigationEvidenceTrail.js'
import { FIXTURE_BUNDLES, FIXTURE_USER } from '../src/lib/investigationWorkspaceFixtures.js'
import { investigationWorkspacePanels } from '../src/lib/investigationWorkspaceClient.js'
import { WORKSPACE_STATUS } from '../src/lib/investigationWorkspaceSession.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = join(root, 'tests/.compiled/EvidenceTrail.mjs')
mkdirSync(dirname(output), { recursive: true })
const require = createRequire(import.meta.url)
const esbuild = createRequire(require.resolve('vite/package.json'))('esbuild')
await esbuild.build({
  absWorkingDir: root, entryPoints: ['src/components/InvestigationAssessmentTrail.jsx'], outfile: output,
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', external: ['react', 'react/jsx-runtime'],
})
const { default: Trail, RetainedInputRecord, RetainedInputDates } = await import(pathToFileURL(output))
const workspaceOutput = join(root, 'tests/.compiled/EvidenceTrailWorkspace.mjs')
await esbuild.build({
  absWorkingDir: root, entryPoints: ['src/components/PrivateInvestigationWorkspace.jsx'], outfile: workspaceOutput,
  bundle: true, format: 'esm', platform: 'node', jsx: 'automatic', external: ['react', 'react/jsx-runtime'],
  plugins: [{ name: 'skip-css', setup(build) { build.onLoad({ filter: /\.css$/ }, () => ({ contents: '', loader: 'js' })) } }],
})
const { default: Workspace, PrivateInvestigationInspector: Inspector } = await import(pathToFileURL(workspaceOutput))
const position = '9007199254740993'
function fixture() {
  const bundle = structuredClone(FIXTURE_BUNDLES.comparable)
  const selected = bundle.observation.snapshot.assessments[0]
  Object.assign(selected, { context_positions: [position], parent_ids: ['left', 'right'], ancestor_ids: ['root', 'left', 'right'], extra_positions: [] })
  for (const id of ['left', 'right', 'root']) bundle.observation.snapshot.assessments.push({ id, rationale: `${id} reasoning`, outcome: 'insufficient_evidence', remaining_uncertainty: 'Fixture only.', context_positions: [position], parent_ids: [], ancestor_ids: [] })
  const input = bundle.observation.snapshot.inputs[0]
  input.capture.payload.published_at = '2019-01-02T03:04:05Z'
  input.capture.captured_at = '2020-02-03T04:05:06Z'
  input.queued_at = '2021-03-04T05:06:07Z'
  return bundle
}
const selectedId = bundle => bundle.observation.snapshot.selected_assessment_ids[0]
const workspace = (bundle, extra = {}) => ({ status: WORKSPACE_STATUS.ready, userId: FIXTURE_USER.id, state: {
  bundle, panels: investigationWorkspacePanels(bundle), catalog: [], beforeBundles: {}, activeSection: 'overview', ...extra,
}, actions: {} })
const markup = (Component, props) => renderToStaticMarkup(createElement(Component, props))

test('dependency diamond is flat and unique, revision links are separate and missing records remain unavailable', () => {
  const bundle = fixture(), assessment = bundle.observation.snapshot.assessments[0]
  assessment.parent_ids.push('left')
  assessment.ancestor_ids.push('root', 'missing')
  assessment.predecessor_id = 'earlier-revision'
  assessment.superseded_by = ['later-revision']
  const trail = savedAssessmentTrail(bundle, assessment.id)
  assert.deepEqual(trail.dependencies.map(row => row.id), ['left', 'right', 'root', 'missing'])
  assert.equal(trail.dependencies.at(-1).assessment, null)
  assert.deepEqual(trail.revisions.map(row => row.kind), ['Previous revision', 'Recorded replacement'])
  assert.ok(trail.revisions.every(row => row.assessment === null))
  assessment.parent_ids = [assessment.id] // Malformed self-link does not cause recursive rendering.
  assert.equal(savedAssessmentTrail(bundle, assessment.id).dependencies[0].assessment, null)
})

test('input positions never round through numbers and selected context users exclude dependency-only records', () => {
  const bundle = fixture(), id = selectedId(bundle)
  assert.deepEqual(selectedContextUsers(bundle, position).map(row => row.id), [id])
  assert.deepEqual(selectedContextUsers(bundle, Number(position)), [])
  assert.deepEqual(selectedContextUsers(bundle, '9007199254740992'), [])
  bundle.observation.snapshot.inputs[0].position = '9007199254740992'
  assert.equal(savedAssessmentTrail(bundle, id).inputs[0].input, null)
  bundle.observation.snapshot.selected_assessment_ids = []
  assert.deepEqual(selectedContextUsers(bundle, position), [])
})

test('dates use capture payload publication and capture time, never obsolete fields or queue time as a substitute', () => {
  const input = fixture().observation.snapshot.inputs[0]
  const html = markup(RetainedInputDates, { input })
  assert.match(html, /2019-01-02 03:04:05 UTC/)
  assert.match(html, /2020-02-03 04:05:06 UTC/)
  assert.match(html, /2021-03-04 05:06:07 UTC/)
  delete input.capture.payload.published_at
  delete input.capture.captured_at
  const dates = retainedInputDates(input)
  assert.equal(retainedDateLabel(dates[0].value), 'Not recorded')
  assert.equal(retainedDateLabel(dates[1].value), 'Not recorded')
  assert.equal(retainedDateLabel('invalid'), 'Unrecognized retained date')
  assert.deepEqual(retainedInputDates({ record_version: { recorded_at: '2020-01-01Z' } }).map(row => row.label), ['Record version saved', 'Change queued'])
})

test('unsafe source locators stay text and context reuse is not presented as support or independent corroboration', () => {
  const bundle = fixture(), input = bundle.observation.snapshot.inputs[0]
  input.capture.payload.url = 'javascript:alert(1)'
  const html = markup(RetainedInputRecord, { bundle, input, position })
  assert.doesNotMatch(html, /href="javascript:/)
  assert.match(html, /Selected assessments using this input as context \(1\)/)
  assert.match(html, /does not establish independent sources/)
  assert.match(html, /do not establish when the reported event happened/)
})

test('trail defers input content, pages long lists, and expands exact retained input', () => {
  const bundle = fixture(), id = selectedId(bundle), assessment = bundle.observation.snapshot.assessments[0]
  for (let i = 1; i <= 22; i++) {
    const input = structuredClone(bundle.observation.snapshot.inputs[0])
    input.position = (BigInt(position) + BigInt(i)).toString()
    bundle.observation.snapshot.inputs.push(input)
    assessment.context_positions.push(input.position)
  }
  let tree
  act(() => { tree = TestRenderer.create(createElement(Trail, { bundle, assessmentId: id })) })
  const outer = tree.root.findByProps({ className: 'piw-linked-record piw-assessment-trail' })
  assert.equal(tree.root.findAllByProps({ 'data-record': 'input' }).length, 0)
  act(() => { const node = { open: true }; outer.props.onToggle({ target: node, currentTarget: node }) })
  assert.equal(tree.root.findAllByType('summary').filter(row => JSON.stringify(row.props.children).includes('Position')).length, 10)
  const more = tree.root.findAllByType('button').find(row => JSON.stringify(row.props.children).includes('inputs'))
  act(() => more.props.onClick())
  assert.equal(tree.root.findAllByType('summary').filter(row => JSON.stringify(row.props.children).includes('Position')).length, 20)
  const firstInput = tree.root.findAllByType('details').find(row => row.props.onToggle && row !== outer)
  act(() => firstInput.props.onToggle({ currentTarget: { open: true } }))
  assert.equal(tree.root.findByProps({ 'data-record': 'input' }).props['data-position'], position)
  act(() => tree.unmount())
})

test('overview, hypotheses and paired change inspectors expose trails from their matching versions', () => {
  const current = fixture(), before = fixture()
  before.version.id = 'before-version'
  before.observation.snapshot.assessments[0].context_positions = []
  const html = markup(Workspace, { workspace: workspace(current) })
  assert.equal((html.match(/Saved evidence trail · 1 context input/g) ?? []).length, 2)
  const inspector = { kind: 'evidence-change', change: { kind: 'assessment_stale', assessment_id: selectedId(current) }, beforeVersionId: before.version.id }
  const paired = markup(Inspector, { workspace: workspace(current, { inspector, beforeBundles: { [before.version.id]: before } }) })
  assert.match(paired, /Saved evidence trail · 0 context inputs/)
  assert.match(paired, /Saved evidence trail · 1 context input/)
})

test('private trails disappear when access is denied and unavailable bundles do not fall back to current evidence', () => {
  const bundle = fixture(), ws = workspace(bundle)
  ws.status = WORKSPACE_STATUS.access_denied
  const html = markup(Workspace, { workspace: ws }) + markup(Inspector, { workspace: ws })
  assert.doesNotMatch(html, /Saved evidence trail|left reasoning|Source History|Shared article capture/)
  assert.equal(savedAssessmentTrail(null, selectedId(bundle)), null)
  assert.match(markup(Trail, { bundle: null, assessmentId: selectedId(bundle) }), /trail unavailable/)
})

test('date-only source values retain day precision without inventing UTC midnight', () => {
  assert.deepEqual(retainedDateDisplay('2024-04-08'), {label:'2024-04-08 (date only)',dateTime:'2024-04-08'})
  const input={capture:{payload:{published_at:'2024-04-08'}}}
  const before=structuredClone(input), html=markup(RetainedInputDates,{input})
  assert.match(html, /datetime="2024-04-08"/i)
  assert.match(html, /2024-04-08 \(date only\)/)
  assert.doesNotMatch(html, /00:00|UTC/)
  assert.deepEqual(input,before)
})

test('minute, second and microsecond precision survive display without padding or truncation', () => {
  for (const clock of ['03:04','03:04:05','03:04:05.1','03:04:05.123456']) {
    const value='2024-04-08T'+clock+'Z'
    assert.deepEqual(retainedDateDisplay(value), {label:'2024-04-08 '+clock+' UTC',dateTime:value})
  }
})

test('numeric source offsets stay explicit without shifting the recorded calendar day', () => {
  assert.deepEqual(retainedDateDisplay('2024-04-08T00:15:00+0530'), {
    label:'2024-04-08 00:15:00 UTC+05:30',dateTime:'2024-04-08T00:15:00+05:30'})
  assert.equal(retainedDateLabel('2024-04-08T23:15:00-04:00'),'2024-04-08 23:15:00 UTC-04:00')
  assert.deepEqual(retainedDateDisplay('2024-04-08 17:59:00.123456+00'), {
    label:'2024-04-08 17:59:00.123456 UTC',dateTime:'2024-04-08T17:59:00.123456+00:00'})
})

test('unqualified local clocks are not promoted to UTC or machine-readable instants', () => {
  const value='2024-04-08T03:04:05'
  assert.deepEqual(retainedDateDisplay(value),{label:'2024-04-08 03:04:05 (time zone not recorded)',dateTime:null})
  const html=markup(RetainedInputDates,{input:{record_version:{recorded_at:value}}})
  assert.match(html,/time zone not recorded/)
  assert.doesNotMatch(html,/<time|UTC/)
  assert.deepEqual(retainedDateDisplay('2024-04-08T03:04:05-00:00'), {
    label:'2024-04-08 03:04:05 UTC (local offset unknown)',dateTime:'2024-04-08T03:04:05Z'})
})

test('impossible calendars and unsupported clocks never normalize into plausible dates', () => {
  for (const value of ['2023-02-29','1900-02-29','2024-02-30','2024-04-31',
    '2024-00-08','2024-13-08','2024-04-00','0000-01-01','2024-04-08T24:00:00Z',
    '2024-04-08T03:60:00Z','2024-04-08T03:04:60Z','2024-04-08T03:04:05+24:00',
    '2024-04-08T03:04:05+01:60','04/08/2024','2024-04-08\n','2024-04-08T03:04:05.1234567Z']) {
    assert.deepEqual(retainedDateDisplay(value),{label:'Unrecognized retained date',dateTime:null},value)
    assert.doesNotMatch(markup(RetainedInputDates,{input:{record_version:{recorded_at:value}}}),/<time/)
  }
  assert.equal(retainedDateDisplay('2000-02-29').dateTime,'2000-02-29')
  assert.equal(retainedDateDisplay('2024-02-29').dateTime,'2024-02-29')
})

test('empty retained dates remain absent and never borrow another recorded clock', () => {
  for (const value of [null,undefined,'',0,{}]) assert.deepEqual(retainedDateDisplay(value),{label:'Not recorded',dateTime:null})
  const html=markup(RetainedInputDates,{input:{capture:{payload:{},captured_at:'2024-04-08T03:04:05Z'}}})
  assert.match(html,/<dt>Source publication<\/dt><dd>Not recorded<\/dd>/)
  assert.match(html,/2024-04-08 03:04:05 UTC/)
})

test('duplicate selected assessment identities are unavailable regardless of order', () => {
  const bundle=fixture(), snapshot=bundle.observation.snapshot, id=selectedId(bundle)
  snapshot.assessments.push({...snapshot.assessments[0],rationale:'conflicting duplicate'})
  for (let i=0;i<2;i++) {
    assert.equal(savedAssessmentTrail(bundle,id),null)
    assert.deepEqual(selectedContextUsers(bundle,position),[])
    assert.match(markup(Trail,{bundle,assessmentId:id}),/Assessment trail unavailable/)
    snapshot.assessments.reverse()
  }
})

test('duplicate dependency and input identities never select arbitrary saved content', () => {
  const bundle=fixture(), snapshot=bundle.observation.snapshot, id=selectedId(bundle)
  snapshot.assessments.push({...snapshot.assessments.find(row=>row.id==='left'),rationale:'duplicate dependency'})
  snapshot.inputs.push({...snapshot.inputs[0],capture:{payload:{title:'duplicate capture'}}})
  for (let i=0;i<2;i++) {
    const trail=savedAssessmentTrail(bundle,id)
    assert.equal(trail.inputs[0].input,null)
    assert.equal(trail.dependencies.find(row=>row.id==='left').assessment,null)
    assert.equal(trail.dependencies.find(row=>row.id==='right').assessment.rationale,'right reasoning')
    snapshot.assessments.reverse();snapshot.inputs.reverse()
  }
})

test('context and extra-input membership require exact array positions, never substrings', () => {
  const bundle=fixture(), assessment=bundle.observation.snapshot.assessments[0]
  assessment.context_positions=position
  assert.deepEqual(selectedContextUsers(bundle,position),[])
  assert.equal(savedAssessmentTrail(bundle,assessment.id).contextRecorded,false)
  assessment.context_positions=['1']
  assessment.extra_positions='11'
  assert.deepEqual(selectedContextUsers(bundle,'11'),[])
  assert.equal(savedAssessmentTrail(bundle,assessment.id).inputs[0].explicitlyAdded,false)
  assessment.extra_positions=['1']
  assert.equal(savedAssessmentTrail(bundle,assessment.id).inputs[0].explicitlyAdded,true)
  for (const value of ['1\n','01','1.0',1,' 1','1 ']) assert.equal(exactInputPosition(value),null)
})

test('malformed collections and null rows cannot crash saved-trail resolution', () => {
  for (const assessments of [null,{},'invalid',[null,{}]]) {
    const bundle={observation:{snapshot:{assessments,selected_assessment_ids:['missing']}}}
    assert.equal(savedAssessmentTrail(bundle,'missing'),null)
    assert.deepEqual(selectedContextUsers(bundle,'1'),[])
  }
  const bundle=fixture()
  bundle.observation.snapshot.assessments.push(null,{})
  bundle.observation.snapshot.inputs={}
  const trail=savedAssessmentTrail(bundle,selectedId(bundle))
  assert.equal(trail.inputs[0].input,null)
  assert.equal(trail.dependencies.length,3)
})

test('identical duplicate rows remain ambiguous and the snapshot is not rewritten', () => {
  const bundle=fixture(), snapshot=bundle.observation.snapshot, id=selectedId(bundle)
  snapshot.inputs.push(structuredClone(snapshot.inputs[0]))
  const before=structuredClone(bundle)
  assert.equal(savedAssessmentTrail(bundle,id).inputs[0].input,null)
  assert.deepEqual(bundle,before)
})
