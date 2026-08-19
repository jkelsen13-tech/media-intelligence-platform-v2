import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { keysetAll } from './lib.js'

// ---------------------------------------------------------------------------
// ⚠️  WARNING (Phase 0 arc-membership fix): the ?reset=1 path WIPES the entire
// arc layer (story_arcs, arc_entities, arc_events, arc_milestones, nodes,
// edges, sources, citations, article_entities, entities) and resets every
// article's arc assignment. A full reprocess built the ORIGINAL poisoned arc
// layer. Do NOT run reset without (a) a fresh backup of articles.arc_id,
// story_arcs and arc_entities, and (b) a reviewed migration plan. The attach /
// originate paths below now carry the same hardening as ingest-rss
// (hub-entity exclusion, min shared-entity / primary gate, similarity floor,
// most-matches process picking, anti-snowball arc_entities, centroid
// embeddings) so a re-run cannot re-snowball — but reset is still destructive.
// ---------------------------------------------------------------------------

async function loadConfig(supabase: any) {
  const { data, error } = await supabase.from('pipeline_config').select('key, value')
  if (error) throw error
  const cfg: Record<string, any> = {}
  for (const row of data) cfg[row.key] = row.value
  return cfg
}


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

// Reference-manifest rows intentionally retain publisher metadata only. Their
// placeholder text expressly states that no original publisher body, claims,
// entities, or relationship data were copied. Treating that sentinel as
// evidence would fabricate cross-surface links from a non-source string.
const METADATA_ONLY_REFERENCE_BODY = 'Read-only reference import: public source metadata only. No original body text, embeddings, entities, claims, or relationship data were copied.'

function isMetadataOnlyReferenceBody(text: string): boolean {
  return text.trim() === METADATA_ONLY_REFERENCE_BODY
}

const PRIMARY_RECORD_HOST_RE = /(^|\.)([a-z0-9-]+\.gov|justice\.gov|uscourts\.gov|supremecourt\.gov|congress\.gov|whitehouse\.gov|federalregister\.gov|ecfr\.gov)$/i

function isResolvablePrimaryRecordUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && PRIMARY_RECORD_HOST_RE.test(parsed.hostname)
  } catch {
    return false
  }
}

