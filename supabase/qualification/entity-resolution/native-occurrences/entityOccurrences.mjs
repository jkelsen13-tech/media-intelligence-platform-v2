// Successor occurrence producer for the existing YHB v8 heuristic.
// The unchanged predecessor remains the aggregation oracle. No DB/network/model,
// actor resolution, source authorization or publication is performed here.
import {createHash} from 'node:crypto'
import {Buffer} from 'node:buffer'
import {normalizeEntityName} from '../../../functions/collector-algorithm-shadow-candidate/predecessorV8.js'
import {QUALIFICATION} from '../mentionContract.mjs'

export const EXTRACTOR_VERSION='yhb-v8-entity-occurrences-native-v1'
export const PREDECESSOR_BLOB='6dc53dfc776d686a53bdf2d7de7c6a0374ea1ced'
export const LIMITS=Object.freeze({fieldBytes:262144,regexMatches:4096,occurrences:256,outletNames:4096,outletNameBytes:512})
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)
const digest=x=>createHash('sha256').update(x).digest('hex')
const deny=()=>{throw Error('native_entity_occurrence_denied')}
function scalar(text){
 if(typeof text!=='string'||text.includes('\u0000')||
 /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(text))deny()
}
function outlets(value){
 if(!(value instanceof Set)||value.size>LIMITS.outletNames)deny()
 for(const name of value){
  scalar(name)
  if(Buffer.byteLength(name,'utf8')>LIMITS.outletNameBytes||normalizeEntityName(name)!==name)deny()
 }
}
// These matcher/stoplist definitions are retained verbatim from PREDECESSOR_BLOB.
// Do not silently improve them: changes require a new extractor version and
// explicit reconciliation with immutable physical occurrence identities.
const MONTHS_DAYS = new Set(['january','february','march','april','may','june','july','august','september','october','november','december','monday','tuesday','wednesday','thursday','friday','saturday','sunday'])
const STOP_SINGLE = new Set([...MONTHS_DAYS,'the','a','an','in','on','at','as','it','he','she','but','and','or','if','by','to','from','with','after','before','this','that','these','those','there','here','what','how','why','when','where','who','will','would','could','should','is','are','was','were','has','have','had','not','no','yes','now','new','more','most','all','one','two','first','last','latest','breaking','watch','video','live','opinion','analysis','explainer','quiz','podcast','newsletter','according','report','reports','source','sources','official','officials','government','police','ministry','department','court','senate','parliament','congress','army','navy','spokesperson','headlines','digest','briefing','roundup','bulletin','updates','uk','us','eu','un','mp','mps','pm'])
const ROLE_TITLES_RE = /^(?:President|Prime Minister|Vice President|Deputy Prime Minister|Minister|Foreign Minister|Defence Minister|Senator|Governor|Mayor|Secretary(?: of State)?|Chancellor(?: of the Exchequer)?|Attorney General|MP|Mr|Ms|Mrs|Miss|Dr|Sir|Dame|Judge|Justice|Chief|General|Admiral|Captain|Colonel|Spokesperson|Officer|Professor|Father|Rabbi|Pope|King|Queen|Prince|Princess)\s+/i
const PROPER_RE = /\b((?:(?:[A-Z]\.){2,}|[A-Z][\w'’\-]*)(?:(?:\s+(?:of|the|de|del|van|von|der|al|bin|and|&|for)\s+|\s+)(?:(?:[A-Z]\.){2,}|[A-Z][\w'’\-]*))*)/g


// Same loop and filtering as extractEntityCandidates, before its normalized-name
// Map aggregation. All offsets are advanced within the original regex match.
// No global indexOf/search of aggregated, normalized or longest surface names.
export function extractEntityOccurrences(text,outletNames){
 scalar(text);outlets(outletNames)
 if(Buffer.byteLength(text,'utf8')>LIMITS.fieldBytes)deny()
 const result=[],singleCounts=new Map()
 let scanned=0
 for(const match of text.matchAll(PROPER_RE)){
  if(++scanned>LIMITS.regexMatches)deny()
  let surface=match[1],startUTF16=match.index
  startUTF16+=surface.length-surface.trimStart().length
  surface=surface.trim().replace(/[\s.,;:]+$/,'')
  const leading=surface.match(/^[\s.,;:]+/)
  if(leading){startUTF16+=leading[0].length;surface=surface.slice(leading[0].length)}
  if(surface.length<2)continue
  let role=null
  for(let count=0;count<3;count++){
   const roleMatch=surface.match(ROLE_TITLES_RE)
   if(!roleMatch)break
   role=role?role+' '+roleMatch[0].trim():roleMatch[0].trim()
   startUTF16+=roleMatch[0].length
   surface=surface.slice(roleMatch[0].length)
   startUTF16+=surface.length-surface.trimStart().length
   surface=surface.trim()
  }
  if(surface.length<2||surface.includes('. ')||surface.split(/\s+/).length>6)continue
  const words=surface.split(/\s+/)
  const normalized=normalizeEntityName(surface)
  if(!normalized)continue
  if(words.length===1){
   const acronym=/^[A-Z0-9&]{2,6}$/.test(surface)
   const escaped=surface.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
   let occurrences=singleCounts.get(surface)
   if(occurrences===undefined){
    occurrences=(text.match(new RegExp('\\b'+escaped+'\\b','g'))??[]).length
    singleCounts.set(surface,occurrences)
   }
   if(STOP_SINGLE.has(normalized)||(!acronym&&occurrences<2))continue
  }else if(STOP_SINGLE.has(normalized.split(' ')[0])||words.every(word=>STOP_SINGLE.has(word.toLowerCase())))continue
  if(outletNames.has(normalized))continue
  const endUTF16=startUTF16+surface.length
  if(text.slice(startUTF16,endUTF16)!==surface)deny()
  const start=Array.from(text.slice(0,startUTF16)).length
  const end=start+Array.from(surface).length
  if(result.length>=LIMITS.occurrences)deny()
  result.push(Object.freeze({literal:surface,role_prefix:role,offset_unit:'unicode_code_point',start,end}))
 }
 return Object.freeze(result)
}
const FIELD_KEYS=['scope','id','source_version','field_version','field_hash','raw','native_capture_id',
 'native_job_id','native_article_id','native_content_hash','native_source_field','native_byte_length'].sort().join('|')
