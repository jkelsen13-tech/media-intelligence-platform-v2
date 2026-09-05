import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ---------------------------------------------------------------------------
// MIP Build Directive v2 — Steps 1-4.
// Step 1: sanitize once at the boundary (strip CDATA/HTML, retain image
//         provenance, DECODE HTML entities — never delete them).
// Step 2: hybrid NER behind a single extractEntities() seam (heuristic now,
//         optional model when NER_API_URL/NER_API_KEY or HF_API_TOKEN secrets
//         are set) + persistent entity resolution (entities, article_entities,
//         arc_entities). Attachment requires a shared resolved entity;
//         embedding similarity only shortlists candidates.
// Step 3: digest exclusion; consequence rules (shared entity + causal
//         language or citation — date proximity removed); arc titles
//         "[actor] — [process]" with no 'developments' fallback (no process
//         => no arc); calibrated classifier.
// Step 4: arc_milestones generated at origination; ingest-time evidence
//         check confirms/fails pending milestones from article text.
//
// Incident fix 2026-08-10 (doc07 canary sweep):
//   (1) INGEST_RSS_RUN_KEY run-key gate (fail-closed), same pattern as
//       batch-intake / source-comparison-run / graph-analysis-run.
//   (2) pipeline_config.held_run_tags (JSON array) — articles ingested under
//       a held ingestion_run_id are excluded from the Phase 2
//       unattached-sweep pool.
// ---------------------------------------------------------------------------

async function loadConfig(supabase: any) {
  const { data, error } = await supabase.from('pipeline_config').select('key, value')
  if (error) throw error
  const cfg: Record<string, any> = {}
  for (const row of data) cfg[row.key] = row.value
  return cfg
}

// ---------- Step 1: sanitization ----------

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  hellip: '…', middot: '·', bull: '•', dagger: '†', Dagger: '‡',
  prime: '′', Prime: '″', minus: '−', permil: '‰', frasl: '⁄',
  trade: '™', copy: '©', reg: '®', deg: '°', plusmn: '±', times: '×', divide: '÷',
  pound: '£', euro: '€', yen: '¥', cent: '¢', sect: '§', para: '¶', micro: 'µ',
  eacute: 'é', Eacute: 'É', egrave: 'è', Egrave: 'È', agrave: 'à', Agrave: 'À',
  ccedil: 'ç', Ccedil: 'Ç', uuml: 'ü', Uuml: 'Ü', ouml: 'ö', Ouml: 'Ö',
  auml: 'ä', Auml: 'Ä', iuml: 'ï', euml: 'ë', iacute: 'í', Iacute: 'Í',
  oacute: 'ó', Oacute: 'Ó', uacute: 'ú', Uacute: 'Ú', ntilde: 'ñ', Ntilde: 'Ñ',
  szlig: 'ß', oelig: 'œ', OElig: 'Œ', aelig: 'æ', AElig: 'Æ', aring: 'å', Aring: 'Å',
  oslash: 'ø', Oslash: 'Ø', ecirc: 'ê', Ecirc: 'Ê', acirc: 'â', Acirc: 'Â',
  ocirc: 'ô', Ocirc: 'Ô', ucirc: 'û', Ucirc: 'Û', icirc: 'î', Icirc: 'Î',
  atilde: 'ã', Atilde: 'Ã', otilde: 'õ', Otilde: 'Õ',
  rsaquo: '›', lsaquo: '‹', laquo: '«', raquo: '»', rarr: '→', larr: '←', harr: '↔',
  sup2: '²', sup3: '³', frac12: '½', frac14: '¼', frac34: '¾',
  brvbar: '¦', uml: '¨', acute: '´', cedil: '¸', ordf: 'ª', ordm: 'º',
  iexcl: '¡', iquest: '¿', shy: '',
}

// Prefixes (>= 2 chars) of known entity names. A trailing '&' + one of these
// at end-of-text is a truncated entity fragment ("...Asia.&lt"), not prose;
// single-letter tails ("M&A", "R&D") and non-entity words ("Goldman & Co")
// are left alone.
const TRUNCATED_ENTITY_PREFIXES = new Set([
  'lt', 'gt', 'am', 'amp', 'qu', 'quo', 'quot', 'ap', 'apo', 'apos',
  'nb', 'nbs', 'nbsp', 'hel', 'hell', 'helli', 'hellip',
  'mda', 'mdas', 'mdash', 'nda', 'ndas', 'ndash',
  'lsq', 'lsqu', 'lsquo', 'rsq', 'rsqu', 'rsquo',
  'ldq', 'ldqu', 'ldquo', 'rdq', 'rdqu', 'rdquo',
  'mid', 'midd', 'middo', 'middot', 'bul', 'bull',
  'cop', 'copy', 'reg', 'tra', 'trad', 'trade', 'deg',
])

function decodeEntities(s: string): string {
  // Phase 0 Part 2 Tier 2: decode to a FIXPOINT (max 3 passes) so
  // double-encoded input resolves fully (&amp;apos; -> &apos; -> '), and
  // tolerate whitespace-malformed entities (& apos; -> ').
  for (let pass = 0; pass < 3; pass++) {
    const before = s
    s = s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{0,9}|\s+[a-zA-Z]{2,9});/g, (m, g) => {
      if (g[0] === '#') {
        const n = g[1] === 'x' || g[1] === 'X' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10)
        if (Number.isFinite(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff)) {
          try { return String.fromCodePoint(n) } catch { return m }
        }
        return m
      }
      return NAMED_ENTITIES[g.trim()] ?? m
    })
    if (s === before) break
  }
  return s
}

interface Sanitized {
  text: string
  imageUrl: string | null
  imageAlt: string | null
}

// Sanitize ONCE at the boundary: strip CDATA wrappers, pull image provenance
// into separate fields, DECODE entities first (so entity-encoded tags like
// &lt;a href="..."&gt; become literal markup and get stripped too), strip
// complete tags, strip broken/truncated tag fragments (</span&, unterminated
// <a href="..., bare trailing <), drop residual unknown entities
// (whitespace-tolerant), decode bare entity words left by legacy
// half-stripped input (apos;/quot;), remove truncated entity tails at
// end-of-text, then collapse whitespace.
function sanitize(raw: string | null | undefined): Sanitized {
  if (!raw) return { text: '', imageUrl: null, imageAlt: null }
  let s = String(raw).replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '')
  let imageUrl: string | null = null
  let imageAlt: string | null = null
  const img = s.match(/<img\b[^>]*>/i) ?? s.match(/<img\b[\s\S]*$/i)
  if (img) {
    const src = img[0].match(/src\s*=\s*"([^"]+)"/i) ?? img[0].match(/src\s*=\s*'([^']+)'/i)
    const alt = img[0].match(/alt\s*=\s*"([^"]*)"/i) ?? img[0].match(/alt\s*=\s*'([^']*)'/i)
    imageUrl = src ? src[1] : null
    imageAlt = alt ? alt[1] : null
  }
  s = s.replace(/<img\b[^>]*>?/gi, ' ')
  // Decode BEFORE tag-stripping: encoded tags (&lt;b&gt;, &lt;/span&amp;gt;)
  // become literal markup here and are removed by the next passes.
  s = decodeEntities(s)
  s = s.replace(/<[^>]+>/g, ' ') // complete tags (incl. decoded ones)
  s = s.replace(/<\/?[a-zA-Z][a-zA-Z0-9]*&[a-zA-Z]{0,9}(?![a-zA-Z0-9]*;)/g, ' ') // broken fragments: </span&, </a&gt (any position)
  s = s.replace(/<\/?[a-zA-Z!][^>]{0,400}$/, ' ') // unterminated tag at end (<a href="htt)
  s = s.replace(/<\/?$/, ' ') // bare trailing < or </
  s = s.replace(/&\s*[a-zA-Z#0-9]{1,10};/g, ' ') // residual unknown entities (whitespace-tolerant)
  // Tier 2 round 2: repair half-stripped entities (mirrors the r2
  // mip_clean_display_text() in the database).
  // (1) Bare known-entity words whose '&' was stripped upstream by legacy
  //     cleaners ("Trump apos;s", 'quot;60 Minutes quot;') decode to their
  //     character; an optional leading '&' and whitespace before ';' are
  //     tolerated. For quot;, a preceding space is consumed only for a
  //     CLOSING quote (followed by whitespace/end) so 'her quot;60' keeps
  //     its opening-quote spacing.
  s = s.replace(/&?\s+apos\s*;/g, "'")
  s = s.replace(/&?\bapos\s*;/g, "'")
  s = s.replace(/&?\s+quot\s*;(?=\s|$)/g, '"')
  s = s.replace(/&?\bquot\s*;/g, '"')
  s = s.replace(/&?\s*\bnbsp\s*;/g, ' ')
  s = s.replace(/&?\bamp\s*;/g, '&')
  s = s.replace(/&?\blt\s*;/g, '<')
  s = s.replace(/&?\bgt\s*;/g, '>')
  // (2) Truncated entity tails at end-of-text ("...war&", "...Asia.&lt")
  //     are removed; trailing punctuation is kept (and not duplicated when
  //     it already precedes the fragment: "Asia.&lt." -> "Asia.").
  s = s.replace(/&(#x?[0-9a-fA-F]{0,7}|[a-zA-Z]{2,9})([.,;:!?)\]]*)\s*$/, (m, g, punct, off, str) => {
    if (g[0] !== '#' && !TRUNCATED_ENTITY_PREFIXES.has(g.toLowerCase())) return m
    const prev = str[off - 1]
    return prev && punct.startsWith(prev) ? punct.slice(1) : punct
  })
  s = s.replace(/&(\s*[.,;:!?)\]]*)$/, '$1') // bare trailing '&' ("war&." -> "war.")
  s = s.replace(/\s+/g, ' ').trim()
  return { text: s, imageUrl, imageAlt }
}

function tag(block: string, name: string): string | null {
  const openTag = '<' + name
  const i = block.indexOf(openTag)
  if (i < 0) return null
  const boundary = block[i + openTag.length]
  if (boundary !== '>' && boundary !== ' ' && boundary !== '\t' && boundary !== '\n' && boundary !== '/') return null
  const gt = block.indexOf('>', i)
  const closeTag = '</' + name + '>'
  const j = block.indexOf(closeTag, gt)
  if (gt < 0 || j < 0) return null
  return block.slice(gt + 1, j)
}

function parseDate(s: string | null): string | null {
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function absoluteUrl(base: string, href: string): string {
  try { return new URL(href, base).toString() } catch { return href }
}

interface RawItem {
  title: string
  url: string
  summary: string | null
  published_at: string | null
  byline: string | null
  image_url: string | null
  image_alt: string | null
}

function parseFeed(xml: string, feedUrl: string): RawItem[] {
  const items: RawItem[] = []
  for (const m of xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi)) {
    const b = m[1]
    const t = sanitize(tag(b, 'title'))
    const link = sanitize(tag(b, 'link') ?? tag(b, 'guid')).text
    if (!t.text || !link) continue
    const d = sanitize(tag(b, 'description'))
    items.push({
      title: t.text,
      url: absoluteUrl(feedUrl, link),
      summary: d.text.slice(0, 2000) || null,
      published_at: parseDate(sanitize(tag(b, 'pubDate') ?? tag(b, 'dc:date')).text),
      byline: sanitize(tag(b, 'dc:creator') ?? tag(b, 'author')).text || null,
      image_url: d.imageUrl ?? t.imageUrl,
      image_alt: d.imageAlt ?? t.imageAlt,
    })
  }
  for (const m of xml.matchAll(/<entry[\s>]([\s\S]*?)<\/entry>/gi)) {
    const b = m[1]
    const t = sanitize(tag(b, 'title'))
    const linkMatch = b.match(/<link[^>]*href=["']([^"']+)["']/i)
    if (!t.text || !linkMatch) continue
    const authorBlock = b.match(/<author[\s>]([\s\S]*?)<\/author>/i)
    const d = sanitize(tag(b, 'summary') ?? tag(b, 'content'))
    items.push({
      title: t.text,
      url: absoluteUrl(feedUrl, linkMatch[1]),
      summary: d.text.slice(0, 2000) || null,
      published_at: parseDate(sanitize(tag(b, 'published') ?? tag(b, 'updated')).text),
      byline: authorBlock ? sanitize(tag(authorBlock[1], 'name')).text || null : null,
      image_url: d.imageUrl ?? t.imageUrl,
      image_alt: d.imageAlt ?? t.imageAlt,
    })
  }
  return items
}

