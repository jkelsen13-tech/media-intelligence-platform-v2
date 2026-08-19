const { readFileSync, writeFileSync } = require('node:fs')
const { GoogleDecoder } = require('google-news-url-decoder')

const [inputPath, outputPath] = process.argv.slice(2)
if (!inputPath || !outputPath) throw new Error('Usage: node decode_project2025_urls_sequential.cjs input.json output.json')

async function main() {
  const input = JSON.parse(readFileSync(inputPath, 'utf8'))
  const decoder = new GoogleDecoder()
  const output = []
  for (const [index, article] of input.articles.entries()) {
    const result = await decoder.decode(article.google_news_url)
    output.push({
      ...article,
      publisher_url: result.status ? result.decoded_url : null,
      decode_status: result.status === true,
      decode_note: result.status ? null : (result.message ?? 'Unknown decode error'),
    })
    process.stderr.write(`decoded ${index + 1}/${input.articles.length}\n`)
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  const decoded = output.filter((article) => article.decode_status && article.publisher_url)
  writeFileSync(outputPath, JSON.stringify({ count: output.length, decoded_count: decoded.length, articles: output }, null, 2) + '\n')
  console.log(JSON.stringify({ count: output.length, decoded_count: decoded.length, outputPath }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
