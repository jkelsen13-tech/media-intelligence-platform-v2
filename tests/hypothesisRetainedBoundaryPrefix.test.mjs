import test from 'node:test'
import assert from 'node:assert/strict'
import {verifyRetainedBoundaryPrefix} from '../supabase/qualification/hypothesis-assessments/retainedBoundaryPrefix.mjs'
const id=n=>String(n).repeat(8)+'-'+String(n).repeat(4)+'-'+String(n).repeat(4)+'-'+String(n).repeat(4)+'-'+String(n).repeat(12)
const registration={version:2,sequence:1,previous:'',source:id(1),stream:id(2),bindingId:id(3),incarnationId:id(4),recoveryEvidence:'a'.repeat(64),contractDigest:'b'.repeat(64)}
test('retained prefix rejects absent duplicate oversized and inconsistent terminal identities before journal access',async()=>{
 let reads=0
 const options={registration,observationEpoch:id(5),revisionRelation:'41',markerRelation:'42',captureIds:[id(6)],terminalCapture:id(6),targetMarker:id(7),journal:{get:async()=>{reads++;return null}}}
 for(const extra of [{captureIds:[]},{captureIds:[id(6),id(6)]},{captureIds:Array(257).fill(id(6))},{terminalCapture:id(8)},{targetMarker:'invalid'}]){
  await assert.rejects(()=>verifyRetainedBoundaryPrefix({...options,...extra}))
 }
 assert.equal(reads,0)
 await assert.rejects(()=>verifyRetainedBoundaryPrefix(options))
 assert.equal(reads,1)
})
