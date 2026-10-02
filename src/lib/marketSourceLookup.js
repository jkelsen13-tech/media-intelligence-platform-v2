import { marketInstant, validateMarketAsset } from '../../supabase/functions/_shared/marketsEvidenceContract.mjs'
import { buildMarketPriceContext } from './marketPriceContext.js'

export const MARKET_SOURCE_PROJECTION = 'mip-markets-authorized-directory-v1'
const text = value => typeof value === 'string' && value.trim() ? value : null
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
  return value
}

// This is a bounded reader of an already authorized projection supplied by the
// application's backend owner, not a directory, publication gate or provider.
// No public request JSON/flag is accepted as authority and no endpoint is added.
export function createMarketSourceLookup(snapshot = null) {
  const unavailable = reason => Object.freeze({ status: 'unavailable', reason,
    validAt: null, observedAt: null, version: null,
    search: () => ({ status: 'unavailable', reason, results: [] }),
    lookup: () => ({ status: 'unavailable', reason, model: null }),
  })
  if (!snapshot) return unavailable('directory_unavailable')
  if (snapshot.status !== 'available') return unavailable('directory_unavailable')
  if (snapshot.contract !== MARKET_SOURCE_PROJECTION || !text(snapshot.version)
    || marketInstant(snapshot.validAt) === null || marketInstant(snapshot.observedAt) === null
    || !Array.isArray(snapshot.assets) || snapshot.assets.length > 200
    || !Array.isArray(snapshot.reporting) || snapshot.reporting.length > 200) return unavailable('directory_invalid')
  let retained
  try { retained = JSON.parse(JSON.stringify(snapshot)) } catch { return unavailable('directory_invalid') }
  const assets = new Map()
  for (const input of retained.assets) {
    const qualified = validateMarketAsset(input, retained.validAt)
    if (qualified.status !== 'ok' || assets.has(qualified.asset.id)) return unavailable('directory_invalid')
    assets.set(qualified.asset.id, { input, qualified,
      identity: { ...qualified.asset, aliases: qualified.aliases },
    })
  }
  freeze(retained)
  const search = (query = '', { kind = null } = {}) => {
    if (typeof query !== 'string' || query.length > 120 || (kind !== null && !['equity', 'cryptoasset'].includes(kind))) {
      return { status: 'unavailable', reason: 'invalid_search', results: [] }
    }
    const needle = query.trim().toLocaleLowerCase('en-US')
    if (!needle) return { status: 'idle', reason: null, results: [] }
    const results = [...assets.values()].filter(({ identity }) => (!kind || identity.kind === kind)
      && [identity.name, ...identity.aliases.flatMap(alias => [alias.symbol, alias.namespace])]
        .some(value => value.toLocaleLowerCase('en-US').includes(needle)))
      .map(({ identity }) => identity).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    return freeze({ status: results.length ? 'matches' : 'unmapped', reason: null, results,
      requiresExplicitSelection: true })
  }
  const lookup = ({ id = null, kind = null, at = retained.validAt } = {}) => {
    const selected = assets.get(id)
    if (!selected || (kind !== null && selected.identity.kind !== kind)) return { status: 'unavailable', reason: 'asset_unmapped', model: null }
    if (marketInstant(at) === null) return { status: 'unavailable', reason: 'inspection_time_unavailable', model: null }
    // Evidence validators re-evaluate exact versions and half-open validity at
    // the selected clock. A retained current snapshot is not an as-known-then
    // reconstruction, and cannot supply evidence from another valid clock.
    const reporting = retained.reporting.filter(record => record?.evidence?.asset?.id === id
      && marketInstant(record.evidence.at) === marketInstant(at))
    const model = buildMarketPriceContext({ asset: selected.input, at, observationTime: retained.observedAt, reporting })
    return freeze({ status: model.status, reason: model.reason, model, directoryVersion: retained.version })
  }
  return Object.freeze({ status: 'available', reason: null, validAt: retained.validAt,
    observedAt: retained.observedAt, version: retained.version, search, lookup })
}