function literalClaimFromStoredClaims(claims: any, bodyText: string): string | null {
  if (!Array.isArray(claims)) return null
  for (const claim of claims) {
    const text = typeof claim?.text === 'string' ? claim.text.trim() : ''
    if (text.length >= 80 && bodyText.includes(text)) return text.slice(0, 1200)
  }
  return null
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
      const toks = new Set(norm.split(' '))
      if (toks.size >= 2) {
        const hits: any[] = []
        for (const [en, e] of this.byNorm) {
          const et = new Set(en.split(' '))
          const sub = [...toks].every((t) => et.has(t)) || [...et].every((t) => toks.has(t))
          if (sub) hits.push(e)
        }
        if (hits.length === 1) {
          ent = hits[0]
          conf = this.fuzzyConf
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

// ---------------------------------------------------------------------------
// NER MODEL SEAM (addendum §2.1) — wiring a model later is CONFIG-ONLY.
//
// Secrets (either pair works):
//   NER_API_URL + NER_API_KEY            -> POST NER_API_URL
//   HF_API_TOKEN (alone)                 -> POST https://api-inference.huggingface.co/models/dslim/bert-base-NER
//
// REQUEST:
//   POST <url>
//   Headers: Authorization: Bearer <key>, Content-Type: application/json
//   Body:    { "inputs": "<article text, truncated to 8000 chars>" }
//
// RESPONSE (both HF token-classification and simple custom shapes accepted):
//   HF style:    [[{ "entity_group": "PER", "word": "Keir Starmer", "score": 0.99, "start": 0, "end": 12 }, ...]]
//               (a flat single-level array is also accepted; BPE "##" prefixes are stripped)
//   Custom style: { "entities": [{ "text": "Keir Starmer", "type": "PER" }, ...] }
//   Recognized per mention: text|surface|word, type|entity_group|entity.
//   Type mapping: PER*->person, ORG*->organization, INSTITUTION->institution,
//   LOC/GPE/MISC->other.
//
// MERGE: model spans WIN on overlap — a heuristic candidate is dropped when
// its normalized name is a token-subset/superset of a model candidate's.
// Canonicalization, resolution, attachment and confidence logging downstream
// are SHARED regardless of path. Absent secrets or any failure => null =>
// silently heuristic-only. Path is logged via article_entities.extraction_method
// ('heuristic' | 'model' | 'model+heuristic').
// ---------------------------------------------------------------------------
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
// dropped when its normalized name is a token-subset/superset of any model
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
  { category: 'economic_policy', weight: 0.45, re: /\b(tariff\w*|inflation|interest rate\w*|federal reserve|trade (deal|war|dispute|crosshairs)|recession|budget|gdp|central bank)\b/i },
  { category: 'economic_policy', weight: 0.3, re: /\b(supply chain|jobs report|dairy sector|auto industry|rent control\w*|cost of living|wages?|deficit|spending|economy|economic)\b/i },
  { category: 'economic_policy', weight: 0.15, re: /\b(markets?|stocks?|shares|oil prices?|energy prices?|prices?)\b/i },
  { category: 'legislative_regulatory', weight: 0.45, re: /\b(bill|senate|house passes|regulation|supreme court|executive order|congress|parliament|vote\w*|ruling|legislation|lawmakers)\b/i },
  { category: 'legislative_regulatory', weight: 0.3, re: /\b(rules out|backs off|pledge|ban\w*|controls|amendment|regulator\w*|white paper|statutory|clause|committee stage)\b/i },
  { category: 'legislative_regulatory', weight: 0.15, re: /\b(law|legal|court|judge|appeal|hearing)\b/i },
]

interface Classification {
  category: string
  confidence: number
  evidence: string | null
}

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


const PROCESS_PATTERNS: Array<{ process: string; re: RegExp }> = [
  { process: 'cross-border explosives interdiction', re: /\b(bomb|explosive\w*|ied)\b[\s\S]{0,80}\b(intercept\w*|seiz\w*)\b|\b(intercept\w*|seiz\w*)\b[\s\S]{0,80}\b(bomb|explosive\w*|ied)\b/i },
  { process: 'shipping interdiction', re: /\b(tanker\w*|shipping|vessel\w*)[\s\S]{0,80}(threat|u-turn|rerout\w*)|\b(shipping threat)\b/i },
  { process: 'ceasefire talks', re: /\b(ceasefire|truce|peace talks|peace deal)\b/i },
  // Phase 0 fix: economic/legal processes ordered BEFORE military escalation;
  // military escalation requires genuine armed-conflict vocabulary (bare
  // 'strike\w*|attack\w*' removed, 'war' word-bounded).
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
  { process: 'policy reversal', re: /\b(backs off|revers\w*|u-turn|abandon\w*|scrap\w*)\b/i },
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
// first-match; ties keep the earlier (more specific) pattern. null => no arc.
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

function makeArcTitle(actorName: string | null, process: string | null): string | null {
  if (!process) return null
  if (!actorName) return `Unattributed cluster — ${process}`
  // Strip possessive leaks ("Charlie Kirk's" -> "Charlie Kirk") so the title
  // subject is the entity name, not a surface form.
  const subject = actorName.replace(/['’]s$/u, '').trim()
  if (!subject) return `Unattributed cluster — ${process}`
  return `${subject} — ${process}`.slice(0, 140)
}


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
    { key: 'gp_routes', title: 'Disrupted routes or activity normalize', confirm: /\b(resum\w+|reopen\w+|normali\w*|returns? to (the )?(red sea|route|port))\b/i },
    { key: 'gp_escalation', title: 'Further escalation or intervention', confirm: /\b(escalat\w+|strike\w+|attack\w*|intervention|deploy\w+|mobilis\w+|mobiliz\w+)\b/i },
  ],
  economic_policy: [
    { key: 'ep_enacted', title: 'Policy measure enacted or implemented', confirm: /\b(takes effect|comes into force|enacted|implement\w+|signed into law|approved)\b/i },
    { key: 'ep_market', title: 'Market or sector adjustment', confirm: /\b(markets? (react\w*|fall|rise|slide)|shares? (fell|fall|rose|rise)|prices? (rise|fall|rose|fell)|adjust\w+)\b/i },
    { key: 'ep_reversal', title: 'Policy reversed or withdrawn', confirm: /\b(revers\w+|withdraw\w+|scrapped|backs off|abandon\w+|u-turn)\b/i },
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

function tagTopics(text: string, floor: number): Array<{ slug: string; confidence: number }> {
  const conf = new Map<string, number>()
  for (const { slug, weight, re } of TOPIC_RULES) {
    if (re.test(text)) conf.set(slug, Math.min(1, (conf.get(slug) ?? 0) + weight))
  }
  for (const [slug, c] of [...conf]) {
    let p = TOPIC_PARENT[slug]
    while (p) {
      conf.set(p, Math.max(conf.get(p) ?? 0, c))
      p = TOPIC_PARENT[p] ?? null
    }
  }
  return [...conf].filter(([, c]) => c >= floor).map(([slug, confidence]) => ({ slug, confidence }))
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
    .map((t) => ({ node_id: nodeId, topic_id: ids.get(t.slug), confidence: t.confidence }))
    .filter((r) => r.topic_id)
  if (rows.length === 0) return 0
  await supabase.from('node_topics').upsert(rows, { onConflict: 'node_id,topic_id' })
  return rows.length
}

interface AttachContext {
  sharedEntities: string[]
  sharedEntityIds: string[]
  similarity: number | null
  causal: string | null
  temporal: string | null
  hasCitation: boolean
  citationPrimary?: boolean
  actors?: ActorRef[]
  topicFloor?: number
  embedding?: number[] | null // article embedding, used to refresh the arc centroid
}

async function attachToArc(supabase: any, art: any, arc: any, ctx: AttachContext) {
  // 15A: atomic attach (migration 20260813_atomic_arc_attach). Membership
  // write, member-count derivation, and the running-centroid fold happen in
  // ONE SQL transaction, computed from the current stored value inside it.
  // Duplicate attach is an idempotent no-op ('already_attached'). Deliberate
  // failure-contract change: a centroid failure now rolls back the membership
  // too — the article stays unattached and retryable instead of landing with
  // a stale centroid (the old try/catch silently allowed that).
  // p_evidence null => existing arc_assignment_evidence is preserved
  // (backfill never wrote it).
  const { error: attachErr } = await supabase.rpc('attach_article_to_arc', {
    p_article_id: art.id,
    p_arc_id: arc.id,
    p_embedding: ctx.embedding && ctx.embedding.length > 0 ? `[${ctx.embedding.join(',')}]` : null,
    p_evidence: null,
  })
  if (attachErr) throw attachErr

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
          evidence: ctx.causal ?? ctx.temporal ?? 'explicit citation in article',
        },
      },
      { onConflict: 'source_id,target_id,type' },
    )
  }
  await supabase.from('story_arcs').update({ last_update_at: new Date().toISOString() }).eq('id', arc.id)
}

// Phase 0 fix: hub entities (document frequency > cluster_entity_max_df over
// article_entities) are excluded from attach matching, mirroring the
// originate-step filter that already existed here.
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

// Phase 0 hardening (mirrors ingest-rss): accept a candidate arc only when
// the article shares >= 2 arc entities OR the arc's role='primary' entity;
// a single shared entity additionally requires similarity >= attachMinSimilarity.
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
    if (sharedCount < 2 && !cand.sharedPrimary) continue
    let sim: number | null = null
    if (embedding) {
      const vec = parseVec(cand.arc.embedding)
      if (vec) sim = cosine(embedding, vec)
    }
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
  entityMemberFreq?: Map<string, number>,
) {
  const cls = applyFloor(classifyArc(clusterText), catFloor)
  const title = makeArcTitle(actorName, process)
  if (!title) return null // never originate without an identifiable process
  const slug = `arc-${slugify(title).slice(0, 40)}-${String(art.id).slice(0, 8)}`

  const { data: rootNode, error: nodeErr } = await supabase
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
  if (nodeErr) console.error('originateArc: node insert failed:', nodeErr.message)

  const { data: arc, error: arcErr } = await supabase
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
  if (!arc) {
    console.error('originateArc: story_arcs insert failed:', arcErr?.message ?? 'no data', '| title:', title)
    return null
  }

  // Phase 0 fix (anti-snowball): persist ONLY entities that appear in >= 2
  // cluster members (previously ALL member entities, which let one bridging
  // article poison the arc forever). Fall back to the actor entity alone so
  // the arc keeps a primary.
  const seen = new Set<string>()
  const rows: any[] = []
  for (const e of clusterEntities) {
    if (seen.has(e.id)) continue
    seen.add(e.id)
    if (entityMemberFreq && (entityMemberFreq.get(e.id) ?? 0) < 2) continue
    rows.push({ arc_id: arc.id, entity_id: e.id, role: e.canonical_name === actorName ? 'primary' : 'participant' })
  }
  if (rows.length === 0) {
    const actorEntity = clusterEntities.find((e) => e.canonical_name === actorName)
    if (actorEntity) rows.push({ arc_id: arc.id, entity_id: actorEntity.id, role: 'primary' })
  }
  if (rows.length > 0) await supabase.from('arc_entities').upsert(rows, { onConflict: 'arc_id,entity_id' })

  await generateMilestones(supabase, arc.id, cls.category, process)
  return arc
}

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



