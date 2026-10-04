import { runRetainedRealNewsClockReplay } from './replay.mjs'

// stdout is the deterministic portable receipt; the caller chooses its custody.
process.stdout.write(`${JSON.stringify(await runRetainedRealNewsClockReplay(), null, 2)}\n`)
