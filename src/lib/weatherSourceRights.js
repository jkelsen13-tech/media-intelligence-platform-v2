// Source-specific review records, not a blanket approval of a provider's catalog.
// Data rights and hosted-service terms are separate. Unknown permission denies.
// This first slice covers event-time weather only; it does not authorize overlays.
function freezeDeep(value) {
  for (const item of Object.values(value)) {
    if (item && typeof item === 'object') freezeDeep(item)
  }
  return Object.freeze(value)
}

export const WEATHER_SOURCE_RIGHTS = freezeDeep({
  'open-meteo-archive-free-era5': {
    provider: 'Open-Meteo',
    product: 'Free hosted Historical Weather API / ERA5',
    endpoint: 'https://archive-api.open-meteo.com/v1/archive',
    review: {
      status: 'blocked',
      reviewedOn: '2026-09-07',
      reference: 'docs/NO_FEE_WORLD_VIEW_BACKFILL_2026-09-07.md',
      reason: 'source_terms_incompatible',
    },
    software: { license: null, copiedCode: false },
    data: {
      license: 'CC-BY-4.0',
      reference: 'https://open-meteo.com/en/licence',
      attributionRequired: true,
    },
    service: {
      reference: 'https://open-meteo.com/en/terms',
      noFee: true,
      commercialUse: false,
    },
    // No new fetch, retention, export or redistribution is authorized by this record.
    permissions: { display: false, analysis: false, retain: false, export: false, redistribute: false },
  },
  'nasa-power-hourly': {
    provider: 'NASA POWER',
    product: 'Hourly meteorology; exact parameters and upstream release not yet reviewed',
    review: { status: 'pending', reviewedOn: null, reference: null, reason: 'source_not_reviewed' },
    software: { license: null, copiedCode: false },
    data: { license: null, reference: null, attributionRequired: null },
    service: { reference: 'https://power.larc.nasa.gov/docs/services/api/temporal/hourly/', noFee: null, commercialUse: null },
    permissions: { display: null, analysis: null, retain: null, export: null, redistribute: null },
  },
  'noaa-ghcnh-hourly': {
    provider: 'NOAA NCEI',
    product: 'GHCNh hourly; exact station, release and route not yet reviewed',
    review: { status: 'pending', reviewedOn: null, reference: null, reason: 'source_not_reviewed' },
    software: { license: null, copiedCode: false },
    data: { license: null, reference: null, attributionRequired: null },
    service: { reference: 'https://www.ncei.noaa.gov/products/global-historical-climatology-network-hourly', noFee: null, commercialUse: null },
    permissions: { display: null, analysis: null, retain: null, export: null, redistribute: null },
  },
})

export function weatherSourcePermission(sourceId, action = 'display') {
  const source = typeof sourceId === 'string' && Object.hasOwn(WEATHER_SOURCE_RIGHTS, sourceId)
    ? WEATHER_SOURCE_RIGHTS[sourceId] : null
  if (!source) return Object.freeze({ allowed: false, reason: 'source_not_registered' })
  if (!Object.hasOwn(source.permissions, action)) {
    return Object.freeze({ allowed: false, reason: 'action_not_registered' })
  }
  if (source.review.status !== 'approved') {
    return Object.freeze({ allowed: false, reason: source.review.reason })
  }
  if (source.service.noFee !== true || source.service.commercialUse !== true) {
    return Object.freeze({ allowed: false, reason: 'source_terms_incompatible' })
  }
  return Object.freeze({
    allowed: source.permissions[action] === true,
    reason: source.permissions[action] === true ? null : 'permission_not_granted',
  })
}
