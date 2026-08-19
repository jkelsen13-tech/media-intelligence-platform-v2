import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const migrationPath = resolve(root, 'supabase/migrations/20260819_authenticated_writer_citation_identity.sql')
const outputPath = resolve(root, 'verifier/authenticated_writer_citation_identity_input.json')
const query = await readFile(migrationPath, 'utf8')
await writeFile(outputPath, JSON.stringify({
  project_id: 'yhbwnrtlqbjtcrrlpbge',
  name: 'authenticated_writer_citation_identity',
  query,
}, null, 2) + '\n')
console.log(outputPath)
