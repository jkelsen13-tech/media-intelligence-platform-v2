// Server-only read adapter. Never bundle gateway authority or database credentials.
export function createEftaReviewHandler({authority,randomUUID=()=>crypto.randomUUID()}) {
 if(!authority||typeof authority.invoke!=='function') throw Error('efta_gateway_unconfigured');
 return async function handle(request) {
  if(request.method!=='GET') return new Response('Method not allowed',{status:405});
  try {
   const payload=await authority.invoke(request,'private_read',ctx=>[randomUUID(),ctx.session,ctx.runtime,ctx.assignment]);
   if(payload?.contract!=='efta-private-review-v2'||payload.public_release!==false) throw Error('efta_bad_native_reply');
   return new Response(JSON.stringify(payload),{status:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  } catch {return new Response('Unavailable',{status:403,headers:{'Cache-Control':'no-store'}})}
 };
}

