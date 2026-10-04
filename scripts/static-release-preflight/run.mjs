import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { QUALIFICATION, verifyRelease, createStaticModel, measureMapping, browserRequestTarget, sha256,
  qualifyRollbackSelection } from './model.mjs'

const deniedTargets = [
  'assets/missing.js', 'assets/missing.css', 'cesium/Workers/missing.js',
  'cesium/Assets/missing.png', 'cesium/ThirdParty/missing.wasm', 'tiles/0/0/0.png',
  'api/stories', 'functions/v1/investigation-api', 'rest/v1/articles', 'auth/v1/user',
  'private/receipt.json', 'source/package.json', 'src/App.jsx', 'node_modules/x.js',
  'story/00000000-0000-4000-8000-000000000001', 'event/fixture/world',
]
const malformedTargets = [
  '../index.html', '%2e%2e/index.html', '%252e%252e/index.html', 'assets%2fmissing.js',
  'assets%5cmissing.js', 'assets/%00missing.js', 'assets/%0amissing.js', 'assets/%7fmissing.js',
  'assets/%3fmissing.js', 'assets/%23missing.js', 'assets/%ZZmissing.js', 'assets//missing.js',
  '.env', '.git/config',
]

export async function runPreflight(input) {
  const release = await verifyRelease(input.release)
  let rollback = { verdict: 'HOLD_REAL_PREDECESSOR_ARTIFACT_NOT_SUPPLIED', current_body_identity_verified: true,
    prior_body_identity_verified: false, action_performed: false,
    reason: 'Fixtures test distinct release selection and reject mixed/missing bodies. No actual previous deployable body set or deployed pointer was supplied.' }
  if (input.previousRelease) {
    const previous = await verifyRelease(input.previousRelease)
    rollback = { ...qualifyRollbackSelection({ current: release, previous, expectedPreviousIdentity: input.expectedPreviousIdentity }),
      current_body_identity_verified: true, prior_body_identity_verified: true }
  } else if (input.expectedPreviousIdentity) throw Error('previous exact body artifact is required for rollback selection')
  const prefix = createStaticModel(release), redirect = createStaticModel(release, { rootEntry: 'redirect-to-prefix' })
  const rootOnly = createStaticModel(release, { mount: '/' })
  const directMapping = measureMapping(release, prefix), redirectedMapping = measureMapping(release, redirect)
  const rootMapping = measureMapping(release, rootOnly)
  const indexRow = release.files.find(row => row.path === 'index.html')
  const navigationLocations = [
    release.compiledBase,
    release.compiledBase + 'index.html',
    release.compiledBase + '?display=qualification#/event/fixture/world?place=fixture',
    release.compiledBase + '#/story/00000000-0000-4000-8000-000000000001?version=00000000-0000-4000-8000-000000000002',
  ]
  const navigation = navigationLocations.map(location => {
    const target = browserRequestTarget(location), response = prefix.respond({ target })
    return { browser_location: location, server_request_target: target, status: response.status,
      body_sha256: sha256(response.body), pass: response.status === 200 && sha256(response.body) === indexRow.sha256,
      claim: 'Actual entry body is refreshable at its server path. Fragment remains client state; no route data or App execution is qualified.' }
  })
  const refusals = []
  for (const path of deniedTargets) for (const mount of ['/', release.compiledBase]) {
    const target = mount + path, response = redirect.respond({ target })
    refusals.push({ target, expected_status: 404, status: response.status,
      html_fallback: response.headers['content-type'].startsWith('text/html'),
      pass: response.status === 404 && response.artifactPath === null && !response.headers['content-type'].startsWith('text/html') })
  }
  for (const path of malformedTargets) {
    const target = release.compiledBase + path, response = prefix.respond({ target })
    refusals.push({ target, expected_status: 400, status: response.status, pass: response.status === 400 && response.artifactPath === null })
  }
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'TRACE']) {
    const response = prefix.respond({ target: release.compiledBase, method })
    refusals.push({ method, target: release.compiledBase, expected_status: 405, status: response.status,
      pass: response.status === 405 && response.headers.allow === 'GET, HEAD' && response.artifactPath === null })
  }
  const rootRedirect = redirect.respond({ target: '/?display=qualification' })
  const allPass = directMapping.verdict === 'PASS_MODEL_MAPPING' && redirectedMapping.verdict === 'PASS_MODEL_MAPPING'
    && rootMapping.verdict === 'HOLD_COMPILED_PREFIX_UNSERVED' && navigation.every(row => row.pass) && refusals.every(row => row.pass)
    && rootRedirect.status === 308 && rootRedirect.headers.location === release.compiledBase + '?display=qualification'
  return {
    contract: 'mip-static-release-preflight-v1', observed_at_utc: new Date().toISOString(), runtime: process.version,
    qualification: QUALIFICATION, verdict: allPass ? 'PASS_BOUNDED_MODEL_WITH_HOST_AND_ROLLBACK_GATES_HELD' : 'FAIL_MODEL_CHECK',
    release_identity: release.identity, verified_bodies: release.files.length, total_bytes: release.totalBytes,
    export_proof: release.exportProof, canonical_cesium_proof: release.canonicalProof,
    compiled_base: release.compiledBase, actual_entry_urls: release.entryURLs,
    direct_prefix_mapping: directMapping,
    root_with_explicit_prefix_layout: { ...redirectedMapping, rows: undefined,
      root_redirect: { status: rootRedirect.status, location: rootRedirect.headers.location },
      requirement: 'Actual host must serve the entire unchanged body set at the compiled prefix and support an approved static root redirect. No HTML or bundle rewrite.' },
    root_only_mapping: { ...rootMapping, rows: undefined, unmapped_entry_urls: release.entryURLs,
      entry_status: rootOnly.respond({ target: '/' }).status,
      reason: 'HTML at root retains compiled prefix URLs; root-only file mounting cannot satisfy those URLs.' },
    hash_navigation_refresh: navigation, fail_closed_requests: refusals,
    cache_policy: { immutable_scope: 'Inventory-bound assets with emitted hash filename suffixes only',
      unhashed_cesium: 'Revalidate every use with body ETag; coordinate atomic complete releases, previous chunks and CDN/browser caches.',
      html_and_unhashed: 'public, max-age=0, must-revalidate',
      etag: 'Quoted strong SHA256 of actual file bytes; GET/HEAD weak If-None-Match comparison and wildcard only after exact existing-body lookup.' },
    security_headers: { verdict: 'HOLD_GOVERNED_HOST_HEADER_ACCEPTANCE',
      generated_csp_or_hsts: false, policy: 'The model adds no CSP/HSTS/security policy. Supplied governed header values are preserved; none was supplied for this release report.' },
    rollback,
    limits: ['No deployed host HTTP, TLS, DNS, CDN, headers, observability, commercial entitlement or account activation proof.',
      'No browser/App execution, real data, Auth/RLS, source admission, backend compatibility, physical device, performance or final appearance proof.',
      'No environment credentials, API proxy, external fetch, deployment, restore, protected mutation, cloud function or provider spend.'],
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const [inputPath, outputPath, ...extra] = process.argv.slice(2)
    if (!inputPath || !outputPath || extra.length) throw Error('usage: node scripts/static-release-preflight/run.mjs <input.json> <new-report.json>')
    const inputBytes = await readFile(inputPath), input = JSON.parse(inputBytes)
    const report = await runPreflight(input)
    report.input_sha256 = sha256(inputBytes)
    report.harness_sources = await Promise.all(['model.mjs', 'run.mjs'].map(async path => ({
      path: 'scripts/static-release-preflight/' + path, sha256: sha256(await readFile(new URL(path, import.meta.url))),
    })))
    await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
    console.log(JSON.stringify({ report: resolve(outputPath), verdict: report.verdict, runtime: report.runtime,
      bodies: report.verified_bodies, total_bytes: report.total_bytes, compiled_base: report.compiled_base,
      root_only: report.root_only_mapping.verdict, rollback: report.rollback.verdict }))
    if (report.verdict === 'FAIL_MODEL_CHECK') process.exitCode = 1
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
