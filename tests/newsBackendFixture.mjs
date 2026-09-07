import { createClient } from '@supabase/supabase-js'
import { createNewsBackend } from '../src/lib/newsBackend.js'

// Synthetic HTTP fixture for the installed SDK. It is never a production seed.
export function newsBackendFixture({ tables = {}, errors = {} } = {}) {
  const calls = []
  let token = 'news-session-one'
  const client = createClient('https://news-backend.example.invalid', 'fixture-browser-key', {
    accessToken: async () => token,
    realtime: { transport: class { constructor() { throw new Error('unexpected websocket') } } },
    global: { fetch: async (input, init) => {
      const request = new Request(input, init), url = new URL(request.url), params = url.searchParams
      const table = url.pathname.split('/').at(-1)
      calls.push({ table, params, request })
      const headers = { 'content-type': 'application/json' }
      const error = typeof errors[table] === 'function' ? errors[table](params) : errors[table]
      if (error) return new Response(JSON.stringify(error), { status: 403, headers })
      let rows = [...(tables[table] ?? [])]
      for (const [key, value] of params) {
        const valuePart = value.slice(value.indexOf('.') + 1)
        if (value.startsWith('eq.')) rows = rows.filter(row => String(row[key]) === valuePart)
        if (value.startsWith('gt.')) rows = rows.filter(row => String(row[key]) > valuePart)
        if (value.startsWith('gte.')) rows = rows.filter(row => String(row[key]) >= valuePart)
        if (value.startsWith('lte.')) rows = rows.filter(row => String(row[key]) <= valuePart)
        if (value === 'not.is.null') rows = rows.filter(row => row[key] != null)
        if (value.startsWith('in.')) rows = rows.filter(row => valuePart.slice(1, -1).split(',').map(v => v.replace(/^"|"$/g, '')).includes(String(row[key])))
        if (value.startsWith('like.')) rows = rows.filter(row => String(row[key]).endsWith(valuePart.replace(/[%*]/g, '')))
      }
      const count = rows.length
      const fields = params.get('order')?.split(',') ?? []
      rows.sort((a, b) => {
        for (const field of fields) {
          const [key, dir] = field.split('.')
          const result = String(a[key] ?? '').localeCompare(String(b[key] ?? ''))
          if (result) return result * (dir === 'desc' ? -1 : 1)
        }
        return 0
      })
      const offset = Number(params.get('offset') ?? 0)
      rows = rows.slice(offset, offset + Math.min(1000, Number(params.get('limit') ?? 1000)))
      headers['content-range'] = `${offset}-${offset + Math.max(0, rows.length - 1)}/${count}`
      const single = request.headers.get('accept')?.includes('vnd.pgrst.object')
      if (single && rows.length !== 1) return new Response(JSON.stringify({ code: 'PGRST116', details: 'The result contains 0 rows', message: 'No row' }), { status: 406, headers })
      return new Response(request.method === 'HEAD' ? null : JSON.stringify(single ? rows[0] : rows), { headers })
    } },
  })
  return { client, backend: createNewsBackend(client), calls, setToken: value => { token = value } }
}
