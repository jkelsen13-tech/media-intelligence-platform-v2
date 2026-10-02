import { marketInstant, validateMarketAsset, validateMarketEvidencePath } from './marketsEvidenceContract.mjs'

export const MARKETS_DIRECTORY_CONTRACT = 'mip-markets-admitted-directory-v2'
export const MARKET_IDENTITY_TYPES = Object.freeze(['issuer', 'share_class', 'listing', 'cryptoasset', 'network', 'trading_pair'])
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
const text = value => typeof value === 'string' && value.trim().length > 0
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const reject = reason => ({ status: 'unavailable', reason, snapshot: null })
const nativeField = field => field === 'body' ? 'body_text' : field
const pick = (value, keys) => Object.fromEntries(keys.filter(key => value?.[key] !== undefined).map(key => [key, value[key]]))
const identityKeys = ['id','recordVersionId','identityType','name','validFrom','validTo','methodVersion','reviewRef','sourceBindings',
  'issuerId','shareClassId','exchangeMic','networkId','assetIdentifier','assetIdentifierKind','baseAssetId','quoteAssetId','venue','aliases']
const aliasKeys=['symbol','namespace','recordVersionId','publicVersionId','validFrom','validTo']
const bindingKeys=['publicVersionId','captureId','payloadHash','articleId','admissionKind','reviewRef','policyVersion','reviewedBy','reviewedAt',
  'field','start','end','excerpt','excerptHash','eventId','rightsVersionId','attribution']
function publicIdentity(row) {
  return {...pick(row,identityKeys),sourceBindings:row.sourceBindings.map(b=>pick(b,bindingKeys)),
    ...(Array.isArray(row.aliases)?{aliases:row.aliases.map(a=>pick(a,aliasKeys))}:{})}
}
function publicEvidence(evidence, asset, bindings) {
  return {at:evidence.at,eventId:evidence.eventId,asset:{...pick(asset,[...identityKeys,'kind','releaseState','publiclyEligible']),
    identityRefs:asset.identityRefs.map(ref => pick(ref,['id','recordVersionId','identityType','name','methodVersion','reviewRef','sourceBindings']))},
    hops:evidence.hops.map(hop => pick(hop,['from','to','relationship','assessmentId'])),
    assessments:evidence.assessments.map(a => ({...pick(a,['id','candidateId','from','to','relationship','outcome','stale','supersededBy','algorithmVersion',
      'uncertainty','releaseState','publiclyEligible','validFrom','validTo']),supports:a.supports.map(s => pick(s,['captureId','field','start','end','excerpt']))})),
    captures:evidence.captures.map(c => ({...pick(c,['id','articleId','rootId','payloadHash','publicVersionId','publiclyEligible','publishedAt','recordedAt','sourceUrl','rights']),
      admittedSpans:bindings.filter(b => b.captureId === c.id && b.publicVersionId === c.publicVersionId).map(b => ({
        publicVersionId:b.publicVersionId,payloadHash:b.payloadHash,field:b.field === 'body_text' ? 'body' : b.field,start:b.start,end:b.end,excerpt:b.excerpt}))}))}
}
function exactSpan(a, b) {
  return a.captureId === b.captureId && a.payloadHash === b.payloadHash && nativeField(a.field) === nativeField(b.field)
    && a.start === b.start && a.end === b.end && a.excerpt === b.excerpt
}
function publicBinding(binding) {
  return uuid(binding?.publicVersionId) && uuid(binding.captureId) && hash(binding.payloadHash)
    && binding.admissionKind === 'reviewed_proposition' && text(binding.reviewRef) && text(binding.policyVersion)
    && text(binding.reviewedBy) && marketInstant(binding.reviewedAt) !== null
    && ['title', 'summary', 'body_text'].includes(nativeField(binding.field))
    && Number.isSafeInteger(binding.start) && Number.isSafeInteger(binding.end) && binding.start >= 0 && binding.end > binding.start
    && text(binding.excerpt) && Array.from(binding.excerpt).length === binding.end-binding.start && hash(binding.excerptHash)
    && uuid(binding.rightsVersionId) && text(binding.attribution) && uuid(binding.eventId)
}
function validInterval(row, at) {
  const start = marketInstant(row?.validFrom), end = marketInstant(row?.validTo)
  return start !== null && (row.validTo === null || (end !== null && end > start)) && at >= start && (end === null || at < end)
}
function validateIdentity(row, at) {
  return uuid(row?.id) && uuid(row.recordVersionId) && MARKET_IDENTITY_TYPES.includes(row.identityType)
    && text(row.name) && validInterval(row, at) && text(row.methodVersion) && text(row.reviewRef)
    && Array.isArray(row.sourceBindings) && row.sourceBindings.length > 0 && row.sourceBindings.length <= 32
    && row.sourceBindings.every(publicBinding)
}