const BUDGET_MS = 100_000
const EXTRACT_BATCH = 25
const ORIGINATE_COMPS = 12
const ATTACH_BATCH = 50

interface BackfillState {
  phase: 'extract' | 'originate' | 'attach' | 'done'
}

async function loadState(supabase: any): Promise<BackfillState | null> {
  const { data } = await supabase.from('pipeline_config').select('value').eq('key', 'backfill_state').maybeSingle()
  if (!data) return null
  const v = data.value
  return typeof v === 'string' ? JSON.parse(v) : (v as BackfillState)
}

async function saveState(supabase: any, state: BackfillState) {
  await supabase
    .from('pipeline_config')
    .upsert({ key: 'backfill_state', value: JSON.stringify(state), description: 'backfill-legacy v4 reprocess cursor (managed)' }, { onConflict: 'key' })
}

async function deleteAll(supabase: any, table: string, col = 'id') {
  const { error } = await supabase.from(table).delete().not(col, 'is', null)
  if (error) throw new Error(`wipe ${table}: ${error.message}`)
}

async function wipeArcLayer(supabase: any) {
  await deleteAll(supabase, 'sources')
  await deleteAll(supabase, 'edges')
  await deleteAll(supabase, 'arc_events')
  await deleteAll(supabase, 'arc_milestones')
  await deleteAll(supabase, 'arc_entities', 'arc_id')
  await deleteAll(supabase, 'citations')
  await deleteAll(supabase, 'article_entities', 'article_id')
  await deleteAll(supabase, 'entities')
  const { error } = await supabase
    .from('articles')
    .update({ arc_id: null, is_digest: false, entities_extracted_at: null, arc_assign_attempted_at: null, monoculture: false })
    .not('id', 'is', null)
  if (error) throw new Error(`reset articles: ${error.message}`)
  await deleteAll(supabase, 'story_arcs')
  await deleteAll(supabase, 'nodes')
}

