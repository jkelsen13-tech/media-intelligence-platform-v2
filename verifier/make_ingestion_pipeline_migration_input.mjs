import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const projectRoot = resolve(import.meta.dirname, '..')
const migrationPath = resolve(projectRoot, 'supabase/migrations/20260819_provenance_first_ingestion_pipeline.sql')
const outputPath = resolve(import.meta.dirname, 'ingestion_pipeline_migration_input.json')
const query = await readFile(migrationPath, 'utf8')

await writeFile(outputPath, `${JSON.stringify({
  project_id: 'yhbwnrtlqbjtcrrlpbge',
  name: 'provenance_first_ingestion_pipeline',
  query,
}, null, 2)}\n`)

console.log(outputPath)
