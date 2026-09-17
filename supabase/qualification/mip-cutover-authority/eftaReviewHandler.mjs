// Server-only adapter. Never bundle this module or database credentials into a browser.
// authenticate must use the deployed private gateway's verified user/assignment and
// broker workload binding; an Authorization header alone is not an assignment.
export function createEftaReviewHandler({authenticate,sql}) {
 if(typeof authenticate!=='function'||typeof sql!=='function') throw Error('efta_gateway_unconfigured');
 return async function handle(request) {
  if(request.method!=='GET') return new Response('Method not allowed',{status:405});
  try {
   const actor=await authenticate(request);
   if(!actor || actor.canReadEfta!==true || !actor.session || !actor.runtime)
    return new Response('Unavailable',{status:403});
   const receipt=crypto.randomUUID();
   // No candidate IDs, SQL, runtime, role or broker session comes from the request body.
   const payload=await sql('efta_private_read',[receipt,actor.session,actor.runtime]);
   if(payload?.contract!=='efta-private-review-v1'||payload.public_release!==false) throw Error('efta_bad_native_reply');
   return new Response(JSON.stringify(payload),{status:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  } catch {return new Response('Unavailable',{status:503,headers:{'Cache-Control':'no-store'}})}
 };
}
