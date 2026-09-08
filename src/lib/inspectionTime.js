// Accept explicit-offset ISO and recorded PostgreSQL timestamp representations.
// Preserve the supplied text; only the display clock uses normalized milliseconds.
function normalizedInspectionInstant(value) {
  if (typeof value !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}(?::?\d{2})?)$/i.exec(value)
  if (!m) return null
  const [year,month,day,hour,minute,second] = m.slice(1,7).map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31,leap ? 29 : 28,31,30,31,30,31,31,30,31,30,31]
  if (month < 1 || month > 12 || day < 1 || day > days[month-1]
    || hour > 23 || minute > 59 || second > 59) return null
  let zone = m[8].toUpperCase()
  if (zone !== 'Z') {
    const digits = zone.slice(1).replace(':','')
    const hours = digits.slice(0,2), minutes = digits.slice(2) || '00'
    if (Number(hours) > 23 || Number(minutes) > 59) return null
    zone = zone[0] + hours + ':' + minutes
  }
  // Avoid engine-specific parsing of SQL spaces, short offsets and sub-ms digits.
  const fraction = m[7] ? '.' + m[7].slice(0,3) : ''
  return m[1]+'-'+m[2]+'-'+m[3]+'T'+m[4]+':'+m[5]+':'+m[6]+fraction+zone
}

export function inspectionInstantMilliseconds(value) {
  const normalized = normalizedInspectionInstant(value)
  if (normalized === null) return null
  const ms = Date.parse(normalized)
  return Number.isFinite(ms) ? ms : null
}

export function parseInspectionInstant(value) {
  return inspectionInstantMilliseconds(value) === null ? null : value
}