// ---------- citations & claims (unchanged behaviour, sanitized input) ----------

const CITATION_PATTERNS: Array<{ type: string; re: RegExp }> = [
  { type: 'court_doc', re: /(court documents?|court filing|court records?|indictment|affidavit|criminal complaint|lawsuit)([^.]{0,80})/i },
  { type: 'agency_release', re: /(press release|official statement|statement from the [A-Z][^.]{0,60}|agency (said|confirmed|reported)[^.]{0,60})/i },
  { type: 'named_official', re: /([A-Z][a-zA-Z'’-]+ [A-Z][a-zA-Z'’-]+ (?:said|told|announced|confirmed|stated)[^.]{0,60})/ },
  { type: 'anonymous_official', re: /((?:officials?|sources?)(?: familiar with| close to| briefed on)?[^.]{0,40}said|unnamed official[^.]{0,60}|anonymous official[^.]{0,60})/i },
  { type: 'study', re: /((?:study|report|poll|research|analysis)[^.]{0,40}(?:found|shows|published|concluded)[^.]{0,60})/i },
  { type: 'prior_reporting', re: /(previously reported[^.]{0,60}|according to (?:the )?(?:New York Times|BBC|CNN|Fox News|Al Jazeera|Reuters|AP)[^.]{0,60})/i },
]

function extractCitations(text: string, weights: Record<string, number>) {
  const found: Array<{ cited_entity: string; cited_type: string; documentation_strength: number }> = []
  const seen = new Set<string>()
  for (const { type, re } of CITATION_PATTERNS) {
    const m = text.match(re)
    if (m && !seen.has(type)) {
      seen.add(type)
      found.push({
        cited_entity: (m[1] ?? m[0]).trim().slice(0, 160),
        cited_type: type,
        documentation_strength: weights[type] ?? 0.2,
      })
    }
  }
  return found
}

const FRAMING_MARKERS = /\b(critics say|supporters say|some say|many believe|could|may|might|appears|seems|allegedly|reportedly|so-called|claims? to)\b/i

function extractClaims(text: string) {
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.length > 40 && s.length < 400)
  const claims: Array<{ text: string; kind: 'substantive' | 'framing' }> = []
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

interface EntityCandidate {
  surface: string
  role: string | null
  mentions: number
}

