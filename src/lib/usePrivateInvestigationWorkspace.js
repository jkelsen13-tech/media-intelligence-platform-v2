import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { investigationWorkspacePanels } from './investigationWorkspaceClient.js'
import {
  captureReviewPayload,
  catalogRequestKey,
  createRequestGate,
  emptyPrivateWorkspaceState,
  mergeCatalogItems,
  readRequestKey,
  reviewRequestKey,
  statusFromSession,
  workspaceErrorCode,
} from './investigationWorkspaceSession.js'

export function usePrivateInvestigationWorkspace({
  userId = null,
  sessionLoading = false,
  client = null,
  active = false,
  randomUUID = () => globalThis.crypto?.randomUUID?.(),
  initialInvestigationId = null,
} = {}) {
  const [state, setState] = useState(emptyPrivateWorkspaceState)
  const stateRef = useRef(state)
  const userRef = useRef(userId)
  const catalogGate = useRef(createRequestGate())
  const readGate = useRef(createRequestGate())
  const reviewGate = useRef(createRequestGate())
  const mountedRef = useRef(true)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  const clearPrivateState = useCallback(() => {
    catalogGate.current.invalidate()
    readGate.current.invalidate()
    reviewGate.current.invalidate()
    const empty = emptyPrivateWorkspaceState()
    stateRef.current = empty
    if (mountedRef.current) setState(empty)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      catalogGate.current.invalidate()
      readGate.current.invalidate()
      reviewGate.current.invalidate()
    }
  }, [])

  useEffect(() => {
    if (userRef.current === userId) return
    userRef.current = userId
    clearPrivateState()
  }, [userId, clearPrivateState])

  const applyCatalog = useCallback((updater) => {
    setState((current) => {
      const next = updater(current)
      stateRef.current = next
      return next
    })
  }, [])

  const loadCatalog = useCallback(async ({ after = null, append = false, refresh = false } = {}) => {
    if (sessionLoading || !userId || !client) return
    const token = catalogGate.current.start(catalogRequestKey(userId, after))
    applyCatalog((current) => ({
      ...current,
      loadingCatalog: true,
      catalogError: refresh || !append ? null : current.catalogError,
      catalog: refresh ? [] : current.catalog,
      ...(refresh ? { nextAfter: null, hasMore: false } : {}),
    }))
    const result = await client.list(after ? { after, limit: 20 } : { limit: 20 })
    if (!mountedRef.current || !catalogGate.current.isCurrent(token) || userRef.current !== userId) {
      return { ignored: true }
    }
    const code = workspaceErrorCode(result.error)
    if (code) {
      applyCatalog((current) => ({
        ...current,
        loadingCatalog: false,
        catalogError: code,
        ...(code === 'authentication_required' || code === 'access_denied'
          ? { catalog: [], bundle: null, panels: null, beforeBundles: {}, pendingReview: null }
          : {}),
      }))
      return { ignored: false, error: code }
    }
    const page = result.data?.items ?? []
    applyCatalog((current) => ({
      ...current,
      loadingCatalog: false,
      catalogError: null,
      catalog: append ? mergeCatalogItems(current.catalog, page) : mergeCatalogItems([], page),
      hasMore: result.data?.has_more === true,
      nextAfter: result.data?.next_after ?? null,
    }))
    return { ignored: false, data: result.data }
  }, [applyCatalog, client, sessionLoading, userId])

  const loadBundle = useCallback(async (investigationId, versionId = null, { asBefore = false } = {}) => {
    if (sessionLoading || !userId || !client || !investigationId) return
    const token = readGate.current.start(readRequestKey(userId, investigationId, versionId))
    if (!asBefore) {
      applyCatalog((current) => ({
        ...current,
        selectedInvestigationId: investigationId,
        selectedVersionId: versionId,
        loadingBundle: true,
        bundleError: null,
        reviewConflict: false,
        inspector: null,
      }))
    }
    const result = await client.read(investigationId, versionId)
    if (!mountedRef.current || userRef.current !== userId) return { ignored: true }
    if (!asBefore && !readGate.current.isCurrent(token)) return { ignored: true }
    const code = workspaceErrorCode(result.error)
    if (code) {
      if (code === 'authentication_required') {
        clearPrivateState()
        applyCatalog((current) => ({ ...current, catalogError: code, bundleError: code }))
        return { ignored: false, error: code }
      }
      if (asBefore) return { ignored: false, error: code }
      applyCatalog((current) => ({
        ...current,
        loadingBundle: false,
        bundleError: code,
        bundle: null,
        panels: null,
        ...(code === 'access_denied' ? { pendingReview: null, beforeBundles: {} } : {}),
      }))
      return { ignored: false, error: code }
    }
    const mapped = investigationWorkspacePanels(result.data)
    if (!mapped) {
      if (asBefore) return { ignored: false, error: 'unsupported_contract' }
      applyCatalog((current) => ({
        ...current,
        loadingBundle: false,
        bundle: result.data,
        panels: null,
        bundleError: 'unsupported_contract',
      }))
      return { ignored: false, error: 'unsupported_contract' }
    }
    if (asBefore) {
      applyCatalog((current) => ({
        ...current,
        beforeBundles: { ...current.beforeBundles, [result.data.version.id]: result.data },
      }))
      return { ignored: false, data: result.data }
    }
    applyCatalog((current) => ({
      ...current,
      loadingBundle: false,
      bundle: result.data,
      panels: mapped,
      bundleError: null,
      selectedInvestigationId: result.data.investigation_id,
      selectedVersionId: versionId,
    }))
    return { ignored: false, data: result.data }
  }, [applyCatalog, clearPrivateState, client, sessionLoading, userId])

  useEffect(() => {
    if (sessionLoading) return
    if (!userId || !client) {
      if (!sessionLoading) clearPrivateState()
      return
    }
    if (!active) return
    loadCatalog({ refresh: true }).then((result) => {
      if (result?.ignored) return
      const current = stateRef.current
      const seed = current.selectedInvestigationId
        ?? initialInvestigationId
        ?? result?.data?.items?.[0]?.investigation_id
        ?? null
      if (seed) loadBundle(seed, current.selectedVersionId)
    })
  }, [active, userId, sessionLoading, client, loadCatalog, loadBundle, clearPrivateState, initialInvestigationId])

  const selectInvestigation = useCallback((investigationId) => {
    reviewGate.current.invalidate()
    applyCatalog((current) => ({
      ...current,
      pendingReview: null,
      reviewBusy: false,
      reviewError: null,
      reviewConflict: false,
      beforeBundles: {},
      inspector: null,
    }))
    return loadBundle(investigationId, null)
  }, [applyCatalog, loadBundle])

  const selectVersion = useCallback((investigationId, versionId) => {
    reviewGate.current.invalidate()
    applyCatalog((current) => ({
      ...current,
      pendingReview: null,
      reviewBusy: false,
      reviewError: null,
      reviewConflict: false,
    }))
    return loadBundle(investigationId, versionId)
  }, [applyCatalog, loadBundle])

  const markReviewed = useCallback(async () => {
    const current = stateRef.current
    if (!client || !userId || current.reviewBusy) return
    if (current.panels?.canMarkReviewed !== true) return
    if (current.pendingReview) return
    const payload = captureReviewPayload({
      investigationId: current.bundle?.investigation_id,
      versionId: current.bundle?.version?.id,
      previousReceiptId: current.bundle?.review?.id ?? null,
      receiptId: randomUUID(),
    })
    if (!payload) return
    const token = reviewGate.current.start(reviewRequestKey(userId, payload))
    applyCatalog((s) => ({ ...s, pendingReview: payload, reviewBusy: true, reviewError: null, reviewConflict: false }))
    const result = await client.markReviewed(payload)
    if (!mountedRef.current || userRef.current !== userId || !reviewGate.current.isCurrent(token)) {
      return { ignored: true }
    }
    const code = workspaceErrorCode(result.error)
    if (code === 'version_conflict') {
      applyCatalog((s) => ({ ...s, reviewBusy: false, reviewError: code, reviewConflict: true, pendingReview: null }))
      await loadBundle(payload.investigationId, null)
      return { ignored: false, error: code }
    }
    if (code) {
      applyCatalog((s) => ({ ...s, reviewBusy: false, reviewError: code }))
      return { ignored: false, error: code }
    }
    applyCatalog((s) => ({ ...s, reviewBusy: false, pendingReview: null, reviewError: null }))
    await loadBundle(payload.investigationId, current.selectedVersionId)
    await loadCatalog({ refresh: true })
    return { ignored: false, data: result.data }
  }, [applyCatalog, client, loadBundle, loadCatalog, randomUUID, userId])

  const retryReview = useCallback(async () => {
    const current = stateRef.current
    const payload = current.pendingReview
    if (!payload || !client || !userId || current.reviewBusy) return
    const token = reviewGate.current.start(reviewRequestKey(userId, payload))
    applyCatalog((s) => ({ ...s, reviewBusy: true, reviewError: null }))
    const result = await client.markReviewed(payload)
    if (!mountedRef.current || userRef.current !== userId || !reviewGate.current.isCurrent(token)) {
      return { ignored: true }
    }
    const code = workspaceErrorCode(result.error)
    if (code === 'version_conflict') {
      applyCatalog((s) => ({ ...s, reviewBusy: false, reviewError: code, reviewConflict: true, pendingReview: null }))
      await loadBundle(payload.investigationId, null)
      return { ignored: false, error: code }
    }
    if (code) {
      applyCatalog((s) => ({ ...s, reviewBusy: false, reviewError: code }))
      return { ignored: false, error: code }
    }
    applyCatalog((s) => ({ ...s, reviewBusy: false, pendingReview: null, reviewError: null }))
    await loadBundle(payload.investigationId, current.selectedVersionId)
    await loadCatalog({ refresh: true })
    return { ignored: false, data: result.data }
  }, [applyCatalog, client, loadBundle, loadCatalog, userId])

  const openBeforeVersion = useCallback((versionId) => {
    const current = stateRef.current
    if (!current.selectedInvestigationId || !versionId) return
    return loadBundle(current.selectedInvestigationId, versionId, { asBefore: true })
  }, [loadBundle])

  const setInspector = useCallback((inspector) => {
    applyCatalog((current) => ({ ...current, inspector }))
  }, [applyCatalog])

  const setActiveSection = useCallback((activeSection) => {
    applyCatalog((current) => ({ ...current, activeSection }))
  }, [applyCatalog])

  const status = useMemo(
    () => statusFromSession({ sessionLoading, userId, state }),
    [sessionLoading, userId, state],
  )

  return {
    state,
    status,
    userId,
    sessionLoading,
    actions: {
      loadCatalog,
      loadMore: () => loadCatalog({ after: state.nextAfter, append: true }),
      refresh: () => loadCatalog({ refresh: true }).then((result) => {
        const id = stateRef.current.selectedInvestigationId
        if (id) return loadBundle(id, stateRef.current.selectedVersionId)
        return result
      }),
      selectInvestigation,
      selectVersion,
      markReviewed,
      retryReview,
      openBeforeVersion,
      setInspector,
      setActiveSection,
      clearPrivateState,
    },
  }
}
