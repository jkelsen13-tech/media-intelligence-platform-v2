import { readFileSync, writeFileSync } from 'node:fs'

const [inputPath, outputPath] = process.argv.slice(2)
if (!inputPath || !outputPath) throw new Error('Usage: node resolve_google_news_urls.mjs input.json output.json')

const input = JSON.parse(readFileSync(inputPath, 'utf8'))
const timeoutFetch = async (url) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MIP-v2 research metadata resolver)' },
    })
    const html = await response.text()
    const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
      ?? html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i)
    const publisherUrl = canonical?.[1] ?? (response.url.includes('news.google.com') ? null : response.url)
    return { publisher_url: publisherUrl, resolve_status: response.status }
  } catch (error) {
    return { publisher_url: null, resolve_status: `error:${error.name}` }
  } finally {
    clearTimeout(timer)
  }
}

const limit = 5
const resolved = []
for (let start = 0; start < input.articles.length; start += limit) {
  const chunk = input.articles.slice(start, start + limit)
  const chunkResults = await Promise.all(chunk.map(async (article) => ({ ...article, ...(await timeoutFetch(article.google_news_url)) })))
  resolved.push(...chunkResults)
  process.stderr.write(`resolved ${resolved.length}/${input.articles.length}\n`)
}

const usable = resolved.filter((article) => article.publisher_url && !article.publisher_url.includes('news.google.com'))
writeFileSync(outputPath, JSON.stringify({
  count: resolved.length,
  resolved_count: usable.length,
  articles: resolved,
}, null, 2) + '\n')
console.log(JSON.stringify({ count: resolved.length, resolved_count: usable.length, outputPath }, null, 2))
