import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { investigationWorkspacePanels } from './investigationWorkspaceClient.js'
import {
  bundleMatchesRequest,
  captureReviewPayload,
  catalogRequestKey,
  createKeyedRequestFamily,
  createRequestGate,
  displayedScopeKey,
  emptyPrivateWorkspaceState,
  historyRequestKey,
  mergeCatalogItems,
  readRequestKey,
  reviewRequestKey,
  statusFromSession,
  workspaceErrorCode,
} from './investigationWorkspaceSession.js'

function emptyPanelsState() {
  return {
    bundle: null,
    panels: null,
    beforeBundles: {},
    inspector: null,
    pendingReview: null,
    reviewBusy: false,
    reviewError: null,
    reviewConflict: false,
    loadingBundle: false,
    loadingBefore: false,
  }
}

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
  const historyFamily = useRef(createKeyedRequestFamily())
  const reviewGate = useRef(createRequestGate())
  const displayedScopeRef = useRef(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  const applyCatalog = useCallback((updater) => {
    setState((current) => {
      const next = updater(current)
      stateRef.current = next
      return next
    })
  }, [])

  const invalidateAllRequests = useCallback(() => {
    catalogGate.current.invalidate()
    readGate.current.invalidate()
    historyFamily.current.invalidate()
    reviewGate.current.invalidate()
    displayedScopeRef.current = null
  }, [])

  const clearPrivateState = useCallback(() => {
    invalidateAllRequests()
    const empty = emptyPrivateWorkspaceState()
    stateRef.current = empty
    if (mountedRef.current) setState(empty)
  }, [invalidateAllRequests])

  const applyAccessFailure = useCallback((code, { investigationId } = {}) => {
    if (code === 'authentication_required') {
      invalidateAllRequests()
      const next = {
        ...emptyPrivateWorkspaceState(),
        catalogError: code,
        bundleError: code,
      }
      stateRef.current = next
      if (mountedRef.current) setState(next)
      return true
    }
    if (code === 'access_denied') {
      readGate.current.invalidate()
      historyFamily.current.invalidate()
      reviewGate.current.invalidate()
      displayedScopeRef.current = null
      applyCatalog((current) => {
        const deniedId = investigationId ?? current.selectedInvestigationId
        return {
          ...current,
          catalog: deniedId
            ? current.catalog.filter((item) => item.investigation_id !== deniedId)
            : current.catalog,
          selectedInvestigationId: deniedId,
          selectedVersionId: null,
          ...emptyPanelsState(),
          bundleError: code,
        }
      })
      return true
    }
    return false
  }, [applyCatalog, invalidateAllRequests])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      invalidateAllRequests()
    }
  }, [invalidateAllRequests])

  useEffect(() => {
    if (userRef.current === userId) return
    userRef.current = userId
    clearPrivateState()
  }, [userId, clearPrivateState])

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
    if (!mountedRef.current || userRef.current !== userId) {
      return { ignored: true }
    }
    const code = workspaceErrorCode(result.error)
    if (code === 'authentication_required') {
      applyAccessFailure(code)
      return { ignored: false, error: code }
    }
    if (!catalogGate.current.isCurrent(token)) {
      return { ignored: true }
    }
    if (code === 'access_denied') {
      applyAccessFailure(code)
      return { ignored: false, error: code }
    }
    if (code) {
      applyCatalog((current) => ({
        ...current,
        loadingCatalog: false,
        catalogError: code,
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
  }, [applyAccessFailure, applyCatalog, client, sessionLoading, userId])

  const loadBundle = useCallback(async (investigationId, versionId = null, options = {}) => {
    const {
      asBefore = false,
      preserveReviewConflict = false,
    } = options
    if (sessionLoading || !userId || !client || !investigationId) return
    const current = stateRef.current
    const displayedInvestigationId = asBefore ? current.selectedInvestigationId : investigationId
    const displayedVersionId = asBefore ? current.selectedVersionId : versionId
    let displayedToken = null
    let historyToken = null

    if (asBefore) {
      historyToken = historyFamily.current.start(
        historyRequestKey(userId, displayedInvestigationId, displayedVersionId, versionId),
      )
      applyCatalog((s) => ({ ...s, loadingBefore: true }))
    } else {
      const nextScope = displayedScopeKey(userId, investigationId, versionId)
      if (displayedScopeRef.current !== nextScope) {
        historyFamily.current.invalidate()
        displayedScopeRef.current = nextScope
      }
      displayedToken = readGate.current.start(readRequestKey(userId, investigationId, versionId))
      applyCatalog((s) => ({
        ...s,
        selectedInvestigationId: investigationId,
        selectedVersionId: versionId,
        loadingBundle: true,
        bundleError: preserveReviewConflict ? s.bundleError : null,
        reviewConflict: preserveReviewConflict ? s.reviewConflict : false,
        reviewError: preserveReviewConflict ? s.reviewError : null,
        inspector: preserveReviewConflict ? s.inspector : null,
        beforeBundles: {},
        loadingBefore: false,
      }))
    }

    const result = await client.read(investigationId, versionId)
    if (!mountedRef.current || userRef.current !== userId) return { ignored: true }

    const code = workspaceErrorCode(result.error)
    if (code === 'authentication_required') {
      applyAccessFailure(code, { investigationId })
      return { ignored: false, error: code }
    }

    if (asBefore) {
      if (!historyFamily.current.isCurrent(historyToken)) return { ignored: true }
    } else if (!readGate.current.isCurrent(displayedToken)) {
      return { ignored: true }
    }

    if (code === 'access_denied') {
      applyAccessFailure(code, { investigationId })
      return { ignored: false, error: code }
    }
    if (code) {
      if (asBefore) {
        applyCatalog((s) => ({ ...s, loadingBefore: false }))
        return { ignored: false, error: code }
      }
      applyCatalog((s) => ({
        ...s,
        loadingBundle: false,
        bundleError: code,
        bundle: null,
        panels: null,
      }))
      return { ignored: false, error: code }
    }

    if (!bundleMatchesRequest(result.data, investigationId, versionId)) {
      if (asBefore) {
        applyCatalog((s) => ({ ...s, loadingBefore: false }))
      }
      return { ignored: true, error: 'identity_mismatch' }
    }

    const mapped = investigationWorkspacePanels(result.data)
    if (!mapped) {
      if (asBefore) {
        applyCatalog((s) => ({ ...s, loadingBefore: false }))
        return { ignored: false, error: 'unsupported_contract' }
      }
      applyCatalog((s) => ({
        ...s,
        loadingBundle: false,
        bundle: result.data,
        panels: null,
        bundleError: 'unsupported_contract',
      }))
      return { ignored: false, error: 'unsupported_contract' }
    }

    if (asBefore) {
      applyCatalog((s) => ({
        ...s,
        loadingBefore: false,
        beforeBundles: { ...s.beforeBundles, [result.data.version.id]: result.data },
      }))
      return { ignored: false, data: result.data }
    }

    applyCatalog((s) => ({
      ...s,
      loadingBundle: false,
      bundle: result.data,
      panels: mapped,
      bundleError: null,
      selectedInvestigationId: result.data.investigation_id,
      selectedVersionId: versionId,
      reviewConflict: preserveReviewConflict ? s.reviewConflict : false,
      reviewError: preserveReviewConflict ? s.reviewError : null,
    }))
    return { ignored: false, data: result.data }
  }, [applyAccessFailure, applyCatalog, client, sessionLoading, userId])

  useEffect(() => {
    if (sessionLoading) return
    if (!userId || !client) {
      clearPrivateState()
      return
    }
    if (!active) return
    loadCatalog({ refresh: true }).then((result) => {
      if (result?.ignored || result?.error) return
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
    historyFamily.current.invalidate()
    applyCatalog((current) => ({
      ...current,
      pendingReview: null,
      reviewBusy: false,
      reviewError: null,
      reviewConflict: false,
      bundle: null,
      panels: null,
      beforeBundles: {},
      inspector: null,
      selectedInvestigationId: investigationId,
      selectedVersionId: null,
    }))
    return loadBundle(investigationId, null)
  }, [applyCatalog, loadBundle])

  const selectVersion = useCallback((investigationId, versionId) => {
    reviewGate.current.invalidate()
    historyFamily.current.invalidate()
    applyCatalog((current) => ({
      ...current,
      pendingReview: null,
      reviewBusy: false,
      reviewError: null,
      reviewConflict: false,
      bundle: null,
      panels: null,
      beforeBundles: {},
      inspector: null,
    }))
    return loadBundle(investigationId, versionId)
  }, [applyCatalog, loadBundle])

  const finishReviewRequest = useCallback(async (payload, result, token) => {
    if (!mountedRef.current || userRef.current !== userId) {
      return { ignored: true }
    }
    const code = workspaceErrorCode(result.error)
    if (code === 'authentication_required') {
      applyAccessFailure(code, { investigationId: payload.investigationId })
      return { ignored: false, error: code }
    }
    if (!reviewGate.current.isCurrent(token)) {
      return { ignored: true }
    }
    if (code === 'access_denied') {
      applyAccessFailure(code, { investigationId: payload.investigationId })
      return { ignored: false, error: code }
    }
    if (code === 'version_conflict') {
      applyCatalog((s) => ({
        ...s,
        reviewBusy: false,
        reviewError: code,
        reviewConflict: true,
        pendingReview: null,
      }))
      await loadBundle(payload.investigationId, null, { preserveReviewConflict: true })
      return { ignored: false, error: code }
    }
    if (code) {
      applyCatalog((s) => ({ ...s, reviewBusy: false, reviewError: code }))
      return { ignored: false, error: code }
    }
    applyCatalog((s) => ({
      ...s,
      reviewBusy: false,
      pendingReview: null,
      reviewError: null,
      reviewConflict: false,
    }))
    await loadBundle(payload.investigationId, stateRef.current.selectedVersionId)
    await loadCatalog({ refresh: true })
    return { ignored: false, data: result.data }
  }, [applyAccessFailure, applyCatalog, loadBundle, loadCatalog, userId])

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
    applyCatalog((s) => ({
      ...s,
      pendingReview: payload,
      reviewBusy: true,
      reviewError: null,
      reviewConflict: false,
    }))
    const result = await client.markReviewed(payload)
    return finishReviewRequest(payload, result, token)
  }, [applyCatalog, client, finishReviewRequest, randomUUID, userId])

  const retryReview = useCallback(async () => {
    const current = stateRef.current
    const payload = current.pendingReview
    if (!payload || !client || !userId || current.reviewBusy) return
    const token = reviewGate.current.start(reviewRequestKey(userId, payload))
    applyCatalog((s) => ({ ...s, reviewBusy: true, reviewError: null }))
    const result = await client.markReviewed(payload)
    return finishReviewRequest(payload, result, token)
  }, [applyCatalog, client, finishReviewRequest, userId])

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
        const current = stateRef.current
        if (current.selectedInvestigationId) {
          return loadBundle(current.selectedInvestigationId, current.selectedVersionId, {
            preserveReviewConflict: current.reviewConflict === true,
          })
        }
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
