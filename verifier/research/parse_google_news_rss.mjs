import { readFileSync, writeFileSync } from 'node:fs'

const [inputPath, outputPath] = process.argv.slice(2)
if (!inputPath || !outputPath) throw new Error('Usage: node parse_google_news_rss.mjs input.xml output.json')

const xml = readFileSync(inputPath, 'utf8')
const decode = (value = '') => value
  .replace(/^<!\[CDATA\[|\]\]>$/g, '')
  .replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .trim()
const text = (block, tag) => {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return decode(match?.[1] ?? '')
}

const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => {
  const block = match[1]
  const sourceMatch = block.match(/<source[^>]*url="([^"]*)"[^>]*>([\s\S]*?)<\/source>/i)
  return {
    title: text(block, 'title'),
    url: text(block, 'link'),
    published_at: text(block, 'pubDate'),
    source: decode(sourceMatch?.[2] ?? ''),
    source_url: decode(sourceMatch?.[1] ?? ''),
  }
})

writeFileSync(outputPath, JSON.stringify({ count: items.length, items }, null, 2) + '\n')
console.log(JSON.stringify({ count: items.length, outputPath }, null, 2))
