import {createHash} from 'node:crypto'
export const QUALIFICATION = Object.freeze({production_qualified:false,source_authority_qualified:false,transport_qualified:false,publication_allowed:false})
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)
const hash=x=>createHash('sha256').update(x).digest('hex')
const fail=()=>{throw new Error('mention_contract_denied')}
function keys(o,names){if(!o||typeof o!=='object'||Array.isArray(o)||Object.keys(o).sort().join('|')!==names.split('|').sort().join('|'))fail()}
function scalar(s){if(typeof s!=='string'||s.includes('\u0000')||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(s))fail()}
function ref(r){if(r===null)return;keys(r,'kind|id');if(!['unresolved','mention'].includes(r.kind)||(r.kind==='unresolved'?r.id!==null:!uuid(r.id)))fail()}
// Caller-supplied field envelopes do not establish authority. The future bridge
// must obtain this exact field from current-authorized immutable source storage.
// Reference: ../content-addressed-storage/exactCitation.mjs (assessment-specific;
// not reused as a generic production authority or by coercing mention IDs).
export function validateExactMention(m,field,{maxFieldBytes=1048576}={}){
 keys(m,'scope|id|field_id|source_version|field_version|field_hash|offset_unit|start|end|literal|speaker|addressee')
 keys(field,'scope|id|source_version|field_version|field_hash|base64|production_qualified|source_authority_qualified|transport_qualified|publication_allowed')
 if(!Number.isSafeInteger(maxFieldBytes)||maxFieldBytes<1||maxFieldBytes>2097152)fail()
 for(const k of Object.keys(QUALIFICATION))if(field[k]!==false)fail()
 if(!uuid(m.scope)||!uuid(m.id)||!uuid(m.field_id)||field.scope!==m.scope||field.id!==m.field_id)fail()
 for(const k of ['source_version','field_version'])if(typeof m[k]!=='string'||!m[k].length||m[k].length>256||m[k]!==field[k])fail()
 if(!/^[0-9a-f]{64}$/.test(m.field_hash)||m.field_hash!==field.field_hash||m.offset_unit!=='unicode_code_point')fail()
 if(typeof field.base64!=='string'||field.base64.length>Math.ceil(maxFieldBytes/3)*4)fail()
 const bytes=Buffer.from(field.base64,'base64')
 if(bytes.toString('base64')!==field.base64||bytes.length>maxFieldBytes||hash(bytes)!==m.field_hash)fail()
 const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes)
 scalar(text);scalar(m.literal);ref(m.speaker);ref(m.addressee)
 const points=Array.from(text)
 if(!Number.isSafeInteger(m.start)||!Number.isSafeInteger(m.end)||m.start<0||m.end<=m.start||m.end>points.length||points.slice(m.start,m.end).join('')!==m.literal)fail()
 return Object.freeze({mention_id:m.id,scope:m.scope,span_hash:hash(Buffer.from(m.literal,'utf8')),exact_bytes_verified:true,...QUALIFICATION})
}
export function validateCandidate(c){
 keys(c,'scope|id|mention_id|actor_id|version|predecessor_id|rank|supporting_mentions|conflicting_mentions|method')
 if(![c.scope,c.id,c.mention_id,c.actor_id].every(uuid)||!Number.isSafeInteger(c.version)||c.version<1||
 (c.version===1?c.predecessor_id!==null:!uuid(c.predecessor_id))||!Number.isSafeInteger(c.rank)||c.rank<1||c.rank>1000000||
 typeof c.method!=='string'||!c.method.trim()||c.method.length>256)fail()
 for(const k of ['supporting_mentions','conflicting_mentions'])if(!Array.isArray(c[k])||c[k].length>64||!c[k].every(uuid)||new Set(c[k]).size!==c[k].length)fail()
 if(c.supporting_mentions.some(id=>c.conflicting_mentions.includes(id)))fail()
 return {...QUALIFICATION,identity_accepted:false}
}
export function validateDecision(d){
 keys(d,'scope|id|mention_id|version|predecessor_id|status|candidate_id|reason')
 if(![d.scope,d.id,d.mention_id].every(uuid)||!Number.isSafeInteger(d.version)||d.version<1||
 (d.version===1?d.predecessor_id!==null:!uuid(d.predecessor_id))||
 !['unresolved','rejected','accepted'].includes(d.status)||
 (d.status==='accepted'?!uuid(d.candidate_id):d.candidate_id!==null)||
 typeof d.reason!=='string'||!d.reason.trim()||d.reason.length>4096)fail()
 return QUALIFICATION
}
