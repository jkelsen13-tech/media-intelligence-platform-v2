import test from 'node:test';
import assert from 'node:assert/strict';
import {createEftaAtomicBrokerSession,eftaBrokerTransactionInternals} from '../supabase/qualification/mip-cutover-authority/eftaBrokerTransaction.mjs';
const id=n=>`${n.repeat(8)}-${n.repeat(4)}-4${n.repeat(3)}-8${n.repeat(3)}-${n.repeat(12)}`;
const hash='a'.repeat(64);
function fixture(overrides={}){
 const events=[];
 const context={session_id:id('1'),auth_session_id:id('2'),live_session_revision:id('b'),subject_id:id('3'),assignment_revision:id('4'),
  authentication_revision:id('5'),mapping_revision:id('6'),key_revision:id('7'),credential_revision:id('8'),
  token_binding_hash:hash,runtime:'efta-qualification-runtime',database_principal:'mip_efta_private_reader_v1',...overrides.context};
 const client={transaction:async fn=>{events.push('begin');try{const v=await fn({
  setLocalRole:async role=>events.push(['role',role]),invokeExact:async(sig,args)=>{events.push(['call',sig,args]);return {ok:true}}
 });events.push('commit');return v}catch(e){events.push('rollback');throw e}},close:async()=>events.push('close'),...overrides.client};
 return {session:createEftaAtomicBrokerSession({client,context,randomUUID:()=>id('9')}),context,events};
}
test('live auth assertion and exactly one governed call share one transaction',async()=>{
 const f=fixture(),sig='mip_identity.efta_private_read(uuid,uuid,text,uuid)',values=[id('a'),id('1'),'efta-qualification-runtime',id('4')];
 await f.session.invokeExact(sig,values,{subject_principal:`auth_user:${id('3')}`,authentication_revision:id('5'),
  auth_session_id:id('2'),assignment_revision:id('4'),mapping_revision:id('6'),key_revision:id('7'),
  live_session_revision:id('b'),
  credential_revision:id('8'),token_binding_hash:hash});
 assert.deepEqual(f.events.map(x=>Array.isArray(x)?x.slice(0,2):x),['begin',['role','mip_efta_authenticator_v1'],
  ['call',eftaBrokerTransactionInternals.assertionSignature],['role','mip_efta_private_reader_v1'],['call',sig],'commit']);
});
test('wrong target, stale attribution and closed sessions fail before database transaction',async()=>{
 const f=fixture(),good={subject_principal:`auth_user:${id('3')}`,authentication_revision:id('5'),auth_session_id:id('2'),live_session_revision:id('b'),
  assignment_revision:id('4'),mapping_revision:id('6'),key_revision:id('7'),credential_revision:id('8'),token_binding_hash:hash};
 await assert.rejects(f.session.invokeExact('mip_identity.efta_admit(uuid,uuid,uuid,text,uuid)',[],good),/denied/);
 await assert.rejects(f.session.invokeExact('mip_identity.efta_private_read(uuid,uuid,text,uuid)',[],{...good,mapping_revision:id('a')}),/denied/);
 await f.session.close();
 await assert.rejects(f.session.invokeExact('mip_identity.efta_private_read(uuid,uuid,text,uuid)',[],good),/denied/);
 assert.equal(f.events.includes('begin'),false);
});
test('adapter failure rolls back and never reaches governed operation',async()=>{
 const events=[];const f=fixture({client:{transaction:async fn=>{events.push('begin');try{return await fn({
  setLocalRole:async role=>events.push(['role',role]),invokeExact:async sig=>{events.push(['call',sig]);throw Error('live denied')}
 })}catch(e){events.push('rollback');throw e}}}});
 await assert.rejects(f.session.invokeExact('mip_identity.efta_private_read(uuid,uuid,text,uuid)',[],{
  subject_principal:`auth_user:${id('3')}`,authentication_revision:id('5'),auth_session_id:id('2'),
  live_session_revision:id('b'),
  assignment_revision:id('4'),mapping_revision:id('6'),key_revision:id('7'),credential_revision:id('8'),token_binding_hash:hash}),/live denied/);
 assert.deepEqual(events.map(x=>Array.isArray(x)?x[1]:x),['begin','mip_efta_authenticator_v1',eftaBrokerTransactionInternals.assertionSignature,'rollback']);
});
