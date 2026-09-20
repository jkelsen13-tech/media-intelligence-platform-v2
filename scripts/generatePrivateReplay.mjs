// Stdin only. stdout contains counts only; errors deliberately suppress input values.
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { replayPrivateInput } from './nativeOfflineReplay.mjs'
try {
  let raw = ''; let bytes = 0
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) {
    bytes += Buffer.byteLength(chunk); if (bytes > 32*1024*1024) throw new Error('limit'); raw += chunk
    const newline=raw.indexOf('\n')
    if(newline>=0) { raw=raw.slice(0,newline); break }
  }
  const replay = replayPrivateInput(JSON.parse(raw))
  const dir = new URL('../.private-demo/', import.meta.url)
  await mkdir(dir, { recursive:true })
  await writeFile(new URL('native-replay.json', dir), JSON.stringify(replay), { mode:0o600 })
  console.log(JSON.stringify({ contract:replay.contract, revision:replay.revision, counts:replay.counts, output:fileURLToPath(new URL('native-replay.json',dir)) }))
} catch { console.error('Private replay generation failed contract validation. No input values logged; prior artifact was not overwritten.'); process.exitCode=1 }
