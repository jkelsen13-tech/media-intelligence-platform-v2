// Trusted-host command adapter. It is intentionally not an HTTP/browser handler.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const requiredUuid=(x,nullable=false)=>{if(nullable&&x==null)return null;if(typeof x!=='string'||!UUID.test(x))throw Error('efta_reviewer_command_denied');return x};

export function createEftaReviewerCommand({authority}){
 if(!authority||typeof authority.invoke!=='function') throw Error('efta_reviewer_gateway_unconfigured');
 return Object.freeze({
  resolveIdentity(request,input){
   const x=structuredClone(input??{});
   return authority.invoke(request,'resolve_identity',ctx=>[
    requiredUuid(x.request_id),String(x.origin??''),requiredUuid(x.institution_revision),
    requiredUuid(x.predecessor,true),String(x.state??''),String(x.reason??''),
    ctx.session,ctx.runtime,ctx.assignment
   ]);
  },
  decide(request,input){
   const x=structuredClone(input??{});
   return authority.invoke(request,'decide',ctx=>[
    requiredUuid(x.request_id),requiredUuid(x.candidate_id),String(x.action??''),
    requiredUuid(x.predecessor,true),x.review,ctx.session,ctx.runtime,ctx.assignment
   ]);
  }
 });
}

