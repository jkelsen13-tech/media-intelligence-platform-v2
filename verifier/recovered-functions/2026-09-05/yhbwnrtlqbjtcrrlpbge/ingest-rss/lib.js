// ingest-rss: shared runtime helpers.
//
// Plain ESM JavaScript (no Deno- or Node-only APIs) so the SAME FILE runs in
// the Deno edge runtime and under node:test — the test suite pins the read
// path the algorithm actually uses. Byte-for-byte semantic parity with
// backfill-legacy/lib.js keysetAll (Doc 13 pattern).

// Doc 13: PostgREST silently truncates any unpaginated select at 1000 rows.
// Keyset-paginate by the unique `id` column until a short page returns.
// Keyset (cursor) is preferred over offset because ingest writes
// concurrently — offsets can skip/duplicate rows as inserts shift pages.
// `filter` applies caller predicates (e.g. entity_type IN (...)) before
// ordering/pagination.
// NOTE: `cols` MUST include `id` — the cursor reads it back off the returned
// rows, so a cols list without it silently breaks paging on full tables.
export async function keysetAll(client, table, cols, { filter = (q) => q, pageSize = 1000 } = {}) {
  const out = []
  let last = null
  for (;;) {
    let q = filter(client.from(table).select(cols)).order('id', { ascending: true })
    if (last !== null) q = q.gt('id', last)
    const { data, error } = await q.limit(pageSize)
    if (error) return { data: null, error }
    out.push(...(data ?? []))
    if (!data || data.length < pageSize) return { data: out, error: null }
    last = data[data.length - 1].id
  }
}