async function extractBatch(
  supabase: any,
  resolver: EntityResolver,
  outletNames: Set<string>,
  cfg: any,
  report: any,
  runTag: string | null = null,
): Promise<boolean> {
  // Scoped mode (Doc 07 Item 2b): when runTag is set, selection is narrowed
  // to that ingestion run's rows ONLY — the corpus-wide null markers must
  // never pull legacy articles into a scoped run.
  let q = supabase
    .from('articles')
    .select('id, title, summary, body_text, image_url, image_alt, ingestion_run_id')
    .is('entities_extracted_at', null)
    .order('fetched_at', { ascending: true })
    .limit(EXTRACT_BATCH)
  if (runTag) q = q.eq('ingestion_run_id', runTag)
  const { data: batch, error } = await q
  if (error) throw error
  if (!batch || batch.length === 0) return false

  const ENT_MIN_CONF = Number(cfg.entity_resolve_min_confidence ?? 0.5)
  const DIGEST_ENTITY_COUNT = Number(cfg.digest_entity_count ?? 8)
  const DOC_WEIGHTS = cfg.doc_strength_weights ?? {}

  for (const art of batch) {
    try {
      const t = sanitize(art.title)
      const s = sanitize(art.summary)
      const b = sanitize(art.body_text)
      const updates: any = { entities_extracted_at: new Date().toISOString() }
      if (t.text !== (art.title ?? '')) updates.title = t.text
      if (s.text !== (art.summary ?? '')) updates.summary = s.text || null
      if (b.text !== (art.body_text ?? '')) updates.body_text = b.text || null
      if (!art.image_url && s.imageUrl) updates.image_url = s.imageUrl
      if (!art.image_alt && s.imageAlt) updates.image_alt = s.imageAlt

      if (isMetadataOnlyReferenceBody(b.text)) {
        // Preserve the article for News and chronological Timeline access, but
        // explicitly withhold every inferred cross-surface relation until an
        // original publisher body is hydrated and can supply literal evidence.
        updates.claims = []
        updates.is_digest = false
        updates.arc_assign_attempted_at = new Date().toISOString()
        updates.source_status_changed_at = new Date().toISOString()
        updates.source_status_note = 'Reference-manifest metadata only; original publisher body is unavailable for literal extraction or cross-surface assignment.'
        await supabase.from('citations').delete().eq('article_id', art.id)
        await supabase.from('article_entities').delete().eq('article_id', art.id)
        const { error: upErr } = await supabase.from('articles').update(updates).eq('id', art.id)
        if (upErr) throw upErr
        report.metadataOnlySkipped = (report.metadataOnlySkipped ?? 0) + 1
        continue
      }

      const analysisText = `${t.text}. ${b.text || s.text}`
      const claims = extractClaims(analysisText)
      updates.claims = claims

      const resolved = await extractAndResolveEntities(supabase, resolver, art.id, analysisText, outletNames)
      report.entitiesResolved += resolved.length
      const strong = resolved.filter((r) => r.confidence >= ENT_MIN_CONF)
      const orgPersonCount = strong.filter((r) => ['person', 'organization', 'institution'].includes(r.entity_type)).length
      updates.is_digest = isDigest(t.text, orgPersonCount, DIGEST_ENTITY_COUNT)
      if (updates.is_digest) report.digests++

      await supabase.from('citations').delete().eq('article_id', art.id)
      for (const c of extractCitations(analysisText, DOC_WEIGHTS)) {
        await supabase.from('citations').insert({ ...c, article_id: art.id })
        report.citations++
      }

      const { error: upErr } = await supabase.from('articles').update(updates).eq('id', art.id)
      if (upErr) throw upErr
      report.extracted++
    } catch (err) {
      report.errors.push(`extract ${String(art.id).slice(0, 8)}: ${String(err)}`)
      await supabase.from('articles').update({ entities_extracted_at: new Date().toISOString() }).eq('id', art.id)
    }
  }
  return true
}

// Review-gated candidate pass. It assesses only literal source text that is
// stored locally, an actual HTTPS primary-record publisher URL, and a primary
// citation classification. It never writes a Graph/Arc/Timeline surface and
// therefore cannot convert a proposal into a live claim.
// Keep PostgREST .in() URLs safely below the edge gateway request limit.
const CANDIDATE_BATCH = 100
const CANDIDATE_ALGORITHM_VERSION = 'provenance-first-v2.4-evidence-floor'

