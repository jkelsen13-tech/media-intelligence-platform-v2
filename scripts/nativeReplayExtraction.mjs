// Pure mirror of ingest-rss extraction only. Parity checked against the native source.
// No EntityResolver, database, admission or canonical identity operation.
const FRAMING_MARKERS = /\b(critics say|supporters say|some say|many believe|could|may|might|appears|seems|allegedly|reportedly|so-called|claims? to)\b/i

export function extractClaims(text) {
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.length > 40 && s.length < 400)
  const claims = []
  for (const s of sentences.slice(0, 12)) {
    claims.push({ text: s.trim(), kind: FRAMING_MARKERS.test(s) ? 'framing' : 'substantive' })
    if (claims.length >= 6) break
  }
  return claims
}

// ---------- Step 2: heuristic NER + persistent entity resolution ----------

const MONTHS_DAYS = new Set([
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december', 'monday', 'tuesday',
  'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
])

const STOP_SINGLE = new Set([
  ...MONTHS_DAYS,
  'the', 'a', 'an', 'in', 'on', 'at', 'as', 'it', 'he', 'she', 'but', 'and',
  'or', 'if', 'by', 'to', 'from', 'with', 'after', 'before', 'this', 'that',
  'these', 'those', 'there', 'here', 'what', 'how', 'why', 'when', 'where',
  'who', 'will', 'would', 'could', 'should', 'is', 'are', 'was', 'were',
  'has', 'have', 'had', 'not', 'no', 'yes', 'now', 'new', 'more', 'most',
  'all', 'one', 'two', 'first', 'last', 'latest', 'breaking', 'watch',
  'video', 'live', 'opinion', 'analysis', 'explainer', 'quiz', 'podcast',
  'newsletter', 'according', 'report', 'reports', 'source', 'sources',
  'official', 'officials', 'government', 'police', 'ministry', 'department',
  'court', 'senate', 'parliament', 'congress', 'army', 'navy', 'spokesperson',
  'headlines', 'digest', 'briefing', 'roundup', 'bulletin', 'updates',
  'uk', 'us', 'eu', 'un', 'mp', 'mps', 'pm',
])

const ROLE_TITLES_RE = /^(?:President|Prime Minister|Vice President|Deputy Prime Minister|Minister|Foreign Minister|Defence Minister|Senator|Governor|Mayor|Secretary(?: of State)?|Chancellor(?: of the Exchequer)?|Attorney General|MP|Mr|Ms|Mrs|Miss|Dr|Sir|Dame|Judge|Justice|Chief|General|Admiral|Captain|Colonel|Spokesperson|Officer|Professor|Father|Rabbi|Pope|King|Queen|Prince|Princess)\s+/i

// Phase 0 fix (entity hygiene): outlet names/aliases that must never become
// story entities even when absent from the outlets table. 'Daily Mail' was
// extracted and typed as a PERSON entity; it is a news outlet.
const OUTLET_NAME_ALIASES = new Set([
  'daily mail', 'mail online', 'mailonline', 'the daily mail', 'dailymail',
])

// Capitalized multi-word proper-noun phrases, allowing lowercase connectors
// so "Ministry of Defence" / "Bank of England" resolve as ONE entity.
// Token excludes trailing dots so sentence boundaries can't bleed into a
// surface ("England. The"); multi-letter abbreviations (U.S.) still match.
const PROPER_RE = /\b((?:(?:[A-Z]\.){2,}|[A-Z][\w'’\-]*)(?:(?:\s+(?:of|the|de|del|van|von|der|al|bin|and|&|for)\s+|\s+)(?:(?:[A-Z]\.){2,}|[A-Z][\w'’\-]*))*)/g


export function extractEntityCandidates(text, outletNames) {
  const candidates = new Map()
  for (const m of text.matchAll(PROPER_RE)) {
    let surface = m[1].trim().replace(/[\s.,;:]+$/, '').replace(/^[\s.,;:]+/, '')
    if (surface.length < 2) continue
    let role = null
    for (let k = 0; k < 3; k++) {
      const r = surface.match(ROLE_TITLES_RE)
      if (!r) break
      role = role ? `${role} ${r[0].trim()}` : r[0].trim()
      surface = surface.slice(r[0].length).trim()
    }
    if (surface.length < 2) continue
    // Label sanity filter: reject surfaces that still contain a sentence
    // break or read like a headline fragment (>6 words) — these are
    // extraction artifacts, not entities, and must never reach the tables.
    if (surface.includes('. ') || surface.split(/\s+/).length > 6) continue
    const words = surface.split(/\s+/)
    const norm = normalizeEntityName(surface)
    if (!norm) continue
    if (words.length === 1) {
      const isAcronym = /^[A-Z0-9&]{2,6}$/.test(surface)
      const occurrences = (text.match(new RegExp(`\\b${surface.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')) ?? []).length
      if (STOP_SINGLE.has(norm)) continue
      if (!isAcronym && occurrences < 2) continue // sentence-start noise
    } else {
      if (STOP_SINGLE.has(norm.split(' ')[0])) continue // "The Papers", "In ..."
      if (words.every((w) => STOP_SINGLE.has(w.toLowerCase()))) continue
    }
    if (outletNames.has(norm)) continue // outlet names are not story entities
    const cur = candidates.get(norm)
    if (cur) {
      cur.mentions++
      if (!cur.role && role) cur.role = role
      if (surface.length > cur.surface.length) cur.surface = surface
    } else {
      candidates.set(norm, { surface, role, mentions: 1 })
    }
  }
  return [...candidates.values()]
}

export function normalizeEntityName(s) {
  return s
    .toLowerCase()
    .replace(/[''’]s\b/g, '') // strip possessives
    .replace(/\bs’$/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function guessEntityType(name) {
  if (/\b(ministry|department|agency|police|court|senate|congress|parliament|government|army|navy|air force|commission|authority|council|committee|office|bureau|service|garda|gardaí|psni|nato|fbi|cia|federal reserve|met office|white house|downing street|pentagon|treasury|home office)\b/i.test(name)) return 'institution'
  if (/\b(inc|ltd|corp|corporation|company|group|holdings|airlines?|airways|bank|university|college|hospital|school|club|fc|party|union|association|institute|foundation|charity|trust|media|news|broadcasting)\b/i.test(name)) return 'organization'
  const words = name.split(/\s+/)
  if (words.length === 2 && words.every((w) => /^[A-Z][a-zA-Z'’.\-]+$/.test(w) && !/^[A-Z]{2,}$/.test(w))) return 'person'
  return 'other'
}
