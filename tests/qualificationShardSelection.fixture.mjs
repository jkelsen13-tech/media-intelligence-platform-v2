// Synthetic selection geometry only; no original worker assertion is replaced.
import test from 'node:test'
export const workerRoot="isolated hypothesis generation authority, retained computation and restart package"
export const commitRoot="synthetic commit recorder uses existing encrypted remote journal and actual isolated process restart"
export const directNames=Object.freeze([
 "consistent exported snapshot bootstrap isolation",
 "actual pgoutput metadata-to-durable-recorder isolation",
 "source-captured contiguous metadata coverage isolation",
 "native marker boundary proof without source activation",
 "configured synthetic client-handler-store-worker-review path uses native gateway transactions",
 "atomic real retained-input capture; no caller source body or input hash accepted",
 "separate worker table/function ownership, FORCE RLS and no escalation",
 "closed CC source scope and missing permission never enter generation",
 "wrong audience/subject/runtime, expired identity and cross-runtime session denied",
 "revoked mapping and stale replacement cannot reuse a retained generation",
 "source and evaluated-implementation revocation during processing strand work",
 "revoked reviewer membership denies completion and retains processing",
 "revoked method denies completion and cannot be reactivated under old revision",
 "ineligible and out-of-runtime work cannot obstruct eligible investigation",
 "rotating investigation selection advances an eligible later investigation",
 "database independently rejects output source, method, rating, review and argument escalation",
 "permission acceptance first: output/revision/ack/receipt commit, revocation waits",
 "permission revocation first: output/revision/ack/receipt all reject",
 "source correction during processing rejects stale retained generation",
 "exact completion retry requires current authority and identical output",
 "worker method mismatch is explicitly failed without invented assessment",
 "expired lease does not requeue, force-cancel or accept completion",
 "real container computes over retained spans with no broad credentials or network",
 "actual termination/restart before_complete_commit recovers exact durable completion",
 "actual termination/restart after_complete_commit recovers exact durable completion",
 "actual lost claim response preserves stranded work; fresh process cannot invent lease",
 "encrypted remote exact-content journal, scoped runtime, no plaintext and protocol separation",
 "generated reassessment resolves exact human causes atomically and stays unreviewed/private",
 "unselected retained input permissions still protect generated history and create causes",
 "private operational ledger binds exact generation records and never returns lease secrets or source text",
 "expired session cannot commit an idle receipt after waiting on a permission fence",
 "capture acknowledgement can be recovered after the generation has completed",
 "method replacement retains a distinct pending cause and explicit new-version reassessment",
 "rolled-back method removal leaves no cause; committed removal retains cause and unrelated history",
 "fresh-generation recovery preserves expired attempt and commits exact linked retry",
 "recovery refuses wrong owner, scope, completed job and revoked input permission",
 "recovery is atomic on rollback and inaccessible to the worker role",
 "private Markets shared graph retained reader",
 "revoked signing key denies claim and completion despite an outstanding lease"
])
export const aNames=Object.freeze(["source-captured contiguous metadata coverage isolation","native marker boundary proof without source activation"])
export const skipA="^(?:consistent exported snapshot bootstrap isolation|actual pgoutput metadata-to-durable-recorder isolation|configured synthetic client-handler-store-worker-review path uses native gateway transactions|atomic real retained-input capture; no caller source body or input hash accepted|separate worker table/function ownership, FORCE RLS and no escalation|closed CC source scope and missing permission never enter generation|wrong audience/subject/runtime, expired identity and cross-runtime session denied|revoked mapping and stale replacement cannot reuse a retained generation|source and evaluated-implementation revocation during processing strand work|revoked reviewer membership denies completion and retains processing|revoked method denies completion and cannot be reactivated under old revision|ineligible and out-of-runtime work cannot obstruct eligible investigation|rotating investigation selection advances an eligible later investigation|database independently rejects output source, method, rating, review and argument escalation|permission acceptance first: output/revision/ack/receipt commit, revocation waits|permission revocation first: output/revision/ack/receipt all reject|source correction during processing rejects stale retained generation|exact completion retry requires current authority and identical output|worker method mismatch is explicitly failed without invented assessment|expired lease does not requeue, force-cancel or accept completion|real container computes over retained spans with no broad credentials or network|actual termination/restart before_complete_commit recovers exact durable completion|actual termination/restart after_complete_commit recovers exact durable completion|actual lost claim response preserves stranded work; fresh process cannot invent lease|encrypted remote exact-content journal, scoped runtime, no plaintext and protocol separation|generated reassessment resolves exact human causes atomically and stays unreviewed/private|unselected retained input permissions still protect generated history and create causes|private operational ledger binds exact generation records and never returns lease secrets or source text|expired session cannot commit an idle receipt after waiting on a permission fence|capture acknowledgement can be recovered after the generation has completed|method replacement retains a distinct pending cause and explicit new-version reassessment|rolled-back method removal leaves no cause; committed removal retains cause and unrelated history|fresh-generation recovery preserves expired attempt and commits exact linked retry|recovery refuses wrong owner, scope, completed job and revoked input permission|recovery is atomic on rollback and inaccessible to the worker role|private Markets shared graph retained reader|revoked signing key denies claim and completion despite an outstanding lease|synthetic commit recorder uses existing encrypted remote journal and actual isolated process restart)$"
export const skipB="^(?:source-captured contiguous metadata coverage isolation|native marker boundary proof without source activation)$"
const mark=(kind,name)=>process.stdout.write('SHARD_SELECTION_RECORD '+JSON.stringify({kind,name})+'\n')
if(process.env.MIP_SHARD_SELECTION_CHILD==='synthetic-only'){
 test(workerRoot,async t=>{
  mark('root',workerRoot)
  for(const name of directNames)await t.test(name,async sub=>{
   mark('direct',name)
   await sub.test('synthetic nested assertion',async leaf=>{
    mark('nested',name)
    await leaf.test('synthetic deepest assertion',()=>mark('deep',name))
   })
  })
 })
 if(process.env.MIP_SHARD_SELECTION_LAYOUT!=='two-files')test(commitRoot,async t=>{
  mark('root',commitRoot)
  await t.test('synthetic commit nested assertion',async sub=>{
   mark('commit','nested')
   await sub.test('synthetic commit deepest assertion',()=>mark('commit','deep'))
  })
 })
}
