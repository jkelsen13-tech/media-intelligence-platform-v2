// Live negative boundary check. No token, profile, operation or database write.
import assert from 'node:assert/strict'
const response = await fetch('https://qikvmopbtijoebdqosyq.supabase.co/functions/v1/spatial-runtime', {
  method:'POST', headers:{'content-type':'application/json'}, body:'{}',
  redirect:'error', signal:AbortSignal.timeout(15000),
})
assert.equal(response.status,401,'spatial writer must reject an unauthenticated request')
console.log('MIP_SPATIAL_ANONYMOUS_DENIAL_PASS='+JSON.stringify({status:response.status,credentialsSent:false,positiveWriteTested:false}))
