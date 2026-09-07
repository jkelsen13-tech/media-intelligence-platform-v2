import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { investigationEvidenceCheckPanels } from './investigationEvidenceChecksClient.js'
import { investigationEvidenceReviewPanels } from './investigationEvidenceReviewsClient.js'
import { investigationWorkspacePanels } from './investigationWorkspaceClient.js'
import {
  emptyReviewsState,
  freezeReviewDecisionPayload,
  historyMatchesRequest,
  inspectorOwnsReviewHistory,
  isTerminalReviewAccessError,
  mergeHistoryEvents,
  receiptMatchesDecision,
  reviewDecisionContextMatches,
  reviewDecisionRequestKey,
  reviewHistoryRefreshBlocked,
  reviewHistoryRequestKey,
  reviewSubmissionBlockReason,
  reviewsRequestKey,
  reviewTargetKey,
  selectedEvidenceFromDraft,
} from './investigationEvidenceReviewUi.js'
import {
  bundleMatchesRequest,
  captureReviewPayload,
  catalogRequestKey,
  checksRequestKey,
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
  workspaceReviewReceiptMatches,
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
    checks: null,
    checksPanels: null,
    checksError: null,
    checksBusy: false,
    loadingChecks: false,
    pendingChecksRun: null,
    ...emptyReviewsState(),
  }
}

function checksIdentityMatches(data, investigationId, versionId, observationId) {
  return data?.investigation_id === investigationId
    && data?.version_id === versionId
    && data?.observation_id === observationId
}

function bundleMatchesChecksIdentity(bundle, investigationId, versionId, observationId) {
  return Boolean(bundle)
    && bundle.investigation_id === investigationId
    && bundle.version?.id === versionId
    && bundle.observation?.id === observationId
}

function reviewsIdentityMatches(data, investigationId, versionId, observationId, reportId) {
  return data?.investigation_id === investigationId
    && data?.version_id === versionId
    && data?.observation_id === observationId
    && data?.report_id === reportId
}

