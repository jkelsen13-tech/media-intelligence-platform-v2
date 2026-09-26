// Pure predecessor-seam candidate extracted from the retained yhb ingest-rss v8
// source. This module has no database, network, environment, provider, or clock
// access. It is evidence for cutover comparison, not the canonical MIP algorithm.

const NAMED_ENTITIES = {
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

const TRUNCATED_ENTITY_PREFIXES = new Set([
  'lt', 'gt', 'am', 'amp', 'qu', 'quo', 'quot', 'ap', 'apo', 'apos',
  'nb', 'nbs', 'nbsp', 'hel', 'hell', 'helli', 'hellip',
  'mda', 'mdas', 'mdash', 'nda', 'ndas', 'ndash',
  'lsq', 'lsqu', 'lsquo', 'rsq', 'rsqu', 'rsquo',
  'ldq', 'ldqu', 'ldquo', 'rdq', 'rdqu', 'rdquo',
  'mid', 'midd', 'middo', 'middot', 'bul', 'bull',
  'cop', 'copy', 'reg', 'tra', 'trad', 'trade', 'deg',
])

export function decodeEntities(value) {
  let text = value
  for (let pass = 0; pass < 3; pass++) {
    const before = text
    text = text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]{0,9}|\s+[a-zA-Z]{2,9});/g, (match, group) => {
      if (group[0] === '#') {
        const number = group[1] === 'x' || group[1] === 'X' ? parseInt(group.slice(2), 16) : parseInt(group.slice(1), 10)
        if (Number.isFinite(number) && number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff)) {
          try { return String.fromCodePoint(number) } catch { return match }
        }
        return match
      }
      return NAMED_ENTITIES[group.trim()] ?? match
    })
    if (text === before) break
  }
  return text
}

export function sanitize(raw) {
  if (!raw) return { text: '', imageUrl: null, imageAlt: null }
  let text = String(raw).replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '')
  let imageUrl = null
  let imageAlt = null
  const image = text.match(/<img\b[^>]*>/i) ?? text.match(/<img\b[\s\S]*$/i)
  if (image) {
    const source = image[0].match(/src\s*=\s*"([^"]+)"/i) ?? image[0].match(/src\s*=\s*'([^']+)'/i)
    const alt = image[0].match(/alt\s*=\s*"([^"]*)"/i) ?? image[0].match(/alt\s*=\s*'([^']*)'/i)
    imageUrl = source ? source[1] : null
    imageAlt = alt ? alt[1] : null
  }
  text = text.replace(/<img\b[^>]*>?/gi, ' ')
  text = decodeEntities(text)
  text = text.replace(/<[^>]+>/g, ' ')
  text = text.replace(/<\/?[a-zA-Z][a-zA-Z0-9]*&[a-zA-Z]{0,9}(?![a-zA-Z0-9]*;)/g, ' ')
  text = text.replace(/<\/?[a-zA-Z!][^>]{0,400}$/, ' ')
  text = text.replace(/<\/?$/, ' ')
  text = text.replace(/&\s*[a-zA-Z#0-9]{1,10};/g, ' ')
  text = text.replace(/&?\s+apos\s*;/g, "'")
  text = text.replace(/&?\bapos\s*;/g, "'")
  text = text.replace(/&?\s+quot\s*;(?=\s|$)/g, '"')
  text = text.replace(/&?\bquot\s*;/g, '"')
  text = text.replace(/&?\s*\bnbsp\s*;/g, ' ')
  text = text.replace(/&?\bamp\s*;/g, '&')
  text = text.replace(/&?\blt\s*;/g, '<')
  text = text.replace(/&?\bgt\s*;/g, '>')
  text = text.replace(/&(#x?[0-9a-fA-F]{0,7}|[a-zA-Z]{2,9})([.,;:!?)\]]*)\s*$/, (match, group, punctuation, offset, source) => {
    if (group[0] !== '#' && !TRUNCATED_ENTITY_PREFIXES.has(group.toLowerCase())) return match
    const previous = source[offset - 1]
    return previous && punctuation.startsWith(previous) ? punctuation.slice(1) : punctuation
  })
  text = text.replace(/&(\s*[.,;:!?)\]]*)$/, '$1')
  text = text.replace(/\s+/g, ' ').trim()
  return { text, imageUrl, imageAlt }
}

