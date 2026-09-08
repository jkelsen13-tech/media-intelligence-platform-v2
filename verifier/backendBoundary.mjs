import assert from 'node:assert/strict'

export const AUTHORITATIVE_PROJECT = 'qikvmopbtijoebdqosyq'

// Capture only managed Supabase project identity and service family.
// Never retain headers, query strings, object names, tokens or payloads.
export function backendRequestTarget(rawUrl) {
  let url
  try { url = new URL(rawUrl) } catch { return null }
  const match = /^([a-z0-9]{20})(?:\.functions)?\.supabase\.co$/.exec(url.hostname)
  if (!match) return null
  const family = url.hostname.includes('.functions.') ? 'functions' : url.pathname.split('/')[1]
  return { project: match[1], service: ['rest','auth','storage','functions','realtime'].includes(family) ? family : 'other' }
}

export function verifyBackendTargets(targets, expected = AUTHORITATIVE_PROJECT) {
  assert.ok(targets.length > 0, 'No managed Supabase request observed; backend use is unverified')
  const projects = [...new Set(targets.map(target => target.project))].sort()
  assert.deepEqual(projects, [expected], 'Observed a non-authoritative Supabase backend')
  return { project: expected, requestCount: targets.length, services: [...new Set(targets.map(target => target.service))].sort() }
}

export function observeBackendBoundary(page) {
  const targets = []
  page.on('request', request => {
    const target = backendRequestTarget(request.url())
    if (target) targets.push(target)
  })
  return () => verifyBackendTargets(targets)
}
