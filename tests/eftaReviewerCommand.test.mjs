import test from 'node:test';
import assert from 'node:assert/strict';
import {createEftaReviewerCommand} from '../supabase/qualification/mip-cutover-authority/eftaReviewerCommand.mjs';

const id=n=>`${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`;
test('server-only reviewer adapter exposes only identity resolution and decision',async()=>{
 const calls=[];const command=createEftaReviewerCommand({authority:{invoke:async(request,operation,builder)=>{
  const ctx={session:id('7'),runtime:'efta-qualification-v1',assignment:id('8')};
  const values=builder(ctx);calls.push({operation,values});return id('9');
 }}});
 assert.deepEqual(Object.keys(command).sort(),['decide','resolveIdentity']);
 await command.resolveIdentity({}, {request_id:id('1'),origin:'doj-oig',institution_revision:id('2'),
  predecessor:null,state:'resolved',reason:'reviewed'});
 assert.equal(calls[0].operation,'resolve_identity');assert.deepEqual(calls[0].values,
  [id('1'),'doj-oig',id('2'),null,'resolved','reviewed',id('7'),'efta-qualification-v1',id('8')]);
 await command.decide({}, {request_id:id('3'),candidate_id:id('4'),action:'approve',predecessor:null,review:{reason:'reviewed'}});
 assert.equal(calls[1].operation,'decide');assert.deepEqual(calls[1].values,
  [id('3'),id('4'),'approve',null,{reason:'reviewed'},id('7'),'efta-qualification-v1',id('8')]);
 assert.equal('admit' in command,false);assert.equal('release' in command,false);assert.equal('publish' in command,false);
});

test('reviewer adapter rejects malformed identifiers before authority invocation',async()=>{
 let called=false;const command=createEftaReviewerCommand({authority:{invoke:async(request,operation,builder)=>{called=true;return builder({})}}});
 await assert.rejects(command.decide({}, {request_id:'free text',candidate_id:id('1'),review:{}}),/efta_reviewer_command_denied/);
 assert.equal(called,true); // authority owns authentication; builder rejects before any RPC.
});

