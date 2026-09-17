// Authorization transport is supplied by the private host. No database RPC is exposed.
export function createEftaReviewClient({request}) {
 if(typeof request!=='function') throw Error('efta_reader_unconfigured');
 return Object.freeze({async read() {
  const response=await request({method:'GET',cache:'no-store'});
  if(!response?.ok) throw Error('efta_reader_unavailable');
  const payload=await response.json();
  if(payload?.contract!=='efta-private-review-v2'||payload.public_release!==false)
   throw Error('efta_reader_invalid_contract');
  return payload;
 }});
}