// A browser never supplies this owner. The installed retained-record adapter
// reads the existing private reviewed-public-article owner. Neither successful
// acquisition nor caller eligibility flags may grant an admitted span.
function resolveBinding(binding, owner, at) {
  if (!uuid(binding?.publicVersionId)) return null
  const version = owner.readReviewedArticleVersion(binding.publicVersionId)
  if (!version || version.public_version_id !== binding.publicVersionId || version.admission_kind !== 'reviewed_proposition'
    || version.capture_id !== binding.captureId || version.capture_hash !== binding.payloadHash
    || !uuid(version.article_id) || !text(version.review_ref) || !text(version.policy_version)
    || !text(version.reviewed_by) || marketInstant(version.reviewed_at) === null || !Array.isArray(version.evidence)) return null
  const span = version.evidence.find(e => e.capture_id === binding.captureId && e.capture_hash === binding.payloadHash
    && e.source_field === nativeField(binding.field) && e.span_start === binding.start && e.span_end === binding.end && e.excerpt === binding.excerpt)
  if (!span || !hash(span.excerpt_hash) || !uuid(span.event_id)) return null
  const rights = owner.readExcerptRights(binding.publicVersionId)
  if (!uuid(rights?.id) || rights.publicVersionId !== binding.publicVersionId || rights.captureId !== binding.captureId
    || rights.payloadHash !== binding.payloadHash || rights.displayExcerpt !== true || !text(rights.attribution)
    || !text(rights.reviewRef) || !text(rights.reviewedBy) || marketInstant(rights.checkedAt) === null || marketInstant(rights.checkedAt)>at
    || !(rights.validUntil === null || (marketInstant(rights.validUntil) !== null && marketInstant(rights.validUntil) > at))) return null
  try { const url = new URL(rights.termsUrl); if (url.protocol !== 'https:' || url.username || url.password) return null } catch { return null }
  return { publicVersionId: version.public_version_id, captureId: version.capture_id, payloadHash: version.capture_hash,
    articleId: version.article_id, admissionKind: version.admission_kind, reviewRef: version.review_ref,
    policyVersion: version.policy_version, reviewedBy: version.reviewed_by, reviewedAt: version.reviewed_at,
    field: span.source_field, start: span.span_start, end: span.span_end, excerpt: span.excerpt, excerptHash: span.excerpt_hash,
    eventId:span.event_id,rightsVersionId:rights.id,attribution:rights.attribution }
}