function extractEntityCandidates(text: string, outletNames: Set<string>): EntityCandidate[] {
  const candidates = new Map<string, EntityCandidate>()
  for (const m of text.matchAll(PROPER_RE)) {
    let surface = m[1].trim().replace(/[\s.,;:]+$/, '').replace(/^[\s.,;:]+/, '')
    if (surface.length < 2) continue
    let role: string | null = null
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

function normalizeEntityName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[''’]s\b/g, '') // strip possessives
    .replace(/\bs’$/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function guessEntityType(name: string): string {
  if (/\b(ministry|department|agency|police|court|senate|congress|parliament|government|army|navy|air force|commission|authority|council|committee|office|bureau|service|garda|gardaí|psni|nato|fbi|cia|federal reserve|met office|white house|downing street|pentagon|treasury|home office)\b/i.test(name)) return 'institution'
  if (/\b(inc|ltd|corp|corporation|company|group|holdings|airlines?|airways|bank|university|college|hospital|school|club|fc|party|union|association|institute|foundation|charity|trust|media|news|broadcasting)\b/i.test(name)) return 'organization'
  const words = name.split(/\s+/)
  if (words.length === 2 && words.every((w) => /^[A-Z][a-zA-Z'’.\-]+$/.test(w) && !/^[A-Z]{2,}$/.test(w))) return 'person'
  return 'other'
}

interface ResolvedEntity {
  id: string
  canonical_name: string
  entity_type: string
  confidence: number
  role: string | null
  isNew: boolean
}

// Persistent resolver: exact canonical/alias match (high) > unambiguous
// token-subset fuzzy match (medium) > create new entity. Every extraction is
// logged to article_entities with its confidence and method.
class EntityResolver {
  byNorm = new Map<string, any>()
  aliasIdx = new Map<string, any>()
  exactConf: number
  fuzzyConf: number
  newConf: number

  constructor(cfg: any) {
    this.exactConf = Number(cfg.entity_exact_confidence ?? 0.95)
    this.fuzzyConf = Number(cfg.entity_fuzzy_confidence ?? 0.7)
    this.newConf = Number(cfg.entity_new_confidence ?? 0.5)
  }

  async load(supabase: any) {
    let from = 0
    for (;;) {
      const { data, error } = await supabase
        .from('entities')
        .select('id, canonical_name, normalized_name, aliases, entity_type, mention_count')
        .range(from, from + 999)
      if (error) throw error
      if (!data || data.length === 0) break
      for (const e of data) this.index(e)
      if (data.length < 1000) break
      from += 1000
    }
  }

  index(e: any) {
    this.byNorm.set(e.normalized_name, e)
    for (const a of e.aliases ?? []) {
      const an = normalizeEntityName(a)
      if (an) this.aliasIdx.set(an, e)
    }
  }

  async resolve(supabase: any, cand: EntityCandidate): Promise<ResolvedEntity | null> {
    const norm = normalizeEntityName(cand.surface)
    if (!norm) return null
    let ent = this.byNorm.get(norm) ?? this.aliasIdx.get(norm)
    let conf = ent ? this.exactConf : 0
    if (!ent) {
      // Fuzzy: token-subset match, only when exactly ONE candidate matches.
      const toks = new Set(norm.split(' '))
      if (toks.size >= 2) {
        const hits: any[] = []
        for (const [en, e] of this.byNorm) {
          const et = new Set(en.split(' '))
          const sub = [...toks].every((t) => et.has(t)) || [...et].every((t) => toks.has(t))
          if (sub) hits.push(e)
        }
        if (hits.length === 1) {
          // Phase 0 fix (entity hygiene): token-subset fuzzy resolution
          // produced cross-type junk (e.g. outlets/places resolving onto
          // person entities). Accept a fuzzy hit only when the candidate's
          // type AGREES with the stored entity type and the fuzzy confidence
          // meets the resolve floor.
          const candType = (cand as ModelEntityCandidate).entityType ?? guessEntityType(cand.surface)
          if (hits[0].entity_type === candType && this.fuzzyConf >= 0.5) {
            ent = hits[0]
            conf = this.fuzzyConf
          }
        }
      }
    }
    if (!ent) {
      const { data, error } = await supabase
        .from('entities')
        .upsert(
          {
            canonical_name: cand.surface.slice(0, 160),
            normalized_name: norm,
            entity_type: (cand as ModelEntityCandidate).entityType ?? guessEntityType(cand.surface),
            mention_count: 0,
            last_seen: new Date().toISOString(),
          },
          { onConflict: 'normalized_name' },
        )
        .select('id, canonical_name, normalized_name, aliases, entity_type, mention_count')
        .single()
      if (error || !data) return null
      ent = data
      this.index(ent)
      if (cand.surface !== ent.canonical_name) {
        const aliases = new Set(ent.aliases ?? [])
        aliases.add(cand.surface.slice(0, 160))
        await supabase.from('entities').update({ aliases: [...aliases] }).eq('id', ent.id)
        ent.aliases = [...aliases]
        this.aliasIdx.set(norm, ent)
      }
      return { id: ent.id, canonical_name: ent.canonical_name, entity_type: ent.entity_type, confidence: this.newConf, role: cand.role, isNew: true }
    }
    // Existing entity: alias unseen surface forms (obvious duplicate merge).
    if (cand.surface !== ent.canonical_name && !(ent.aliases ?? []).includes(cand.surface)) {
      const aliases = [...(ent.aliases ?? []), cand.surface.slice(0, 160)]
      await supabase.from('entities').update({ aliases }).eq('id', ent.id)
      ent.aliases = aliases
      this.aliasIdx.set(norm, ent)
    }
    await supabase
      .from('entities')
      .update({ last_seen: new Date().toISOString(), mention_count: (ent.mention_count ?? 0) + cand.mentions })
      .eq('id', ent.id)
    ent.mention_count = (ent.mention_count ?? 0) + cand.mentions
    return { id: ent.id, canonical_name: ent.canonical_name, entity_type: ent.entity_type, confidence: conf, role: cand.role, isNew: false }
  }
}

// ---------- Entity extraction seam (hybrid heuristic/model) ----------
//
// extractEntities(text, outletNames) is THE single seam for NER. Everything
// downstream (entities table, EntityResolver canonicalization, article_entities
// confidence logging, arc attachment) consumes only its return value and never
// cares which path produced the candidates.
//
// Paths:
//   - 'heuristic'        : regex/stoplist extractor only (default today).
//   - 'model'            : external NER model only (heuristics produced nothing).
//   - 'model+heuristic'  : merged; model spans win on overlap.
//
// OPTIONAL MODEL PATH — config-only to enable:
//   Set Supabase secrets `NER_API_URL` and `NER_API_KEY` (or `HF_API_TOKEN`
//   with no NER_API_URL to use the HF Inference API default bert-base-NER).
//   When the secret is absent the model path is skipped silently.
//
// Expected model request shape:
//   POST <NER_API_URL>
//   headers: Authorization: Bearer <NER_API_KEY|HF_API_TOKEN>,
//            Content-Type: application/json
//   body: { "inputs": "<article text>" }            // HF inference style
//
// Accepted response shapes (any of):
//   1. HF token-classification: [[{ entity_group|entity, word, start, end,
//      score }...]] (also accepted unwrapped: [...])
//   2. Generic span list: { "entities": [{ "text"|"surface", "type"?,
//      "start"?, "end"?, "score"? }...] }
// Model entity types are mapped onto our entity_type vocabulary
// (person/organization/institution/other) at merge time; PER->person,
// ORG->organization, LOC/MISC->other.

type ExtractionMethod = 'heuristic' | 'model' | 'model+heuristic'

interface ModelEntityCandidate extends EntityCandidate {
  entityType?: string
}

function mapModelEntityType(t: string): string | undefined {
  const u = t.toUpperCase()
  if (u.startsWith('PER')) return 'person'
  if (u.startsWith('ORG')) return 'organization'
  if (u === 'INSTITUTION') return 'institution'
  if (u.startsWith('LOC') || u.startsWith('GPE') || u.startsWith('MISC')) return 'other'
  return undefined
}

// Calls the configured NER model. Returns null when unconfigured OR on any
// failure — callers always fall back to heuristics.
async function extractEntitiesModel(text: string): Promise<ModelEntityCandidate[] | null> {
  const url = Deno.env.get('NER_API_URL') ??
    (Deno.env.get('HF_API_TOKEN')
      ? 'https://api-inference.huggingface.co/models/dslim/bert-base-NER'
      : undefined)
  const key = Deno.env.get('NER_API_KEY') ?? Deno.env.get('HF_API_TOKEN')
  if (!url || !key) return null // secrets absent: heuristic-only (today's default)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: text.slice(0, 8000) }),
    })
    if (!res.ok) {
      console.warn(`ner-model: HTTP ${res.status}; falling back to heuristics`)
      return null
    }
    const body = await res.json()
    const raw: any[] = Array.isArray(body)
      ? (Array.isArray(body[0]) ? body[0] : body)
      : (body?.entities ?? [])
    const byNorm = new Map<string, ModelEntityCandidate>()
    for (const e of raw) {
      const surface = String(e.text ?? e.surface ?? e.word ?? '').replace(/^##/, '').trim()
      if (surface.length < 2) continue
      const norm = normalizeEntityName(surface)
      if (!norm || STOP_SINGLE.has(norm)) continue
      const cur = byNorm.get(norm)
      if (cur) cur.mentions++
      else {
        byNorm.set(norm, {
          surface,
          role: null,
          mentions: 1,
          entityType: mapModelEntityType(String(e.type ?? e.entity_group ?? e.entity ?? '')),
        })
      }
    }
    return [...byNorm.values()]
  } catch (err) {
    console.warn(`ner-model: call failed (${String(err)}); falling back to heuristics`)
    return null
  }
}

// Single NER seam. Model spans win on overlap: a heuristic candidate is
// dropped when its normalized name is a token-subset/superset of a model
// candidate's normalized name. Canonicalization/resolution downstream is
// shared regardless of path.
async function extractEntities(
  text: string,
  outletNames: Set<string>,
): Promise<{ candidates: EntityCandidate[]; method: ExtractionMethod }> {
  const heuristic = extractEntityCandidates(text, outletNames)
  const model = await extractEntitiesModel(text)
  if (!model) return { candidates: heuristic, method: 'heuristic' }
  const modelNorms = model.map((c) => new Set(normalizeEntityName(c.surface).split(' ')))
  const keptHeuristic = heuristic.filter((h) => {
    const ht = new Set(normalizeEntityName(h.surface).split(' '))
    return !modelNorms.some(
      (mt) => [...ht].every((t) => mt.has(t)) || [...mt].every((t) => ht.has(t)),
    )
  })
  const candidates: EntityCandidate[] = [...model, ...keptHeuristic]
  return { candidates, method: keptHeuristic.length > 0 ? 'model+heuristic' : 'model' }
}

async function extractAndResolveEntities(
  supabase: any,
  resolver: EntityResolver,
  articleId: string,
  text: string,
  outletNames: Set<string>,
): Promise<ResolvedEntity[]> {
  const { candidates, method } = await extractEntities(text, outletNames)
  console.log(`ner-path: article=${articleId} method=${method} candidates=${candidates.length}`)
  const resolved: ResolvedEntity[] = []
  const seenIds = new Set<string>()
  for (const cand of candidates.slice(0, 25)) {
    try {
      const r = await resolver.resolve(supabase, cand)
      if (!r || seenIds.has(r.id)) continue
      seenIds.add(r.id)
      resolved.push(r)
      await supabase.from('article_entities').upsert(
        {
          article_id: articleId,
          entity_id: r.id,
          confidence: r.confidence,
          extraction_method: method,
          role: r.role,
        },
        { onConflict: 'article_id,entity_id' },
      )
    } catch {
      // entity resolution is best-effort per candidate
    }
  }
  return resolved
}

// ---------- Step 3a: digest exclusion ----------

const DIGEST_TITLE_RE = /\b(headlines? for|the papers|what we know|daily briefing|morning (digest|briefing|roundup)|evening (digest|briefing|roundup)|news digest|(news|sport)s? roundup|round-up|the week in|week in review|catch[- ]up|live updates?|news bulletin|at a glance|recap|in pictures)\b/i

function isDigest(title: string, entityCount: number, digestEntityCount: number): boolean {
  if (DIGEST_TITLE_RE.test(title)) return true
  return entityCount >= digestEntityCount
}

// ---------- Step 3b: consequence signals (causal language OR citation) ----------
//
// Phase 0 Part 2 Tier 3: a causal edge requires an explicit CAUSAL statement
// (or a citation) — never a temporal connective alone. Temporal keywords
// (after/following/amid/in the wake of/on the back of/days-after/hours-after)
// mark SEQUENCE, not causation; 'citing' is attribution and 'linked to' is
// merely associative — both removed from the causal trigger set. Gate: no
// causal edge rests on a keyword alone.

// Temporal-only connectives -> non-causal 'sequence' edges.
const TEMPORAL_RE = /\b(after|following|amid|in the wake of|on the back of|days? after|hours? after)\b/i

// Explicit causal statements only.
const CAUSAL_RE = /\b(as a result of|in response to|because of|due to|owing to|sparked by|triggered by|prompted by|in retaliation for|in protest (of|at|against)|caused by|led to|resulting from)\b/i

function temporalEvidence(text: string): string | null {
  const m = text.match(TEMPORAL_RE)
  return m ? m[0] : null
}

// A causal phrase counts as evidence only when a shared resolved entity (or a
// reference to the arc's root event) appears in the same sentence /
// ±150-char window — otherwise the phrase describes the article's OWN
// narrative, not a relation to the root event.
function causalEvidence(text: string, sharedEntities: string[] = [], rootTitle: string | null = null): string | null {
  const m = text.match(CAUSAL_RE)
  if (!m || m.index === undefined) return null
  const lo = Math.max(0, m.index - 150)
  const hi = Math.min(text.length, m.index + m[0].length + 150)
  const window = text.slice(lo, hi).toLowerCase()
  const refs = [...sharedEntities, ...(rootTitle ? [rootTitle] : [])]
  for (const ref of refs) {
    const norm = String(ref).toLowerCase().replace(/\s+/g, ' ').trim()
    if (norm.length >= 3 && window.includes(norm)) return m[0]
  }
  return null
}

// Phase 2 (02B) evidence capture: sentence/window containing the evidence
// marker, <= 400 chars. Stored in the NEW metadata.evidence_passage field —
// metadata.evidence (the marker, read by the r5 guard) is NOT changed.
function passageAround(text: string, marker: string | null): string | null {
  if (!marker) return null
  const i = text.toLowerCase().indexOf(marker.toLowerCase())
  if (i < 0) return null
  const lo = Math.max(0, text.lastIndexOf('.', i) + 1, i - 150)
  const hi = Math.min(text.length, i + marker.length + 150)
  return text.slice(lo, hi).trim().replace(/\s+/g, ' ').slice(0, 400)
}

// ---------- classifier ----------
// Spec §2.5.3 defines exactly four named categories; 'unclassified' only when
// genuinely ambiguous. Keyword/weight rubric operationalises those category
// definitions; confidence is logged for every arc and the floor is calibrated
// from the measured distribution (stored in pipeline_config).

const CATEGORY_RUBRIC: Array<{ category: string; weight: number; re: RegExp }> = [
  // Institutional accountability: scrutiny of whether an institution or
  // officeholder discharged their duties — investigations, failures,
  // misconduct, oversight, legal exposure of officials.
  { category: 'institutional_accountability', weight: 0.45, re: /\b(investigation|investigating|probe|inquiry|inquest|misconduct|cover-up|oversight|indictment|indicted|arrest\w*|charged|jailed|blackmail|sacked|suspended|resignation|resigned)\b/i },
  { category: 'institutional_accountability', weight: 0.3, re: /\b(lack of authority|accountability|failure\w*|failings|negligence|whistleblow\w*|lawsuit|scandal|corruption|disciplinary|grooming|abuse)\b/i },
  { category: 'institutional_accountability', weight: 0.15, re: /\b(apolog\w+|compensation|report found|review found|criticis\w+)\b/i },
  // Geopolitical consequence: state / armed-actor actions and their
  // cross-border effects (shipping disruption, displacement, escalation).
  { category: 'geopolitical_consequence', weight: 0.45, re: /\b(war|ceasefire|missile\w*|troops|invasion|drone strike|nato|treaty|houthis?|red sea|escalation|airstrike\w*|hostages?|gaza|ukraine)\b/i },
  { category: 'geopolitical_consequence', weight: 0.35, re: /\b(sanctions?|shipping threat|tanker\w*|u-turn\w*|evacuation|displacement|cross-border|diplomat\w*|embassy|militia|insurgent\w*)\b/i },
  { category: 'geopolitical_consequence', weight: 0.15, re: /\b(allies|summit|foreign minister|defence|defense|security council|border)\b/i },
  // Economic policy: policy levers acting on the economy.
  { category: 'economic_policy', weight: 0.45, re: /\b(tariff\w*|inflation|interest rate\w*|federal reserve|trade (deal|war|dispute|crosshairs)|recession|budget|gdp|central bank)\b/i },
  { category: 'economic_policy', weight: 0.3, re: /\b(supply chain|jobs report|dairy sector|auto industry|rent control\w*|cost of living|wages?|deficit|spending|economy|economic)\b/i },
  { category: 'economic_policy', weight: 0.15, re: /\b(markets?|stocks?|shares|oil prices?|energy prices?|prices?)\b/i },
  // Legislative / regulatory: the lawmaking and rulemaking process.
  { category: 'legislative_regulatory', weight: 0.45, re: /\b(bill|senate|house passes|regulation|supreme court|executive order|congress|parliament|vote\w*|ruling|legislation|lawmakers)\b/i },
  { category: 'legislative_regulatory', weight: 0.3, re: /\b(rules out|backs off|pledge|ban\w*|controls|amendment|regulator\w*|white paper|statutory|clause|committee stage)\b/i },
  { category: 'legislative_regulatory', weight: 0.15, re: /\b(law|legal|court|judge|appeal|hearing)\b/i },
]

interface Classification {
  category: string
  confidence: number
  evidence: string | null
}

// Confidence is computed and logged regardless of floor; applyFloor decides
// whether the label stands.
function classifyArc(text: string): Classification {
  const scores = new Map<string, { score: number; evidence: string | null }>()
  for (const { category, weight, re } of CATEGORY_RUBRIC) {
    const m = text.match(re)
    if (!m) continue
    const cur = scores.get(category) ?? { score: 0, evidence: null }
    cur.score += weight
    if (!cur.evidence) cur.evidence = m[0]
    scores.set(category, cur)
  }
  let best: Classification | null = null
  for (const [category, { score, evidence }] of scores) {
    const confidence = Math.min(1, score)
    if (!best || confidence > best.confidence) best = { category, confidence, evidence }
  }
  return best ?? { category: 'unclassified', confidence: 0, evidence: null }
}

function applyFloor(cls: Classification, floor: number): Classification {
  if (cls.confidence < floor) return { ...cls, category: 'unclassified' }
  return cls
}

const ARC_EVENT_CATEGORY: Record<string, string> = {
  institutional_accountability: 'accountability',
  geopolitical_consequence: 'geopolitical',
  economic_policy: 'economic',
  legislative_regulatory: 'legislative',
  unclassified: 'accountability',
}

// ---------- Step 3c: arc titles "[actor] — [process]" (expanded processes) ----------

const PROCESS_PATTERNS: Array<{ process: string; re: RegExp }> = [
  { process: 'cross-border explosives interdiction', re: /\b(bomb|explosive\w*|ied)\b[\s\S]{0,80}\b(intercept\w*|seiz\w*)\b|\b(intercept\w*|seiz\w*)\b[\s\S]{0,80}\b(bomb|explosive\w*|ied)\b/i },
  { process: 'shipping interdiction', re: /\b(tanker\w*|shipping|vessel\w*)[\s\S]{0,80}(threat|u-turn|rerout\w*)|\b(shipping threat)\b/i },
  { process: 'ceasefire talks', re: /\b(ceasefire|truce|peace talks|peace deal)\b/i },
  // Phase 0 fix: economic/legal processes must win over 'military escalation'
  // (bare 'strike/attack/war' used to hijack trade-war and court stories), so
  // they are ordered BEFORE it, and military escalation now requires genuine
  // armed-conflict vocabulary — bare 'strike\w*|attack\w*' removed, 'war'
  // word-bounded.
  { process: 'trade dispute', re: /\b(tariff\w*|trade (war|deal|dispute|crosshairs))\b/i },
  { process: 'sanctions regime', re: /\bsanction\w*\b/i },
  { process: 'hostage negotiations', re: /\bhostage\w*\b/i },
  { process: 'military escalation', re: /\b(missile\w*|airstrike\w*|drone strike|troops|invasion)\b|\b(air|drone|missile|military) strike\w*\b|\bwar\b/i },
  { process: 'interest-rate decision', re: /\b(interest rate\w*|rate (cut|rise|hike|decision)|central bank)\b/i },
  { process: 'budget decision', re: /\b(budget|spending review|fiscal)\b/i },
  { process: 'rent-control decision', re: /\brent control\w*\b/i },
  { process: 'procurement', re: /\b(procurement|contract awarded|tender|defence contract|arms deal)\b/i },
  { process: 'criminal prosecution', re: /\b(arrest\w*|charged|indict\w*|jailed|prosecut\w*|trial)\b/i },
  { process: 'sentencing', re: /\b(sentenc\w+|jailed for)\b/i },
  { process: 'public inquiry', re: /\b(inquiry|inquest)\b/i },
  { process: 'investigation', re: /\b(investigat\w*|probe)\b/i },
  { process: 'misconduct case', re: /\b(misconduct|blackmail|harassment|abuse|scandal)\b/i },
  { process: 'resignation', re: /\b(resign\w+|steps down|quit\w*)\b/i },
  { process: 'appointment', re: /\b(appoint\w*|named as|takes office)\b/i },
  { process: 'policy reversal', re: /\b(backs off|revers\w*|u-turn|abandon\w+|scrap\w*)\b/i },
  { process: 'legislative action', re: /\b(bill|vote\w*|executive order|amendment|legislation|act passed)\b/i },
  { process: 'regulatory decision', re: /\b(regulat\w+|rules out|ban\w*|approv\w+|licen[cs]\w+)\b/i },
  { process: 'legal ruling', re: /\b(ruling|verdict|court rules|judgment|appeal)\b/i },
  { process: 'medical evacuation', re: /\b(evacuation|evacuate\w*)\b/i },
  { process: 'disaster response', re: /\b(flood\w*|wildfire\w*|storm|earthquake|hurricane)\b/i },
  { process: 'election campaign', re: /\b(election|campaign|ballot)\b/i },
  { process: 'diplomatic talks', re: /\b(summit|diplomat\w*|talks|envoy)\b/i },
  { process: 'rollout', re: /\b(rollout|roll-out|launch\w*|deploy\w+)\b/i },
  { process: 'data breach', re: /\b(data breach|hack\w*|cyberattack\w*)\b/i },
  { process: 'recall', re: /\brecall\w*\b/i },
  { process: 'funding decision', re: /\b(funding|allocat\w+|grant\w*|bailout)\b/i },
  { process: 'enforcement action', re: /\b(enforcement|fine\w*|penalt\w+|crackdown|raid\w*)\b/i },
]

// Phase 0 fix: pick the process with the MOST member-text matches instead of
// the first matching entry — first-match let an early broad pattern
// ('military escalation') claim arcs whose dominant signal was something else.
// Ties keep the earlier (more specific) pattern. No matches => null => no arc.
function findProcess(text: string): string | null {
  let best: string | null = null
  let bestCount = 0
  for (const { process, re } of PROCESS_PATTERNS) {
    const matches = text.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) ?? []
    if (matches.length > bestCount) {
      bestCount = matches.length
      best = process
    }
  }
  return best
}

// NO 'developments' fallback: callers must not originate without a process.
function makeArcTitle(actorName: string | null, process: string | null): string | null {
  if (!process) return null
  if (!actorName) return `Unattributed cluster — ${process}`
  // Strip possessive leaks ("Charlie Kirk's" -> "Charlie Kirk") so the title
  // subject is the entity name, not a surface form.
  const subject = actorName.replace(/['’]s$/u, '').trim()
  if (!subject) return `Unattributed cluster — ${process}`
  return `${subject} — ${process}`.slice(0, 140)
}

// ---------- Step 4: milestones ----------

interface MilestoneTemplate {
  key: string
  title: string
  confirm: RegExp
  fail?: RegExp
}

const MILESTONE_TEMPLATES: Record<string, MilestoneTemplate[]> = {
  institutional_accountability: [
    { key: 'ia_concludes', title: 'Investigation or inquiry concludes', confirm: /\b(findings?|report)\b[\s\S]{0,40}\b(published|released)\b|\b(investigat\w*|inquiry|probe|inquest)\b[\s\S]{0,80}\b(conclud\w*|complet\w*|publishes?|releases?)\b/i, fail: /\b(investigat\w*|inquiry|probe)\b[\s\S]{0,60}\b(dropped|abandoned|closed without|shelved)\b/i },
    { key: 'ia_charges', title: 'Charges or disciplinary action filed', confirm: /\b(charged|charges (filed|brought)|indict\w+|prosecut\w+|disciplin\w+|suspended|dismissed|sacked)\b/i, fail: /\b(cleared|no charges|charges dropped|acquit\w+|exonerat\w+)\b/i },
    { key: 'ia_policy', title: 'Institution policy change announced', confirm: /\b(policy change|reform\w*|new (rules|guidelines|protocols)|overhaul|code of conduct)\b/i },
    { key: 'ia_remedy', title: 'Remedy or settlement for affected party', confirm: /\b(settlement|compensation|payout|remedy|apolog\w+|damages awarded|redress)\b/i },
  ],
  geopolitical_consequence: [
    { key: 'gp_ceasefire', title: 'Ceasefire or de-escalation agreed', confirm: /\b(ceasefire|truce|de-escalat\w+|peace (deal|agreement)|armistice|withdraw\w*)\b/i, fail: /\b(talks? (collapse\w*|fail\w*)|ceasefire (broken|collapses?|ends?))\b/i },
    { key: 'gp_sanctions', title: 'Sanctions or retaliation imposed', confirm: /\b(sanctions? (imposed|announced|extended)|retaliat\w+|expel\w+|travel ban)\b/i },
    { key: 'gp_routes', title: 'Disrupted routes or activity normalize', confirm: /\b(resum\w+|reopen\w*|normali\w*|returns? to (the )?(red sea|route|port))\b/i },
    { key: 'gp_escalation', title: 'Further escalation or intervention', confirm: /\b(escalat\w+|strike\w*|attack\w*|intervention|deploy\w+|mobilis\w+|mobiliz\w+)\b/i },
  ],
  economic_policy: [
    { key: 'ep_enacted', title: 'Policy measure enacted or implemented', confirm: /\b(takes effect|comes into force|enacted|implement\w+|signed into law|approved)\b/i },
    { key: 'ep_market', title: 'Market or sector adjustment', confirm: /\b(markets? (react\w*|fall|rise|slide)|shares? (fell|fall|rose|rise)|prices? (rise|fall|rose|fell)|adjust\w+)\b/i },
    { key: 'ep_reversal', title: 'Policy reversed or withdrawn', confirm: /\b(revers\w*|withdraw\w*|scrapped|backs off|abandon\w+|u-turn)\b/i },
    { key: 'ep_funding', title: 'Funding or budget allocated', confirm: /\b(funding|allocat\w+|budget|appropriat\w+|bailout)\b/i },
  ],
  legislative_regulatory: [
    { key: 'lr_funding', title: 'Implementation funding allocated', confirm: /\b(funding|allocat\w+|appropriat\w+|budget)\b/i },
    { key: 'lr_enforcement', title: 'Enforcement action filed', confirm: /\b(enforcement|fined|fine\w*|penalt\w+|crackdown|sanctioned)\b/i },
    { key: 'lr_challenge', title: 'Legal challenge filed', confirm: /\b(lawsuit|legal challenge|judicial review|court challenge|appeal|injunction)\b/i },
    { key: 'lr_deadline', title: 'Implementation deadline met', confirm: /\b(takes effect|comes into force|deadline|implement\w+|in force)\b/i, fail: /\b(delayed|postponed|missed deadline|pushed back)\b/i },
  ],
  unclassified: [
    { key: 'gen_response', title: 'Official response issued', confirm: /\b(respond\w+|statement|comment\w+|reaction)\b/i },
    { key: 'gen_development', title: 'Further developments reported', confirm: /\b(develop\w+|update\w+|continu\w+|latest)\b/i },
    { key: 'gen_reaction', title: 'Stakeholder reaction emerges', confirm: /\b(react\w+|criticis\w+|criticiz\w+|praise\w+|backlash|condemn\w+)\b/i },
  ],
}

async function generateMilestones(supabase: any, arcId: string, category: string, process: string) {
  const templates = MILESTONE_TEMPLATES[category] ?? MILESTONE_TEMPLATES.unclassified
  const rows = templates.slice(0, 6).map((t) => ({
    arc_id: arcId,
    title: t.title,
    milestone_key: t.key,
    status: 'pending',
    notes: `Expected outcome for ${category} arc (${process}).`,
  }))
  await supabase.from('arc_milestones').insert(rows)
}

// Ingest-time milestone check: pending milestones change status only on
// evidence from an ingested source.
async function checkMilestones(supabase: any, arc: any, articleText: string, art: any): Promise<number> {
  const { data: pending } = await supabase
    .from('arc_milestones')
    .select('id, title, milestone_key, status')
    .eq('arc_id', arc.id)
    .eq('status', 'pending')
  let updated = 0
  for (const ms of pending ?? []) {
    const tpl = (MILESTONE_TEMPLATES[arc.category] ?? MILESTONE_TEMPLATES.unclassified).find(
      (t) => t.key === ms.milestone_key,
    )
    if (!tpl) continue
    let status: string | null = null
    if (tpl.fail && tpl.fail.test(articleText)) status = 'failed'
    else if (tpl.confirm.test(articleText)) status = 'confirmed'
    if (!status) continue
    await supabase
      .from('arc_milestones')
      .update({
        status,
        notes: `Evidence: "${art.title}" (${art.url ?? 'no url'})`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', ms.id)
    updated++
  }
  return updated
}

// ---------- embeddings (unchanged: gte-small via Supabase.ai) ----------

let aiSession: any = null
function getSession(model: string) {
  if (!aiSession) {
    // @ts-ignore
    aiSession = new Supabase.ai.Session(model)
  }
  return aiSession
}

async function embed(text: string, model: string): Promise<number[]> {
  const session = getSession(model)
  const out = await session.run(text.slice(0, 8000), { mean_pool: true, normalize: true })
  const vec = Array.isArray(out) ? out : out?.embedding ?? out?.embeddings?.[0]
  if (!vec) throw new Error('embedding failed')
  return Array.from(vec as Iterable<number>)
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
}

function parseVec(v: any): number[] | null {
  if (!v) return null
  if (Array.isArray(v)) return v as number[]
  try { return JSON.parse(v) } catch {
    return String(v).replace(/[\[\]]/g, '').split(',').map(Number)
  }
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z\s.'-]/g, '').replace(/\s+/g, ' ').trim()
}

async function resolveAuthor(supabase: any, byline: string | null, outletId: string) {
  if (!byline) return { authorId: null, unattributed: true, isNew: false }
  const clean = sanitize(byline).text.replace(/^(by|By)\s+/, '').slice(0, 120)
  const norm = normalizeName(clean)
  if (!norm || norm.length < 3) return { authorId: null, unattributed: true, isNew: false }
  const { data: existing } = await supabase.from('authors').select('id, outlet_ids').eq('normalized_name', norm).maybeSingle()
  if (existing) {
    const outlets = new Set(existing.outlet_ids ?? [])
    outlets.add(outletId)
    await supabase.from('authors').update({ last_seen: new Date().toISOString(), outlet_ids: Array.from(outlets) }).eq('id', existing.id)
    return { authorId: existing.id, unattributed: false, isNew: false }
  }
  const { data: created, error } = await supabase.from('authors').insert({ name: clean, normalized_name: norm, outlet_ids: [outletId] }).select('id').single()
  if (error) return { authorId: null, unattributed: true, isNew: false }
  await supabase.from('author_profile_queue').upsert({ author_id: created.id }, { onConflict: 'author_id' })
  return { authorId: created.id, unattributed: false, isNew: true }
}

function resolveNodeId(citedEntity: string, nodeLabels: Array<{ id: string; label: string }>): string | null {
  const hay = citedEntity.toLowerCase()
  for (const n of nodeLabels) {
    const lab = n.label.toLowerCase()
    if (lab.length >= 5 && (hay.includes(lab) || lab.includes(hay))) return n.id
  }
  return null
}

// ---------- Steps 6-8: actor nodes/edges, edge signal columns, topics ----------

interface ActorRef {
  id: string
  canonical_name: string
  entity_type: string
}

// Step 6 (§4): one ACTOR node per resolved entity, backlinked via
// metadata.entity_id. Idempotent.
async function ensureActorNode(supabase: any, e: ActorRef): Promise<string | null> {
  // Type guard: never write non-string or malformed labels (a stray object
  // here once rendered literally as "[object Object]" in the graph).
  if (typeof e?.canonical_name !== 'string' || !e.canonical_name.trim()) return null
  if (e.canonical_name.includes('. ') || e.canonical_name.trim().split(/\s+/).length > 6) return null
  const slug = `actor-${normalizeEntityName(e.canonical_name)}`
  const { data, error } = await supabase
    .from('nodes')
    .upsert(
      { slug, label: e.canonical_name.slice(0, 160), type: 'actor', metadata: { entity_id: e.id, entity_type: e.entity_type } },
      { onConflict: 'slug' },
    )
    .select('id')
    .single()
  if (error || !data) return null
  return data.id
}

// Actor edges EVENT -> ACTOR for the article's own resolved entities.
async function linkActorsToEventNode(supabase: any, nodeId: string, actors: ActorRef[], articleId: string) {
  for (const e of actors) {
    if (!['person', 'organization', 'institution'].includes(e.entity_type)) continue
    const actorNodeId = await ensureActorNode(supabase, e)
    if (!actorNodeId || actorNodeId === nodeId) continue
    await supabase.from('edges').upsert(
      {
        source_id: nodeId,
        target_id: actorNodeId,
        type: 'actor',
        label: 'involves',
        weight: 'heavy',
        signal_source: 'shared_entity',
        doc_strength: 'corroborated',
        claimed_by: 'reporting',
        reliability: 2,
        metadata: { entity_id: e.id, article_id: articleId },
      },
      { onConflict: 'source_id,target_id,type' },
    )
  }
}

// Step 8 (§5): tag against the FIXED topic tree. Conservative keyword rubric;
// below floor => untagged; topics are NEVER invented. A subtopic tag
// propagates to its ancestors at the same confidence.
const TOPIC_PARENT: Record<string, string | null> = {
  technology: null,
  ai: 'technology',
  'ai-model-development': 'ai',
  'ai-regulation': 'ai',
  'ai-infrastructure': 'ai',
  semiconductors: 'technology',
  'semiconductors-fabrication': 'semiconductors',
  'semiconductors-export-controls': 'semiconductors',
  'semiconductors-supply-chain': 'semiconductors',
  'quantum-computing': 'technology',
  'data-centers': 'technology',
  'data-centers-siting': 'data-centers',
  'data-centers-energy': 'data-centers',
  'data-centers-water': 'data-centers',
  telecommunications: 'technology',
  governance: null,
  'governance-legislation': 'governance',
  'governance-regulatory-action': 'governance',
  'governance-judicial': 'governance',
  'governance-executive-action': 'governance',
  'security-defense': null,
  'energy-environment': null,
  'labor-economy': null,
  'public-health': null,
  'civil-liberties': null,
}

const TOPIC_RULES: Array<{ slug: string; weight: number; re: RegExp }> = [
  { slug: 'ai-model-development', weight: 0.45, re: /\b(large language model|llm\b|frontier model|model (release|launch|training)|gpt-?\w*)\b/i },
  { slug: 'ai-regulation', weight: 0.45, re: /\b(ai (act|regulation|rules|bill|safety|governance)|artificial intelligence (regulation|bill|rules|safety))\b/i },
  { slug: 'ai-infrastructure', weight: 0.45, re: /\b(ai (infrastructure|compute|chips?|accelerators?))\b/i },
  { slug: 'ai', weight: 0.3, re: /\b(artificial intelligence|openai|anthropic|deepmind|machine learning)\b/i },
  { slug: 'semiconductors-fabrication', weight: 0.45, re: /\b(fabs?\b|foundry|tsmc|chip (plant|manufacturing|fab))\b/i },
  { slug: 'semiconductors-export-controls', weight: 0.45, re: /\b(export controls?|entity list|chip exports?)\b/i },
  { slug: 'semiconductors-supply-chain', weight: 0.45, re: /\b(chip supply|semiconductor supply|supply chains?)\b/i },
  { slug: 'semiconductors', weight: 0.3, re: /\bsemiconductors?\b/i },
  { slug: 'quantum-computing', weight: 0.45, re: /\bquantum (comput\w+|processor|supremacy)\b/i },
  { slug: 'data-centers-siting', weight: 0.45, re: /\bdata cent(er|re)\w*[\s\S]{0,40}(siting|permit\w*|zoning|construction)\b/i },
  { slug: 'data-centers-energy', weight: 0.45, re: /\bdata cent(er|re)\w*[\s\S]{0,40}(energy|power|electricity)\b/i },
  { slug: 'data-centers-water', weight: 0.45, re: /\bdata cent(er|re)\w*[\s\S]{0,40}water\b/i },
  { slug: 'data-centers', weight: 0.3, re: /\bdata cent(er|re)\w*\b/i },
  { slug: 'telecommunications', weight: 0.45, re: /\b(5g|6g|telecom\w*|broadband|spectrum auction)\b/i },
  { slug: 'technology', weight: 0.25, re: /\b(algorithm\w*|software|cyberattack\w*|app\b|platform\w*)\b/i },
  { slug: 'governance-legislation', weight: 0.45, re: /\b(bill|legislation|act passed|house passes|senate (vote|passes)|parliament|amendment)\b/i },
  { slug: 'governance-regulatory-action', weight: 0.45, re: /\b(regulator\w*|regulation|ban\w*|rules out|ftc|sec\b|fcc|ofcom|statutory)\b/i },
  { slug: 'governance-judicial', weight: 0.45, re: /\b(supreme court|court rules|ruling|verdict|judge|appeal|judgment)\b/i },
  { slug: 'governance-executive-action', weight: 0.45, re: /\b(executive order|white house|downing street|president (signed|ordered)|administration)\b/i },
  { slug: 'governance', weight: 0.25, re: /\b(government|minister|ministry|congress|senate)\b/i },
  { slug: 'security-defense', weight: 0.45, re: /\b(military|missile\w*|troops|defen[cs]e|nato|airstrike\w*|drone strike|\bwar\b|ceasefire|hostages?|sanction\w*|militia)\b/i },
  { slug: 'energy-environment', weight: 0.45, re: /\b(renewable\w*|solar|wind farm|nuclear|carbon|emission\w*|climate|flood\w*|wildfire\w*|hurricane|storm)\b/i },
  { slug: 'energy-environment', weight: 0.3, re: /\b(oil|gas prices?|energy)\b/i },
  { slug: 'labor-economy', weight: 0.45, re: /\b(inflation|tariff\w*|trade (deal|war|dispute)|recession|budget|gdp|interest rate\w*|federal reserve|jobs report|wages?|strike\w*|union\w*)\b/i },
  { slug: 'labor-economy', weight: 0.3, re: /\b(econom\w+|markets?|stocks?|shares)\b/i },
  { slug: 'public-health', weight: 0.45, re: /\b(hospital\w*|vaccin\w*|pandemic|disease|virus|cdc\b|who\b|public health|medical)\b/i },
  { slug: 'civil-liberties', weight: 0.45, re: /\b(civil libert\w+|free speech|privacy|protest\w*|dissent|censorship|surveillance|press freedom)\b/i },
]

// Phase 2 (02B) F6 fix: same slugs/confidences as before; each tag also
// carries the sentence that matched, persisted to node_topics.evidence.
function tagTopics(text: string, floor: number): Array<{ slug: string; confidence: number; evidence: string | null }> {
  const conf = new Map<string, { c: number; ev: string | null }>()
  for (const { slug, weight, re } of TOPIC_RULES) {
    const m = text.match(re)
    if (!m) continue
    const cur = conf.get(slug) ?? { c: 0, ev: null }
    cur.c = Math.min(1, cur.c + weight)
    if (!cur.ev) cur.ev = passageAround(text, m[0])
    conf.set(slug, cur)
  }
  for (const [slug, v] of [...conf]) {
    let p = TOPIC_PARENT[slug]
    while (p) {
      const cur = conf.get(p) ?? { c: 0, ev: null }
      cur.c = Math.max(cur.c, v.c)
      if (!cur.ev) cur.ev = v.ev
      conf.set(p, cur)
      p = TOPIC_PARENT[p] ?? null
    }
  }
  return [...conf].filter(([, v]) => v.c >= floor).map(([slug, v]) => ({ slug, confidence: v.c, evidence: v.ev }))
}

let topicIdCache: Map<string, string> | null = null
async function loadTopicIds(supabase: any): Promise<Map<string, string>> {
  if (topicIdCache) return topicIdCache
  const { data } = await supabase.from('topics').select('id, slug')
  topicIdCache = new Map((data ?? []).map((t: any) => [t.slug, t.id]))
  return topicIdCache
}

async function tagNodeTopics(supabase: any, nodeId: string, text: string, floor: number): Promise<number> {
  const tags = tagTopics(text, floor)
  if (tags.length === 0) return 0
  const ids = await loadTopicIds(supabase)
  const rows = tags
    .map((t) => ({ node_id: nodeId, topic_id: ids.get(t.slug), confidence: t.confidence, evidence: t.evidence }))
    .filter((r) => r.topic_id)
  if (rows.length === 0) return 0
  await supabase.from('node_topics').upsert(rows, { onConflict: 'node_id,topic_id' })
  return rows.length
}

// ---------- attachment & origination (entity-driven) ----------

interface AttachContext {
  sharedEntities: string[]
  sharedEntityIds: string[]
  similarity: number | null
  causal: string | null
  temporal: string | null
  hasCitation: boolean
  citationPrimary?: boolean // citation to a primary document (court filing / agency release)
  actors?: ActorRef[] // the article's OWN resolved entities (conf >= floor)
  topicFloor?: number
  embedding?: number[] | null // the article's embedding, used to refresh the arc centroid
  articleText?: string // Phase 2 (02B): full analysis text for evidence_passage capture
}

async function attachToArc(supabase: any, art: any, arc: any, ctx: AttachContext) {
  // Phase 2 (02B) evidence capture: persist assignment provenance (F5 fix).
  await supabase.from('articles').update({
    arc_id: arc.id,
    arc_assignment_evidence: {
      similarity: ctx.similarity,
      shared_entity_ids: ctx.sharedEntityIds,
      shared_entity_names: ctx.sharedEntities,
      rule_version: 'arc_assign@20260724+gte-small(threshold=0.88)',
      assigned_at: new Date().toISOString(),
    },
  }).eq('id', art.id)

  // Phase 0 fix: arc embeddings were set once from the seed article and never
  // updated, so similarity checks compared against a stale (sometimes wrong)
  // vector. Maintain a RUNNING CENTROID over member embeddings instead.
  if (ctx.embedding && ctx.embedding.length > 0) {
    try {
      const { data: fresh } = await supabase
        .from('story_arcs')
        .select('embedding')
        .eq('id', arc.id)
        .single()
      const { count } = await supabase
        .from('articles')
        .select('id', { count: 'exact', head: true })
        .eq('arc_id', arc.id)
        .not('embedding', 'is', null)
      const m = count ?? 1 // members with embeddings, INCLUDING the one just attached
      const old = parseVec(fresh?.embedding)
      const n = ctx.embedding.length
      const next: number[] = new Array(n)
      for (let i = 0; i < n; i++) {
        const prev = old && old.length === n && m > 1 ? old[i] * (m - 1) : 0
        next[i] = (prev + ctx.embedding[i]) / m
      }
      await supabase
        .from('story_arcs')
        .update({ embedding: `[${next.join(',')}]` })
        .eq('id', arc.id)
      arc.embedding = next
    } catch {
      // centroid refresh is best-effort; attachment itself must not fail
    }
  }

  const slug = `art-${slugify(art.title).slice(0, 40)}-${String(art.id).slice(0, 8)}`
  const { data: node } = await supabase
    .from('nodes')
    .upsert(
      {
        slug,
        label: art.title.slice(0, 120),
        type: 'event',
        description: (art.summary ?? '').slice(0, 400),
        confidence: 70,
        occurred_at: art.published_at ? String(art.published_at).slice(0, 10) : null,
        arc_id: arc.id,
        metadata: { article_id: art.id },
      },
      { onConflict: 'slug' },
    )
    .select('id')
    .single()

  if (node) {
    await supabase.from('sources').insert({
      node_id: node.id,
      outlet: art.outlet ?? null,
      headline: art.title.slice(0, 200),
      url: art.url ?? null,
      published_at: art.published_at ? String(art.published_at).slice(0, 10) : null,
    })
    // Step 6: actor nodes + actor edges for this article's resolved entities
    if (ctx.actors && ctx.actors.length > 0) {
      await linkActorsToEventNode(supabase, node.id, ctx.actors, art.id)
    }
    // Step 8: topic tagging against the fixed tree
    await tagNodeTopics(supabase, node.id, `${art.title}. ${art.summary ?? ''}`, ctx.topicFloor ?? 0.4)
  }

  // Consequence rules (§2.2/§2.5) — Phase 0 Part 2 Tier 3 three-way branch:
  //   (1) explicit causal language with shared-entity proximity => 'causal';
  //   (2) temporal connective only (after/following/amid/...) => 'sequence'
  //       (temporal adjacency, NOT causation);
  //   (3) citation => 'causal' only for a primary document (court filing /
  //       agency release); a weak citation (named official / study) =>
  //       'sequence'.
  // The shared resolved entity is already established; date proximity is NOT
  // a signal. Gate: no causal edge rests on a keyword alone.
  const edgeKind: 'causal' | 'sequence' | null = ctx.causal
    ? 'causal'
    : ctx.temporal
      ? 'sequence'
      : ctx.hasCitation
        ? ctx.citationPrimary
          ? 'causal'
          : 'sequence'
        : null
  if (edgeKind && node && arc.root_node_id) {
    // Step 7 (§4/§3.4): ranked signal reliability at edge-creation time.
    // causal_language=3; primary-document citation=1; temporal or
    // weak-citation sequence=4; 5/date-proximity never stored.
    const reliability = edgeKind === 'causal' ? (ctx.causal ? 3 : 1) : 4
    const docStrength = edgeKind === 'causal' ? (ctx.causal ? 'corroborated' : 'documented') : 'circumstantial'
    const claimedBy = edgeKind === 'causal' && !ctx.causal ? 'source_document' : 'reporting'
    const signalSource = edgeKind === 'causal'
      ? ctx.causal ? 'shared_entity+causal_language' : 'shared_entity+citation'
      : 'shared_entity+sequence'
    await supabase.from('arc_events').insert({
      arc_id: arc.id,
      title: art.title.slice(0, 200),
      category: ARC_EVENT_CATEGORY[arc.category] ?? 'accountability',
      confidence: !ctx.causal && ctx.citationPrimary ? 'confirmed' : 'corroborated',
      occurred_at: art.published_at ? String(art.published_at).slice(0, 10) : null,
      description: (art.summary ?? '').slice(0, 400),
    })
    await supabase.from('edges').upsert(
      {
        source_id: arc.root_node_id,
        target_id: node.id,
        type: edgeKind,
        weight: edgeKind === 'sequence' ? 'light' : reliability <= 2 ? 'heavy' : 'medium',
        label: edgeKind === 'causal'
          ? ctx.causal ? `causal: ${ctx.causal}` : 'cited development in arc'
          : ctx.temporal ? `sequence: ${ctx.temporal}` : 'sequence: cited development in arc',
        similarity: ctx.similarity,
        signal_source: edgeKind === 'causal' ? (ctx.causal ? 'causal_language' : 'citation') : 'shared_entity',
        doc_strength: docStrength,
        claimed_by: claimedBy,
        reliability,
        counterfactual_test: edgeKind === 'sequence' ? 'sequence_only' : null,
        metadata: {
          signal_source: signalSource, // legacy mirror for pre-Step-7 readers
          shared_entities: ctx.sharedEntities,
          evidence: ctx.causal ?? ctx.temporal ?? 'explicit citation in article', // UNCHANGED — r5 guard input
          article_id: art.id, // Phase 2 (02B) F4 fix: restore source linkage
          evidence_passage: passageAround(ctx.articleText ?? `${art.title}. ${art.summary ?? ''}`, ctx.causal ?? ctx.temporal), // Phase 2 (02B) F4 fix
        },
      },
      { onConflict: 'source_id,target_id,type' },
    )
  }
  await supabase.from('story_arcs').update({ last_update_at: new Date().toISOString() }).eq('id', arc.id)
}

// Document frequency of every entity over article_entities, used to exclude
// hub entities (e.g. 'Iran', 'Trump', 'AI') from arc matching. One generic
// shared hub entity used to be enough to attach — that poisoned the arc layer.
async function loadHubEntityIds(supabase: any, maxDf: number): Promise<Set<string>> {
  const df = new Map<string, Set<string>>()
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('article_entities')
      .select('article_id, entity_id')
      .range(from, from + 999)
    if (error) throw error
    if (!data || data.length === 0) break
    for (const r of data) {
      const set = df.get(r.entity_id) ?? new Set<string>()
      set.add(r.article_id)
      df.set(r.entity_id, set)
    }
    if (data.length < 1000) break
    from += 1000
  }
  const hubs = new Set<string>()
  for (const [entityId, arts] of df) {
    if (arts.size > maxDf) hubs.add(entityId)
  }
  return hubs
}

// Embedding similarity only SHORTLISTS/ranks candidates that already share a
// resolved entity. No shared entity => no attachment, whatever the cosine.
// Phase 0 hardening: a candidate arc is acceptable only when
//   - the article shares >= 2 of the arc's entities, OR
//   - it shares the arc's role='primary' entity;
// and when exactly ONE entity is shared, similarity to the (fresh) arc
// embedding must clear attachMinSimilarity. Hub entities are excluded
// upstream, so they can never satisfy this by themselves.
async function findArcBySharedEntity(
  supabase: any,
  entityIds: string[],
  embedding: number[] | null,
  attachMinSimilarity = 0.78,
): Promise<{ arc: any; sharedEntityIds: string[]; sharedNames: string[]; similarity: number | null } | null> {
  if (entityIds.length === 0) return null
  const { data, error } = await supabase
    .from('arc_entities')
    .select('arc_id, entity_id, role, story_arcs!inner(id, slug, title, category, summary, status, root_node_id, embedding, title_article_count), entities!inner(canonical_name)')
    .in('entity_id', entityIds)
    .eq('story_arcs.status', 'active')
  if (error || !data || data.length === 0) return null
  const byArc = new Map<string, { arc: any; sharedEntityIds: string[]; sharedNames: string[]; sharedPrimary: boolean }>()
  for (const row of data) {
    const cur = byArc.get(row.arc_id) ?? { arc: (row as any).story_arcs, sharedEntityIds: [], sharedNames: [], sharedPrimary: false }
    cur.sharedEntityIds.push(row.entity_id)
    cur.sharedNames.push((row as any).entities.canonical_name)
    if ((row as any).role === 'primary') cur.sharedPrimary = true
    byArc.set(row.arc_id, cur)
  }
  let best: { arc: any; sharedEntityIds: string[]; sharedNames: string[]; similarity: number | null } | null = null
  for (const cand of byArc.values()) {
    const sharedCount = cand.sharedEntityIds.length
    // Minimum-evidence gate: >= 2 shared entities, or the arc's primary entity.
    if (sharedCount < 2 && !cand.sharedPrimary) continue
    let sim: number | null = null
    if (embedding) {
      const vec = parseVec(cand.arc.embedding)
      if (vec) sim = cosine(embedding, vec)
    }
    // Single-entity matches additionally require a similarity floor; with no
    // comparable embedding there is no corroboration, so reject.
    if (sharedCount < 2 && (sim === null || sim < attachMinSimilarity)) continue
    const entry = { ...cand, similarity: sim }
    if (
      !best ||
      entry.sharedEntityIds.length > best.sharedEntityIds.length ||
      (entry.sharedEntityIds.length === best.sharedEntityIds.length && (entry.similarity ?? 0) > (best.similarity ?? 0))
    ) {
      best = entry
    }
  }
  return best
}

async function maybeRetitleArc(supabase: any, arc: any, catFloor: number): Promise<boolean> {
  const { count } = await supabase
    .from('articles')
    .select('id', { count: 'exact', head: true })
    .eq('arc_id', arc.id)
  const n = count ?? 0
  const last = arc.title_article_count ?? 0
  if (n === 0 || (last > 0 && n < Math.max(last * 2, last + 5))) return false

  const { data: primary } = await supabase
    .from('arc_entities')
    .select('entities!inner(canonical_name)')
    .eq('arc_id', arc.id)
    .eq('role', 'primary')
    .limit(1)
  const actorName = (primary?.[0] as any)?.entities?.canonical_name ?? null

  const { data: arts } = await supabase
    .from('articles')
    .select('id, title, summary')
    .eq('arc_id', arc.id)
    .order('published_at', { ascending: true })
    .limit(10)

  // Phase 0 fix: retitle/reclassify ONLY from members that pass the attach
  // keep-rule (share the arc's primary entity or >= 2 arc entities). Weak
  // members must not steer the arc's title or category. If none pass (e.g.
  // freshly originated arc), fall back to all members.
  const { data: arcEnts } = await supabase
    .from('arc_entities')
    .select('entity_id, role')
    .eq('arc_id', arc.id)
  const primaryId = (arcEnts ?? []).find((r: any) => r.role === 'primary')?.entity_id ?? null
  const arcEntIds = new Set((arcEnts ?? []).map((r: any) => r.entity_id))
  let memberIds = (arts ?? []).map((a: any) => a.id)
  if (arcEntIds.size > 0 && memberIds.length > 0) {
    const { data: aeRows } = await supabase
      .from('article_entities')
      .select('article_id, entity_id')
      .in('article_id', memberIds)
    const sharedBy = new Map<string, { shared: number; primary: boolean }>()
    for (const r of aeRows ?? []) {
      if (!arcEntIds.has(r.entity_id)) continue
      const cur = sharedBy.get(r.article_id) ?? { shared: 0, primary: false }
      cur.shared++
      if (r.entity_id === primaryId) cur.primary = true
      sharedBy.set(r.article_id, cur)
    }
    const keepIds = memberIds.filter((id: string) => {
      const s = sharedBy.get(id)
      return s && (s.primary || s.shared >= 2)
    })
    if (keepIds.length > 0) memberIds = keepIds
  }
  const keepSet = new Set(memberIds)
  const text = (arts ?? []).filter((a: any) => keepSet.has(a.id)).map((a: any) => `${a.title}. ${a.summary ?? ''}`).join(' ')
  const process = findProcess(text)
  const title = makeArcTitle(actorName, process)
  const cls = applyFloor(classifyArc(text), catFloor)
  const update: any = { title_article_count: n }
  if (title) update.title = title // no process => keep existing title, never 'developments'
  // Phase 0 fix: ALWAYS recompute the category (previously frozen once a
  // non-unclassified label existed, which kept wrong labels forever). Below
  // the calibrated floor the arc is unclassified with NULL confidence.
  if (cls.category === 'unclassified') {
    update.category = 'unclassified'
    update.category_confidence = null
    update.category_evidence = cls.evidence
  } else {
    update.category = cls.category
    update.category_confidence = cls.confidence
    update.category_evidence = cls.evidence
  }
  await supabase.from('story_arcs').update(update).eq('id', arc.id)
  if (title) arc.title = title
  arc.title_article_count = n
  // Keep pending milestone notes in sync with the retitled/regenerated arc —
  // origination may have used a different process phrase (#5 template leak).
  if (title) {
    const noteCategory = update.category ?? arc.category
    await supabase
      .from('arc_milestones')
      .update({ notes: `Expected outcome for ${noteCategory} arc (${process}).` })
      .eq('arc_id', arc.id)
      .eq('status', 'pending')
      .like('notes', 'Expected outcome%')
  }
  return true
}

async function originateArc(
  supabase: any,
  art: any,
  embedding: number[] | null,
  actorName: string,
  process: string,
  catFloor: number,
  clusterSize: number,
  clusterEntities: ResolvedEntity[],
  clusterText: string,
) {
  const cls = applyFloor(classifyArc(clusterText), catFloor)
  const title = makeArcTitle(actorName, process)
  if (!title) return null // never originate without an identifiable process
  const slug = `arc-${slugify(title).slice(0, 40)}-${String(art.id).slice(0, 8)}`

  const { data: rootNode } = await supabase
    .from('nodes')
    .insert({
      slug: `evt-${slugify(art.title).slice(0, 40)}-${String(art.id).slice(0, 8)}`,
      label: art.title.slice(0, 120),
      type: 'event',
      description: (art.summary ?? '').slice(0, 400),
      confidence: 65,
      summary: (art.summary ?? '').slice(0, 400),
      occurred_at: art.published_at ? String(art.published_at).slice(0, 10) : null,
    })
    .select('id')
    .single()

  const { data: arc } = await supabase
    .from('story_arcs')
    .insert({
      slug,
      title,
      category: cls.category,
      category_confidence: cls.confidence,
      category_evidence: cls.evidence,
      seed_article_id: art.id,
      title_article_count: clusterSize,
      status: 'active',
      root_node_id: rootNode?.id ?? null,
      summary: (art.summary ?? '').slice(0, 500),
      started_at: art.published_at ? String(art.published_at).slice(0, 10) : null,
      embedding: embedding ? `[${embedding.join(',')}]` : null,
      last_assignment_run: new Date().toISOString(),
    })
    .select('id, slug, title, category, summary, status, root_node_id, title_article_count')
    .single()
  if (!arc) return null

  // Phase 0 fix (anti-snowball): persist ONLY entities that appear in >= 2
  // cluster members. Previously every entity of every member was written, so
  // one bridging article poisoned the arc's entity set forever and pulled in
  // unrelated articles on every subsequent attach. If nothing reaches 2
  // members, fall back to the actor entity alone so the arc keeps a primary.
  const memberCount = new Map<string, number>()
  for (const e of clusterEntities) memberCount.set(e.id, (memberCount.get(e.id) ?? 0) + 1)
  const seen = new Set<string>()
  const rows: any[] = []
  for (const e of clusterEntities) {
    if (seen.has(e.id)) continue
    seen.add(e.id)
    if ((memberCount.get(e.id) ?? 0) < 2) continue
    rows.push({ arc_id: arc.id, entity_id: e.id, role: e.canonical_name === actorName ? 'primary' : 'participant' })
  }
  if (rows.length === 0) {
    const actorEntity = clusterEntities.find((e) => e.canonical_name === actorName)
    if (actorEntity) rows.push({ arc_id: arc.id, entity_id: actorEntity.id, role: 'primary' })
  }
  if (rows.length > 0) await supabase.from('arc_entities').upsert(rows, { onConflict: 'arc_id,entity_id' })

  // Step 4: expected outcomes at origination.
  await generateMilestones(supabase, arc.id, cls.category, process)
  return arc
}

// Union-find over articles sharing resolved entities.
function clusterBySharedEntities(items: Array<{ id: string; entityIds: string[] }>): string[][] {
  const parent = new Map<string, string>()
  const find = (x: string): string => {
    let r = x
    while (parent.get(r) !== r) r = parent.get(r)!
    let cur = x
    while (parent.get(cur) !== cur) {
      const next = parent.get(cur)!
      parent.set(cur, r)
      cur = next
    }
    return r
  }
  for (const it of items) parent.set(it.id, it.id)
  const byEntity = new Map<string, string[]>()
  for (const it of items) {
    for (const e of it.entityIds) {
      const arr = byEntity.get(e) ?? []
      arr.push(it.id)
      byEntity.set(e, arr)
    }
  }
  for (const ids of byEntity.values()) {
    for (let i = 1; i < ids.length; i++) {
      const ra = find(ids[0])
      const rb = find(ids[i])
      if (ra !== rb) parent.set(rb, ra)
    }
  }
  const comps = new Map<string, string[]>()
  for (const it of items) {
    const r = find(it.id)
    const arr = comps.get(r) ?? []
    arr.push(it.id)
    comps.set(r, arr)
  }
  return [...comps.values()]
}

// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  // Fail-closed run-key gate (same pattern as batch-intake /
  // source-comparison-run / graph-analysis-run): this function WRITES, so an
  // invocation without the owner-held key must never reach the pipeline.
  // verify_jwt stays on, but the anon key is public by design — the run key
  // is the actual authorization barrier. Secret unset => writer disabled.
  if (req.method !== 'POST') return Response.json({ error: 'POST only' }, { status: 405 })
  const expected = Deno.env.get('INGEST_RSS_RUN_KEY')
  if (!expected) return Response.json({ error: 'INGEST_RSS_RUN_KEY not configured; writer disabled' }, { status: 503 })
  if (req.headers.get('x-ingest-rss-key') !== expected) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: 'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })
  }
  const supabase = createClient(supabaseUrl, serviceKey)
  const cfg = await loadConfig(supabase)

  const CAT_FLOOR = Number(cfg.category_confidence_floor ?? 0.35)
  const TOPIC_FLOOR = Number(cfg.topic_confidence_floor ?? 0.4)
  const DOC_WEIGHTS = cfg.doc_strength_weights ?? {}
  const EMBED_MODEL = String(cfg.embedding_model ?? 'gte-small')
  const LOOKBACK_DAYS = Number(cfg.lookback_days ?? 30)
  const AUTHOR_MIN = Number(cfg.author_min_articles ?? 3)
  const AUTHOR_MAX_PRIOR = Number(cfg.author_profile_max_prior ?? 5)
  const AUTHOR_REFRESH_DAYS = Number(cfg.author_refresh_days ?? 90)
  const MAX_PER_FEED = Number(cfg.max_items_per_feed ?? 4)
  const MAX_NEW_PER_RUN = Number(cfg.max_new_per_run ?? 8)
  const ENT_MIN_CONF = Number(cfg.entity_resolve_min_confidence ?? 0.5)
  const DIGEST_ENTITY_COUNT = Number(cfg.digest_entity_count ?? 8)
  const ATTACH_MIN_SIM = Number(cfg.attach_min_similarity ?? 0.78)
  const CLUSTER_MAX_DF = Number(cfg.cluster_entity_max_df ?? 5)
  const PRIOR_POOL_LIMIT = 60
  // Held run tags (pipeline_config.held_run_tags, JSON array): articles
  // ingested under one of these ingestion_run_id tags are quarantined data
  // (test canaries, held batches) and must NEVER enter the Phase 2
  // unattached-sweep pool. Absent or misconfigured key => empty array =>
  // nothing held.
  const HELD_RUN_TAGS: string[] = Array.isArray(cfg.held_run_tags) ? cfg.held_run_tags.map(String) : []

  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 86400000)

  const resolver = new EntityResolver(cfg)
  await resolver.load(supabase)

  const { data: outletRows } = await supabase.from('outlets').select('id, name')
  const outletNames = new Set<string>((outletRows ?? []).map((o: any) => normalizeEntityName(o.name)))
  for (const alias of OUTLET_NAME_ALIASES) outletNames.add(alias)

  // Phase 0 fix: hub entities (df > cluster_entity_max_df) are excluded from
  // BOTH attachment and origination input — previously this filter existed
  // only in the backfill originate step.
  const hubEntityIds = await loadHubEntityIds(supabase, CLUSTER_MAX_DF)

  const { data: sources, error: srcErr } = await supabase
    .from('ingest_sources')
    .select('feed_url, enabled, outlets (id, name)')
    .eq('enabled', true)
  if (srcErr) throw srcErr

  const { data: nodeRows } = await supabase.from('nodes').select('id, label')
  const nodeLabels = (nodeRows ?? [])
    .filter((n: any) => n.label && n.label.length >= 5)
    .sort((a: any, b: any) => b.label.length - a.label.length)

  const report: any = {
    ranAt: new Date().toISOString(),
    thresholds: {
      category_confidence_floor: CAT_FLOOR,
      entity_resolve_min_confidence: ENT_MIN_CONF,
      digest_entity_count: DIGEST_ENTITY_COUNT,
      embedding_model: EMBED_MODEL,
      lookback_days: LOOKBACK_DAYS,
      max_items_per_feed: MAX_PER_FEED,
      max_new_per_run: MAX_NEW_PER_RUN,
    },
    feeds: [] as any[],
    ingested: 0,
    skippedExisting: 0,
    digests: 0,
    attached: 0,
    arcsOriginated: 0,
    unattached: 0,
    heldExcluded: 0,
    arcsRetitled: 0,
    entitiesResolved: 0,
    milestonesCreated: 0,
    milestonesUpdated: 0,
    monocultureFlags: 0,
    authorsProfiled: 0,
    citationsResolvedToNodes: 0,
    errors: [] as string[],
  }

  const cycleArticles: Array<{
    id: string
    outletKey: string
    embedding: number[]
    citationCount: number
    citationPrimary: boolean
    entityIds: string[]
    entities: ResolvedEntity[]
    art: any
  }> = []

  // ---------- Phase 1: new items from feeds ----------
  for (const src of sources ?? []) {
    if (report.ingested >= MAX_NEW_PER_RUN) break
    const outlet = (src as any).outlets
    const feedReport: any = { outlet: outlet?.name, feed: src.feed_url, fetched: 0, new: 0 }
    try {
      const res = await fetch(src.feed_url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MIP-Pipeline/6.0)', Accept: 'application/rss+xml, application/xml, text/xml, */*' },
        signal: AbortSignal.timeout(20000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const xml = await res.text()
      const items = parseFeed(xml, src.feed_url)
      feedReport.fetched = items.length

      for (const item of items) {
        if (feedReport.new >= MAX_PER_FEED) break
        if (report.ingested >= MAX_NEW_PER_RUN) break
        if (item.published_at && new Date(item.published_at) < cutoff) continue

        const { data: dup } = await supabase.from('articles').select('id').eq('url', item.url).maybeSingle()
        if (dup) {
          report.skippedExisting++
          continue
        }

        // Sanitized already (Step 1, at the boundary). Everything downstream
        // consumes clean text only.
        const { authorId, unattributed } = await resolveAuthor(supabase, item.byline, outlet.id)
        const bodyText = item.summary ?? ''
        const analysisText = `${item.title}. ${bodyText}`
        const citations = extractCitations(analysisText, DOC_WEIGHTS)
        const claims = extractClaims(analysisText)
        const embedding = await embed(analysisText, EMBED_MODEL)

        const { data: art, error: artErr } = await supabase
          .from('articles')
          .insert({
            feed: slugify(outlet.name),
            outlet: outlet.name,
            title: item.title,
            url: item.url,
            summary: bodyText.slice(0, 500) || null,
            published_at: item.published_at,
            outlet_id: outlet.id,
            author_id: authorId,
            body_text: bodyText || null,
            embedding: `[${embedding.join(',')}]`,
            claims,
            unattributed,
            image_url: item.image_url,
            image_alt: item.image_alt,
          })
          .select('id, outlet')
          .single()
        if (artErr) throw artErr

        // Step 2: entity extraction + resolution (logged always).
        const resolved = await extractAndResolveEntities(supabase, resolver, art.id, analysisText, outletNames)
        report.entitiesResolved += resolved.length
        const strong = resolved.filter((r) => r.confidence >= ENT_MIN_CONF)
        const strongIds = strong.map((r) => r.id)

        // Step 3a: digest exclusion — stored, flagged, excluded downstream.
        const orgPersonCount = strong.filter((r) => ['person', 'organization', 'institution'].includes(r.entity_type)).length
        if (isDigest(item.title, orgPersonCount, DIGEST_ENTITY_COUNT)) {
          await supabase.from('articles').update({ is_digest: true }).eq('id', art.id)
          report.digests++
          feedReport.new++
          report.ingested++
          continue
        }

        for (const c of citations) {
          const resolvedNode = resolveNodeId(c.cited_entity, nodeLabels)
          if (resolvedNode) report.citationsResolvedToNodes++
          await supabase.from('citations').insert({ ...c, article_id: art.id, resolved_node_id: resolvedNode })
        }

        cycleArticles.push({
          id: art.id,
          outletKey: outlet.id,
          embedding,
          citationCount: citations.length,
          citationPrimary: citations.some((c) => ['court_doc', 'agency_release'].includes(c.cited_type)),
          entityIds: strongIds.filter((id) => !hubEntityIds.has(id)),
          entities: strong,
          art: { id: art.id, title: item.title, summary: bodyText.slice(0, 500), published_at: item.published_at, url: item.url, outlet: outlet.name },
        })
        feedReport.new++
        report.ingested++
      }
    } catch (err) {
      feedReport.error = String(err)
      report.errors.push(`${outlet?.name}: ${String(err)}`)
    }
    report.feeds.push(feedReport)
  }

  // ---------- Phase 2: entity-driven arc assignment ----------
  const cycleIds = new Set(cycleArticles.map((c) => c.id))
  const { data: priorUnattached } = await supabase
    .from('articles')
    .select('id, title, summary, url, outlet, outlet_id, published_at, embedding, is_digest, ingestion_run_id')
    .is('arc_id', null)
    .eq('is_digest', false)
    .order('fetched_at', { ascending: false })
    .limit(PRIOR_POOL_LIMIT)

  report.heldRunTags = HELD_RUN_TAGS

  const pool = [...cycleArticles]
  for (const p of priorUnattached ?? []) {
    if (cycleIds.has(p.id)) continue
    // Held-tag exclusion, JS-side (NOT a PostgREST not.in filter): a NULL
    // ingestion_run_id means "normal row" and must never be excluded; SQL
    // NULL semantics in a NOT IN filter would silently drop those rows.
    if (p.ingestion_run_id && HELD_RUN_TAGS.includes(String(p.ingestion_run_id))) {
      report.heldExcluded++
      continue
    }
    const { data: ae } = await supabase.from('article_entities').select('entity_id, confidence').eq('article_id', p.id)
    let entityIds = (ae ?? []).filter((r: any) => r.confidence >= ENT_MIN_CONF).map((r: any) => r.entity_id)
    let entities: ResolvedEntity[] = []
    if ((ae ?? []).length === 0) {
      const text = `${p.title}. ${p.summary ?? ''}`
      const resolved = await extractAndResolveEntities(supabase, resolver, p.id, text, outletNames)
      entities = resolved.filter((r) => r.confidence >= ENT_MIN_CONF)
      entityIds = entities.map((r) => r.id)
    }
    entityIds = entityIds.filter((id) => !hubEntityIds.has(id))
    pool.push({
      id: p.id,
      outletKey: p.outlet_id ?? p.outlet ?? 'unknown',
      embedding: parseVec(p.embedding) ?? [],
      citationCount: 0,
      citationPrimary: false,
      entityIds,
      entities,
      art: p,
    })
  }
  report.poolSize = pool.length

  const unattachedPool: typeof pool = []

  for (const ca of pool) {
    if (ca.entityIds.length === 0) {
      // No resolved entity: valid terminal state — stays in the feed.
      unattachedPool.push(ca)
      continue
    }
    const hit = await findArcBySharedEntity(supabase, ca.entityIds, ca.embedding.length ? ca.embedding : null, ATTACH_MIN_SIM)
    if (hit) {
      const text = `${ca.art.title}. ${ca.art.summary ?? ''}`
      await attachToArc(supabase, ca.art, hit.arc, {
        sharedEntities: hit.sharedNames,
        sharedEntityIds: hit.sharedEntityIds,
        similarity: hit.similarity,
        causal: causalEvidence(text, hit.sharedNames, hit.arc.title),
        temporal: temporalEvidence(text),
        hasCitation: ca.citationCount > 0,
        citationPrimary: ca.citationPrimary,
        actors: ca.entities,
        topicFloor: TOPIC_FLOOR,
        embedding: ca.embedding.length ? ca.embedding : null,
        articleText: text,
      })
      report.attached++
      report.milestonesUpdated += await checkMilestones(supabase, hit.arc, text, ca.art)
      const retitled = await maybeRetitleArc(supabase, hit.arc, CAT_FLOOR)
      if (retitled) report.arcsRetitled++
    } else {
      unattachedPool.push(ca)
    }
  }

  // ---------- Step 2 origination: cluster unattached by shared entities ----------
  const components = clusterBySharedEntities(
    unattachedPool.filter((c) => c.entityIds.length > 0).map((c) => ({ id: c.id, entityIds: c.entityIds })),
  )
  const byId = new Map(unattachedPool.map((c) => [c.id, c]))
  for (const comp of components) {
    const members = comp.map((id) => byId.get(id)!)
    if (members.length < 2) {
      report.unattached += members.length
      continue
    }
    // Origination gate: >= 1 entity resolved at/above threshold (guaranteed
    // by pool construction) AND an identifiable process AND a named actor.
    const clusterText = members.map((m) => `${m.art.title}. ${m.art.summary ?? ''}`).join(' ')
    const process = findProcess(clusterText)
    const allEntities = members.flatMap((m) => m.entities)
    const actor =
      allEntities.find((e) => e.entity_type === 'institution') ??
      allEntities.find((e) => e.entity_type === 'person') ??
      allEntities[0]
    if (!process || !actor) {
      // No identifiable process => NO arc (never a 'developments' placeholder).
      report.unattached += members.length
      continue
    }
    members.sort((a, b) => String(a.art.published_at ?? '').localeCompare(String(b.art.published_at ?? '')))
    const seed = members[0]
    const arc = await originateArc(
      supabase,
      seed.art,
      seed.embedding.length ? seed.embedding : null,
      actor.canonical_name,
      process,
      CAT_FLOOR,
      members.length,
      allEntities,
      clusterText,
    )
    if (!arc) {
      report.unattached += members.length
      continue
    }
    report.arcsOriginated++
    report.milestonesCreated += (MILESTONE_TEMPLATES[arc.category] ?? MILESTONE_TEMPLATES.unclassified).length
    for (const member of members) {
      const text = `${member.art.title}. ${member.art.summary ?? ''}`
      await attachToArc(supabase, member.art, arc, {
        sharedEntities: allEntities.map((e) => e.canonical_name),
        sharedEntityIds: allEntities.map((e) => e.id),
        similarity: null,
        causal: causalEvidence(text, allEntities.map((e) => e.canonical_name), arc.title),
        temporal: temporalEvidence(text),
        hasCitation: member.citationCount > 0,
        citationPrimary: member.citationPrimary,
        actors: member.entities,
        topicFloor: TOPIC_FLOOR,
        embedding: member.embedding.length ? member.embedding : null,
        articleText: text,
      })
      report.attached++
      report.milestonesUpdated += await checkMilestones(supabase, arc, text, member.art)
    }
  }
  report.unattached += unattachedPool.filter((c) => c.entityIds.length === 0).length

  await supabase
    .from('story_arcs')
    .update({ last_assignment_run: new Date().toISOString() })
    .eq('status', 'active')

  // ---------- Phase 3: monoculture flags (unchanged) ----------
  const { data: citRows2 } = await supabase
    .from('citations')
    .select('cited_entity, article_id')
    .order('created_at', { ascending: false })
    .limit(2000)
  const byEntity = new Map<string, string[]>()
  for (const c of citRows2 ?? []) {
    const key = c.cited_entity.toLowerCase()
    const arr = byEntity.get(key) ?? []
    arr.push(c.article_id)
    byEntity.set(key, arr)
  }
  for (const [, articleIds] of byEntity) {
    if (new Set(articleIds).size < 2) continue
    const { data: flagged } = await supabase
      .from('articles')
      .update({ monoculture: true })
      .in('id', [...new Set(articleIds)])
      .select('id')
    report.monocultureFlags += flagged?.length ?? 0
  }

  // ---------- Phase 4: author profiling (unchanged) ----------
  const refreshCutoff = new Date(Date.now() - AUTHOR_REFRESH_DAYS * 86400000).toISOString()
  const { data: queue } = await supabase
    .from('author_profile_queue')
    .select('author_id, authors (id, name, article_count, last_computed)')
    .is('processed_at', null)
    .limit(5)
  for (const q of queue ?? []) {
    const author = (q as any).authors
    if (!author) continue
    if (author.last_computed && author.last_computed > refreshCutoff) {
      await supabase.from('author_profile_queue').update({ processed_at: new Date().toISOString() }).eq('author_id', author.id)
      continue
    }
    const { data: arts } = await supabase
      .from('articles')
      .select('claims, citations (cited_type)')
      .eq('author_id', author.id)
      .gte('published_at', new Date(Date.now() - 365 * 86400000).toISOString())
      .order('published_at', { ascending: false })
      .limit(AUTHOR_MAX_PRIOR)
    const count = arts?.length ?? 0
    await supabase.from('authors').update({ article_count: count }).eq('author_id', author.id)
    if (count < AUTHOR_MIN) continue

    let substantive = 0, framing = 0
    const typeDist: Record<string, number> = {}
    for (const a of arts ?? []) {
      for (const c of a.claims ?? []) {
        if (c.kind === 'substantive') substantive++
        else framing++
      }
      for (const cit of (a as any).citations ?? []) {
        typeDist[c.cited_type] = (typeDist[c.cited_type] ?? 0) + 1
      }
    }
    const profile = {
      settled_vs_contested: {
        substantive_claims: substantive,
        framing_claims: framing,
        settled_ratio: substantive + framing > 0 ? substantive / (substantive + framing) : null,
      },
      citation_diversity: typeDist,
      outlet_alignment: null,
      note: 'Heuristic profile from recent articles; no left-right score by design.',
      usable: count >= AUTHOR_MIN,
    }
    const confidence = Math.min(1, count / AUTHOR_MAX_PRIOR) * 0.8
    await supabase
      .from('authors')
      .update({ framing_profile: profile, confidence, last_computed: new Date().toISOString() })
      .eq('author_id', author.id)
    await supabase.from('author_profile_queue').update({ processed_at: new Date().toISOString() }).eq('author_id', author.id)
    report.authorsProfiled++
  }

  return Response.json({ ok: true, ...report })
})
