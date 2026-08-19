import { readFileSync, writeFileSync } from 'node:fs'

const [outputPath, targetYearArg, ...inputPaths] = process.argv.slice(2)
const targetYear = Number(targetYearArg)
if (!outputPath || !Number.isInteger(targetYear) || inputPaths.length === 0) {
  throw new Error('Usage: node curate_project2025_candidates.mjs output.json targetYear input1.json [input2.json ...]')
}

const trustedSources = new Set([
  'Reuters', 'NPR', 'PBS', 'BBC', 'apnews.com', 'The New York Times', 'The Guardian',
  'ABC News - Breaking News, Latest News and Videos', 'NBC News', 'ProPublica',
  'FactCheck.org', 'Time Magazine', 'Axios', 'USA Today', 'The Washington Post',
  'C-SPAN', 'Politico', 'E&E News by POLITICO', 'The Hill', 'CNBC', 'KFF Health News',
  'The Hechinger Report', 'Poynter', 'Columbia Journalism Review', 'The Christian Science Monitor',
])
const stopTitle = /project 2029|marathon project|project 2026|reflecting pool|opinions?\s*\|/i
const normalize = (title) => title
  .toLowerCase()
  .replace(/\s+-\s+[^-]+$/, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim()

const records = inputPaths.flatMap((file) => JSON.parse(readFileSync(file, 'utf8')).items)
const selected = []
const seen = new Set()
for (const item of records) {
  const date = new Date(item.published_at)
  if (Number.isNaN(date.valueOf()) || date.getUTCFullYear() !== targetYear) continue
  if (!trustedSources.has(item.source)) continue
  if (!/project 2025/i.test(item.title) || stopTitle.test(item.title)) continue
  const key = normalize(item.title)
  if (!key || seen.has(key)) continue
  seen.add(key)
  selected.push({
    title: item.title.replace(/\s+-\s+[^-]+$/, '').trim(),
    source: item.source,
    source_home: item.source_url,
    published_at: date.toISOString(),
    google_news_url: item.url,
  })
}
selected.sort((a, b) => a.published_at.localeCompare(b.published_at) || a.title.localeCompare(b.title))
writeFileSync(outputPath, JSON.stringify({ count: selected.length, articles: selected }, null, 2) + '\n')
console.log(JSON.stringify({ count: selected.length, outputPath, bySource: Object.fromEntries([...new Set(selected.map((r) => r.source))].sort().map((source) => [source, selected.filter((r) => r.source === source).length])) }, null, 2))
