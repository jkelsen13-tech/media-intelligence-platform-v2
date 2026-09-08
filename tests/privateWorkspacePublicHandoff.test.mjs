import test from 'node:test'
import assert from 'node:assert/strict'
import { privateWorkspacePublicNode, savedInvestigationHandoffVisible } from '../src/lib/privateWorkspacePublicHandoff.js'
import { commitNewSubject } from '../src/lib/newSubjectPropagation.js'
import { emptyInvestigationContext, setInvestigationActiveView } from '../src/lib/investigationContext.js'

const node={id:'public-node-id',type:'event',label:'Public event',occurred_at:'2024-04-08'}
const panels={question:'Private question',canonicalSubject:{id:node.id,type:'graph_node'}}
const input={userId:'user-a',status:'ready',panels,graph:{source:'supabase',nodes:[node]}}

test('private handoff resolves only the exact loaded public identity',()=>{
  assert.equal(privateWorkspacePublicNode(input),node)
  for(const patch of [{userId:null},{status:'loading'},{status:'access_denied'},{graph:{source:'fixture',nodes:[node]}},{panels:{canonicalSubject:{id:'other'}}},{graph:{source:'supabase',nodes:[{slug:node.id,type:'event'}]}}]) {
    assert.equal(privateWorkspacePublicNode({...input,...patch}),null)
  }
})
test('one public subject remains synchronized across Graph, Timeline and World View',()=>{
  const matched=privateWorkspacePublicNode(input)
  let context=commitNewSubject(emptyInvestigationContext('investigations'),matched,{landingView:'graph'})
  assert.equal(context.canonical_subject_id,node.id)
  assert.equal(context.canonical_subject_type,'event')
  for(const view of ['timeline','world','graph']) {
    context=setInvestigationActiveView(context,view)
    assert.equal(context.canonical_subject_id,node.id)
    assert.equal(context.canonical_subject_type,'event')
    assert.equal(context.active_view,view)
    assert.ok(!JSON.stringify(context).includes('Private question'))
  }
})
test('saved-version handoff disclosure does not survive changed user, version or subject',()=>{
  const binding={userId:'user-a',investigationId:'private-id',versionId:'version-1',subjectId:node.id}
  const state={binding,userId:'user-a',status:'ready',bundle:{investigation_id:'private-id',version:{id:'version-1'}},subjectId:node.id,view:'graph'}
  assert.equal(savedInvestigationHandoffVisible(state),true)
  for(const view of ['timeline','world']) assert.equal(savedInvestigationHandoffVisible({...state,view}),true)
  for(const patch of [{userId:'user-b'},{userId:null},{status:'access_denied'},{subjectId:'other'},{view:'investigations'},{bundle:{investigation_id:'private-id',version:{id:'version-2'}}},{bundle:null}]) {
    assert.equal(savedInvestigationHandoffVisible({...state,...patch}),false)
  }
})