// Extend native record_versions, not a parallel identity/history/publication
// engine. Input records are loaded by the server owner; this function is not an
// HTTP body handler. Canonical IDs are retained UUIDs, never ticker/name hashes.
export function projectMarketsDirectory({ at, observedAt, version, records = [] } = {}, owner = null) {
  if (marketInstant(at) === null || marketInstant(observedAt) === null || !text(version)
    || !Array.isArray(records) || records.length > 1000 || typeof owner?.readReviewedArticleVersion !== 'function'
    || typeof owner?.readExcerptRights !== 'function' || typeof owner?.readMarketQualification !== 'function') return reject('owner_or_scope_unavailable')
  const identities = [], reporting = [], seenVersions = new Set()
  try {
    for (const record of records) {
      if (!uuid(record?.id) || seenVersions.has(record.id) || !uuid(record.record_key)
        || !['market_identity', 'market_evidence_path'].includes(record.record_kind) || record.operation === 'delete') return reject('invalid_native_revision')
      seenVersions.add(record.id)
      const row = structuredClone(record.payload)
      if (row?.id !== record.record_key || row.recordVersionId !== record.id) return reject('revision_binding_mismatch')
      const qualification = owner.readMarketQualification(record.id)
      if (qualification?.recordVersionId !== record.id || qualification.reviewKind !== (record.record_kind === 'market_identity' ? 'identity_mapping' : 'supported_path')
        || !text(qualification.reviewRef) || !text(qualification.methodVersion)) continue
      row.methodVersion = qualification.methodVersion;row.reviewRef = qualification.reviewRef
      if (!Array.isArray(row.sourceBindings) || row.sourceBindings.length < 1 || row.sourceBindings.length > 32) return reject('source_binding_required')
      const bindings = row.sourceBindings.map(binding => resolveBinding(binding, owner, marketInstant(observedAt)))
      if (bindings.some(binding => !binding)) continue // pending, source report, revoked, mismatched or private
      row.sourceBindings = bindings
      if (record.record_kind === 'market_identity') identities.push(publicIdentity(row))
      else reporting.push(row)
    }
  } catch { return reject('owner_read_failed') }
  const instant = marketInstant(at), directory = new Map(), canonical = []
  for (const row of identities) {
    if (!validateIdentity(row, instant) || directory.has(row.id)) return reject('invalid_canonical_identity')
    directory.set(row.id, row); canonical.push(row)
  }
  const assets = []
  for (const row of canonical) {
    if (!['listing', 'cryptoasset'].includes(row.identityType)) continue
    const refs = [row]
    if (row.identityType === 'listing') {
      const issuer = directory.get(row.issuerId), shareClass = directory.get(row.shareClassId)
      if (issuer?.identityType !== 'issuer' || shareClass?.identityType !== 'share_class' || shareClass.issuerId !== issuer.id
        || row.id === issuer.id || row.id === shareClass.id || !/^[A-Z0-9]{4}$/.test(row.exchangeMic ?? '')) return reject('listing_identity_incomplete')
      refs.push(issuer, shareClass)
    } else {
      const network = directory.get(row.networkId)
      if (network?.identityType !== 'network' || row.id === network.id || !text(row.assetIdentifier)
        || !['native', 'contract'].includes(row.assetIdentifierKind)) return reject('crypto_identity_incomplete')
      refs.push(network)
    }
    const asset = { ...row, kind: row.identityType === 'listing' ? 'equity' : 'cryptoasset', releaseState: 'public', publiclyEligible: true,
      identityRefs: refs.map(ref => ({ id: ref.id, recordVersionId: ref.recordVersionId, identityType: ref.identityType,
        name: ref.name, methodVersion: ref.methodVersion, reviewRef: ref.reviewRef, sourceBindings: ref.sourceBindings })) }
    // Effective ticker aliases belong to the listing/network-qualified identity,
    // and require their own admitted source span inside this native revision.
    if (!Array.isArray(asset.aliases) || asset.aliases.some(alias => alias.recordVersionId !== asset.recordVersionId
      || !asset.sourceBindings.some(b => b.publicVersionId === alias.publicVersionId))) return reject('alias_admission_required')
    if (validateMarketAsset(asset, at).status !== 'ok') return reject('invalid_asset')
    assets.push(asset)
  }
  // Trading pairs remain separate retained identities and are never search assets.
  for (const pair of canonical.filter(row => row.identityType === 'trading_pair')) {
    if (directory.get(pair.baseAssetId)?.identityType !== 'cryptoasset' || directory.get(pair.quoteAssetId)?.identityType !== 'cryptoasset'
      || pair.baseAssetId === pair.quoteAssetId || !text(pair.venue)) return reject('invalid_trading_pair')
  }
  const admittedReporting = []
  for (const path of reporting) {
    const asset = assets.find(a => a.id === path.evidence?.asset?.id && a.recordVersionId === path.evidence.asset.recordVersionId)
    if (!asset) continue
    path.evidence.asset = asset
    if (typeof owner.readAssessment !== 'function') continue
    let assessmentsCurrent = true
    for (const assessment of path.evidence.assessments ?? []) {
      const native = owner.readAssessment(assessment.id)
      if (native?.id !== assessment.id || native.candidate_id !== assessment.candidateId || native.outcome !== 'supported'
        || native.stale !== false || !Array.isArray(native.superseded_by) || native.superseded_by.length
        || native.algorithm_version !== assessment.algorithmVersion || native.remaining_uncertainty !== assessment.uncertainty) {assessmentsCurrent=false;break}
      // The original native assessment stays private. Only this exact reviewed,
      // source-admitted path's permitted fact projection is public.
      assessment.releaseState='public';assessment.publiclyEligible=true
    }
    if (!assessmentsCurrent) continue
    for (const capture of path.evidence.captures ?? []) {
      const binding = path.sourceBindings.find(b => b.captureId === capture.id && b.payloadHash === capture.payloadHash && b.publicVersionId === capture.publicVersionId)
      if (binding) capture.rights = {displayExcerpt:true,recordVersionId:binding.rightsVersionId,attribution:binding.attribution}
      else capture.rights = null
    }
    if (marketInstant(path.evidence.at) !== instant || !text(path.methodVersion) || !text(path.reviewRef)
      || path.sourceBindings.some(b => b.eventId !== path.evidence.eventId)) continue
    const checked = validateMarketEvidencePath(path.evidence)
    if (checked.status !== 'ok' || checked.path.some(hop => hop.supports.some(support => !path.sourceBindings.some(binding =>
      binding.publicVersionId === support.publicVersionId && exactSpan(binding, support))))) continue
    admittedReporting.push({...pick(path,['id','recordVersionId','methodVersion','reviewRef','sourceBindings','relevance']),
      evidence:publicEvidence(path.evidence,asset,path.sourceBindings)})
  }
  const snapshot = { contract: MARKETS_DIRECTORY_CONTRACT, status: assets.length ? 'available' : 'unavailable',
    version, validAt: at, observedAt, identities: canonical, assets, reporting: admittedReporting }
  return assets.length ? { status: 'available', reason: null, snapshot } : reject('no_admitted_assets')
}

