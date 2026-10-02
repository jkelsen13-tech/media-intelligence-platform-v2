// 16_ACCOUNT_PIPELINE — identity layer seam (UI side).
//
// Scope: magic-link signup/login, session detection, and auth state exposure
// for the rest of the app. No workspace/saved-topics/flagging — those are
// separately scoped downstream documents.
//
// Trigger gate (live, verified 2026-08-13): on_auth_user_created_mip inserts
// a mip_profiles row ONLY when the new user's raw_user_meta_data carries
// 'app' = 'mip'. Every signup/login call below therefore passes
// options.data = { app: 'mip' } — do not remove it; without it a magic-link
// signup creates an auth user with NO profile row.
//
// Flag: pipeline_config.account_ui must be exactly boolean true, matching
// the withhold posture of phase3_beta / source_comparison_beta. Unreadable
// flag resolves false and no auth UI renders.

import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { isConfirmedV2ClientPageOrigin } from './supabaseOrigin.js'

// Metadata key the DB trigger gates on. Exported as a constant so tests can
// lock the wiring (a silent drop here breaks profile creation invisibly).
export const MIP_USER_METADATA = Object.freeze({ app: 'mip' })

// Capture the error before the app's deep-link serialization or the SDK can
// replace the callback hash. Keep no callback tokens in module state.
let redirectError = typeof window === 'undefined' ? null : parseAuthRedirectError(window.location.hash)

export function authRedirectError() {
  return redirectError ?? (typeof window === 'undefined' ? null : parseAuthRedirectError(window.location.hash))
}

export function safeAuthRedirectUrl(raw, { development = false } = {}) {
  if (typeof raw !== 'string' || /[\\\u0000-\u0020\u007f]/.test(raw)) return null
  try {
    const url = new URL(raw)
    const local = development === true && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      && ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
    if (!local && !isConfirmedV2ClientPageOrigin(raw)) return null
    // No returnTo parameter or supplied redirect destination is followed.
    // Auth callbacks own the fragment; retained app context stays in the app.
    return `${url.origin}${url.pathname}`
  } catch {
    return null
  }
}

/** Flag read. Returns exactly-true only when the DB value is boolean true. */
export async function loadAccountUiFlag(client = supabase) {
  if (!client) return false
  try {
    const { data, error } = await client
      .from('pipeline_config')
      .select('value')
      .eq('key', 'account_ui')
      .maybeSingle()
    return !error && data?.value === true
  } catch {
    return false
  }
}

/**
 * Send a magic link. shouldCreateUser: true makes this one call serve both
 * signup and login (per Doc 16's single entry point). options.data carries
 * the trigger-gating metadata on the FIRST sign-in that creates the user.
 */
export async function sendMagicLink(email, {
  client = supabase,
  location = typeof window === 'undefined' ? null : window.location.href,
  development = import.meta.env?.DEV === true,
} = {}) {
  if (!client) return { error: new Error('Sign-in is not available in this session.') }
  const emailRedirectTo = safeAuthRedirectUrl(location, { development })
  if (!emailRedirectTo) return { error: new Error('Sign-in is not available at this browser address.') }
  try {
    return await client.auth.signInWithOtp({
      email,
      options: {
        data: MIP_USER_METADATA,
        emailRedirectTo,
        shouldCreateUser: true,
      },
    })
  } catch {
    return { error: new Error('Could not send the sign-in link. Please try again.') }
  }
}

export async function getSession(client = supabase) {
  if (!client) return null
  try {
    const { data, error } = await client.auth.getSession()
    return error ? null : data?.session ?? null
  } catch {
    return null
  }
}

/** Subscribe to auth state changes. Returns an unsubscribe function. */
export function onAuthChange(callback, client = supabase) {
  if (!client) return () => {}
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    callback(session ?? null)
  })
  return () => data?.subscription?.unsubscribe?.()
}

export async function signOut(client = supabase) {
  if (!client) return { error: null }
  try {
    return await client.auth.signOut()
  } catch {
    return { error: new Error('Could not log out. Please try again.') }
  }
}

/**
 * Expired / invalid magic link: Supabase redirects back with the error in
 * the URL hash (#error=access_denied&error_code=otp_expired&...). Parse it
 * so the UI can show "link expired — send a new one" instead of a silent
 * signed-out state. Returns null when no auth error is present.
 */
export function parseAuthRedirectError(hash) {
  if (!hash || !hash.includes('error')) return null
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const code = params.get('error_code') ?? params.get('error')
  if (!code) return null
  const description = (params.get('error_description') ?? '').replace(/\+/g, ' ')
  return { code, description }
}

/** Strip the error hash after surfacing it, so a reload doesn't re-show it. */
export function clearAuthRedirectError() {
  redirectError = null
  if (typeof window === 'undefined') return
  if (parseAuthRedirectError(window.location.hash)) {
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
  }
}

/**
 * Auth state for the rest of the app (Doc 16 acceptance: "the auth state is
 * available to other parts of the app"). Any component can call this hook;
 * 02B-ADD Part B will consume session.user.id as the flag-enforcement
 * user_id. Returns { session, user, loading }.
 */
export function usableAuthSession(session, now = Date.now()) {
  if (!session?.user?.id) return null
  if (session.expires_at != null && (!Number.isFinite(session.expires_at) || session.expires_at * 1000 <= now)) return null
  return session
}

export function useAuthSession({ client = supabase } = {}) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    let observedChange = false
    let expiryTimer
    const apply = (s) => {
      if (!active) return
      clearTimeout(expiryTimer)
      const usable = usableAuthSession(s)
      setSession(usable)
      setLoading(false)
      if (usable?.expires_at != null) {
        const checkExpiry = () => {
          if (!active) return
          const remaining = usable.expires_at * 1000 - Date.now()
          if (remaining <= 0) setSession(null)
          else expiryTimer = setTimeout(checkExpiry, Math.min(remaining, 2_147_483_647))
        }
        expiryTimer = setTimeout(checkExpiry, Math.min(usable.expires_at * 1000 - Date.now(), 2_147_483_647))
      }
    }
    const unsub = onAuthChange((s) => {
      observedChange = true
      apply(s)
    }, client)
    getSession(client).then((s) => {
      if (!observedChange) apply(s)
    })
    return () => {
      active = false
      clearTimeout(expiryTimer)
      unsub()
    }
  }, [client])
  const currentSession = usableAuthSession(session)
  return { session: currentSession, user: currentSession?.user ?? null, loading }
}

/** Own profile row (RLS: select own only). Null when absent/unreachable. */
export async function loadOwnProfile(userId, client = supabase) {
  if (!client || !userId) return null
  try {
    const { data, error } = await client
      .from('mip_profiles')
      .select('id, display_name, created_at')
      .eq('id', userId)
      .maybeSingle()
    if (error) return null
    return data?.id === userId ? data : null
  } catch {
    return null
  }
}

export function useOwnProfile(userId, { client = supabase } = {}) {
  const [profile, setProfile] = useState(null)
  useEffect(() => {
    let active = true
    setProfile(null)
    if (userId) loadOwnProfile(userId, client).then((data) => { if (active) setProfile(data) })
    return () => { active = false }
  }, [userId, client])
  // Hide the previous identity even on the render before effect cleanup.
  return profile?.id === userId ? profile : null
}