async function candidateStep(supabase: any, report: any, runTag: string | null = null): Promise<boolean> {
  let q = supabase
    .from('articles')
    .select('id, url, body_text, claims')
    .is('candidate_generation_attempted_at', null)
    .order('fetched_at', { ascending: true })
    .limit(CANDIDATE_BATCH)
  // Scoped BigQuery runs already persist structured extraction results through
  // article_extraction_results; they are eligible for candidate assessment
  // even when the legacy entity-backfill marker has not been populated.
  if (runTag) q = q.eq('ingestion_run_id', runTag)
  else q = q.not('entities_extracted_at', 'is', null)
  const { data: batch, error } = await q
  if (error) throw error
  if (!batch || batch.length === 0) return false

  const articleIds = batch.map((article: any) => article.id)
  const [{ data: citationRows, error: citationError }, { data: existingRows, error: existingError }] = await Promise.all([
    supabase.from('citations').select('article_id, cited_type').in('article_id', articleIds),
    supabase.from('cross_surface_candidates').select('article_id').in('article_id', articleIds)
      .eq('candidate_type', 'graph_node').eq('target_table', 'nodes').is('target_id', null)
      .eq('algorithm_version', CANDIDATE_ALGORITHM_VERSION),
  ])
  if (citationError) throw citationError
  if (existingError) throw existingError

  const citationTypesByArticle = new Map<string, Set<string>>()
  for (const citation of citationRows ?? []) {
    const types = citationTypesByArticle.get(citation.article_id) ?? new Set<string>()
    types.add(citation.cited_type)
    citationTypesByArticle.set(citation.article_id, types)
  }
  const existingArticleIds = new Set<string>((existingRows ?? []).map((row: any) => row.article_id))
  const notes = new Map<string, string[]>()
  const candidates: any[] = []
  const now = new Date().toISOString()
  const redistrictingSensitiveScope = Boolean(runTag && runTag.includes('redistricting-exclusion'))

  for (const article of batch) {
    const body = String(article.body_text ?? '').trim()
    let note: string
    if (redistrictingSensitiveScope) {
      note = 'withheld: redistricting-sensitive ingestion scope is reserved for owner review'
      report.candidateOwnerHoldWithheld++
    } else if (isMetadataOnlyReferenceBody(body)) {
      note = 'withheld: reference-manifest metadata only; no original publisher body for literal evidence'
      report.candidateMetadataOnlyWithheld++
    } else {
      const literal = literalClaimFromStoredClaims(article.claims, body)
      const hasPrimaryCitation = [...(citationTypesByArticle.get(article.id) ?? new Set<string>())]
        .some((type) => ['court_doc', 'agency_release'].includes(type))
      const hasPrimaryUrl = isResolvablePrimaryRecordUrl(article.url)
      if (!literal) {
        note = 'withheld: no stored literal claim span of sufficient length'
        report.candidateNoLiteralWithheld++
      } else if (!hasPrimaryCitation) {
        note = 'withheld: no court_doc or agency_release citation classification'
        report.candidateNoPrimaryCitationWithheld++
      } else if (!hasPrimaryUrl) {
        note = 'withheld: publisher URL is not a recognized HTTPS primary-record host'
        report.candidateNoPrimaryUrlWithheld++
      } else {
        note = 'candidate materialized: literal claim plus primary citation and primary-record URL'
        if (existingArticleIds.has(article.id)) {
          report.candidatesAlreadyPresent++
        } else {
          candidates.push({
            article_id: article.id,
            candidate_type: 'graph_node',
            target_table: 'nodes',
            target_id: null,
            evidence_excerpt: literal,
            evidence_start: body.indexOf(literal),
            evidence_end: body.indexOf(literal) + literal.length,
            algorithm_version: CANDIDATE_ALGORITHM_VERSION,
            review_state: 'pending',
            remaining_uncertainty: 'Pending review: literal stored publisher text, primary citation classification, and a resolvable primary-record URL meet the generation floor. No node or relationship has been published.',
          })
          report.candidatesMaterialized++
        }
      }
    }
    const ids = notes.get(note) ?? []
    ids.push(article.id)
    notes.set(note, ids)
  }

  if (candidates.length > 0) {
    const { error: insertError } = await supabase.from('cross_surface_candidates').insert(candidates)
    if (insertError) throw insertError
  }
  for (const [note, ids] of notes) {
    const { error: markError } = await supabase
      .from('articles')
      .update({ candidate_generation_attempted_at: now, candidate_generation_note: note })
      .in('id', ids)
    if (markError) throw markError
  }
  report.candidateAssessed += batch.length
  return true
}

async function loadArticleEntities(supabase: any, articleIds: string[], minConf: number): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>()
  for (let i = 0; i < articleIds.length; i += 150) {
    const chunk = articleIds.slice(i, i + 150)
    const { data, error } = await supabase
      .from('article_entities')
      .select('article_id, entity_id, confidence')
      .in('article_id', chunk)
      .gte('confidence', minConf)
    if (error) throw error
    for (const row of data ?? []) {
      const arr = map.get(row.article_id) ?? []
      arr.push(row.entity_id)
      map.set(row.article_id, arr)
    }
  }
  return map
}

async function loadEntityIndex(supabase: any): Promise<Map<string, any>> {
  const idx = new Map<string, any>()
  let from = 0
  for (;;) {
    const { data, error } = await supabase.from('entities').select('id, canonical_name, entity_type').range(from, from + 999)
    if (error) throw error
    if (!data || data.length === 0) break
    for (const e of data) idx.set(e.id, e)
    if (data.length < 1000) break
    from += 1000
  }
  return idx
}

