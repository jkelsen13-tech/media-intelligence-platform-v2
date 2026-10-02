import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { createElement } from 'react'
import TestRenderer, { act } from 'react-test-renderer'
import { deferred } from '../src/lib/investigationWorkspaceFixtures.js'

const output = new URL('./.compiled/auth-account-panel.mjs', import.meta.url)
mkdirSync(new URL('./.compiled/', import.meta.url), { recursive: true })
await build({ entryPoints: [fileURLToPath(new URL('../src/panels/AccountPanel.jsx', import.meta.url))],
  outfile: fileURLToPath(output), bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic',
  loader: { '.css': 'empty' }, plugins: [{ name: 'controlled-account-auth', setup(builder) {
    builder.onLoad({ filter: /\/lib\/auth\.js$/ }, () => ({ contents: `
      const state = () => globalThis.__mipAccountAuth;
      export const useAuthSession = () => state().auth;
      export const useOwnProfile = () => state().profile ?? null;
      export const signOut = () => state().signOut();
      export const sendMagicLink = email => state().sendMagicLink(email);
      export const authRedirectError = () => state().redirectError ?? null;
      export const clearAuthRedirectError = () => {};
    `, loader: 'js' }))
  } }] })
const { default: AccountPanel } = await import(output.href)
const text = (renderer) => JSON.stringify(renderer.toJSON())
const signedIn = { session: { user: { id: 'owner' } }, user: { id: 'owner', email: 'owner@example.invalid' }, loading: false }

test('account logout has a pending state and reports a failed logout without claiming success', async () => {
  const pending = deferred()
  globalThis.__mipAccountAuth = { auth: signedIn, signOut: () => pending.promise }
  let renderer
  await act(async () => { renderer = TestRenderer.create(createElement(AccountPanel)) })
  await act(async () => { void renderer.root.findByProps({ className: 'auth-logout-btn' }).props.onClick() })
  assert.equal(renderer.root.findByProps({ className: 'auth-logout-btn' }).props.disabled, true)
  assert.match(text(renderer), /Logging out/)
  await act(async () => pending.resolve({ error: { message: 'offline' } }))
  assert.match(text(renderer), /Could not log out/)
  assert.match(text(renderer), /Signed in as/)
  assert.equal(renderer.root.findByProps({ className: 'auth-logout-btn' }).props.disabled, false)
  await act(async () => renderer.unmount())
  delete globalThis.__mipAccountAuth
})

test('account shows an expired callback and clean failed magic-link submission', async () => {
  globalThis.__mipAccountAuth = { auth: { session: null, user: null, loading: false },
    redirectError: { code: 'otp_expired' }, sendMagicLink: async () => ({ error: { message: 'Could not send the sign-in link.' } }) }
  let renderer
  await act(async () => { renderer = TestRenderer.create(createElement(AccountPanel)) })
  assert.match(text(renderer), /sign-in link has expired/)
  await act(async () => renderer.root.findByType('input').props.onChange({ target: { value: 'owner@example.invalid' } }))
  await act(async () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }))
  assert.match(text(renderer), /Could not send the sign-in link/)
  assert.doesNotMatch(text(renderer), /Link sent/)
  await act(async () => renderer.unmount())
  delete globalThis.__mipAccountAuth
})
