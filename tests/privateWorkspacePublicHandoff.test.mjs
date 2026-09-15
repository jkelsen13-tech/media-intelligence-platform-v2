import test from 'node:test'
import assert from 'node:assert/strict'
import { privateWorkspacePublicNode, savedInvestigationHandoffVisible, publicWorkspaceEntry, retainWorkspaceEntry, preservesPublicWorkspaceEntry } from '../src/lib/privateWorkspacePublicHandoff.js'
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
  let context=commitNewSubject(emptyInvestigationContext('investigations'),matched,{landingView:'graph'}).investigationContext
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

test('public entry is exact, and private selection stays latched through denial/logout',()=>{
 const context={canonical_subject_id:'public-a',canonical_subject_type:'event'}
 const entry=publicWorkspaceEntry(context)
 assert.equal(preservesPublicWorkspaceEntry(entry,context),true)
 for(const changed of [null,{...context,canonical_subject_id:'public-b'},{...context,canonical_subject_type:'actor'}])
  assert.equal(preservesPublicWorkspaceEntry(entry,changed),false)
 for(const state of [{selectedInvestigationId:'private-a'},{bundle:{investigation_id:'private-a'}}]){
  const privateEntry=retainWorkspaceEntry(entry,state)
  assert.equal(preservesPublicWorkspaceEntry(retainWorkspaceEntry(privateEntry,{}),context),false)
  assert.equal(preservesPublicWorkspaceEntry(retainWorkspaceEntry(privateEntry,{bundle:null,selectedInvestigationId:null}),context),false)
 }
 assert.equal(preservesPublicWorkspaceEntry(publicWorkspaceEntry(null),context),false)
})

test('explicit public route owns identity despite an already-loaded private question',()=>{
 const context={canonical_subject_id:'new-public',canonical_subject_type:'event'}
 const entry=publicWorkspaceEntry(context,{routeOwned:true})
 for(const state of [{selectedInvestigationId:'old-private'},{bundle:{investigation_id:'old-private'}},{bundle:null}]){
  assert.equal(retainWorkspaceEntry(entry,state),entry)
  assert.equal(preservesPublicWorkspaceEntry(retainWorkspaceEntry(entry,state),context),true)
 }
 const explicitlyPrivate=publicWorkspaceEntry(null)
 assert.equal(preservesPublicWorkspaceEntry(retainWorkspaceEntry(explicitlyPrivate,{}),context),false)
})