function tag(block, name) {
  const openTag = '<' + name
  const start = block.indexOf(openTag)
  if (start < 0) return null
  const boundary = block[start + openTag.length]
  if (!['>', ' ', '\t', '\n', '/'].includes(boundary)) return null
  const openingEnd = block.indexOf('>', start)
  const closing = block.indexOf('</' + name + '>', openingEnd)
  if (openingEnd < 0 || closing < 0) return null
  return block.slice(openingEnd + 1, closing)
}

function parseDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function absoluteUrl(base, href) {
  try { return new URL(href, base).toString() } catch { return href }
}

export function parseFeed(xml, feedUrl) {
  const items = []
  for (const match of xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/gi)) {
    const block = match[1]
    const title = sanitize(tag(block, 'title'))
    const link = sanitize(tag(block, 'link') ?? tag(block, 'guid')).text
    if (!title.text || !link) continue
    const description = sanitize(tag(block, 'description'))
    items.push({
      title: title.text,
      url: absoluteUrl(feedUrl, link),
      summary: description.text.slice(0, 2000) || null,
      published_at: parseDate(sanitize(tag(block, 'pubDate') ?? tag(block, 'dc:date')).text),
      byline: sanitize(tag(block, 'dc:creator') ?? tag(block, 'author')).text || null,
      image_url: description.imageUrl ?? title.imageUrl,
      image_alt: description.imageAlt ?? title.imageAlt,
    })
  }
  for (const match of xml.matchAll(/<entry[\s>]([\s\S]*?)<\/entry>/gi)) {
    const block = match[1]
    const title = sanitize(tag(block, 'title'))
    const link = block.match(/<link[^>]*href=["']([^"']+)["']/i)
    if (!title.text || !link) continue
    const author = block.match(/<author[\s>]([\s\S]*?)<\/author>/i)
    const description = sanitize(tag(block, 'summary') ?? tag(block, 'content'))
    items.push({
      title: title.text,
      url: absoluteUrl(feedUrl, link[1]),
      summary: description.text.slice(0, 2000) || null,
      published_at: parseDate(sanitize(tag(block, 'published') ?? tag(block, 'updated')).text),
      byline: author ? sanitize(tag(author[1], 'name')).text || null : null,
      image_url: description.imageUrl ?? title.imageUrl,
      image_alt: description.imageAlt ?? title.imageAlt,
    })
  }
  return items
}

const CITATION_PATTERNS = [
  { type: 'court_doc', re: /(court documents?|court filing|court records?|indictment|affidavit|criminal complaint|lawsuit)([^.]{0,80})/i },
  { type: 'agency_release', re: /(press release|official statement|statement from the [A-Z][^.]{0,60}|agency (said|confirmed|reported)[^.]{0,60})/i },
  { type: 'named_official', re: /([A-Z][a-zA-Z'’-]+ [A-Z][a-zA-Z'’-]+ (?:said|told|announced|confirmed|stated)[^.]{0,60})/ },
  { type: 'anonymous_official', re: /((?:officials?|sources?)(?: familiar with| close to| briefed on)?[^.]{0,40}said|unnamed official[^.]{0,60}|anonymous official[^.]{0,60})/i },
  { type: 'study', re: /((?:study|report|poll|research|analysis)[^.]{0,40}(?:found|shows|published|concluded)[^.]{0,60})/i },
  { type: 'prior_reporting', re: /(previously reported[^.]{0,60}|according to (?:the )?(?:New York Times|BBC|CNN|Fox News|Al Jazeera|Reuters|AP)[^.]{0,60})/i },
]

export function extractCitations(text, weights) {
  const found = []
  const seen = new Set()
  for (const { type, re } of CITATION_PATTERNS) {
    const match = text.match(re)
    if (match && !seen.has(type)) {
      seen.add(type)
      found.push({ cited_entity: (match[1] ?? match[0]).trim().slice(0, 160), cited_type: type,
        documentation_strength: weights[type] ?? 0.2 })
    }
  }
  return found
}

const FRAMING_MARKERS = /\b(critics say|supporters say|some say|many believe|could|may|might|appears|seems|allegedly|reportedly|so-called|claims? to)\b/i

export function extractClaims(text) {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(sentence => sentence.length > 40 && sentence.length < 400)
  return sentences.slice(0, 6).map(sentence => ({ text: sentence.trim(), kind: FRAMING_MARKERS.test(sentence) ? 'framing' : 'substantive' }))
}

