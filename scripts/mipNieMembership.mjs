import { fingerprintPayload, isExactJsonNumber, serializeStagingJson } from './mipLegacyGraphStaging.mjs'

export const NIE_PROJECT_REF = 'niejaejtbxgakyrsntxm'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NATIVE_FIELDS = ['event_id', 'article_id', 'membership_method', 'membership_confidence', 'created_at']

export function prepareNieEventArticle(record) {
  if (!record || record.source_project_ref !== NIE_PROJECT_REF) {
    throw new Error('nie membership requires exact source project identity')
  }
  const supplied = Object.keys(record).filter((key) => key !== 'source_project_ref')
  if (supplied.length !== NATIVE_FIELDS.length
      || supplied.some((key) => !NATIVE_FIELDS.includes(key))
      || NATIVE_FIELDS.some((key) => !Object.hasOwn(record, key))) {
    throw new Error('nie membership requires exact native event_articles fields')
  }
  if (!UUID.test(record.event_id) || !UUID.test(record.article_id)
      || typeof record.membership_method !== 'string'
      || !record.membership_method.trim()
      || typeof record.created_at !== 'string'
      || !record.created_at.trim()) {
    throw new Error('nie membership requires event, article, method, and creation time')
  }
  const confidence = record.membership_confidence
  if (confidence !== null
      && !(typeof confidence === 'number' && Number.isFinite(confidence))
      && !isExactJsonNumber(confidence)) {
    throw new Error('nie membership confidence must be numeric or null')
  }
  const payload = Object.fromEntries(NATIVE_FIELDS.map((field) => [field, record[field]]))
  return {
    source_project_ref: NIE_PROJECT_REF,
    source_key: [record.event_id, record.article_id],
    payload,
    payload_sha256: fingerprintPayload(payload),
  }
}

export async function stageNieEventArticle(db, record) {
  const prepared = prepareNieEventArticle(record)
  const row = await db.query(
    'select legacy_graph_staging.stage_nie_event_article($1::jsonb, $2::text) as result',
    [serializeStagingJson(prepared.payload), prepared.payload_sha256],
  )
  return row.rows[0].result
}
