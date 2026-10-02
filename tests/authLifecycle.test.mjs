import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import {
  getSession, loadOwnProfile, sendMagicLink, signOut, safeAuthRedirectUrl,
  usableAuthSession, useAuthSession, useOwnProfile, clearAuthRedirectError,
} from '../src/lib/auth.js'
import { usePrivateInvestigationWorkspace } from '../src/lib/usePrivateInvestigationWorkspace.js'
import { deferred, fixtureCatalog, FIXTURE_USER } from '../src/lib/investigationWorkspaceFixtures.js'

const PAGE = 'https://jkelsen13-tech.github.io/media-intelligence-platform-v2/'
const session = (id = 'owner', expires_at) => ({ user: { id }, ...(expires_at == null ? {} : { expires_at }) })
function authClient(initial) {
  let callback
  let unsubscribed = 0
  return {
    client: { auth: {
      getSession: () => initial.promise,
      onAuthStateChange(fn) {
        callback = fn
        return { data: { subscription: { unsubscribe() { unsubscribed++ } } } }
      },
    } },
    emit(event, value) { callback(event, value) },
    unsubscribed: () => unsubscribed,
  }
}
function AuthProbe({ client, probe }) {
  probe.current = useAuthSession({ client })
  return null
}
async function mountAuth(api) {
  const probe = {}
  let renderer
  await act(async () => { renderer = TestRenderer.create(createElement(AuthProbe, { client: api.client, probe })) })
  return { probe, renderer }
}
async function resolve(pending, value) {
  await act(async () => { pending.resolve(value); await pending.promise })
}

test('a rejected initial session read settles signed out instead of remaining loading', async () => {
  const pending = deferred()
  const api = authClient(pending)
  const { probe, renderer } = await mountAuth(api)
  assert.equal(probe.current.loading, true)
  await act(async () => { pending.reject(new Error('offline')); await Promise.resolve() })
  assert.deepEqual(probe.current, { session: null, user: null, loading: false })
  await act(async () => renderer.unmount())
  assert.equal(api.unsubscribed(), 1)
})

test('a late initial read cannot undo logout or overwrite a newer sign-in', async () => {
  for (const newer of [null, session('new-owner')]) {
    const pending = deferred()
    const api = authClient(pending)
    const { probe, renderer } = await mountAuth(api)
    await act(async () => api.emit(newer ? 'SIGNED_IN' : 'SIGNED_OUT', newer))
    assert.equal(probe.current.loading, false)
    await resolve(pending, { data: { session: session('old-owner') } })
    assert.equal(probe.current.session, newer)
    await act(async () => renderer.unmount())
    api.emit('SIGNED_IN', session('after-unmount'))
    assert.equal(probe.current.session, newer)
  }
})

test('refresh replaces the expiry deadline; failed refresh expires private identity', async (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100_000 })
  const pending = deferred()
  const api = authClient(pending)
  const { probe, renderer } = await mountAuth(api)
  await resolve(pending, { data: { session: session('owner', 101) } })
  await act(async () => { t.mock.timers.tick(500); api.emit('TOKEN_REFRESHED', session('owner', 103)) })
  await act(async () => t.mock.timers.tick(500))
  assert.equal(probe.current.user.id, 'owner', 'old expiry must not clear the refreshed session')
  await act(async () => t.mock.timers.tick(2000))
  assert.equal(probe.current.session, null)
  assert.equal(probe.current.loading, false)
  await act(async () => renderer.unmount())
})

test('malformed or already expired sessions cannot grant frontend private visibility', () => {
  for (const value of [null, {}, { user: {} }, session('owner', 100), session('owner', NaN)]) {
    assert.equal(usableAuthSession(value, 100_000), null)
  }
  assert.equal(usableAuthSession(session('owner', 101), 100_000)?.user.id, 'owner')
})

test('returned session errors fail closed and logout errors remain visible to callers', async () => {
  assert.equal(await getSession({ auth: { getSession: async () => ({ data: { session: session() }, error: {} }) } }), null)
  const error = { message: 'offline' }
  assert.deepEqual(await signOut({ auth: { signOut: async () => ({ error }) } }), { error })
  assert.ok((await signOut({ auth: { signOut: async () => { throw new Error('offline') } } })).error)
})

test('redirect destination is a confirmed route; untrusted origins, credentials and returnTo are not followed', async () => {
  assert.equal(safeAuthRedirectUrl(`${PAGE}?returnTo=https://attacker.invalid/#event/private`), PAGE)
  for (const raw of ['https://attacker.invalid/', 'https://jkelsen13-tech.github.io/other/',
    'https://user:pass@jkelsen13-tech.github.io/media-intelligence-platform-v2/',
    `${PAGE}\u0000`, 'http://localhost:4173/']) assert.equal(safeAuthRedirectUrl(raw), null)
  assert.equal(safeAuthRedirectUrl('http://localhost:4173/path?debug=1', { development: true }), 'http://localhost:4173/path')
  let call
  const client = { auth: { signInWithOtp: async (input) => { call = input; return { error: null } } } }
  await sendMagicLink('owner@example.invalid', { client, location: PAGE })
  assert.deepEqual(call.options, { data: { app: 'mip' }, emailRedirectTo: PAGE, shouldCreateUser: true })
  call = null
  assert.ok((await sendMagicLink('owner@example.invalid', { client, location: 'https://attacker.invalid/' })).error)
  assert.equal(call, null, 'unsafe redirect fails before sending email')
})

