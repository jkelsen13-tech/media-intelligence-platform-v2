// MK-0/MK-1 semantic contract qualification. Not a publication authority or an
// endpoint. A future authenticated adapter must load retained, authorized records;
// caller-authored flags/objects must never be accepted as publication decisions.
export const MARKET_CONTRACT_VERSION = 'mip-markets-evidence-v1'
const MAX = 200
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const text = value => typeof value === 'string' && value.trim().length > 0
const id = value => typeof value === 'string' && ID.test(value)
function reject(reason) { return { status: 'unavailable', reason } }

// Semantic comparisons use integer nanoseconds; never truncate sub-ms evidence.
export function marketInstant(value) {
  if (typeof value !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}(?::?\d{2})?)$/i.exec(value)
  if (!m) return null
  const [y, mo, d, h, mi, s] = m.slice(1,7).map(Number)
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0)
  const days = [31, leap ? 29 : 28, 31,30,31,30,31,31,30,31,30,31]
  if (y < 1 || mo < 1 || mo > 12 || d < 1 || d > days[mo-1] || h > 23 || mi > 59 || s > 59) return null
  const z = m[8].toUpperCase()
  const digits = z === 'Z' ? '0000' : z.slice(1).replace(':','').padEnd(4,'0')
  const zh = Number(digits.slice(0,2)), zm = Number(digits.slice(2))
  if (zh > 23 || zm > 59) return null
  const date = new Date(0)
  date.setUTCFullYear(y,mo-1,d); date.setUTCHours(h,mi,s,0)
  const offset = (zh * 60 + zm) * (z[0] === '-' ? -1 : 1)
  return BigInt(date.getTime() - offset * 60000) * 1000000n + BigInt((m[7] ?? '').padEnd(9,'0'))
}
function intervalContains(record, instant) {
  const start = marketInstant(record?.validFrom), end = marketInstant(record?.validTo)
  return start !== null && (record.validTo === null || (end !== null && end > start))
    && instant >= start && (end === null || instant < end)
}
function uniqueMap(rows, key) {
  if (!Array.isArray(rows) || rows.length > MAX) return null
  const result = new Map()
  for (const row of rows) {
    if (!row || !id(row[key]) || result.has(row[key])) return null
    result.set(row[key], row)
  }
  return result
}

// IDs name canonical assets; symbols are venue/network-qualified dated aliases.
export function validateMarketAsset(asset, at) {
  const instant = marketInstant(at)
  if (!asset || !id(asset.id) || !id(asset.recordVersionId) || !text(asset.name)
    || !['equity','cryptoasset'].includes(asset.kind) || instant === null) return reject('invalid_identity')
  if (asset.releaseState !== 'public' || asset.publiclyEligible !== true) return reject('unpublished_identity')
  if (!intervalContains(asset,instant)) return reject('identity_not_valid_at_time')
  if (!Array.isArray(asset.aliases) || asset.aliases.length > 32) return reject('invalid_aliases')
  const aliases = []
  for (const alias of asset.aliases) {
    if (!text(alias?.symbol) || !text(alias.namespace) || !id(alias.recordVersionId)
      || marketInstant(alias.validFrom) === null
      || !(alias.validTo === null || (marketInstant(alias.validTo) !== null && marketInstant(alias.validTo) > marketInstant(alias.validFrom)))) return reject('invalid_alias')
    if (intervalContains(alias,instant)) aliases.push({symbol:alias.symbol,namespace:alias.namespace,recordVersionId:alias.recordVersionId,validFrom:alias.validFrom,validTo:alias.validTo})
  }
  if (asset.kind === 'equity' && !id(asset.issuerId)) return reject('issuer_identity_required')
  if (asset.kind === 'cryptoasset' && (!text(asset.networkId)
    || !text(asset.assetIdentifier))) return reject('network_asset_identity_required')
  return { status: 'ok', asset: { id:asset.id,recordVersionId:asset.recordVersionId,name:asset.name,kind:asset.kind,
    validFrom:asset.validFrom,validTo:asset.validTo,
    ...(asset.kind === 'equity' ? {issuerId:asset.issuerId} : {networkId:asset.networkId,assetIdentifier:asset.assetIdentifier}) }, aliases }
}

