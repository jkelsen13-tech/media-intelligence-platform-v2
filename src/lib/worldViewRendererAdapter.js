/** Build a normalized camera state from a 2D/2.5D map camera snapshot. */
export function cameraStateFromMapCamera({ lng, lat, zoom, bearing = 0, pitch = 0 }, precisionClass) {
  const heightMeters = heightMetersFromMapZoom(zoom, lat)
  if (heightMeters === null) return null
  return makeCameraState(
    {
      lon: lng,
      lat,
      heightMeters,
      headingDegrees: bearing,
      pitchDegrees: -pitch,
      rollDegrees: 0,
    },
    precisionClass,
  )
}