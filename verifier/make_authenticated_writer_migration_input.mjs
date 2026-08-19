import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const migrationPath = resolve(root, 'supabase/migrations/20260819_authenticated_ingestion_writer.sql')
const outputPath = resolve(root, 'verifier/authenticated_writer_migration_input.json')
const query = await readFile(migrationPath, 'utf8')
await writeFile(outputPath, JSON.stringify({
  project_id: 'yhbwnrtlqbjtcrrlpbge',
  name: 'authenticated_ingestion_writer',
  query,
}, null, 2) + '\n')
console.log(outputPath)
