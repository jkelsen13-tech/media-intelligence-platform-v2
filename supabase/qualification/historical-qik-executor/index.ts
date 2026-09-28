// SOURCE CANDIDATE ONLY. Entry stays in the existing qik project.
// Do not deploy until full-engine Edge CPU/memory and ordinary-role install qualify.
import { Buffer } from 'node:buffer'
import process from 'node:process'
import pg from 'pg'
const globals = globalThis as unknown as { Buffer: typeof Buffer; process: typeof process }
globals.Buffer ??= Buffer
globals.process ??= process
// Dynamic import ensures unchanged transitive Node modules receive compatibility
// globals before evaluation. Bundle the pinned transitive scripts unchanged.
const { createHistoricalHandler } = await import('./handler.mjs')
Deno.serve(createHistoricalHandler({
  readSecret: (name: string) => Deno.env.get(name),
  createClient: (options: Record<string, unknown>) => new pg.Client(options),
}))
