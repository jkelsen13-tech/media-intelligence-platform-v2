import {createHash} from 'node:crypto'
import {gzipSync,gunzipSync} from 'node:zlib'
const digest=b=>createHash('sha256').update(b).digest('hex')
const hash=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x)
const uuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)
const positive=x=>Number.isSafeInteger(x)&&x>0
const exact=(x,fields)=>Boolean(x)&&Object.getPrototypeOf(x)===Object.prototype&&Object.keys(x).sort().join('|')===[...fields].sort().join('|')
const list=x=>Array.isArray(x)&&x.length>0&&x.length<=32&&new Set(x).size===x.length&&x.every(v=>typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,127}$/.test(v))
const bounds=p=>{
 if(!p||!positive(p.policyVersion)||!positive(p.maxRaw)||!positive(p.maxEncoded)||!positive(p.maxPage)||!list(p.allowedLocations)||!list(p.allowedCodecs)||!list(p.allowedTiers))throw Error('codec_policy_unavailable')
 return Object.freeze({policyVersion:p.policyVersion,maxRaw:p.maxRaw,maxEncoded:p.maxEncoded,maxPage:p.maxPage,allowedLocations:Object.freeze([...p.allowedLocations]),allowedCodecs:Object.freeze([...p.allowedCodecs]),allowedTiers:Object.freeze([...p.allowedTiers])})
}
const logicalKey=x=>{if(typeof x!=='string'||x.length<1||x.length>256)throw Error('logical_key_invalid');return x}
export function encodeCanonical(bytes,codec='gzip-v1',policy){
 const limits=bounds(policy),raw=Buffer.from(bytes)
 if(!raw.length||raw.length>limits.maxRaw)throw Error('canonical_size')
 if(!limits.allowedCodecs.includes(codec)||!['identity-v1','gzip-v1'].includes(codec))throw Error('codec_unsupported')
 const encoded=codec==='identity-v1'?raw:gzipSync(raw)
 if(encoded.length>limits.maxEncoded)throw Error('encoded_size')
 return {raw,encoded,codec,hash:digest(raw),encoded_hash:digest(encoded)}
}
export function decodeCanonical(record){
 if(record?.state!=='canonical_encoded')throw Error('canonical_unavailable')
 const limits=bounds({policyVersion:record.policy_version,maxRaw:record.max_raw,maxEncoded:record.max_encoded,maxPage:record.max_page,allowedLocations:record.allowed_locations,allowedCodecs:record.allowed_codecs,allowedTiers:record.allowed_tiers})
 if(typeof record.encoded!=='string'||record.encoded.length>4*Math.ceil(limits.maxEncoded/3)||!hash(record.encoded_hash)||!hash(record.hash)||!positive(record.raw_size)||record.raw_size>limits.maxRaw)throw Error('encoded_envelope_invalid')
 const encoded=Buffer.from(record.encoded,'base64')
 if(encoded.toString('base64')!==record.encoded)throw Error('encoded_base64_invalid')
 if(!encoded.length||encoded.length>limits.maxEncoded||digest(encoded)!==record.encoded_hash)throw Error('encoded_hash_mismatch')
 let raw
 if(!limits.allowedCodecs.includes(record.codec))throw Error('codec_unsupported')
 if(record.codec==='identity-v1')raw=encoded
 else if(record.codec==='gzip-v1')raw=gunzipSync(encoded,{maxOutputLength:limits.maxRaw})
 else throw Error('codec_unsupported')
 if(raw.length!==record.raw_size||digest(raw)!==record.hash)throw Error('canonical_hash_mismatch')
 return raw
}
// Trusted codec service configuration only. The SQL principal cannot itself prove gzip semantics.
export function createCodecVerifier({call,policy}){
 if(typeof call!=='function')throw Error('codec_transport_required')
 const configured=bounds(policy)
 return Object.freeze({async admit(bytes,codec='gzip-v1'){
  const e=encodeCanonical(bytes,codec,configured)
  const decoded=decodeCanonical({state:'canonical_encoded',...e,encoded:e.encoded.toString('base64'),raw_size:e.raw.length,policy_version:configured.policyVersion,max_raw:configured.maxRaw,max_encoded:configured.maxEncoded,max_page:configured.maxPage,allowed_locations:configured.allowedLocations,allowed_codecs:configured.allowedCodecs,allowed_tiers:configured.allowedTiers})
  if(!decoded.equals(e.raw))throw Error('codec_roundtrip')
  const r=await call('admit',[e.raw,e.codec,e.encoded])
  if(!exact(r,['hash','raw_size','encoded_hash','codec','policy_version','codec_qualified'])||r.codec_qualified!==false||!positive(r.policy_version)||!positive(r.raw_size)||r.policy_version!==configured.policyVersion||r.hash!==e.hash||r.raw_size!==e.raw.length||r.encoded_hash!==e.encoded_hash||r.codec!==e.codec)throw Error('codec_receipt')
  return Object.freeze({...r})
 }})
}
const baseFields=['ref_id','hash','raw_size','provenance','tier','version','policy_version','location','max_raw','max_encoded','max_page','allowed_locations','allowed_codecs','allowed_tiers','production_qualified','publication_allowed','rights_qualified','codec_qualified']
function validateRead(r,level,configured){
 if(!r||r.policy_version!==configured.policyVersion||r.max_raw!==configured.maxRaw||r.max_encoded!==configured.maxEncoded||r.max_page!==configured.maxPage||JSON.stringify(r.allowed_locations)!==JSON.stringify(configured.allowedLocations)||JSON.stringify(r.allowed_codecs)!==JSON.stringify(configured.allowedCodecs)||JSON.stringify(r.allowed_tiers)!==JSON.stringify(configured.allowedTiers))throw Error('storage_policy_changed')
 const fields=[...baseFields]
 if(level==='index')fields.push('index','index_is_evidence')
 if(level==='canonical'){fields.push('state');if(r.state==='canonical_encoded')fields.push('codec','encoded_hash','encoded')}
 if(!exact(r,fields)||!uuid(r.ref_id)||!hash(r.hash)||!positive(r.raw_size)||r.raw_size>configured.maxRaw||!positive(r.version)||!configured.allowedTiers.includes(r.tier)||!configured.allowedLocations.includes(r.location)||['production_qualified','publication_allowed','rights_qualified','codec_qualified'].some(k=>r[k]!==false))throw Error('read_contract_invalid')
 if(!exact(r.provenance,['source_version','acquired_at','rights_ref','privacy_ref'])||Object.values(r.provenance).some(v=>typeof v!=='string'||!v.length||v.length>512)||!Number.isFinite(Date.parse(r.provenance.acquired_at)))throw Error('read_provenance_invalid')
 if(level==='index'&&r.index_is_evidence!==false)throw Error('read_contract_invalid')
 if(level==='canonical'&&!['rehydration_required','canonical_encoded'].includes(r.state))throw Error('read_contract_invalid')
 if(level==='canonical'&&((['cold','deep_archive'].includes(r.tier))!==(r.state==='rehydration_required')))throw Error('read_contract_invalid')
 return r
}
export function createStore({call,investigation,provenance,codecAuthority=null,policy}){
 if(typeof call!=='function'||!uuid(investigation))throw Error('transport_required')
 const configured=bounds(policy)
 const read=async(key,level)=>validateRead(await call('read',[investigation,logicalKey(key),level]),level,configured)
 return Object.freeze({
  metadata:key=>read(key,'metadata'),index:key=>read(key,'index'),
  async locate(field,needle,{after=null,limit=25}={}){
   if(!['summary','entities','claims','timeline','vector_refs'].includes(field)||typeof needle!=='string'||!needle.length||needle.length>128||!positive(limit)||limit>configured.maxPage)throw Error('locator_request_invalid')
   const queryHash=digest('['+[investigation,field,needle,limit].map(x=>JSON.stringify(x)).join(', ')+']')
   const cursorValid=c=>exact(c,['last_ref','query_hash','policy_version','index_epoch'])&&uuid(c.last_ref)&&c.query_hash===queryHash&&c.policy_version===configured.policyVersion&&Number.isSafeInteger(c.index_epoch)&&c.index_epoch>=0
   if(after!==null&&!cursorValid(after))throw Error('locator_cursor_invalid')
   const r=await call('locate',[investigation,field,needle,after,limit])
   if(!exact(r,['candidates','next_cursor','policy_version','query_hash','index_epoch','locator_only','factual_support_qualified','publication_allowed'])||r.policy_version!==configured.policyVersion||r.query_hash!==queryHash||!Number.isSafeInteger(r.index_epoch)||r.index_epoch<0||r.locator_only!==true||r.factual_support_qualified!==false||r.publication_allowed!==false||!Array.isArray(r.candidates)||r.candidates.length>limit)throw Error('locator_contract_invalid')
   let previous=after?.last_ref??''
   for(const c of r.candidates){
    if(!exact(c,['ref_id','canonical_hash','source_version'])||!uuid(c.ref_id)||c.ref_id<=previous||!hash(c.canonical_hash)||typeof c.source_version!=='string'||!c.source_version.length||c.source_version.length>512)throw Error('locator_candidate_invalid')
    previous=c.ref_id
   }
   if(after&&after.index_epoch!==r.index_epoch)throw Error('locator_cursor_invalid')
   if(r.next_cursor!==null&&(!cursorValid(r.next_cursor)||r.next_cursor.index_epoch!==r.index_epoch||r.candidates.length!==limit||r.next_cursor.last_ref!==previous))throw Error('locator_cursor_invalid')
   if(r.candidates.length===limit&&r.next_cursor===null)throw Error('locator_cursor_invalid')
   return r
  },
  async putOnce(key,value){
   logicalKey(key)
   const bytes=Buffer.from(JSON.stringify(value)),e=encodeCanonical(bytes,codecAuthority?'gzip-v1':'identity-v1',configured)
   let receipt
   if(codecAuthority){await codecAuthority.admit(bytes);receipt=await call('bind',[investigation,key,bytes,provenance])}
   else receipt=await call('put',[investigation,key,e.raw,e.codec,e.encoded,provenance])
   const retained=await read(key,'canonical'),actual=decodeCanonical(retained)
   if(!exact(receipt,['ref_id','hash','committed','production_qualified'])||!uuid(receipt.ref_id)||receipt.ref_id!==retained.ref_id||!actual.equals(bytes)||receipt.hash!==e.hash||receipt.committed!==true||receipt.production_qualified!==false)throw Error('readback_mismatch')
   return {committed:true}
  },
  async get(key){return JSON.parse(decodeCanonical(await read(key,'canonical')).toString('utf8'))},
  async factualEvidence(key){return decodeCanonical(await read(key,'canonical'))},
  async resolveCitation(citation){
   if(!exact(citation,['logical_key','ref_id','canonical_hash','source_version','start_byte','end_byte','span_hash'])||!Number.isSafeInteger(citation.start_byte)||!Number.isSafeInteger(citation.end_byte)||citation.start_byte<0||citation.end_byte<=citation.start_byte)throw Error('citation_invalid')
   const record=await read(citation.logical_key,'canonical')
   if(record.ref_id!==citation.ref_id||record.hash!==citation.canonical_hash||record.provenance.source_version!==citation.source_version)throw Error('citation_identity_mismatch')
   const raw=decodeCanonical(record)
   if(citation.end_byte>raw.length)throw Error('citation_span_bounds')
   const span=raw.subarray(citation.start_byte,citation.end_byte)
   if(digest(span)!==citation.span_hash)throw Error('citation_span_hash')
   return {bytes:span,canonical_hash:record.hash,ref_id:record.ref_id,source_version:citation.source_version,exact_canonical_span_verified:true,claim_truth_qualified:false,publication_allowed:false}
  },
  async requestRehydration(key,request,version){
   logicalKey(key)
   if(!uuid(request)||!positive(version))throw Error('rehydration_request_invalid')
   const r=await call('rehydrate',[investigation,key,request,version])
   if(!exact(r,['job_id','state'])||!uuid(r.job_id)||!['pending','completed'].includes(r.state))throw Error('rehydration_receipt_invalid')
   return r
  },
  async completeRehydration(key,job){
   logicalKey(key);if(!uuid(job))throw Error('rehydration_request_invalid')
   const r=await call('complete',[investigation,key,job])
   if(r!==null)throw Error('completion_receipt_invalid')
   return null
  },
  async transition(key,version,tier){
   logicalKey(key)
   if(!positive(version)||!configured.allowedTiers.includes(tier))throw Error('transition_request_invalid')
   const r=await call('transition',[investigation,key,version,tier])
   if(!positive(r)||r!==version+1)throw Error('transition_receipt_invalid')
   return r
  },
  async indexPut(key,hashValue,version,metadata){
   logicalKey(key)
   const r=await call('index_put',[investigation,key,hashValue,version,metadata])
   if(r!==null)throw Error('index_receipt_invalid')
   return null
  },
  async cleanup(){
   const r=await call('cleanup',[investigation])
   if(!Number.isSafeInteger(r)||r<0)throw Error('cleanup_receipt_invalid')
   return r
  }
 })
}
