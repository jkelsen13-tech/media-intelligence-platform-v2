// Only an absent setting uses the established default; malformed stored values fail closed.
export function comparisonProjectionConfig(rows) {
  if (!Array.isArray(rows)) throw new Error('invalid comparison configuration')
  if (rows.length === 0) return {groupFloor: 0.6}
  if (rows.length !== 1 || !rows[0] || rows[0].key !== 'claim_group_confidence_floor') {
    throw new Error('ambiguous comparison configuration')
  }
  const raw = rows[0].value
  const numeric = typeof raw === 'number' || (typeof raw === 'string' &&
    /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw.trim()))
  const floor = numeric ? Number(raw) : NaN
  if (!Number.isFinite(floor) || floor < 0 || floor > 1) {
    throw new Error('invalid claim group confidence floor')
  }
  return {groupFloor: floor}
}
