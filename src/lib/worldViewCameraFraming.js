// Camera-only coordination. A refresh of the same location must not undo
// manual navigation; a new selected location must survive renderer startup.
export function selectedCameraTarget(features) {
  const feature = features.find((item) => item.selected)
  const coordinate = feature?.positions?.[0]
  if (!coordinate || !Number.isFinite(coordinate[0]) || !Number.isFinite(coordinate[1])) return null
  const identity = feature.row?.mip_object_id ?? feature.row?.subject_graph_node_id
  if (!identity) return null
  const precisionClass = feature.row?.precision_class
  return {
    key: JSON.stringify([identity, coordinate[0], coordinate[1], precisionClass]),
    coordinate: [coordinate[0], coordinate[1]],
    precisionClass,
  }
}

export function createCameraFraming() {
  let target = null
  let framedKey = null
  return {
    select(features) {
      target = selectedCameraTarget(features)
      if (!target) framedKey = null
    },
    resetRenderer() { framedKey = null },
    apply(adapter, { force = false } = {}) {
      if (!target || (!force && target.key === framedKey)) return false
      const accepted = adapter?.flyToSubjectCamera?.({
        nextCoordinate: target.coordinate,
        nextPrecisionClass: target.precisionClass,
      })
      if (accepted) framedKey = target.key
      return Boolean(accepted)
    },
  }
}
