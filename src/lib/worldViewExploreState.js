import { parseCameraState, serializeCameraState } from './worldViewCameraState.js'

// Display-only, memory-only. Callers build timeToken from all canonical inspection
// time fields. This module never writes selection, Investigation Context or time.
function contextKey(token) {
  if (!token || typeof token !== 'object' || Array.isArray(token)) return null
  const keys = ['subjectKey', 'version', 'timeToken']
  if (!keys.every(key => Object.hasOwn(token, key))) return null
  const scalar = value => value === null || typeof value === 'string' ||
    (typeof value === 'number' && Number.isFinite(value))
  if (!keys.every(key => scalar(token[key]))) return null
  if (Object.hasOwn(token, 'investigationKey') && !scalar(token.investigationKey)) return null
  return JSON.stringify(keys.map(key => token[key]).concat(token.investigationKey ?? null))
}

function safeScrollPosition(value) {
  return Object.freeze({
    x: Number.isFinite(value?.x) ? value.x : 0,
    y: Number.isFinite(value?.y) ? value.y : 0,
  })
}

/** One transient Explore visit; repeated enter cannot replace its original view. */
export function createExploreSession() {
  let snapshot = null
  let changed = false
  return {
    enter({ cameraState, contextToken, scrollPosition, capturedAt = Date.now() } = {}) {
      if (snapshot) return snapshot
      const camera = parseCameraState(cameraState)
      const timestamp = typeof capturedAt === 'number' && Number.isFinite(capturedAt) ? capturedAt : null
      snapshot = Object.freeze({
        cameraState: camera ? serializeCameraState(camera) : null,
        contextKey: contextKey(contextToken),
        scrollPosition: safeScrollPosition(scrollPosition),
        capturedAt: timestamp,
      })
      changed = false
      return snapshot
    },
    observe(contextToken) {
      if (snapshot && contextKey(contextToken) !== snapshot.contextKey) changed = true
      return changed
    },
    exit({ contextToken, restoreCamera } = {}) {
      if (!snapshot) return Object.freeze({ restored: false, reason: 'inactive' })
      const previous = snapshot
      if (contextKey(contextToken) !== previous.contextKey) changed = true
      snapshot = null
      let reason = changed ? 'context-changed' :
        previous.contextKey === null ? 'invalid-context' :
          !previous.cameraState ? 'invalid-camera' : 'restore-unavailable'
      let restored = false
      if (reason === 'restore-unavailable' && typeof restoreCamera === 'function') {
        try {
          restored = restoreCamera(previous.cameraState) === true
          reason = restored ? 'restored' : 'restore-rejected'
        } catch {
          reason = 'restore-failed'
        }
      }
      changed = false
      return Object.freeze({ restored, reason, scrollPosition: previous.scrollPosition, capturedAt: previous.capturedAt })
    },
    getSnapshot: () => snapshot,
    clear() { snapshot = null; changed = false },
  }
}