const MONTHS_DAYS = new Set(['january','february','march','april','may','june','july','august','september','october','november','december','monday','tuesday','wednesday','thursday','friday','saturday','sunday'])
const STOP_SINGLE = new Set([...MONTHS_DAYS,'the','a','an','in','on','at','as','it','he','she','but','and','or','if','by','to','from','with','after','before','this','that','these','those','there','here','what','how','why','when','where','who','will','would','could','should','is','are','was','were','has','have','had','not','no','yes','now','new','more','most','all','one','two','first','last','latest','breaking','watch','video','live','opinion','analysis','explainer','quiz','podcast','newsletter','according','report','reports','source','sources','official','officials','government','police','ministry','department','court','senate','parliament','congress','army','navy','spokesperson','headlines','digest','briefing','roundup','bulletin','updates','uk','us','eu','un','mp','mps','pm'])
const ROLE_TITLES_RE = /^(?:President|Prime Minister|Vice President|Deputy Prime Minister|Minister|Foreign Minister|Defence Minister|Senator|Governor|Mayor|Secretary(?: of State)?|Chancellor(?: of the Exchequer)?|Attorney General|MP|Mr|Ms|Mrs|Miss|Dr|Sir|Dame|Judge|Justice|Chief|General|Admiral|Captain|Colonel|Spokesperson|Officer|Professor|Father|Rabbi|Pope|King|Queen|Prince|Princess)\s+/i
const PROPER_RE = /\b((?:(?:[A-Z]\.){2,}|[A-Z][\w'’\-]*)(?:(?:\s+(?:of|the|de|del|van|von|der|al|bin|and|&|for)\s+|\s+)(?:(?:[A-Z]\.){2,}|[A-Z][\w'’\-]*))*)/g

export function normalizeEntityName(value) {
  return value.toLowerCase().replace(/[''’]s\b/g, '').replace(/\bs’$/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function extractEntityCandidates(text, outletNames) {
  const candidates = new Map()
  for (const match of text.matchAll(PROPER_RE)) {
    let surface = match[1].trim().replace(/[\s.,;:]+$/, '').replace(/^[\s.,;:]+/, '')
    if (surface.length < 2) continue
    let role = null
    for (let count = 0; count < 3; count++) {
      const roleMatch = surface.match(ROLE_TITLES_RE)
      if (!roleMatch) break
      role = role ? `${role} ${roleMatch[0].trim()}` : roleMatch[0].trim()
      surface = surface.slice(roleMatch[0].length).trim()
    }
    if (surface.length < 2 || surface.includes('. ') || surface.split(/\s+/).length > 6) continue
    const words = surface.split(/\s+/)
    const normalized = normalizeEntityName(surface)
    if (!normalized) continue
    if (words.length === 1) {
      const acronym = /^[A-Z0-9&]{2,6}$/.test(surface)
      const escaped = surface.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const occurrences = (text.match(new RegExp(`\\b${escaped}\\b`, 'g')) ?? []).length
      if (STOP_SINGLE.has(normalized) || (!acronym && occurrences < 2)) continue
    } else if (STOP_SINGLE.has(normalized.split(' ')[0]) || words.every(word => STOP_SINGLE.has(word.toLowerCase()))) continue
    if (outletNames.has(normalized)) continue
    const current = candidates.get(normalized)
    if (current) {
      current.mentions++
      if (!current.role && role) current.role = role
      if (surface.length > current.surface.length) current.surface = surface
    } else candidates.set(normalized, { surface, role, mentions: 1 })
  }
  return [...candidates.values()]
}

export function guessEntityType(name) {
  if (/\b(ministry|department|agency|police|court|senate|congress|parliament|government|army|navy|air force|commission|authority|council|committee|office|bureau|service|garda|gardaí|psni|nato|fbi|cia|federal reserve|met office|white house|downing street|pentagon|treasury|home office)\b/i.test(name)) return 'institution'
  if (/\b(inc|ltd|corp|corporation|company|group|holdings|airlines?|airways|bank|university|college|hospital|school|club|fc|party|union|association|institute|foundation|charity|trust|media|news|broadcasting)\b/i.test(name)) return 'organization'
  const words = name.split(/\s+/)
  if (words.length === 2 && words.every(word => /^[A-Z][a-zA-Z'’.\-]+$/.test(word) && !/^[A-Z]{2,}$/.test(word))) return 'person'
  return 'other'
}
