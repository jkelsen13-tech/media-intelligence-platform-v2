// 16_ACCOUNT_PIPELINE — account sheet (identity layer UI only).
//
// Renders inside App's sheet pattern. Behind pipeline_config.account_ui
// (App only mounts this component while the flag is true). States:
//   signed-out: idle -> sending -> sent (confirmation) / error
//   redirect error: expired or invalid magic link, parsed from the URL hash
//   signed-in: email/display_name indicator + logout

import { useEffect, useState } from 'react'
import {
  sendMagicLink,
  signOut,
  useAuthSession,
  useOwnProfile,
  authRedirectError,
  clearAuthRedirectError,
} from '../lib/auth.js'
import '../styles/auth.css'

export default function AccountPanel({ onClose }) {
  const { session, user, loading } = useAuthSession()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState('idle') // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = useState(null)
  const [redirectError, setRedirectError] = useState(null)
  const profile = useOwnProfile(user?.id)
  const [logoutBusy, setLogoutBusy] = useState(false)
  const [logoutError, setLogoutError] = useState(null)

  // Expired/invalid magic link comes back as a URL-hash error on load.
  useEffect(() => {
    const err = authRedirectError()
    if (err) {
      setRedirectError(err)
      clearAuthRedirectError()
    }
  }, [])

  const handleSend = async (e) => {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed || status === 'sending') return
    setStatus('sending')
    setErrorMsg(null)
    const { error } = await sendMagicLink(trimmed)
    if (error) {
      setStatus('error')
      setErrorMsg(error.message ?? 'Could not send the sign-in link.')
    } else {
      setStatus('sent')
    }
  }

  const handleLogout = async () => {
    if (logoutBusy) return
    setLogoutBusy(true)
    setLogoutError(null)
    const result = await signOut()
    setLogoutBusy(false)
    if (result?.error) {
      setLogoutError('Could not log out. Please try again.')
      return
    }
    setStatus('idle')
    setEmail('')
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet account-sheet"
        role="dialog"
        aria-label="Account"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <h2>Account</h2>
          <button className="sheet-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>

        {redirectError && !session && (
          <div className="notice error auth-notice" role="alert">
            {redirectError.code === 'otp_expired'
              ? 'That sign-in link has expired. Send yourself a new one below.'
              : `Sign-in link did not work (${redirectError.code}). Send yourself a new one below.`}
          </div>
        )}

        {loading ? (
          <p className="sheet-body muted">Checking session…</p>
        ) : session && user ? (
          <div className="auth-signed-in">
            <p className="sheet-body">
              Signed in as <strong>{profile?.display_name ?? user.email}</strong>
            </p>
            {profile?.display_name && (
              <p className="sheet-body muted">{user.email}</p>
            )}
            <button type="button" className="auth-logout-btn" disabled={logoutBusy} onClick={handleLogout}>
              {logoutBusy ? 'Logging out…' : 'Log out'}
            </button>
            {logoutError && <p className="sheet-body auth-error" role="alert">{logoutError}</p>}
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSend}>
            <p className="sheet-body">
              Sign in or create an account with a magic link — no password needed.
            </p>
            <label className="auth-field">
              <span className="auth-label">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={status === 'sending'}
              />
            </label>
            <button type="submit" className="auth-send-btn" disabled={status === 'sending'}>
              {status === 'sending' ? 'Sending…' : 'Send magic link'}
            </button>
            {status === 'sent' && (
              <p className="sheet-body auth-sent" role="status">
                Link sent — check your email and open the link on this device. New here? The same
                link creates your account.
              </p>
            )}
            {status === 'error' && (
              <p className="sheet-body auth-error" role="alert">
                {errorMsg}
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