test('clearing an auth error preserves ordinary deep links and current history state', () => {
  const previous = globalThis.window
  const replacements = []
  globalThis.window = { location: { pathname: '/app/', search: '?x=1', hash: '#event/subject/news' },
    history: { state: { retained: true }, replaceState: (...args) => replacements.push(args) } }
  try {
    clearAuthRedirectError()
    assert.equal(replacements.length, 0)
    globalThis.window.location.hash = '#error=access_denied&error_code=otp_expired'
    clearAuthRedirectError()
    assert.deepEqual(replacements[0], [{ retained: true }, '', '/app/?x=1'])
  } finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous }
})

test('profile reads cannot show a prior identity or accept a mismatched profile id', async () => {
  const reads = []
  const client = { from() { return { select() { return this }, eq(_key, id) { this.id = id; return this },
    maybeSingle() { const pending = deferred(); reads.push({ id: this.id, ...pending }); return pending.promise } } } }
  const probe = { current: null, renders: [] }
  function ProfileProbe({ userId }) {
    probe.current = useOwnProfile(userId, { client })
    probe.renders.push({ userId, profile: probe.current })
    return null
  }
  let renderer
  await act(async () => { renderer = TestRenderer.create(createElement(ProfileProbe, { userId: 'a' })) })
  await act(async () => renderer.update(createElement(ProfileProbe, { userId: 'b' })))
  await resolve(reads[0], { data: { id: 'a', display_name: 'Previous owner' } })
  assert.equal(probe.current, null)
  await resolve(reads[1], { data: { id: 'b', display_name: 'Current owner' } })
  assert.equal(probe.current.display_name, 'Current owner')
  await act(async () => renderer.update(createElement(ProfileProbe, { userId: null })))
  assert.equal(probe.current, null)
  assert.ok(probe.renders.every(({ userId, profile }) => !profile || profile.id === userId))
  await act(async () => renderer.unmount())
  const lookup = loadOwnProfile('b', client)
  await resolve(reads[2], { data: { id: 'a', display_name: 'Mismatched' } })
  assert.equal(await lookup, null)
})

test('private records are hidden on the first session-change render and late requests cannot refill them', async () => {
  const pending = []
  const client = { list() { const request = deferred(); pending.push(request); return request.promise }, read: () => new Promise(() => {}) }
  const renders = []
  const probe = {}
  function PrivateProbe({ userId, sessionLoading = false }) {
    probe.current = usePrivateInvestigationWorkspace({ userId, sessionLoading, client, active: true })
    renders.push({ userId, sessionLoading, catalog: probe.current.state.catalog })
    return null
  }
  let renderer
  await act(async () => { renderer = TestRenderer.create(createElement(PrivateProbe, { userId: FIXTURE_USER.id })) })
  await resolve(pending[0], { data: fixtureCatalog(), error: null })
  assert.ok(probe.current.state.catalog.length)
  let oldRequest
  await act(async () => { oldRequest = probe.current.actions.loadCatalog() })
  await act(async () => renderer.update(createElement(PrivateProbe, { userId: 'other-owner' })))
  assert.equal(probe.current.state.catalog.length, 0)
  await resolve(pending[1], { data: fixtureCatalog(), error: null })
  assert.equal((await oldRequest).ignored, true)
  assert.equal(probe.current.state.catalog.length, 0)
  assert.ok(renders.filter((r) => r.userId === 'other-owner').every((r) => r.catalog.length === 0))
  await act(async () => renderer.update(createElement(PrivateProbe, { userId: 'other-owner', sessionLoading: true })))
  assert.equal(probe.current.status, 'session_loading')
  await act(async () => renderer.unmount())
})

test('callback error is retained before router hash replacement and stores no callback token', async () => {
  const previous = globalThis.window
  globalThis.window = { location: { hash: '#error=access_denied&error_code=otp_expired&access_token=ignored' }, history: {} }
  try {
    const auth = await import(`../src/lib/auth.js?callback-snapshot-test`)
    globalThis.window.location.hash = '#event/public-subject/news'
    assert.deepEqual(auth.authRedirectError(), { code: 'otp_expired', description: '' })
    auth.clearAuthRedirectError()
    assert.equal(auth.authRedirectError(), null)
  } finally { if (previous === undefined) delete globalThis.window; else globalThis.window = previous }
})
