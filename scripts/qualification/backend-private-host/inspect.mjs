// The only operational CLI is offline inspection; there is no run/connect flag.
import { inspectPrivateHost } from './source.mjs'
if (process.argv.length !== 2) {
  process.stdout.write('{"code":"HOST_CLI_ARGUMENTS_REFUSED","liveReady":false}\n')
  process.exitCode = 2
} else {
  try { process.stdout.write(`${JSON.stringify(await inspectPrivateHost(), null, 2)}\n`) }
  catch { process.stdout.write('{"code":"HOST_SOURCE_INSPECTION_REFUSED","liveReady":false}\n'); process.exitCode = 1 }
}
