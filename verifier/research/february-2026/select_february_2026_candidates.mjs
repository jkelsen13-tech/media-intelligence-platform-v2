import { readFileSync, writeFileSync } from 'node:fs'

const [inputPath, outputPath] = process.argv.slice(2)
if (!inputPath || !outputPath) throw new Error('Usage: node select_february_2026_candidates.mjs input.json output.json')

const input = JSON.parse(readFileSync(inputPath, 'utf8'))
const wanted = new Set([
  "WATCH: Trump, EPA's Zeldin announce end of scientific basis for U.S. action on climate change - PBS",
  'Trump set to gut U.S. climate change policy and environmental regulations, White House official says - PBS',
  'Supreme Court strikes down tariffs - SCOTUSblog',
  "As Trump reshapes foreign policy, China moves to limit risks, reap gains - NPR",
  "Fifth Circuit upholds Trump administration's mandatory detention policy - Courthouse News",
  'Chairman Mast Delivers Opening Remarks at Hearing in U.S. Policy Challenges Post-Assad - House.gov',
  'State Data Center Legislation in 2026 Tackles Energy and Tax Issues - MultiState',
  'National and State Child Care Data Overview - Bipartisan Policy Center',
  'State of the Union 2026: Where Americans stand on key issues facing the nation - Pew Research Center',
  'The State of US Vaccine Policy - CIDRAP',
])

const articles = (input.items ?? [])
  .filter((item) => wanted.has(item.title))
  .map((item) => ({
    title: item.title,
    outlet: item.source,
    published_at: item.published_at,
    google_news_url: item.url,
    source_homepage: item.source_url,
  }))

writeFileSync(outputPath, JSON.stringify({ count: articles.length, articles }, null, 2) + '\n')
console.log(JSON.stringify({ selected: articles.length, outputPath }, null, 2))
