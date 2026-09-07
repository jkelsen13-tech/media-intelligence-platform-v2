import { loadSpatialProjection, loadWorldViewGraph } from './spatialProjection.js'
import { loadTemporalAssessment } from './temporalAssessment.js'
import { loadEventTimeWeather } from './eventTimeWeather.js'

// Published spatial reads share the browser client; controlled spatial writes
// remain behind their separately authorized runtime boundary.
export function createSpatialBackend(supabaseClient = null) {
  const options = Object.freeze({ supabaseClient })
  return Object.freeze({
    loadSpatialProjection: () => loadSpatialProjection(options),
    loadWorldViewGraph: () => loadWorldViewGraph(options),
    loadTemporalAssessment: (canonicalEventId) => loadTemporalAssessment(canonicalEventId, options),
    loadEventTimeWeather: ({ row, atMs } = {}) => loadEventTimeWeather({ row, atMs }),
  })
}