// Every essential hop references a retained assessment and exact retained text.
// This validates a supplied path; it neither searches names nor infers causation,
// independence, confidence, or publication eligibility.
export function validateMarketEvidencePath(input) {
  try { if (new TextEncoder().encode(JSON.stringify(input)).length > 4194304) return reject('scope_too_large') }
  catch { return reject('invalid_envelope') }
  const at = marketInstant(input?.at)
  const assetResult = validateMarketAsset(input?.asset,input?.at)
  if (assetResult.status !== 'ok') return assetResult
  if (!id(input.eventId) || at === null || !Array.isArray(input.hops)
    || input.hops.length < 1 || input.hops.length > 8) return reject('invalid_path')
  const assessments = uniqueMap(input.assessments,'id')
  const captures = uniqueMap(input.captures,'id')
  if (!assessments || !captures) return reject('invalid_retained_records')
  const visited = new Set([input.asset.id]), assessmentIds = new Set(), roots = new Set()
  let current = input.asset.id
  const retained = []
  for (const hop of input.hops) {
    if (!hop || hop.from !== current || !id(hop.to) || visited.has(hop.to)
      || !id(hop.assessmentId) || assessmentIds.has(hop.assessmentId)) return reject('disconnected_or_cyclic_path')
    if (!['direct_reporting','ownership','operation','supply','regulation','financing','protocol_dependency'].includes(hop.relationship))
      return reject('unsupported_relationship')
    const a = assessments.get(hop.assessmentId)
    if (!a || a.from !== hop.from || a.to !== hop.to || a.relationship !== hop.relationship
      || a.outcome !== 'supported' || a.stale !== false
      || !Array.isArray(a.supersededBy) || a.supersededBy.length !== 0
      || !id(a.candidateId) || !text(a.algorithmVersion) || !text(a.uncertainty)
      || !intervalContains(a,at)) return reject('unsupported_or_stale_hop')
    // Eligibility is consumed only from the future trusted publication adapter.
    // This contract never changes a private assessment into a public one.
    if (a.releaseState !== 'public' || a.publiclyEligible !== true) return reject('unpublished_hop')
    if (!Array.isArray(a.supports) || a.supports.length < 1 || a.supports.length > 32) return reject('missing_exact_support')
    const supports = []
    for (const support of a.supports) {
      const capture = captures.get(support?.captureId)
      if (!capture || capture.publiclyEligible !== true || capture.rights?.displayExcerpt !== true || !id(capture.rights?.recordVersionId)
        || !id(capture.articleId) || !id(capture.rootId) || !/^[a-f0-9]{64}$/i.test(capture.payloadHash ?? '')
        || marketInstant(capture.recordedAt) === null || !text(capture.publishedAt)
        || !text(capture.sourceUrl) || !text(capture.rights?.attribution)
        || !['title','summary','body'].includes(support.field)
        || !Number.isSafeInteger(support.start) || !Number.isSafeInteger(support.end)
        || support.start < 0 || support.end <= support.start || !text(support.excerpt)
        || typeof capture[support.field] !== 'string'
        || support.end > Array.from(capture[support.field]).length
        || Array.from(capture[support.field]).slice(support.start,support.end).join('') !== support.excerpt) return reject('invalid_or_unavailable_support')
      // Exact source dates/text are retained; date-only publication is never
      // converted to midnight or used to establish a relationship's validity.
      try { const url = new URL(capture.sourceUrl); if (!['http:','https:'].includes(url.protocol) || url.username || url.password) return reject('unsafe_source_url') }
      catch { return reject('unsafe_source_url') }
      roots.add(capture.rootId)
      supports.push({ captureId:support.captureId,field:support.field,start:support.start,end:support.end,excerpt:support.excerpt, articleId:capture.articleId, rootId:capture.rootId,
        payloadHash:capture.payloadHash, publishedAt:capture.publishedAt, recordedAt:capture.recordedAt,
        sourceUrl:capture.sourceUrl, attribution:capture.rights.attribution, rightsRecordVersionId:capture.rights.recordVersionId })
    }
    retained.push({ from:hop.from,to:hop.to,relationship:hop.relationship,assessmentId:hop.assessmentId, candidateId:a.candidateId, algorithmVersion:a.algorithmVersion,
      uncertainty:a.uncertainty, validFrom:a.validFrom,validTo:a.validTo,supports })
    current = hop.to; visited.add(current); assessmentIds.add(a.id)
  }
  if (current !== input.eventId) return reject('wrong_event')
  return { status:'ok', contractVersion:MARKET_CONTRACT_VERSION, at:input.at,
    asset:assetResult.asset, aliases:assetResult.aliases, eventId:input.eventId,
    path:retained, rootIds:[...roots].sort(),
    relation:retained.length === 1 && retained[0].relationship === 'direct_reporting' ? 'direct_reporting' : 'connected_development',
    // There is deliberately no composite confidence or inferred cause.
  }
}
