#!/usr/bin/env node
// Default/offline CLI. Arguments never select a URL, credential, driver or SQL.
import { inspectPackage, buildSubmissionBundle, runClosedSyntheticQualification } from './package.mjs'

const safeCodes = new Set(['SOURCE_LOCK_REFUSED', 'SOURCE_DRIFT', 'MANIFEST_REFUSED', 'PROTOCOL_REFUSED',
  'CLIENT_BINDING_REFUSED', 'SYNTHETIC_OPTIONS_REFUSED', 'ADAPTER_REFUSED', 'BASELINE_REFUSED'])

const args = process.argv.slice(2)
let result
if (args.length > 1 || (args.length === 1 && !['--inspect', '--bundle', '--synthetic'].includes(args[0]))) {
  result = { mode: 'source-only-offline', liveReady: false, outcome: 'REFUSED', code: 'CLI_ARGUMENTS_REFUSED' }
  process.exitCode = 2
} else {
  try {
    result = args[0] === '--bundle' ? await buildSubmissionBundle()
      : args[0] === '--synthetic' ? await runClosedSyntheticQualification() : await inspectPackage()
  } catch (error) {
    result = { mode: 'source-only-offline', liveReady: false, outcome: 'REFUSED',
      code: safeCodes.has(error?.message) ? error.message : 'PACKAGE_INSPECTION_FAILED' }
    process.exitCode = 1
  }
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