async function originateStep(supabase: any, cfg: any, report: any, deadline: number, runTag: string | null = null): Promise<void> {
  const ENT_MIN_CONF = Number(cfg.entity_resolve_min_confidence ?? 0.5)
  const CAT_FLOOR = Number(cfg.category_confidence_floor ?? 0.35)
  const MAX_DF = Number(cfg.cluster_entity_max_df ?? 5)
  const TOPIC_FLOOR = Number(cfg.topic_confidence_floor ?? 0.4)

  let q = supabase
    .from('articles')
    .select('id, title, summary, url, outlet, outlet_id, published_at, embedding')
    .is('arc_id', null)
    .is('arc_assign_attempted_at', null)
    .eq('is_digest', false)
    .not('entities_extracted_at', 'is', null)
  if (runTag) q = q.eq('ingestion_run_id', runTag)
  const { data: poolArts, error } = await q
  if (error) throw error
  if (!poolArts || poolArts.length === 0) {
    report.originatePoolEmpty = true
    return
  }

  const entByArticle = await loadArticleEntities(supabase, poolArts.map((a: any) => a.id), ENT_MIN_CONF)
  const df = new Map<string, number>()
  for (const ids of entByArticle.values()) {
    for (const e of new Set(ids)) df.set(e, (df.get(e) ?? 0) + 1)
  }
  const withEnt = poolArts
    .map((a: any) => ({ id: a.id, entityIds: (entByArticle.get(a.id) ?? []).filter((e) => (df.get(e) ?? 0) <= MAX_DF) }))
    .filter((a: any) => a.entityIds.length > 0)
  const components = clusterBySharedEntities(withEnt)
  const multi = components.filter((c) => c.length >= 2).sort((a, b) => b.length - a.length)
  if (multi.length === 0) {
    report.originateExhausted = true
    return
  }

  const entIdx = await loadEntityIndex(supabase)
  const byId = new Map<string, any>(poolArts.map((a: any) => [a.id, a]))

  for (const comp of multi.slice(0, ORIGINATE_COMPS)) {
    if (Date.now() > deadline - 20_000) break
    const members = comp.map((id) => byId.get(id)!).filter(Boolean)
    const clusterText = members.map((m: any) => `${m.title}. ${m.summary ?? ''}`).join(' ')
    const process = findProcess(clusterText)
    const allEntities: ResolvedEntity[] = []
    const seenE = new Set<string>()
    const freq = new Map<string, number>()
    for (const m of members) {
      for (const eid of new Set(entByArticle.get(m.id) ?? [])) freq.set(eid, (freq.get(eid) ?? 0) + 1)
    }
    for (const m of members) {
      for (const eid of entByArticle.get(m.id) ?? []) {
        if (seenE.has(eid)) continue
        seenE.add(eid)
        const e = entIdx.get(eid)
        if (e) allEntities.push({ id: e.id, canonical_name: e.canonical_name, entity_type: e.entity_type, confidence: 1, role: null, isNew: false })
      }
    }
    allEntities.sort((a, b) => (freq.get(b.id) ?? 0) - (freq.get(a.id) ?? 0))
    const actor =
      allEntities.find((e) => e.entity_type === 'institution') ??
      allEntities.find((e) => e.entity_type === 'person') ??
      allEntities[0]
    if (!process || !actor) {
      await supabase.from('articles').update({ arc_assign_attempted_at: new Date().toISOString() }).in('id', comp)
      report.clustersRejectedNoProcess++
      continue
    }
    members.sort((a: any, b: any) => String(a.published_at ?? '').localeCompare(String(b.published_at ?? '')))
    const seed = members[0]
    const seedVec = parseVec(seed.embedding)
    const arc = await originateArc(
      supabase,
      seed,
      seedVec,
      actor.canonical_name,
      process,
      CAT_FLOOR,
      members.length,
      allEntities,
      clusterText,
      freq,
    )
    if (!arc) {
      await supabase.from('articles').update({ arc_assign_attempted_at: new Date().toISOString() }).in('id', comp)
      report.clustersRejectedNoProcess++
      continue
    }
    report.arcsOriginated++
    report.milestonesCreated += (MILESTONE_TEMPLATES[arc.category] ?? MILESTONE_TEMPLATES.unclassified).length
    for (const member of members) {
      const text = `${member.title}. ${member.summary ?? ''}`
      const { data: citRows } = await supabase.from('citations').select('cited_type').eq('article_id', member.id)
      await attachToArc(supabase, member, arc, {
        sharedEntities: allEntities.map((e) => e.canonical_name),
        sharedEntityIds: allEntities.map((e) => e.id),
        similarity: null,
        causal: causalEvidence(text, allEntities.map((e) => e.canonical_name), arc.title),
        temporal: temporalEvidence(text),
        hasCitation: (citRows?.length ?? 0) > 0,
        citationPrimary: (citRows ?? []).some((c: any) => ['court_doc', 'agency_release'].includes(c.cited_type)),
        actors: ((entByArticle.get(member.id) ?? []) as string[])
          .map((eid) => entIdx.get(eid))
          .filter(Boolean),
        topicFloor: TOPIC_FLOOR,
        embedding: parseVec(member.embedding),
      })
      report.attached++
      report.milestonesUpdated += await checkMilestones(supabase, arc, text, member)
    }
  }
}

async function attachStep(supabase: any, cfg: any, report: any, runTag: string | null = null): Promise<boolean> {
  const ENT_MIN_CONF = Number(cfg.entity_resolve_min_confidence ?? 0.5)
  const TOPIC_FLOOR = Number(cfg.topic_confidence_floor ?? 0.4)
  // Phase 0 fix: single shared entity requires this similarity floor
  // (attach_threshold / attach_shortlist_similarity are dead config; this is
  // the live one, mirrored from ingest-rss), and hub entities (df >
  // cluster_entity_max_df) can never drive attachment.
  const ATTACH_MIN_SIM = Number(cfg.attach_min_similarity ?? 0.78)
  const hubEntityIds = await loadHubEntityIds(supabase, Number(cfg.cluster_entity_max_df ?? 5))

  let q = supabase
    .from('articles')
    .select('id, title, summary, url, outlet, outlet_id, published_at, embedding')
    .is('arc_id', null)
    .is('arc_assign_attempted_at', null)
    .eq('is_digest', false)
    .not('entities_extracted_at', 'is', null)
    .order('published_at', { ascending: true })
    .limit(ATTACH_BATCH)
  if (runTag) q = q.eq('ingestion_run_id', runTag)
  const { data: batch, error } = await q
  if (error) throw error
  if (!batch || batch.length === 0) return false

  const entByArticle = await loadArticleEntities(supabase, batch.map((a: any) => a.id), ENT_MIN_CONF)
  const entIdx = await loadEntityIndex(supabase)
  for (const art of batch) {
    try {
      const entityIds = (entByArticle.get(art.id) ?? []).filter((eid: string) => !hubEntityIds.has(eid))
      const text = `${art.title}. ${art.summary ?? ''}`
      const hit = entityIds.length > 0
        ? await findArcBySharedEntity(supabase, entityIds, parseVec(art.embedding), ATTACH_MIN_SIM)
        : null
      if (hit) {
        const { data: citRows } = await supabase.from('citations').select('cited_type').eq('article_id', art.id)
        await attachToArc(supabase, art, hit.arc, {
          sharedEntities: hit.sharedNames,
          sharedEntityIds: hit.sharedEntityIds,
          similarity: hit.similarity,
          causal: causalEvidence(text, hit.sharedNames, hit.arc.title),
          temporal: temporalEvidence(text),
          hasCitation: (citRows?.length ?? 0) > 0,
          citationPrimary: (citRows ?? []).some((c: any) => ['court_doc', 'agency_release'].includes(c.cited_type)),
          actors: entityIds.map((eid) => entIdx.get(eid)).filter(Boolean),
          topicFloor: TOPIC_FLOOR,
          embedding: parseVec(art.embedding),
        })
        report.attached++
        report.milestonesUpdated += await checkMilestones(supabase, hit.arc, text, art)
      } else {
        report.unattached++
      }
      await supabase.from('articles').update({ arc_assign_attempted_at: new Date().toISOString() }).eq('id', art.id)
    } catch (err) {
      report.errors.push(`attach ${String(art.id).slice(0, 8)}: ${String(err)}`)
      await supabase.from('articles').update({ arc_assign_attempted_at: new Date().toISOString() }).eq('id', art.id)
    }
  }
  return true
}

