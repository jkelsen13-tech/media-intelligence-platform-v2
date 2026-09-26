// One-shot broker connection adapter for hosted-synthetic Route B.
// Not a permanent issuer, controller, queue, or backend.
// Disposable keys only. Does not read project JWT secrets or mint HS256
// against live qik. mip_identity.issue returns a session UUID only.
import {issueWorkloadSession} from '../mip-cutover-authority/brokerSession.js'

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BROKER_ROLE='mip_identity_broker_v2'

// sql adapter required by existing issueWorkloadSession: (name, args[]) => result
export function createBrokerSqlAdapter({withRoleQuery}){
 if(typeof withRoleQuery!=='function')throw Error('hosted_synthetic_broker_adapter')
 return async(name,args)=>{
  if(name!=='configuration'&&name!=='issue')throw Error('hosted_synthetic_broker_rpc_denied')
  if(name==='configuration'){
   const rows=await withRoleQuery(BROKER_ROLE,
    'select mip_identity.configuration($1,$2) result',args)
   return rows[0].result
  }
  const rows=await withRoleQuery(BROKER_ROLE,
   'select mip_identity.issue($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) result',args)
  const sid=String(rows[0].result??'')
  if(!UUID.test(sid))throw Error('hosted_synthetic_issue_not_uuid')
  return sid
 }
}

export function pgliteBrokerAdapter(db){
 return createBrokerSqlAdapter({
  async withRoleQuery(role,sql,params){
   await db.exec('set role '+role)
   try{return(await db.query(sql,params)).rows}
   finally{await db.exec('reset role')}
  }
 })
}

export function assertIssueReturnsUuid(value){
 const sid=String(value??'')
 if(!UUID.test(sid))throw Error('hosted_synthetic_issue_not_uuid')
 return sid
}

export function assertRouteAShape(workerJwt){
 if(typeof workerJwt!=='string')throw Error('hosted_synthetic_worker_jwt_role')
 const parts=workerJwt.split('.')
 if(parts.length!==3)throw Error('hosted_synthetic_worker_jwt_role')
 const claims=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'))
 if(claims.role!=='mip_comparison_worker_v1')throw Error('hosted_synthetic_worker_jwt_role')
 return claims
}

export async function issueWorkloadSessionViaAdapter({sql,token,runtime,principal,request,now}){
 const session=await issueWorkloadSession({sql,token,runtime,principal,request,now})
 return assertIssueReturnsUuid(session)
}