export function usePrivateInvestigationWorkspace({
  userId = null,
  sessionLoading = false,
  client = null,
  checksClient = null,
  reviewsClient = null,
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
  const checksGate = useRef(createRequestGate())
  const reviewsGate = useRef(createRequestGate())
  const reviewsDecideGate = useRef(createRequestGate())
  const reviewHistoryFamily = useRef(createKeyedRequestFamily())
  const displayedScopeRef = useRef(null)
  const inspectEpochRef = useRef(0)
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
    checksGate.current.invalidate()
    reviewsGate.current.invalidate()
    reviewsDecideGate.current.invalidate()
    reviewHistoryFamily.current.invalidate()
    inspectEpochRef.current += 1
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
      checksGate.current.invalidate()
      reviewsGate.current.invalidate()
      reviewsDecideGate.current.invalidate()
      reviewHistoryFamily.current.invalidate()
      inspectEpochRef.current += 1
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

  const publishReviews = useCallback((bundle, checks, reviews, extra = {}) => {
    const keepPending = extra.clearPending === false
    const mapped = investigationEvidenceReviewPanels(bundle, checks, reviews)
    if (!mapped) {
      applyCatalog((s) => ({
        ...s,
        loadingReviews: extra.markLoading === false ? s.loadingReviews : false,
        reviewsBusy: extra.keepBusy === true || keepPending ? s.reviewsBusy : false,
        reviews: extra.replace === false ? s.reviews : null,
        reviewsPanels: extra.replace === false ? s.reviewsPanels : null,
        reviewsError: 'unsupported_contract',
        pendingReviewDecision: keepPending ? s.pendingReviewDecision : null,
        decisionSavedNeedsRefresh: extra.savedNeedsRefresh === true,
      }))
      return { ignored: false, error: 'unsupported_contract' }
    }
    applyCatalog((s) => ({
      ...s,
      loadingReviews: extra.markLoading === false ? s.loadingReviews : false,
      reviewsBusy: extra.keepBusy === true || keepPending ? s.reviewsBusy : false,
      reviews,
      reviewsPanels: mapped,
      reviewsError: extra.keepError === true ? s.reviewsError : null,
      pendingReviewDecision: keepPending ? s.pendingReviewDecision : null,
      decisionSavedNeedsRefresh: extra.savedNeedsRefresh === true
        ? false
        : extra.keepSavedRefresh === true
          ? s.decisionSavedNeedsRefresh
          : s.decisionSavedNeedsRefresh && extra.keepSavedRefresh === true,
      reviewsConflict: extra.keepConflict === true ? s.reviewsConflict : false,
      ...(extra.savedNeedsRefresh === true ? {} : extra.clearSavedRefresh === true ? { decisionSavedNeedsRefresh: false } : {}),
    }))
    return { ignored: false, data: reviews }
  }, [applyCatalog])

  const readReviewsForAccepted = useCallback(async (bundle, checks, extra = {}) => {
    if (sessionLoading || !userId || !reviewsClient) return { ignored: true }
    if (!bundle?.investigation_id || !bundle.version?.id || !bundle.observation?.id) return { ignored: true }
    if (checks?.status !== 'saved' || !checks.report?.id) {
      applyCatalog((s) => ({
        ...s,
        ...emptyReviewsState(),
        pendingReviewDecision: extra.clearPending === false ? s.pendingReviewDecision : null,
      }))
      return { ignored: true }
    }
    const investigationId = bundle.investigation_id
    const versionId = bundle.version.id
    const observationId = bundle.observation.id
    const reportId = checks.report.id
    const token = reviewsGate.current.start(
      reviewsRequestKey(userId, investigationId, versionId, observationId, reportId, extra.action ?? 'read'),
    )
    applyCatalog((s) => ({
      ...s,
      loadingReviews: extra.markLoading === false ? s.loadingReviews : true,
      reviewsError: extra.preserveError || extra.markLoading === false ? s.reviewsError : null,
      ...(extra.replace === false ? {} : {
        reviews: null,
        reviewsPanels: null,
      }),
      decisionSavedNeedsRefresh: extra.keepSavedRefresh === true || extra.markLoading === false
        ? s.decisionSavedNeedsRefresh
        : false,
      pendingReviewDecision: extra.clearPending === false ? s.pendingReviewDecision : s.pendingReviewDecision,
      reviewsBusy: extra.keepBusy === true || extra.clearPending === false ? s.reviewsBusy : s.reviewsBusy,
    }))
    const result = await reviewsClient.read(investigationId, versionId, reportId)
    if (!mountedRef.current || userRef.current !== userId) return { ignored: true }
    const code = workspaceErrorCode(result.error)
    const keepPending = extra.clearPending === false
    const keepBusy = extra.keepBusy === true || keepPending
    if (code === 'authentication_required') {
      applyAccessFailure(code, { investigationId })
      return { ignored: false, error: code }
    }
    if (!reviewsGate.current.isCurrent(token)) return { ignored: true }
    if (code === 'access_denied') {
      applyAccessFailure(code, { investigationId })
      return { ignored: false, error: code }
    }
    if (code) {
      applyCatalog((s) => ({
        ...s,
        loadingReviews: extra.markLoading === false ? s.loadingReviews : false,
        reviewsBusy: keepBusy ? s.reviewsBusy : false,
        reviewsError: code,
        reviews: extra.replace === false ? s.reviews : null,
        reviewsPanels: extra.replace === false ? s.reviewsPanels : null,
        decisionSavedNeedsRefresh: extra.savedNeedsRefresh === true
          ? true
          : extra.keepSavedRefresh === true
            ? s.decisionSavedNeedsRefresh
            : false,
        pendingReviewDecision: keepPending || extra.savedNeedsRefresh !== true ? s.pendingReviewDecision : null,
      }))
      return { ignored: false, error: code }
    }
    if (!reviewsIdentityMatches(result.data, investigationId, versionId, observationId, reportId)) {
      applyCatalog((s) => ({
        ...s,
        loadingReviews: extra.markLoading === false ? s.loadingReviews : false,
        reviewsBusy: keepBusy ? s.reviewsBusy : false,
        reviews: extra.replace === false ? s.reviews : null,
        reviewsPanels: extra.replace === false ? s.reviewsPanels : null,
        reviewsError: 'identity_mismatch',
        decisionSavedNeedsRefresh: extra.savedNeedsRefresh === true
          ? true
          : extra.keepSavedRefresh === true
            ? s.decisionSavedNeedsRefresh
            : false,
        pendingReviewDecision: keepPending || extra.savedNeedsRefresh !== true ? s.pendingReviewDecision : null,
      }))
      return { ignored: false, error: 'identity_mismatch' }
    }
    const current = stateRef.current
    const publishBundle = bundleMatchesChecksIdentity(current.bundle, investigationId, versionId, observationId)
      ? current.bundle
      : bundle
    const publishChecks = current.checks?.report?.id === reportId ? current.checks : checks
    return publishReviews(publishBundle, publishChecks, result.data, extra)
  }, [applyAccessFailure, applyCatalog, publishReviews, reviewsClient, sessionLoading, userId])

  const publishChecks = useCallback((bundle, checks, extra = {}) => {
    const mapped = investigationEvidenceCheckPanels(bundle, checks)
    if (!mapped) {
      applyCatalog((s) => ({
        ...s,
        loadingChecks: false,
        checksBusy: false,
        checks: null,
        checksPanels: null,
        checksError: 'unsupported_contract',
        pendingChecksRun: extra.clearPending === false ? s.pendingChecksRun : null,
        ...emptyReviewsState(),
      }))
      return { ignored: false, error: 'unsupported_contract' }
    }
    applyCatalog((s) => ({
      ...s,
      loadingChecks: false,
      checksBusy: false,
      checks,
      checksPanels: mapped,
      checksError: null,
      pendingChecksRun: extra.clearPending === false ? s.pendingChecksRun : null,
      ...(mapped.status === 'saved' ? {} : emptyReviewsState()),
    }))
    return { ignored: false, data: checks, mapped }
  }, [applyCatalog])

  const readChecksForBundle = useCallback(async (bundle) => {
    if (sessionLoading || !userId || !checksClient || !bundle?.investigation_id || !bundle.version?.id || !bundle.observation?.id) {
      return { ignored: true }
    }
    const investigationId = bundle.investigation_id
    const versionId = bundle.version.id
    const observationId = bundle.observation.id
    const token = checksGate.current.start(checksRequestKey(userId, investigationId, versionId, observationId, 'read'))
    applyCatalog((s) => ({
      ...s,
      loadingChecks: true,
      checksBusy: false,
      checksError: null,
      checks: null,
      checksPanels: null,
      pendingChecksRun: null,
      ...emptyReviewsState(),
    }))
    const result = await checksClient.read(investigationId, versionId)
    if (!mountedRef.current || userRef.current !== userId) return { ignored: true }
    const code = workspaceErrorCode(result.error)
    if (code === 'authentication_required') {
      applyAccessFailure(code, { investigationId })
      return { ignored: false, error: code }
    }
    if (!checksGate.current.isCurrent(token)) return { ignored: true }
    if (code === 'access_denied') {
      applyAccessFailure(code, { investigationId })
      return { ignored: false, error: code }
    }
    if (code) {
      applyCatalog((s) => ({
        ...s,
        loadingChecks: false,
        checksBusy: false,
        checksError: code,
        checks: null,
        checksPanels: null,
        ...emptyReviewsState(),
      }))
      return { ignored: false, error: code }
    }
    if (!checksIdentityMatches(result.data, investigationId, versionId, observationId)) {
      applyCatalog((s) => ({
        ...s,
        loadingChecks: false,
        checksBusy: false,
        checks: null,
        checksPanels: null,
        checksError: 'identity_mismatch',
        pendingChecksRun: null,
        ...emptyReviewsState(),
      }))
      return { ignored: false, error: 'identity_mismatch' }
    }
    const current = stateRef.current
    const publishBundle = bundleMatchesChecksIdentity(current.bundle, investigationId, versionId, observationId)
      ? current.bundle
      : bundle
    const published = publishChecks(publishBundle, result.data)
    if (published.error || result.data?.status !== 'saved') return published
    await readReviewsForAccepted(publishBundle, result.data)
    return published
  }, [applyAccessFailure, applyCatalog, checksClient, publishChecks, readReviewsForAccepted, sessionLoading, userId])

  const loadBundle = useCallback(async (investigationId, versionId = null, options = {}) => {
    const {
      asBefore = false,
      preserveReviewConflict = false,
    } = options
    if (sessionLoading || !userId || !client || !investigationId) return
    const current = stateRef.current
    const displayedInvestigationId = asBefore ? current.selectedInvestigationId : investigationId
    const displayedVersionId = asBefore
      ? (current.bundle?.version?.id ?? null)
      : versionId
    let displayedToken = null
    let historyToken = null

    if (asBefore) {
      historyToken = historyFamily.current.start(
        historyRequestKey(userId, displayedInvestigationId, displayedVersionId, versionId),
      )
      applyCatalog((s) => ({ ...s, loadingBefore: true }))
    } else {
      inspectEpochRef.current += 1
      historyFamily.current.invalidate()
      checksGate.current.invalidate()
      reviewsGate.current.invalidate()
      reviewsDecideGate.current.invalidate()
      reviewHistoryFamily.current.invalidate()
      displayedScopeRef.current = displayedScopeKey(userId, investigationId, versionId)
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
        checks: null,
        checksPanels: null,
        checksError: null,
        checksBusy: false,
        loadingChecks: false,
        pendingChecksRun: null,
        ...emptyReviewsState(),
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
        checks: null,
        checksPanels: null,
        loadingChecks: false,
        checksBusy: false,
        ...emptyReviewsState(),
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
    await readChecksForBundle(result.data)
    return { ignored: false, data: result.data }
  }, [applyAccessFailure, applyCatalog, client, readChecksForBundle, sessionLoading, userId])

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
    checksGate.current.invalidate()
    reviewsGate.current.invalidate()
    reviewsDecideGate.current.invalidate()
    reviewHistoryFamily.current.invalidate()
    inspectEpochRef.current += 1
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
      checks: null,
      checksPanels: null,
      checksError: null,
      checksBusy: false,
      loadingChecks: false,
      pendingChecksRun: null,
      ...emptyReviewsState(),
    }))
    return loadBundle(investigationId, null)
  }, [applyCatalog, loadBundle])

  const selectVersion = useCallback((investigationId, versionId) => {
    reviewGate.current.invalidate()
    historyFamily.current.invalidate()
    checksGate.current.invalidate()
    reviewsGate.current.invalidate()
    reviewsDecideGate.current.invalidate()
    reviewHistoryFamily.current.invalidate()
    inspectEpochRef.current += 1
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
      checks: null,
      checksPanels: null,
      checksError: null,
      checksBusy: false,
      loadingChecks: false,
      pendingChecksRun: null,
      ...emptyReviewsState(),
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
    if (!workspaceReviewReceiptMatches(payload, result.data)) {
      applyCatalog((s) => ({ ...s, reviewBusy: false, reviewError: 'identity_mismatch' }))
      return { ignored: false, error: 'identity_mismatch' }
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

  const finishChecksRequest = useCallback(async (payload, result, token) => {
    if (!mountedRef.current || userRef.current !== userId) return { ignored: true }
    const code = workspaceErrorCode(result.error)
    if (code === 'authentication_required') {
      applyAccessFailure(code, { investigationId: payload.investigationId })
      return { ignored: false, error: code }
    }
    if (!checksGate.current.isCurrent(token)) return { ignored: true }
    if (code === 'access_denied') {
      applyAccessFailure(code, { investigationId: payload.investigationId })
      return { ignored: false, error: code }
    }
    if (code) {
      applyCatalog((s) => ({
        ...s,
        loadingChecks: false,
        checksBusy: false,
        checksError: code,
      }))
      return { ignored: false, error: code }
    }
    if (!checksIdentityMatches(result.data, payload.investigationId, payload.versionId, payload.observationId)) {
      applyCatalog((s) => ({
        ...s,
        loadingChecks: false,
        checksBusy: false,
        checksError: 'identity_mismatch',
      }))
      return { ignored: false, error: 'identity_mismatch' }
    }
    const current = stateRef.current
    const publishBundle = bundleMatchesChecksIdentity(
      current.bundle,
      payload.investigationId,
      payload.versionId,
      payload.observationId,
    ) ? current.bundle : null
    if (!publishBundle) {
      applyCatalog((s) => ({
        ...s,
        loadingChecks: false,
        checksBusy: false,
        checksError: 'identity_mismatch',
      }))
      return { ignored: false, error: 'identity_mismatch' }
    }
    const published = publishChecks(publishBundle, result.data)
    if (published.error || result.data?.status !== 'saved') return published
    await readReviewsForAccepted(publishBundle, result.data)
    return published
  }, [applyAccessFailure, applyCatalog, publishChecks, readReviewsForAccepted, userId])

  const runEvidenceChecks = useCallback(async () => {
    const current = stateRef.current
    if (!checksClient || !userId || current.checksBusy || current.loadingChecks) return
    if (current.pendingChecksRun) return
    if (current.checksPanels?.canRun !== true) return
    const bundle = current.bundle
    if (!bundle?.investigation_id || !bundle.version?.id || !bundle.observation?.id) return
    const payload = {
      investigationId: bundle.investigation_id,
      versionId: bundle.version.id,
      observationId: bundle.observation.id,
    }
    const token = checksGate.current.start(
      checksRequestKey(userId, payload.investigationId, payload.versionId, payload.observationId, 'run'),
    )
    applyCatalog((s) => ({
      ...s,
      checksBusy: true,
      checksError: null,
      pendingChecksRun: payload,
    }))
    const result = await checksClient.run(payload.investigationId, payload.versionId)
    return finishChecksRequest(payload, result, token)
  }, [applyCatalog, checksClient, finishChecksRequest, userId])

  const retryChecks = useCallback(async () => {
    const current = stateRef.current
    if (!checksClient || !userId || current.checksBusy || current.loadingChecks) return
    if (current.pendingChecksRun) {
      const payload = current.pendingChecksRun
      const token = checksGate.current.start(
        checksRequestKey(userId, payload.investigationId, payload.versionId, payload.observationId, 'run'),
      )
      applyCatalog((s) => ({ ...s, checksBusy: true, checksError: null }))
      const result = await checksClient.run(payload.investigationId, payload.versionId)
      return finishChecksRequest(payload, result, token)
    }
    if (current.bundle) return readChecksForBundle(current.bundle)
  }, [applyCatalog, checksClient, finishChecksRequest, readChecksForBundle, userId])

  const finishDecisionRequest = useCallback(async (payload, result, token, extra = {}) => {
    if (!mountedRef.current || userRef.current !== userId) return { ignored: true }
    const current = stateRef.current
    const code = workspaceErrorCode(result.error)
    if (code === 'authentication_required') {
      applyAccessFailure(code, { investigationId: payload.investigation_id })
      return { ignored: false, error: code }
    }
    if (!reviewsDecideGate.current.isCurrent(token)) return { ignored: true }
    if (code === 'access_denied') {
      applyAccessFailure(code, { investigationId: payload.investigation_id })
      return { ignored: false, error: code }
    }
    if (code === 'version_conflict') {
      applyCatalog((s) => ({
        ...s,
        reviewsBusy: false,
        reviewsError: code,
        reviewsConflict: true,
        pendingReviewDecision: null,
      }))
      if (current.bundle && current.checks) {
        await readReviewsForAccepted(current.bundle, current.checks, {
          replace: false,
          keepConflict: true,
          preserveError: true,
          clearPending: true,
        })
      }
      return { ignored: false, error: code }
    }
    if (code === 'invalid_request') {
      applyCatalog((s) => ({
        ...s,
        reviewsBusy: false,
        reviewsError: code,
        pendingReviewDecision: null,
      }))
      return { ignored: false, error: code }
    }
    if (code) {
      applyCatalog((s) => ({
        ...s,
        reviewsBusy: false,
        reviewsError: code,
      }))
      return { ignored: false, error: code }
    }
    const publishBundle = bundleMatchesChecksIdentity(
      current.bundle,
      payload.investigation_id,
      payload.version_id,
      current.bundle?.observation?.id,
    ) ? current.bundle : null
    if (!publishBundle || current.checks?.report?.id !== payload.report_id) {
      applyCatalog((s) => ({
        ...s,
        reviewsBusy: false,
        reviewsError: 'identity_mismatch',
      }))
      return { ignored: false, error: 'identity_mismatch' }
    }
    if (!receiptMatchesDecision(payload, result.data, publishBundle)) {
      applyCatalog((s) => ({
        ...s,
        reviewsBusy: false,
        reviewsError: 'identity_mismatch',
      }))
      return { ignored: false, error: 'identity_mismatch' }
    }
    applyCatalog((s) => ({
      ...s,
      reviewsBusy: false,
      pendingReviewDecision: null,
      reviewsConflict: false,
    }))
    const refreshed = await readReviewsForAccepted(publishBundle, current.checks, {
      savedNeedsRefresh: true,
      clearPending: true,
      clearSavedRefresh: true,
    })
    if (!mountedRef.current || userRef.current !== userId) {
      return { ignored: true, receipt: result.data, refreshed }
    }
    if (isTerminalReviewAccessError(refreshed?.error)) {
      return { ignored: false, error: refreshed.error, receipt: result.data, refreshed }
    }
    const latest = stateRef.current
    if (!reviewDecisionContextMatches(latest, payload)) {
      return { ignored: true, receipt: result.data, refreshed }
    }
    if (refreshed?.error) {
      applyCatalog((s) => ({
        ...s,
        decisionSavedNeedsRefresh: true,
        reviewsError: refreshed.error,
        pendingReviewDecision: null,
        reviewsBusy: false,
      }))
    }
    return { ignored: false, data: result.data, receipt: result.data, refreshed }
  }, [applyAccessFailure, applyCatalog, readReviewsForAccepted, userId])

  const saveEvidenceReview = useCallback(async (targetKind, targetId, draftOverride) => {
    const current = stateRef.current
    if (!reviewsClient || !userId || current.reviewsBusy || current.loadingReviews) return
    if (current.decisionSavedNeedsRefresh) return
    if (current.pendingReviewDecision) return
    if (current.reviewsPanels?.canDecide !== true) return
    const bundle = current.bundle
    const checks = current.checks
    const panels = current.reviewsPanels
    if (!bundle || !checks?.report?.id || !panels) return
    const target = panels.targets.find((item) => item.target_kind === targetKind && item.target_id === targetId)
    if (!target) return
    const draft = draftOverride ?? current.reviewDrafts[reviewTargetKey(targetKind, targetId)]
    const evidence = selectedEvidenceFromDraft(draft)
    if (reviewSubmissionBlockReason(draft, targetKind)) return
    const eventId = randomUUID()
    if (!eventId || !draft) return
    const payload = freezeReviewDecisionPayload({
      investigationId: bundle.investigation_id,
      versionId: bundle.version.id,
      reportId: checks.report.id,
      eventId,
      previousEventId: target.latest_event?.id ?? null,
      targetKind,
      targetId,
      decision: draft.decision,
      rationale: String(draft.rationale ?? '').trim(),
      evidence,
    })
    if (!payload) return
    const token = reviewsDecideGate.current.start(reviewDecisionRequestKey(userId, payload))
    applyCatalog((s) => ({
      ...s,
      reviewDrafts: { ...s.reviewDrafts, [reviewTargetKey(targetKind, targetId)]: draft },
      pendingReviewDecision: payload,
      reviewsBusy: true,
      reviewsError: null,
      reviewsConflict: false,
    }))
    const result = await reviewsClient.decide(payload)
    return finishDecisionRequest(payload, result, token)
  }, [applyCatalog, finishDecisionRequest, randomUUID, reviewsClient, userId])

  const retryEvidenceReviewDecision = useCallback(async () => {
    const current = stateRef.current
    const payload = current.pendingReviewDecision
    if (!payload || !reviewsClient || !userId || current.reviewsBusy) return
    if (current.decisionSavedNeedsRefresh) return
    const token = reviewsDecideGate.current.start(reviewDecisionRequestKey(userId, payload))
    applyCatalog((s) => ({ ...s, reviewsBusy: true, reviewsError: null }))
    const result = await reviewsClient.decide(payload)
    return finishDecisionRequest(payload, result, token)
  }, [applyCatalog, finishDecisionRequest, reviewsClient, userId])

  const retryReviews = useCallback(async () => {
    const current = stateRef.current
    if (!reviewsClient || !userId || current.reviewsBusy || current.loadingReviews) return
    if (!current.bundle || !current.checks) return
    if (current.decisionSavedNeedsRefresh) {
      return readReviewsForAccepted(current.bundle, current.checks, {
        savedNeedsRefresh: true,
        clearPending: true,
        keepSavedRefresh: true,
      })
    }
    return readReviewsForAccepted(current.bundle, current.checks)
  }, [readReviewsForAccepted, reviewsClient, userId])

  const updateReviewDraft = useCallback((targetKind, targetId, updater) => {
    const key = reviewTargetKey(targetKind, targetId)
    applyCatalog((s) => {
      if (s.pendingReviewDecision && s.pendingReviewDecision.target_kind === targetKind && s.pendingReviewDecision.target_id === targetId) {
        return s
      }
      const current = s.reviewDrafts[key]
      const nextDraft = typeof updater === 'function' ? updater(current) : updater
      return {
        ...s,
        reviewDrafts: { ...s.reviewDrafts, [key]: nextDraft },
      }
    })
  }, [applyCatalog])

  const setReviewFilter = useCallback((reviewFilter) => {
    applyCatalog((s) => ({ ...s, reviewFilter }))
  }, [applyCatalog])

  const openBeforeVersion = useCallback((versionId) => {
    const current = stateRef.current
    if (!current.selectedInvestigationId || !versionId) return
    return loadBundle(current.selectedInvestigationId, versionId, { asBefore: true })
  }, [loadBundle])

  const beginInspectSession = useCallback(() => {
    inspectEpochRef.current += 1
    reviewHistoryFamily.current.invalidate()
    const current = stateRef.current
    return {
      epoch: inspectEpochRef.current,
      userId: userRef.current,
      investigationId: current.selectedInvestigationId,
      displayedVersionId: current.bundle?.version?.id ?? null,
    }
  }, [])

  const inspectSessionIsCurrent = useCallback((session) => {
    if (!session || !mountedRef.current) return false
    if (session.epoch !== inspectEpochRef.current) return false
    if (userRef.current !== session.userId) return false
    const current = stateRef.current
    if (current.selectedInvestigationId !== session.investigationId) return false
    if ((current.bundle?.version?.id ?? null) !== session.displayedVersionId) return false
    return true
  }, [])

  const finishInspect = useCallback((session, inspector) => {
    if (!inspectSessionIsCurrent(session)) return false
    applyCatalog((current) => ({
      ...current,
      inspector,
      activeSection: inspector?.kind === 'source-link'
        ? 'source-links'
        : inspector?.kind === 'challenge-cue'
          ? 'evidence-checks'
          : 'changed',
      reviewHistory: inspectorOwnsReviewHistory(inspector, current.reviewHistory) ? current.reviewHistory : null,
      loadingReviewHistory: false,
      loadingOlderReviewHistory: false,
      reviewHistoryError: null,
    }))
    return true
  }, [applyCatalog, inspectSessionIsCurrent])

  const loadReviewHistoryPage = useCallback(async (session, input, { append = false, disclosedRefresh = false } = {}) => {
    if (!reviewsClient || !userId) return { ignored: true }
    const currentAtStart = stateRef.current
    const bundle = currentAtStart.bundle
    const checks = currentAtStart.checks
    if (!bundle || !checks?.report?.id || !currentAtStart.reviewsPanels) return { ignored: true }
    if (input.at_revision !== currentAtStart.reviewsPanels.revision && !disclosedRefresh) {
      // Pinned history uses the accepted overview revision unless this is an explicit refresh.
    }
    const token = reviewHistoryFamily.current.start(
      reviewHistoryRequestKey(
        userId,
        input.investigation_id,
        input.version_id,
        bundle.observation.id,
        input.report_id,
        input.target_kind,
        input.target_id,
        input.at_revision,
        input.before_revision,
        session.epoch,
      ),
    )
    applyCatalog((s) => ({
      ...s,
      loadingReviewHistory: append ? s.loadingReviewHistory : true,
      loadingOlderReviewHistory: append,
      reviewHistoryError: null,
    }))
    const result = await reviewsClient.history(input)
    if (!mountedRef.current || userRef.current !== userId) return { ignored: true }
    if (!inspectSessionIsCurrent(session) || !reviewHistoryFamily.current.isCurrent(token)) {
      return { ignored: true }
    }
    const code = workspaceErrorCode(result.error)
    const current = stateRef.current
    if (!inspectorOwnsReviewHistory(current.inspector, {
      target_kind: input.target_kind,
      target_id: input.target_id,
    })) {
      return { ignored: true }
    }
    if (append) {
      const existingHistory = current.reviewHistory
      const canAppend = inspectorOwnsReviewHistory(current.inspector, existingHistory)
        && existingHistory?.at_revision === input.at_revision
        && existingHistory?.target_kind === input.target_kind
        && existingHistory?.target_id === input.target_id
        && existingHistory?.inspectorEpoch === session.epoch
      if (!canAppend) return { ignored: true }
    }
    if (code === 'authentication_required') {
      applyAccessFailure(code, { investigationId: input.investigation_id })
      return { ignored: false, error: code }
    }
    if (code === 'access_denied') {
      applyAccessFailure(code, { investigationId: input.investigation_id })
      return { ignored: false, error: code }
    }
    if (code) {
      applyCatalog((s) => ({
        ...s,
        loadingReviewHistory: false,
        loadingOlderReviewHistory: false,
        reviewHistoryError: code,
      }))
      return { ignored: false, error: code }
    }
    if (!historyMatchesRequest(result.data, input, current.bundle)) {
      applyCatalog((s) => ({
        ...s,
        loadingReviewHistory: false,
        loadingOlderReviewHistory: false,
        reviewHistoryError: 'identity_mismatch',
      }))
      return { ignored: false, error: 'identity_mismatch' }
    }
    applyCatalog((s) => {
      const canAppend = append
        && inspectorOwnsReviewHistory(s.inspector, s.reviewHistory)
        && s.reviewHistory?.at_revision === input.at_revision
        && s.reviewHistory?.target_kind === input.target_kind
        && s.reviewHistory?.target_id === input.target_id
        && s.reviewHistory?.inspectorEpoch === session.epoch
      if (append && !canAppend) return s
      const existing = canAppend ? s.reviewHistory.events : []
      return {
        ...s,
        loadingReviewHistory: false,
        loadingOlderReviewHistory: false,
        reviewHistoryError: null,
        reviewHistory: {
          target_kind: input.target_kind,
          target_id: input.target_id,
          report_id: input.report_id,
          at_revision: input.at_revision,
          next_before_revision: result.data.next_before_revision,
          events: mergeHistoryEvents(existing, result.data.events),
          refreshed: disclosedRefresh || (append ? s.reviewHistory?.refreshed === true : false),
          inspectorEpoch: session.epoch,
        },
      }
    })
    return { ignored: false, data: result.data }
  }, [applyAccessFailure, applyCatalog, inspectSessionIsCurrent, reviewsClient, userId])

  const inspectComparedRecords = useCallback(async (versionId, focus = null) => {
    if (!versionId) return { ignored: true }
    const session = beginInspectSession()
    const result = await openBeforeVersion(versionId)
    if (!result || result.ignored || result.error) return { ignored: true, error: result?.error }
    if (!bundleMatchesRequest(result.data, session.investigationId, versionId)) {
      return { ignored: true, error: 'identity_mismatch' }
    }
    if (!finishInspect(session, { kind: 'before-state', versionId, focus })) {
      return { ignored: true }
    }
    return { ignored: false, data: result.data }
  }, [beginInspectSession, finishInspect, openBeforeVersion])

  const inspectEvidenceChange = useCallback(async (change) => {
    if (!change) return { ignored: true }
    const session = beginInspectSession()
    const beforeId = stateRef.current.panels?.comparison?.before_version_id ?? null
    if (beforeId) {
      const result = await openBeforeVersion(beforeId)
      if (!result || result.ignored || result.error) return { ignored: true, error: result?.error }
      if (!bundleMatchesRequest(result.data, session.investigationId, beforeId)) {
        return { ignored: true, error: 'identity_mismatch' }
      }
    }
    if (!finishInspect(session, {
      kind: 'evidence-change',
      change,
      beforeVersionId: beforeId,
    })) {
      return { ignored: true }
    }
    return { ignored: false }
  }, [beginInspectSession, finishInspect, openBeforeVersion])

  const inspectReviewTarget = useCallback(async (inspector) => {
    const session = beginInspectSession()
    if (!finishInspect(session, inspector)) return { ignored: true }
    const current = stateRef.current
    const panels = current.reviewsPanels
    const bundle = current.bundle
    const checks = current.checks
    if (!panels || !bundle || !checks?.report?.id) return { ignored: false }
    const targetKind = inspector.kind === 'source-link' ? 'source_link' : 'evidence_cue'
    const targetId = inspector.kind === 'source-link' ? inspector.pair?.id : inspector.cue?.id
    if (!targetId) return { ignored: false }
    const input = {
      investigation_id: bundle.investigation_id,
      version_id: bundle.version.id,
      report_id: checks.report.id,
      target_kind: targetKind,
      target_id: targetId,
      at_revision: panels.revision,
      before_revision: null,
    }
    return loadReviewHistoryPage(session, input)
  }, [beginInspectSession, finishInspect, loadReviewHistoryPage])

  const loadOlderReviewHistory = useCallback(async () => {
    const current = stateRef.current
    const history = current.reviewHistory
    if (!history?.next_before_revision || current.loadingOlderReviewHistory || current.loadingReviewHistory) return
    if (!inspectorOwnsReviewHistory(current.inspector, history)) return
    const session = {
      epoch: history.inspectorEpoch,
      userId: userRef.current,
      investigationId: current.selectedInvestigationId,
      displayedVersionId: current.bundle?.version?.id ?? null,
    }
    if (!inspectSessionIsCurrent(session)) return
    const input = {
      investigation_id: current.bundle.investigation_id,
      version_id: current.bundle.version.id,
      report_id: history.report_id,
      target_kind: history.target_kind,
      target_id: history.target_id,
      at_revision: history.at_revision,
      before_revision: history.next_before_revision,
    }
    return loadReviewHistoryPage(session, input, { append: true, disclosedRefresh: history.refreshed === true })
  }, [inspectSessionIsCurrent, loadReviewHistoryPage])

  const retryReviewHistory = useCallback(async () => {
    const current = stateRef.current
    const inspector = current.inspector
    const panels = current.reviewsPanels
    const bundle = current.bundle
    const checks = current.checks
    if (!inspector || !panels || !bundle || !checks?.report?.id) return
    const history = current.reviewHistory
    const session = {
      epoch: inspectEpochRef.current,
      userId: userRef.current,
      investigationId: current.selectedInvestigationId,
      displayedVersionId: bundle.version?.id ?? null,
    }
    if (!inspectSessionIsCurrent(session)) return
    const targetKind = inspector.kind === 'source-link' ? 'source_link' : inspector.kind === 'challenge-cue' ? 'evidence_cue' : null
    const targetId = inspector.kind === 'source-link' ? inspector.pair?.id : inspector.cue?.id
    if (!targetKind || !targetId) return
    if (history?.next_before_revision && history.events?.length && current.reviewHistoryError && current.loadingOlderReviewHistory === false && history.target_id === targetId) {
      return loadOlderReviewHistory()
    }
    const input = {
      investigation_id: bundle.investigation_id,
      version_id: bundle.version.id,
      report_id: checks.report.id,
      target_kind: targetKind,
      target_id: targetId,
      at_revision: history?.at_revision ?? panels.revision,
      before_revision: null,
    }
    return loadReviewHistoryPage(session, input, { disclosedRefresh: history?.refreshed === true })
  }, [inspectSessionIsCurrent, loadOlderReviewHistory, loadReviewHistoryPage])

  const refreshReviewHistory = useCallback(async () => {
    const current = stateRef.current
    const inspector = current.inspector
    const bundle = current.bundle
    const checks = current.checks
    if (!inspector || !bundle || !checks || !reviewsClient) return
    if (reviewHistoryRefreshBlocked(current)) return
    const session = beginInspectSession()
    if (!finishInspect(session, inspector)) return { ignored: true }
    const refreshed = await readReviewsForAccepted(bundle, checks, {
      replace: false,
      clearPending: false,
      markLoading: false,
      keepBusy: true,
      keepSavedRefresh: true,
      preserveError: true,
    })
    if (!inspectSessionIsCurrent(session)) return { ignored: true }
    if (isTerminalReviewAccessError(refreshed?.error)) return refreshed
    if (refreshed?.ignored || refreshed?.error) return refreshed
    const latest = stateRef.current
    if (!latest.reviewsPanels || !latest.bundle || !latest.checks?.report?.id) return { ignored: true }
    const targetKind = inspector.kind === 'source-link' ? 'source_link' : inspector.kind === 'challenge-cue' ? 'evidence_cue' : null
    const targetId = inspector.kind === 'source-link' ? inspector.pair?.id : inspector.cue?.id
    if (!targetKind || !targetId) return
    if (!inspectorOwnsReviewHistory(latest.inspector, { target_kind: targetKind, target_id: targetId })) {
      return { ignored: true }
    }
    const input = {
      investigation_id: latest.bundle.investigation_id,
      version_id: latest.bundle.version.id,
      report_id: latest.checks.report.id,
      target_kind: targetKind,
      target_id: targetId,
      at_revision: latest.reviewsPanels.revision,
      before_revision: null,
    }
    return loadReviewHistoryPage(session, input, { disclosedRefresh: true })
  }, [beginInspectSession, finishInspect, inspectSessionIsCurrent, loadReviewHistoryPage, readReviewsForAccepted, reviewsClient])

  const setInspector = useCallback((inspector) => {
    inspectEpochRef.current += 1
    reviewHistoryFamily.current.invalidate()
    applyCatalog((current) => ({
      ...current,
      inspector,
      reviewHistory: null,
      loadingReviewHistory: false,
      loadingOlderReviewHistory: false,
      reviewHistoryError: null,
    }))
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
      runEvidenceChecks,
      retryChecks,
      saveEvidenceReview,
      retryEvidenceReviewDecision,
      retryReviews,
      updateReviewDraft,
      setReviewFilter,
      inspectReviewTarget,
      loadOlderReviewHistory,
      retryReviewHistory,
      refreshReviewHistory,
      openBeforeVersion,
      inspectComparedRecords,
      inspectEvidenceChange,
      setInspector,
      setActiveSection,
      clearPrivateState,
      rejectInputImpactAccess: (code, bundle) => {
        // Ignore terminal responses from a view/account that has since left.
        if (stateRef.current.bundle !== bundle) return false
        return applyAccessFailure(code, { investigationId: bundle.investigation_id })
      },
    },
  }
}
