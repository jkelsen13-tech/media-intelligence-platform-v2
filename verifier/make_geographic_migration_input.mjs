import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const migrationPath = resolve(projectRoot, 'supabase/migrations/20260819_geographic_graph_provenance.sql');
const outputPath = resolve(import.meta.dirname, 'geographic_graph_migration_input.json');
const query = await readFile(migrationPath, 'utf8');

await writeFile(outputPath, `${JSON.stringify({
  project_id: 'yhbwnrtlqbjtcrrlpbge',
  name: 'geographic_graph_provenance',
  query,
}, null, 2)}\n`);

console.log(outputPath);