// ---------- additive passes (no reset) ----------

// Step 6 additive pass: actor nodes for every resolved entity + actor edges
// for the CURRENT graph. Idempotent. Event<->article linkage via the id
// prefix embedded in event-node slugs ('art-...-<id8>').
async function actorsPass(supabase: any, report: any, deadline: number) {
  const { data: ents, error } = await keysetAll(supabase, 'entities', 'id, canonical_name, entity_type', {
    filter: (q: any) => q.in('entity_type', ['person', 'organization', 'institution']),
  })
  if (error) throw error
  const actorNodeByEntity = new Map<string, string>()
  for (const e of ents ?? []) {
    const nodeId = await ensureActorNode(supabase, e)
    if (nodeId) actorNodeByEntity.set(e.id, nodeId)
    if (Date.now() > deadline) break
  }
  report.actorNodes = actorNodeByEntity.size

  const { data: evNodes, error: evNodesErr } = await keysetAll(supabase, 'nodes', 'id, slug', {
    filter: (q: any) => q.eq('type', 'event'),
  })
  if (evNodesErr) throw evNodesErr
  const nodeById8 = new Map<string, string>()
  for (const n of evNodes ?? []) {
    const m = String(n.slug).match(/-([0-9a-f]{8})$/)
    if (m) nodeById8.set(m[1], n.id)
  }

  report.actorEdges = 0
  let from = 0
  for (;;) {
    const { data, error: aeErr } = await supabase
      .from('article_entities')
      .select('article_id, entity_id')
      .gte('confidence', 0.5)
      .range(from, from + 999)
    if (aeErr) throw aeErr
    if (!data || data.length === 0) break
    for (const r of data) {
      const n = nodeById8.get(String(r.article_id).slice(0, 8))
      const an = actorNodeByEntity.get(r.entity_id)
      if (!n || !an || n === an) continue
      await supabase.from('edges').upsert(
        {
          source_id: n,
          target_id: an,
          type: 'actor',
          label: 'involves',
          weight: 'heavy',
          signal_source: 'shared_entity',
          doc_strength: 'corroborated',
          claimed_by: 'reporting',
          reliability: 2,
          metadata: { entity_id: r.entity_id, article_id: r.article_id },
        },
        { onConflict: 'source_id,target_id,type' },
      )
      report.actorEdges++
    }
    if (data.length < 1000) break
    from += 1000
    if (Date.now() > deadline) {
      report.actorPassIncomplete = true
      break
    }
  }
}

// Step 8 additive pass: tag existing event nodes from their article text.
async function topicsPass(supabase: any, cfg: any, report: any, deadline: number) {
  const floor = Number(cfg.topic_confidence_floor ?? 0.4)
  const { data: evNodes, error: evNodesErr } = await keysetAll(supabase, 'nodes', 'id, slug', {
    filter: (q: any) => q.eq('type', 'event'),
  })
  if (evNodesErr) throw evNodesErr
  const nodeById8 = new Map<string, string>()
  for (const n of evNodes ?? []) {
    const m = String(n.slug).match(/-([0-9a-f]{8})$/)
    if (m) nodeById8.set(m[1], n.id)
  }
  report.eventNodes = evNodes?.length ?? 0
  report.nodesTagged = 0
  report.topicRows = 0
  let from = 0
  for (;;) {
    const { data, error } = await supabase.from('articles').select('id, title, summary').range(from, from + 499)
    if (error) throw error
    if (!data || data.length === 0) break
    for (const a of data) {
      const nodeId = nodeById8.get(String(a.id).slice(0, 8))
      if (!nodeId) continue
      const n = await tagNodeTopics(supabase, nodeId, `${a.title}. ${a.summary ?? ''}`, floor)
      if (n > 0) {
        report.nodesTagged++
        report.topicRows += n
      }
    }
    if (data.length < 500) break
    from += 500
    if (Date.now() > deadline) {
      report.topicsPassIncomplete = true
      break
    }
  }
}

