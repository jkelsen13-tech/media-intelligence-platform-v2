import { createHash } from 'node:crypto'

// Binds the values actually consumed by the scorer. This is an input digest,
// not an immutable capture, queue generation, release decision or authenticity proof.
export const MEMBERSHIP_FINGERPRINT_CONTRACT = 'mip-membership-input-v2'
function canonicalJson(value, seen = new Set(), depth = 0) {
  if (depth > 64) throw new Error('membership input nesting exceeds bound')
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) throw new Error('membership input has an unsafe number')
    return Object.is(value, -0) ? '-0' : JSON.stringify(value)
  }
  if (typeof value !== 'object' || seen.has(value)) throw new Error('membership input must be acyclic JSON')
  if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('membership input must be plain JSON')
  seen.add(value)
  let result
  if (Array.isArray(value)) {
    const parts=[]
    for(let i=0;i<value.length;i++){
      if(!Object.hasOwn(value,i)) throw new Error('membership input has a sparse array')
      parts.push(canonicalJson(value[i],seen,depth+1))
    }
    result='['+parts.join(',')+']'
  } else {
    result='{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonicalJson(value[key],seen,depth+1)).join(',')+'}'
  }
  seen.delete(value)
  return result
}
export function membershipInputFingerprint(input, releaseGate) {
  if(!input?.event || typeof input.event.id!=='string' || !input.event.id || !Array.isArray(input.members)) throw new Error('membership input identity required')
  const members=input.members.map(member=>member?.article ?? member)
  const ids=members.map(member=>member?.id)
  if(ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length) throw new Error('unique membership input identities required')
  const inputHash=createHash('sha256').update(canonicalJson({event:input.event,members,release_gate:releaseGate}),'utf8').digest('hex')
  // Never copy additional article bodies, summaries, embeddings or arbitrary fields into the
  // persisted fingerprint or its dry-run response. Keep existing identity/title/URL
  // metadata for compatibility; exact scorer array order is bound in the digest.
  const legacyMembers=members.map(article=>({id:article.id,published_at:article.published_at??null,title:article.title??null,url:article.url??null}))
    .sort((a,b)=>String(a.id).localeCompare(String(b.id)))
  return JSON.stringify({event_id:input.event.id,members:legacyMembers,contract:MEMBERSHIP_FINGERPRINT_CONTRACT,input_sha256:inputHash})
}
