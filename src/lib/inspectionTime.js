// Exact inspection instants require an offset and a real Gregorian date.
// Preserve the supplied representation; spatial comparison still uses its existing millisecond clock.
export function parseInspectionInstant(value) {
  if (typeof value !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/i.exec(value)
  if (!m) return null
  const [year,month,day,hour,minute,second] = m.slice(1,7).map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31,leap ? 29 : 28,31,30,31,30,31,31,30,31,30,31]
  if (month < 1 || month > 12 || day < 1 || day > days[month-1]
    || hour > 23 || minute > 59 || second > 59) return null
  if (m[7].toUpperCase() !== 'Z') {
    const [h,min] = m[7].slice(1).split(':').map(Number)
    if (h > 23 || min > 59) return null
  }
  return Number.isFinite(Date.parse(value)) ? value : null
}
