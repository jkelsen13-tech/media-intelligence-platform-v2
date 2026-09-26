import {createHash} from 'node:crypto'

function asBuffer(bytes){
  if(Buffer.isBuffer(bytes))return bytes
  if(bytes instanceof Uint8Array)return Buffer.from(bytes)
  throw Error('capture_bytes_required')
}

export function sha256Hex(bytes){
  return createHash('sha256').update(asBuffer(bytes)).digest('hex')
}

// Capture identity is SHA-256 of retained payload bytes (pipeline uses
// convert_to(payload::text,'UTF8')). JSON.stringify is not a substitute.
export function assertCaptureHash({payloadBytes,contentHash}){
  if(typeof contentHash!=='string'||!/^[0-9a-f]{64}$/.test(contentHash))throw Error('capture_hash_invalid')
  const actual=sha256Hex(payloadBytes)
  if(actual!==contentHash)throw Error('capture_hash_mismatch')
  return actual
}

export async function bindExactCaptureBytes({call,investigation,logicalKey,payloadBytes,contentHash,provenance}){
  if(typeof call!=='function')throw Error('cas_transport_required')
  const raw=asBuffer(payloadBytes)
  assertCaptureHash({payloadBytes:raw,contentHash})
  if(typeof logicalKey!=='string'||!logicalKey.length||logicalKey.length>256)throw Error('logical_key_invalid')
  return call('put',[investigation,logicalKey,raw,'identity-v1',raw,provenance])
}