// Structural qualification of an owner-authenticated RPC response, not a public
// admission authority. All identities and exact source decisions must be bound.
export function validateMarketsPublicDirectory(snapshot) {
  try { return validateDirectory(snapshot) } catch { return reject('directory_invalid') }
}
function validateDirectory(snapshot) {
  if (new TextEncoder().encode(JSON.stringify(snapshot)).length>2097152) return reject('directory_scope_exceeded')
  if (snapshot?.contract !== MARKETS_DIRECTORY_CONTRACT || snapshot.status !== 'available'
    || !text(snapshot.version) || marketInstant(snapshot.validAt) === null || marketInstant(snapshot.observedAt) === null
    || !Array.isArray(snapshot.assets) || snapshot.assets.length < 1 || snapshot.assets.length > 200
    || !Array.isArray(snapshot.identities) || snapshot.identities.length > 1000 || !Array.isArray(snapshot.reporting) || snapshot.reporting.length > 200) return reject('directory_invalid')
  const at = marketInstant(snapshot.validAt), identities = new Map(), versionIds = new Set()
  for (const row of snapshot.identities) {
    if (!validateIdentity(row, at) || identities.has(row.id) || versionIds.has(row.recordVersionId)) return reject('canonical_revision_invalid')
    versionIds.add(row.recordVersionId)
    identities.set(row.id, row)
  }
  for (const row of identities.values()) {
    if (row.identityType === 'share_class' && (identities.get(row.issuerId)?.identityType !== 'issuer' || row.id === row.issuerId)) return reject('directory_invalid')
    if (row.identityType === 'trading_pair' && (identities.get(row.baseAssetId)?.identityType !== 'cryptoasset'
      || identities.get(row.quoteAssetId)?.identityType !== 'cryptoasset' || row.baseAssetId === row.quoteAssetId || !text(row.venue))) return reject('directory_invalid')
  }
  const ids = new Set()
  for (const asset of snapshot.assets) {
    const identity = identities.get(asset?.id)
    if (!identity || identity.recordVersionId !== asset.recordVersionId || ids.has(asset.id)
      || validateMarketAsset(asset, snapshot.validAt).status !== 'ok' || !Array.isArray(asset.identityRefs)) return reject('directory_invalid')
    ids.add(asset.id)
    if (identityKeys.some(key => JSON.stringify(asset[key]) !== JSON.stringify(identity[key]))) return reject('identity_payload_mismatch')
    const expected = asset.kind === 'equity' ? ['listing', 'issuer', 'share_class'] : ['cryptoasset', 'network']
    if (asset.identityType !== expected[0] || asset.identityRefs.length !== expected.length
      || expected.some(type => asset.identityRefs.filter(ref => ref.identityType === type).length !== 1)) return reject('directory_invalid')
    for (const ref of asset.identityRefs) {
      const canonical = identities.get(ref.id)
      if (!canonical || canonical.recordVersionId !== ref.recordVersionId || canonical.identityType !== ref.identityType
        || !Array.isArray(ref.sourceBindings) || JSON.stringify(ref.sourceBindings.map(b=>pick(b,bindingKeys))) !==
          JSON.stringify(canonical.sourceBindings.map(b=>pick(b,bindingKeys)))) return reject('identity_reference_invalid')
    }
    if (asset.kind === 'equity') {
      const issuer = identities.get(asset.issuerId), shareClass = identities.get(asset.shareClassId)
      if (issuer?.identityType !== 'issuer' || shareClass?.identityType !== 'share_class' || shareClass.issuerId !== issuer.id
        || !/^[A-Z0-9]{4}$/.test(asset.exchangeMic ?? '') || !asset.identityRefs.some(ref => ref.id === issuer.id) || !asset.identityRefs.some(ref => ref.id === shareClass.id)) return reject('directory_invalid')
    } else if (identities.get(asset.networkId)?.identityType !== 'network' || !['native', 'contract'].includes(asset.assetIdentifierKind)
      || !asset.identityRefs.some(ref => ref.id === asset.networkId)) return reject('directory_invalid')
    if (!Array.isArray(asset.aliases) || asset.aliases.some(alias => alias.recordVersionId !== asset.recordVersionId
      || !asset.sourceBindings?.some(binding => binding.publicVersionId === alias.publicVersionId))) return reject('directory_invalid')
  }
  // Invalidated paths are withheld without discarding still-admitted identities.
  const reporting = snapshot.reporting.filter(path => uuid(path?.id) && uuid(path.recordVersionId) && text(path.reviewRef)
    && text(path.methodVersion) && Array.isArray(path.sourceBindings) && path.sourceBindings.length > 0 && path.sourceBindings.every(publicBinding)
    && path.sourceBindings.every(b => b.eventId === path.evidence?.eventId)
    && validateMarketEvidencePath(path.evidence).status === 'ok'
    && path.evidence.asset.recordVersionId === snapshot.assets.find(a => a.id === path.evidence.asset.id)?.recordVersionId
    && marketInstant(path.evidence.at) === at && path.evidence.assessments.every(a => a.supports.every(s => {
      const capture = path.evidence.captures.find(c => c.id === s.captureId)
      return path.sourceBindings.some(b => b.publicVersionId === capture?.publicVersionId && b.rightsVersionId === capture?.rights?.recordVersionId
        && b.attribution === capture?.rights?.attribution && exactSpan(b, { ...s, payloadHash: capture?.payloadHash }))
    })))
  return { status: 'available', reason: null, snapshot: { ...pick(snapshot,['contract','status','version','validAt','observedAt']),
    identities: snapshot.identities.map(publicIdentity),
    assets: snapshot.assets.map(asset => ({...publicIdentity(asset),...pick(asset,['kind','releaseState','publiclyEligible']),
      identityRefs:asset.identityRefs.map(ref => pick(ref,['id','recordVersionId','identityType','name','methodVersion','reviewRef','sourceBindings']))})),
    reporting: reporting.map(path => ({...pick(path,['id','recordVersionId','methodVersion','reviewRef','sourceBindings','relevance']),
      evidence:publicEvidence(path.evidence,snapshot.assets.find(a => a.id === path.evidence.asset.id),path.sourceBindings)})) } }
}
