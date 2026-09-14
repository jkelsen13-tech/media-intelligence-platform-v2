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

// Metadata key the DB trigger gates on. Exported as a constant so tests can
// lock the wiring (a silent drop here breaks profile creation invisibly).
export const MIP_USER_METADATA = { app: 'mip' }

/** Flag read. Returns exactly-true only when the DB value is boolean true. */
export async function loadAccountUiFlag() {
  if (!supabase) return false
  const { data, error } = await supabase
    .from('pipeline_config')
    .select('value')
    .eq('key', 'account_ui')
    .maybeSingle()
  if (error) return false
  return data?.value === true
}

/**
 * Send a magic link. shouldCreateUser: true makes this one call serve both
 * signup and login (per Doc 16's single entry point). options.data carries
 * the trigger-gating metadata on the FIRST sign-in that creates the user.
 */
export async function sendMagicLink(email) {
  if (!supabase) return { error: new Error('Supabase client not configured') }
  const emailRedirectTo =
    typeof window !== 'undefined'
      ? window.location.origin + window.location.pathname
      : undefined
  return supabase.auth.signInWithOtp({
    email,
    options: {
      data: MIP_USER_METADATA,
      emailRedirectTo,
      shouldCreateUser: true,
    },
  })
}

export async function getSession() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data?.session ?? null
}

/** Subscribe to auth state changes. Returns an unsubscribe function. */
export function onAuthChange(callback) {
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session ?? null)
  })
  return () => data?.subscription?.unsubscribe?.()
}

export async function signOut() {
  if (!supabase) return
  await supabase.auth.signOut()
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
  if (typeof window === 'undefined') return
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
}

/**
 * Auth state for the rest of the app (Doc 16 acceptance: "the auth state is
 * available to other parts of the app"). Any component can call this hook;
 * 02B-ADD Part B will consume session.user.id as the flag-enforcement
 * user_id. Returns { session, user, loading }.
 */
export function useAuthSession() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    let eventObserved = false
    const apply = (s) => {
      if (!active) return
      setSession(s ?? null)
      setLoading(false)
    }
    // Subscribe first; a newer provider event outranks the initial lookup.
    const unsub = onAuthChange((s) => {
      if (!active) return
      eventObserved = true
      apply(s)
    })
    getSession().then(
      (s) => { if (!eventObserved) apply(s) },
      () => { if (!eventObserved) apply(null) },
    )
    return () => {
      active = false
      unsub()
    }
  }, [])
  return { session, user: session?.user ?? null, loading }
}

/** Own profile row (RLS: select own only). Null when absent/unreachable. */
export async function loadOwnProfile(userId) {
  if (!supabase || !userId) return null
  try {
    const { data, error } = await supabase
      .from('mip_profiles')
      .select('id, display_name, created_at')
      .eq('id', userId)
      .maybeSingle()
    if (error) return null
    return data ?? null
  } catch {
    return null
  }
}
