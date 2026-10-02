// Supplied source locators remain text unless they are absolute HTTP(S) URLs.
// URL parsing alone normalizes backslashes and strips some control characters;
// reject those ambiguous spellings before parsing.
export function safeExternalHttpUrl(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return null
  if (!/^https?:\/\//i.test(raw) || /[\s\\\u0000-\u001f\u007f]/.test(raw)) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (url.username || url.password) return null
    return url.href
  } catch {
    return null
  }
}
