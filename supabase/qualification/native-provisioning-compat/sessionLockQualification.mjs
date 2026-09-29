// Owned synthetic Auth sessions only; invoked by armed managed integration.
// Provider creates test callers/wrappers, NEVER the production helper or missing
// UPDATE grant. Actual helper was installed by nonsuper customer via joint path.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
const pause=()=>new Promise(r=>setTimeout(r,20))
const refusal=e=>e?.code==='P0001'||e?.code==='42501'
async function blocked(observer,waiter,holder){
 for(let i=0;i<150;i++){
  const r=(await observer.query('select $2::int=any(pg_blocking_pids($1::int)) blocked',[waiter,holder])).rows[0]
  if(r.blocked)return
  await pause()
 }
 assert.fail('coordinated transaction was not blocked by intended holder')
}
export async function qualifySessionLocks({provider,connect}){
 const u=randomUUID(),other=randomUUID(),s=randomUUID()
 const exp=Math.floor(Date.now()/1000)+600
 const row=async deadline=>provider.query('insert into auth.sessions(id,user_id,not_after) values($1,$2,$3)',[s,u,deadline])
 const clear=()=>provider.query('delete from auth.sessions where id=$1',[s])
 const client=async()=>{
  const c=await connect('supabase_admin',process.env.MIP_COMPAT_ADMIN_PASSWORD)
  await c.query('set statement_timeout=8000');return c
 }
 const nested=async(c,mode='share')=>c.query(mode==='activation'?'set local role postgres':'set local role mip_mentions_gateway')
 const callKey=(c,subject=u,session=s)=>c.query('select mip_session_lock_fixture.key_check($1,$2) ok',[subject,session])
 const callShare=(c,subject=u,session=s,expiry=exp)=>c.query('select mip_native_caller.assert_session($1,$2,$3)',[subject,session,expiry])
 const callActivation=(c,subject=u,session=s,expiry=exp)=>c.query('select mip_native_activation.auth_current($1::jsonb,$2,$3)',[{subject},session,expiry])
 const callLocked=(c,mode,subject=u,session=s,expiry=exp)=>mode==='activation'?callActivation(c,subject,session,expiry):callShare(c,subject,session,expiry)
 const helpersBefore=(await provider.query("select oid,proowner,proacl,prosqlbody::text body,proconfig from pg_proc where pronamespace='mip_auth_session_lock'::regnamespace order by oid")).rows
 assert.equal((await provider.query("select has_column_privilege('postgres','auth.sessions','id','UPDATE') yes,has_column_privilege('postgres','auth.sessions','id','UPDATE WITH GRANT OPTION') delegated,has_any_column_privilege('mip_efta_auth_session_owner_v1','auth.sessions','SELECT,UPDATE') direct,pg_has_role('postgres','supabase_auth_admin','SET') auth_owner_set")).rows[0].yes,true)
 assert.equal((await provider.query("select has_column_privilege('postgres','auth.sessions','id','UPDATE WITH GRANT OPTION') delegated")).rows[0].delegated,false)
 assert.equal((await provider.query("select has_any_column_privilege('mip_efta_auth_session_owner_v1','auth.sessions','SELECT,UPDATE') direct,pg_has_role('postgres','supabase_auth_admin','SET') owner_set")).rows[0].direct,false)
 assert.equal((await provider.query("select pg_has_role('postgres','supabase_auth_admin','SET') owner_set")).rows[0].owner_set,false)
 // A probe of nested EFTA-owner context only; surrounding EFTA policy/receipt
 // checks are not replaced or credited to this synthetic wrapper.
 await provider.query(`create schema mip_session_lock_fixture;
 revoke all on schema mip_session_lock_fixture from public,anon,authenticated,service_role;
 grant usage on schema mip_session_lock_fixture to mip_mentions_gateway,mip_efta_auth_session_owner_v1;
 create function mip_session_lock_fixture.key_check(u uuid,s uuid) returns boolean language plpgsql security definer set search_path='' as $f$
 begin
 if current_user<>'mip_efta_auth_session_owner_v1' then raise exception 'fixture_nested_owner';end if;
 return mip_auth_session_lock.key_share(u,s) is not distinct from true;
 end $f$;
 alter function mip_session_lock_fixture.key_check(uuid,uuid) owner to mip_efta_auth_session_owner_v1;
 revoke all on function mip_session_lock_fixture.key_check(uuid,uuid) from public,anon,authenticated,service_role;
 grant execute on function mip_session_lock_fixture.key_check(uuid,uuid) to mip_mentions_gateway;`)
 try{
  await provider.query('insert into auth.users(id) values($1),($2)',[u,other])
  await row(null)
  const c=await client()
  try{
   await c.query('begin');await nested(c)
   assert.equal((await c.query('select current_user c')).rows[0].c,'mip_mentions_gateway')
   await assert.rejects(()=>c.query('select mip_auth_session_lock.key_share($1,$2)',[u,s]),e=>e.code==='42501')
   await c.query('rollback')
   await c.query('begin');await nested(c)
   await assert.rejects(()=>callActivation(c),e=>e.code==='42501')
   await c.query('rollback')
   await c.query('begin');await nested(c)
   await c.query('create temp table sessions(id uuid,user_id uuid,not_after timestamptz)')
   assert.equal((await callKey(c)).rows[0].ok,true)
   await callShare(c)
   for(const [subject,session] of [[null,s],[u,null],[other,s],[u,randomUUID()]]){
    await c.query('savepoint invalid')
    assert.equal((await callKey(c,subject,session)).rows[0].ok,false)
    await assert.rejects(()=>callShare(c,subject,session),refusal)
    await c.query('rollback to invalid');await c.query('release invalid')
   }
   for(const expiry of [null,0,1,253402300800]){
    await c.query('savepoint invalid');await assert.rejects(()=>callShare(c,u,s,expiry),refusal);await c.query('rollback to invalid');await c.query('release invalid')
   }
   // No receipt or reader success is manufactured by direct helper invocation.
   await c.query('savepoint reader_refusal')
   await assert.rejects(()=>c.query('select mip_native_caller.read_current($1,$2,$3,$4,$5,$6)',[u,s,exp,randomUUID(),randomUUID(),'a'.repeat(64)]),refusal)
   await c.query('rollback to reader_refusal');await c.query('release reader_refusal')
   await c.query('rollback')
  }finally{await c.end()}
  // Actual installed activation auth_current, invoked as its intended installer.
  // SECURITY DEFINER changes to the restricted Auth owner; no direct Auth rights.
  const activation=await client()
  try{
   await activation.query('begin');await nested(activation,'activation')
   await callActivation(activation)
   for(const [subject,session] of [[null,s],[u,null],[other,s],[u,randomUUID()]]){
    await activation.query('savepoint invalid');await assert.rejects(()=>callActivation(activation,subject,session),refusal);await activation.query('rollback to invalid');await activation.query('release invalid')
   }
   for(const expiry of [null,0,1,253402300800]){
    await activation.query('savepoint invalid');await assert.rejects(()=>callActivation(activation,u,s,expiry),refusal);await activation.query('rollback to invalid');await activation.query('release invalid')
   }
   await activation.query('rollback')
  }finally{await activation.end()}
  console.log('PASS actual activation auth_current positive, input refusals and unauthorized gateway denial')
  await provider.query("update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1",[s])
  for(const mode of ['share','activation']){
   const expired=await client();try{await expired.query('begin');await nested(expired,mode);await assert.rejects(()=>callLocked(expired,mode),refusal);await expired.query('rollback')}finally{await expired.end()}
  }
  await clear()
  for(const mode of ['share','activation']){
   const missing=await client();try{await missing.query('begin');await nested(missing,mode);if(mode==='share')assert.equal((await callKey(missing)).rows[0].ok,false);await assert.rejects(()=>callLocked(missing,mode),refusal);await missing.query('rollback')}finally{await missing.end()}
  }

  // Real EFTA consumer, not the narrow key-lock probe: source-authored synthetic
  // policy/key/assignment/broker rows are private to this transaction and rolled
  // back exactly, including live receipts. No article material or publication.
  const ids=Object.fromEntries(['key','credential','policy','mapping','broker','auth','assignment'].map(k=>[k,randomUUID()]))
  const q=v=>"'"+String(v).replaceAll("'","''")+"'"
  const issuer='https://qikvmopbtijoebdqosyq.supabase.co/auth/v1',kid=randomUUID(),runtime='session-helper-fixture'
  const digest='mip_comparison_kernel_v1.argument_digest'
  const seed=async c=>{
   await c.query(`insert into mip_identity.key_versions values(${q(ids.key)},${q(issuer)},${q(kid)},'{}','2020-01-01','2999-01-01','mechanism-only');
    insert into mip_identity.key_heads values(${q(issuer)},${q(kid)},${q(ids.key)},true);
    with x as(select ${q(ids.credential)}::uuid revision,'efta-private-gateway-v1'::text gateway_id,repeat('a',64)::text fingerprint,null::uuid predecessor,'current'::text state,'2020-01-01'::timestamptz valid_from,'2999-01-01'::timestamptz valid_until)
    insert into mip_identity.efta_gateway_credential_versions
    select revision,gateway_id,fingerprint,predecessor,state,'owner_approved',repeat('b',64),${digest}(jsonb_build_object('revision',revision,'gateway_id',gateway_id,'credential_fingerprint_hash',fingerprint,'predecessor',predecessor,'state',state,'valid_from',valid_from,'valid_until',valid_until)),valid_from,valid_until,clock_timestamp() from x;
    insert into mip_identity.efta_gateway_credential_heads values('efta-private-gateway-v1',${q(ids.credential)},true);
    with x as(select ${q(ids.policy)}::uuid revision,${q(issuer)}::text issuer,'authenticated'::text audience,'ES256'::text algorithm,${q(kid)}::text kid,${q(ids.key)}::uuid key_revision,repeat('9',64)::text jwks_sha256,null::uuid predecessor,'current'::text state,'2020-01-01'::timestamptz valid_from,'2999-01-01'::timestamptz valid_until)
    insert into mip_identity.efta_authentication_policy_versions(revision,issuer,audience,algorithm,kid,key_revision,jwks_sha256,predecessor,state,approval_state,owner_approval_receipt_hash,owner_approval_payload_hash,valid_from,valid_until)
    select revision,issuer,audience,algorithm,kid,key_revision,jwks_sha256,predecessor,state,'owner_approved',repeat('8',64),${digest}(jsonb_build_object('revision',revision,'issuer',issuer,'audience',audience,'algorithm',algorithm,'kid',kid,'key_revision',key_revision,'jwks_sha256',jwks_sha256,'predecessor',predecessor,'state',state,'valid_from',valid_from,'valid_until',valid_until)),valid_from,valid_until from x;
    insert into mip_identity.efta_authentication_policy_heads values('supabase-user-access-v1',${q(ids.policy)},true);
    insert into mip_identity.mapping_versions values(${q(ids.mapping)},${q(runtime)},'mip_efta_reviewer_v1',${q(issuer)},'authenticated',${q('auth_user:'+u)},${q(ids.key)},600,'mechanism-only');
    insert into mip_identity.mapping_heads values(${q(runtime)},'mip_efta_reviewer_v1',${q(ids.mapping)},true);
    insert into mip_comparison_kernel_v1.principal_sessions(session_id,principal,runtime_id,issued_at,expires_at) values(${q(ids.broker)},'mip_efta_reviewer_v1',${q(runtime)},'2020-01-01','2999-01-01');
    insert into mip_identity.sessions values(${q(ids.broker)},${q(ids.auth)},repeat('1',64),${q(ids.mapping)},${q(ids.key)},'2999-01-01','mechanism-only');
    with x as(select ${q(ids.assignment)}::uuid revision,${q(u)}::uuid subject_id,'mip_efta_reviewer_v1'::text principal,${q(ids.mapping)}::uuid mapping_revision,${q(ids.key)}::uuid key_revision,${q(ids.credential)}::uuid credential_revision,null::uuid predecessor,'2020-01-01'::timestamptz valid_from,'2999-01-01'::timestamptz valid_until)
    insert into mip_identity.efta_authority_assignment_versions(revision,subject_id,database_principal,scope,mapping_revision,key_revision,credential_revision,predecessor,approval_state,owner_approval_receipt_hash,owner_approval_payload_hash,reason,valid_from,valid_until,created_at)
    select revision,subject_id,principal,'efta-bounded-demo-v1',mapping_revision,key_revision,credential_revision,predecessor,'owner_approved',repeat('c',64),${digest}(jsonb_build_object('revision',revision,'subject_id',subject_id,'database_principal',principal,'scope','efta-bounded-demo-v1','mapping_revision',mapping_revision,'key_revision',key_revision,'credential_revision',credential_revision,'predecessor',predecessor,'valid_from',valid_from,'valid_until',valid_until)),'owned helper fixture',valid_from,valid_until,clock_timestamp() from x;
    insert into mip_identity.efta_authority_assignment_heads values(${q(u)},'mip_efta_reviewer_v1',${q(ids.assignment)},true);`)
  }
  const realEfta=(c,receipt,subject=u,session=s)=>c.query('select mip_identity.efta_assert_live_auth_session($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) receipt',[receipt,session,subject,ids.policy,ids.broker,runtime,ids.assignment,'1'.repeat(64),issuer,'authenticated','ES256',kid,ids.key,'9'.repeat(64)])
  await row(null)
  const efta=await client(),signout=await client(),receiptId=randomUUID()
  try{
   await efta.query('begin');await seed(efta)
   for(const [subject,session] of [[null,s],[u,null],[other,s],[u,randomUUID()]]){
    await efta.query('savepoint invalid');await efta.query('set local role mip_efta_authenticator_v1')
    await assert.rejects(()=>realEfta(efta,randomUUID(),subject,session),refusal)
    await efta.query('rollback to invalid');await efta.query('release invalid')
   }
   for(const [change,reason] of [
    ["update mip_comparison_kernel_v1.principal_sessions set revoked_at=clock_timestamp() where session_id="+q(ids.broker),'mip_identity_session_revoked'],
    ["update mip_comparison_kernel_v1.principal_sessions set expires_at=clock_timestamp()-interval '1 second' where session_id="+q(ids.broker),'mip_identity_session_revoked'],
    ["update mip_identity.efta_authentication_policy_heads set active=false where policy_id='supabase-user-access-v1'",'efta_authentication_policy_not_authorized'],
    ["update mip_identity.efta_authority_assignment_heads set active=false where subject_id="+q(u),'efta_assignment_not_authorized'],
    ["update mip_identity.efta_gateway_credential_heads set active=false where gateway_id='efta-private-gateway-v1'",'efta_gateway_credential_not_authorized']
   ]){
    await efta.query('savepoint refused');await efta.query(change);await efta.query('set local role mip_efta_authenticator_v1')
    await assert.rejects(()=>realEfta(efta,randomUUID()),e=>e.code==='P0001'&&e.message===reason)
    await efta.query('rollback to refused');await efta.query('release refused')
   }
   await efta.query('set local role mip_efta_authenticator_v1')
   assert.equal((await realEfta(efta,receiptId)).rows[0].receipt,receiptId)
   const hp=(await efta.query('select pg_backend_pid() p')).rows[0].p,wp=(await signout.query('select pg_backend_pid() p')).rows[0].p
   await signout.query('begin');const deleted=signout.query('delete from auth.sessions where id=$1',[s])
   await blocked(provider,wp,hp);await efta.query('rollback')
   assert.equal((await deleted).rowCount,1);await signout.query('commit')
   assert.equal((await provider.query('select count(*)::int n from mip_identity.efta_live_auth_receipts where receipt_id=$1',[receiptId])).rows[0].n,0)
   await efta.query('begin');await seed(efta);await efta.query('set local role mip_efta_authenticator_v1')
   await assert.rejects(()=>realEfta(efta,randomUUID()),e=>e.code==='P0001'&&e.message==='efta_live_auth_session_invalid')
   await efta.query('rollback')
  }finally{await efta.query('rollback').catch(()=>{});await signout.query('rollback').catch(()=>{});await efta.end();await signout.end()}
  assert.equal((await provider.query('select count(*)::int n from mip_identity.key_versions where revision=$1',[ids.key])).rows[0].n,0)

  // After helper return, DELETE waits on both original lock modes. SHARE also
  // blocks expiry UPDATE. KEY SHARE permits non-key expiry UPDATE, exactly as
  // the preserved original EFTA mode; it does NOT claim expiry linearization.
  for(const mode of ['key','share','activation'])for(const action of ['delete','expiry']){
   await row(null)
   const holder=await client(),writer=await client()
   try{
    const hp=(await holder.query('select pg_backend_pid() p')).rows[0].p,wp=(await writer.query('select pg_backend_pid() p')).rows[0].p
    await holder.query('begin');await nested(holder,mode)
    if(mode==='key')assert.equal((await callKey(holder)).rows[0].ok,true);else await callLocked(holder,mode)
    // Function has returned. Caller transaction is still open.
    await writer.query('begin')
    let completed=false
    const write=writer.query(action==='delete'?'delete from auth.sessions where id=$1':"update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1",[s]).then(r=>{completed=true;return r})
    if(mode==='key'&&action==='expiry'){
     const r=await write;assert.equal(r.rowCount,1);assert.equal(completed,true)
     await writer.query('commit')
     assert.equal((await callKey(holder)).rows[0].ok,true)
     await assert.rejects(()=>callShare(holder),refusal)
     await holder.query('rollback')
    }else{
     await blocked(provider,wp,hp);assert.equal(completed,false)
     await holder.query(action==='delete'?'commit':'rollback')
     assert.equal((await write).rowCount,1);await writer.query('commit')
    }
    const after=await client();try{await after.query('begin');await nested(after,mode);if(action==='delete'&&mode!=='activation')assert.equal((await callKey(after)).rows[0].ok,false);await assert.rejects(()=>callLocked(after,mode),refusal);await assert.rejects(()=>after.query('select 1'),e=>e.code==='25P02');await after.query('rollback')}finally{await after.end()}
   }finally{await holder.query('rollback').catch(()=>{});await writer.query('rollback').catch(()=>{});await holder.end();await writer.end()}
   await clear()
  }
  // Auth writer gets the row first. Reader blocks on that exact PID, then
  // rechecks the committed deletion/expiry and refuses, never emits success.
  for(const mode of ['key','share','activation'])for(const action of ['delete','expiry']){
   if(mode==='key'&&action==='expiry')continue
   await row(null);const writer=await client(),reader=await client()
   try{
    const wp=(await writer.query('select pg_backend_pid() p')).rows[0].p,rp=(await reader.query('select pg_backend_pid() p')).rows[0].p
    await writer.query('begin')
    await writer.query(action==='delete'?'delete from auth.sessions where id=$1':"update auth.sessions set not_after=clock_timestamp()-interval '1 second' where id=$1",[s])
    await reader.query('begin');await nested(reader,mode)
    const read=(mode==='key'?callKey(reader):callLocked(reader,mode)).then(r=>({r}),e=>({e}))
    await blocked(provider,rp,wp);await writer.query('commit')
    const answer=await read
    if(mode==='key')assert.equal(answer.r?.rows[0].ok,false);else assert.ok(refusal(answer.e))
    await reader.query('rollback')
   }finally{await writer.query('rollback').catch(()=>{});await reader.query('rollback').catch(()=>{});await writer.end();await reader.end()}
   await clear()
  }
  // Token expires while SHARE is waiting; post-lock check must reject even
  // when writer rolls back and the original nullable session expiry is valid.
  for(const mode of ['share','activation']){
  await row(null)
  const tokenWriter=await client(),tokenReader=await client()
  try{
   const wp=(await tokenWriter.query('select pg_backend_pid() p')).rows[0].p,rp=(await tokenReader.query('select pg_backend_pid() p')).rows[0].p
   await tokenWriter.query('begin');await tokenWriter.query("update auth.sessions set not_after=clock_timestamp()+interval '1 hour' where id=$1",[s])
   await tokenReader.query('begin');await nested(tokenReader,mode)
   const shortExp=Math.floor(Number((await provider.query('select extract(epoch from clock_timestamp()) n')).rows[0].n))+2
   const answer=callLocked(tokenReader,mode,u,s,shortExp).then(r=>({r}),e=>({e}))
   await blocked(provider,rp,wp)
   while(Number((await provider.query('select extract(epoch from clock_timestamp()) n')).rows[0].n)<=shortExp)await pause()
   await tokenWriter.query('rollback')
   assert.ok(refusal((await answer).e));await tokenReader.query('rollback')
  }finally{await tokenWriter.query('rollback').catch(()=>{});await tokenReader.query('rollback').catch(()=>{});await tokenWriter.end();await tokenReader.end()}
  await clear()
  }
  // Failure/connection disappearance releases the still-held row lock. The
  // interrupted caller cannot provide a committed authentication/reader result.
  for(const mode of ['share','activation']){
  await row(null);const failed=await client(),writer=await client()
  try{
   const hp=(await failed.query('select pg_backend_pid() p')).rows[0].p,wp=(await writer.query('select pg_backend_pid() p')).rows[0].p
   await failed.query('begin');await nested(failed,mode);await callLocked(failed,mode)
   await writer.query('begin');const write=writer.query('delete from auth.sessions where id=$1',[s])
   await blocked(provider,wp,hp)
   await failed.end()
   assert.equal((await write).rowCount,1);await writer.query('commit')
  }finally{await failed.end().catch(()=>{});await writer.query('rollback').catch(()=>{});await writer.end()}
  }
 }finally{
  await clear()
  await provider.query('delete from auth.users where id=$1 or id=$2',[u,other])
  await provider.query('drop schema mip_session_lock_fixture cascade')
 }
 assert.deepEqual((await provider.query("select oid,proowner,proacl,prosqlbody::text body,proconfig from pg_proc where pronamespace='mip_auth_session_lock'::regnamespace order by oid")).rows,helpersBefore)
 console.log('PASS fixed session helpers and actual activation auth_current: original coordinated locks, expiry/refusal, nested owner, rollback/connection loss; owned fixture cleanup')
}