Deno.serve(async (req: Request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: 'Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 })
  }
  const supabase = createClient(supabaseUrl, serviceKey)
  const cfg = await loadConfig(supabase)
  const reqUrl = new URL(req.url)

  const report: any = {
    ranAt: new Date().toISOString(),
    extracted: 0,
    digests: 0,
    citations: 0,
    entitiesResolved: 0,
    arcsOriginated: 0,
    attached: 0,
    unattached: 0,
    clustersRejectedNoProcess: 0,
    milestonesCreated: 0,
    milestonesUpdated: 0,
    metadataOnlySkipped: 0,
    candidateAssessed: 0,
    candidatesMaterialized: 0,
    candidatesAlreadyPresent: 0,
    candidateMetadataOnlyWithheld: 0,
    candidateOwnerHoldWithheld: 0,
    candidateNoLiteralWithheld: 0,
    candidateNoPrimaryCitationWithheld: 0,
    candidateNoPrimaryUrlWithheld: 0,
    errors: [] as string[],
  }

  const deadline0 = Date.now() + BUDGET_MS
  const mode = reqUrl.searchParams.get('mode')
  const runTag = reqUrl.searchParams.get('run')

  if (mode === 'candidates') {
    try {
      while (Date.now() < deadline0) {
        const more = await candidateStep(supabase, report, runTag)
        if (!more) break
      }
      return Response.json({ ok: true, mode, runTag, ...report })
    } catch (err) {
      const detail = err instanceof Error ? err.message : (() => {
        try { return JSON.stringify(err) } catch { return String(err) }
      })()
      report.errors.push(`candidate pass: ${detail}`)
      return Response.json({ ok: false, mode, runTag, ...report }, { status: 500 })
    }
  }

  // Scoped mode (Doc 07 Item 2b): ?run=<tag> processes ONLY that ingestion
  // run's rows through extract -> originate -> attach, phase logic verbatim.
  // reset is hard-forbidden here; backfill_state is never read or written.
  if (runTag) {
    if (reqUrl.searchParams.get('reset') === '1') {
      return Response.json({ ok: false, error: 'reset is forbidden in scoped mode (?run=); scoped runs never touch the arc layer outside their own tag' }, { status: 400 })
    }
    report.scopedRun = runTag
    const resolver = new EntityResolver(cfg)
    await resolver.load(supabase)
    const { data: outletRows } = await supabase.from('outlets').select('id, name')
    const outletNames = new Set<string>((outletRows ?? []).map((o: any) => normalizeEntityName(o.name)))
    while (Date.now() < deadline0) {
      const more = await extractBatch(supabase, resolver, outletNames, cfg, report, runTag)
      if (!more) break
    }
    while (Date.now() < deadline0 - 20_000) {
      report.originatePoolEmpty = false
      report.originateExhausted = false
      await originateStep(supabase, cfg, report, deadline0, runTag)
      if (report.originatePoolEmpty || report.originateExhausted) break
    }
    while (Date.now() < deadline0) {
      const more = await attachStep(supabase, cfg, report, runTag)
      if (!more) break
    }
    const { count: scopedRemaining } = await supabase
      .from('articles')
      .select('id', { count: 'exact', head: true })
      .eq('ingestion_run_id', runTag)
      .is('arc_id', null)
      .is('arc_assign_attempted_at', null)
      .eq('is_digest', false)
    report.scopedRemainingUnassigned = scopedRemaining ?? 0
    return Response.json({ ok: true, ...report })
  }

  if (mode === 'actors' || mode === 'topics') {
    // Additive passes — never touch arcs/state.
    if (mode === 'actors') await actorsPass(supabase, report, deadline0)
    else await topicsPass(supabase, cfg, report, deadline0)
    return Response.json({ ok: true, mode, ...report })
  }

  if (reqUrl.searchParams.get('reset') === '1') {
    await wipeArcLayer(supabase)
    await saveState(supabase, { phase: 'extract' })
    report.reset = true
  }

  const state = await loadState(supabase)
  if (!state) {
    return Response.json({ ok: false, error: 'no backfill_state; call with ?reset=1 to wipe the arc layer and start a full reprocess' }, { status: 409 })
  }
  report.phaseStart = state.phase

  const deadline = Date.now() + BUDGET_MS
  if (state.phase === 'extract') {
    const resolver = new EntityResolver(cfg)
    await resolver.load(supabase)
    const { data: outletRows } = await supabase.from('outlets').select('id, name')
    const outletNames = new Set<string>((outletRows ?? []).map((o: any) => normalizeEntityName(o.name)))
    while (Date.now() < deadline) {
      const more = await extractBatch(supabase, resolver, outletNames, cfg, report)
      if (!more) {
        state.phase = 'originate'
        await saveState(supabase, state)
        break
      }
    }
  }
  if (state.phase === 'originate') {
    while (Date.now() < deadline) {
    report.originatePoolEmpty = false
    report.originateExhausted = false
    await originateStep(supabase, cfg, report, deadline)
    if (report.originatePoolEmpty || report.originateExhausted) {
        state.phase = 'attach'
        await saveState(supabase, state)
        break
      }
    }
  }
  if (state.phase === 'attach') {
    while (Date.now() < deadline) {
      const more = await attachStep(supabase, cfg, report)
      if (!more) {
        state.phase = 'done'
        await saveState(supabase, state)
        break
      }
    }
  }

  report.phaseEnd = state.phase
  const { count: remainingExtract } = await supabase.from('articles').select('id', { count: 'exact', head: true }).is('entities_extracted_at', null)
  const { count: remainingAssign } = await supabase.from('articles').select('id', { count: 'exact', head: true }).is('arc_id', null).is('arc_assign_attempted_at', null).eq('is_digest', false).not('entities_extracted_at', 'is', null)
  report.remainingExtract = remainingExtract ?? 0
  report.remainingAssign = remainingAssign ?? 0
  return Response.json({ ok: true, ...report })
})
