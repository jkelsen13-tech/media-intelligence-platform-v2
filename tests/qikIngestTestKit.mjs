import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto'
import {installQikIngest, cleanupQikIngest} from '../supabase/qualification/qik-ingest/installQikIngest.mjs'
import {createPipelineRpc} from '../supabase/qualification/qik-ingest/nativeHandoff.mjs'
import {DISPOSABLE_TEST_TOKEN} from '../supabase/qualification/qik-ingest/collector.mjs'

const qikRoot = new URL('../supabase/qualification/qik-ingest/', import.meta.url)
const pipelineSql = () => readFile(new URL('../supabase/migrations/20260905082406_evidence_pipeline_reliability.sql', import.meta.url), 'utf8')
const fixtureSql = () => readFile(new URL('fixture_substrate.sql', qikRoot), 'utf8')

export const FEED = `<?xml version="1.0"?><rss><channel>
<item><title>Council Approves Water Plan</title><link>https://news.example/water</link>
<description>Officials approved a public water plan after review.</description>
<pubDate>Sat, 26 Sep 2026 12:00:00 GMT</pubDate></item>
<item><title>Second Item</title><link>https://news.example/second</link>
<description>Another retainable headline for the duplicate tests.</description></item>
</channel></rss>`

export async function createDisposableDb() {
  const db = await PGlite.create({extensions: {pgcrypto}})
  const exec = sql => db.exec(sql)
  return {db, exec}
}

export async function loadNativeSubstrate(exec) {
  await exec(await fixtureSql())
  await exec(await pipelineSql())
}

export async function loadQikIngest(exec, options) {
  await loadNativeSubstrate(exec)
  await installQikIngest(exec, options)
}

export async function enableDisposableWriter(db) {
  await db.exec(`
    insert into qik_ingest.runtime_credentials(credential_hash, active, notes)
    values (encode(sha256(convert_to('${DISPOSABLE_TEST_TOKEN}', 'UTF8')), 'hex'), true, 'disposable PGlite only');
    update qik_ingest.collection_gate set collection_authorized = true;
    update public.ingest_sources
      set enabled = true, collection_enabled = true
      where id = '11111111-1111-4111-8111-111111111111';
  `)
}

export function rpc(db) {
  return async (name, args) => {
    const token = args.token
    if (name === 'plan') {
      return (await db.query('select public.mip_qik_ingest_plan($1) r', [token])).rows[0].r
    }
    if (name === 'begin_run') {
      return (await db.query('select public.mip_qik_ingest_begin_run($1,$2,$3::timestamptz) r',
        [token, args.run_id, args.now])).rows[0].r
    }
    if (name === 'retain_item') {
      return (await db.query('select public.mip_qik_ingest_retain_item($1,$2,$3::uuid,$4::jsonb) r',
        [token, args.run_id, args.source_id, JSON.stringify(args.item)])).rows[0].r
    }
    if (name === 'record_source_run') {
      return (await db.query(
        'select public.mip_qik_ingest_record_source_run($1,$2,$3::uuid,$4,$5,$6,$7,$8::timestamptz) r',
        [token, args.run_id, args.source_id, args.state, args.fetched, args.new_items, args.error_note, args.now],
      )).rows[0].r
    }
    if (name === 'finish_run') {
      return (await db.query(
        'select public.mip_qik_ingest_finish_run($1,$2,$3,$4::jsonb,$5::timestamptz) r',
        [token, args.run_id, args.state, JSON.stringify(args.counters ?? {}), args.now],
      )).rows[0].r
    }
    throw new Error(`unknown rpc ${name}`)
  }
}

export {createPipelineRpc, cleanupQikIngest, installQikIngest}