function exactNativeField(field,fieldBytes){
 if(!field||typeof field!=='object'||Array.isArray(field)||Object.keys(field).sort().join('|')!==FIELD_KEYS||field.raw!==null)deny()
 for(const name of ['scope','id','native_capture_id','native_job_id','native_article_id'])if(!uuid(field[name]))deny()
 for(const name of ['field_hash','native_content_hash'])if(typeof field[name]!=='string'||!/^[0-9a-f]{64}$/.test(field[name]))deny()
 if(!['title','summary','body_text'].includes(field.native_source_field)||
 !Number.isSafeInteger(field.native_byte_length)||field.native_byte_length<0||field.native_byte_length>LIMITS.fieldBytes||
 field.source_version!=='native-capture:'+field.native_capture_id+':'+field.native_content_hash||
 field.field_version!=='native-field:utf8:v1:'+field.native_source_field+':'+field.field_hash)deny()
 if(!(fieldBytes instanceof Uint8Array)||fieldBytes.byteLength!==field.native_byte_length)deny()
 // Transient snapshot; no buffer/base64/full field is retained in the result.
 const bytes=Buffer.from(fieldBytes)
 if(digest(bytes)!==field.field_hash)deny()
 let text
 try{text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes)}catch{deny()}
 scalar(text)
 if(!Buffer.from(text,'utf8').equals(bytes))deny()
 return text
}
function occurrenceId(field,occurrence){
 // Domain-separated SHA256 over the exact physical binding; first 128 bits
 // formatted as a version-8 UUID. This is a locator, never actor identity or
 // authorization. Fixed array order is part of this extractor-version contract.
 const name=JSON.stringify(['mip-native-entity-occurrence-v1',EXTRACTOR_VERSION,
  field.scope,field.id,field.native_capture_id,field.native_job_id,field.native_article_id,
  field.native_content_hash,field.native_source_field,field.source_version,field.field_version,
  field.field_hash,occurrence.offset_unit,occurrence.start,occurrence.end,occurrence.literal])
 const bytes=createHash('sha256').update(name,'utf8').digest().subarray(0,16)
 bytes[6]=(bytes[6]&15)|128;bytes[8]=(bytes[8]&63)|128
 const h=bytes.toString('hex')
 return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20)
}
export function buildNativeEntityOccurrencePlan({field,fieldBytes,outletNames,configurationVersion,expectedPlanDigest}={}){
 if(typeof configurationVersion!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(configurationVersion))deny()
 outlets(outletNames)
 if(expectedPlanDigest!==undefined&&(typeof expectedPlanDigest!=='string'||!/^[0-9a-f]{64}$/.test(expectedPlanDigest)))deny()
 // The full filter list remains transient. Its version and canonical digest
 // distinguish input configurations without retaining another outlet inventory.
 const configurationDigest=digest(JSON.stringify(['native-entity-configuration-v1',configurationVersion,[...outletNames].sort()]))
 const text=exactNativeField(field,fieldBytes)
 const occurrences=extractEntityOccurrences(text,outletNames).map(occurrence=>Object.freeze({
  // A prefix such as President is an extraction annotation only. It is not
  // copied into speaker/addressee, actor identity or an accepted agency claim.
  role_prefix:occurrence.role_prefix,
  mention:Object.freeze({scope:field.scope,id:occurrenceId(field,occurrence),field_id:field.id,
   source_version:field.source_version,field_version:field.field_version,field_hash:field.field_hash,
   offset_unit:occurrence.offset_unit,start:occurrence.start,end:occurrence.end,literal:occurrence.literal,
   speaker:null,addressee:null})
 }))
 const inputDigest=digest(JSON.stringify(['native-entity-input-v1',EXTRACTOR_VERSION,configurationDigest,
  field.scope,field.id,field.native_capture_id,field.native_job_id,field.native_article_id,
  field.native_content_hash,field.native_source_field,field.source_version,field.field_version,
  field.field_hash,field.native_byte_length]))
 const resultDigest=digest(JSON.stringify(['native-entity-result-v1',occurrences.map(o=>[
  o.mention.id,o.mention.start,o.mention.end,o.mention.literal,o.role_prefix,o.mention.speaker,o.mention.addressee])]))
 const planDigest=digest(JSON.stringify(['native-entity-plan-v1',inputDigest,resultDigest]))
 // The caller supplies the originally retained digest when retrying. A changed
 // configuration/result is a different plan, never an acknowledged replay.
 if(expectedPlanDigest!==undefined&&expectedPlanDigest!==planDigest)deny()
 return Object.freeze({scope:field.scope,field_id:field.id,capture_id:field.native_capture_id,
  job_id:field.native_job_id,article_id:field.native_article_id,content_hash:field.native_content_hash,
  source_field:field.native_source_field,source_version:field.source_version,field_version:field.field_version,
  field_hash:field.field_hash,extractor_version:EXTRACTOR_VERSION,
  configuration_version:configurationVersion,configuration_digest:configurationDigest,
  input_digest:inputDigest,result_digest:resultDigest,plan_digest:planDigest,
  occurrences:Object.freeze(occurrences),...QUALIFICATION})
}
