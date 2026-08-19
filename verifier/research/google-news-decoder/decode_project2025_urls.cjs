const { readFileSync, writeFileSync } = require('node:fs')
const { GoogleDecoder } = require('google-news-url-decoder')

const [inputPath, outputPath] = process.argv.slice(2)
if (!inputPath || !outputPath) throw new Error('Usage: node decode_project2025_urls.cjs input.json output.json')

async function main() {
  const input = JSON.parse(readFileSync(inputPath, 'utf8'))
  const decoder = new GoogleDecoder()
  const batchSize = 20
  const output = []
  for (let i = 0; i < input.articles.length; i += batchSize) {
    const articles = input.articles.slice(i, i + batchSize)
    const results = await decoder.decodeBatch(articles.map((article) => article.google_news_url))
    for (let idx = 0; idx < articles.length; idx += 1) {
      const result = results[idx] ?? { status: false, message: 'No decoder response' }
      output.push({
        ...articles[idx],
        publisher_url: result.status ? result.decoded_url : null,
        decode_status: result.status === true,
        decode_note: result.status ? null : (result.message ?? 'Unknown decode error'),
      })
    }
    process.stderr.write(`decoded ${output.length}/${input.articles.length}\n`)
  }
  const decoded = output.filter((article) => article.decode_status && article.publisher_url)
  writeFileSync(outputPath, JSON.stringify({ count: output.length, decoded_count: decoded.length, articles: output }, null, 2) + '\n')
  console.log(JSON.stringify({ count: output.length, decoded_count: decoded.length, outputPath }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
