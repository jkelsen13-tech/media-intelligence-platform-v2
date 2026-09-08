import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';

const folder = new URL('../../supabase/migrations/', import.meta.url);
const name = readdirSync(folder).find(x => x.endsWith('_trigger_function_hardening_v1.sql'));
const migration = readFileSync(name ? new URL(name, folder) :
  new URL('../../supabase/proposals/trigger_function_hardening_v1.sql', import.meta.url), 'utf8');
const fixture = readFileSync(new URL('../fixtures/triggerFunctionHardening.sql', import.meta.url), 'utf8');
const ids = Array.from({length:12}, (_,i) => '00000000-0000-4000-8000-' + String(i+1).padStart(12,'0'));
const [event, policy, other, user, skipped, article, arc, candidate, secondArticle, secondCandidate, newArc] = ids;
async function setup(t, apply = true) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(fixture);
  if (apply) await db.exec(migration);
  return db;
}
async function scalar(db, sql, params = []) { return (await db.query(sql, params)).rows[0]; }
const inventory = `select p.proname, md5(p.prosrc) body, p.prosecdef, p.proconfig,
 pg_get_userbyid(p.proowner) owner,
 (select jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) order by t.tgname)
 from pg_trigger t where t.tgfoid=p.oid and not t.tgisinternal) triggers
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prorettype='trigger'::regtype order by p.proname`;

test('hardening preserves trigger bodies, owners, security modes and attachments; closes only intended grants', async t => {
  const db = await setup(t, false);
  const before = (await db.query(inventory)).rows;
  await db.exec(migration);
  const after = (await db.query(inventory)).rows;
  assert.equal(after.length, 5);
  for (let i=0;i<after.length;i++) {
    assert.deepEqual({...after[i],proconfig:null}, {...before[i],proconfig:null});
    assert.deepEqual(after[i].proconfig, ['search_path=""']);
    const privileges = await scalar(db, `select has_function_privilege('anon',$1,'execute') anon,
      has_function_privilege('authenticated',$1,'execute') authenticated,
      has_function_privilege('service_role',$1,'execute') service,
      has_function_privilege('postgres',$1,'execute') owner`, ['public.'+after[i].proname+'()']);
    assert.deepEqual(privileges, {anon:!after[i].prosecdef,authenticated:!after[i].prosecdef,service:true,owner:true});
  }
  await db.exec(migration); // Configuration-only replay is safe.
  assert.deepEqual((await db.query(inventory)).rows, after);
});

test('drift aborts the whole migration before changing configuration or privileges', async t => {
  const db = await setup(t, false);
  await db.exec("alter function public.policy_edge_attributed() security definer");
  const before = (await db.query(inventory)).rows;
  await assert.rejects(db.exec(migration), /prerequisite drift/);
  await db.exec('rollback');
  assert.deepEqual((await db.query(inventory)).rows,before);
  assert.equal((await scalar(db,"select has_function_privilege('anon','public.handle_new_mip_user()','execute') allowed")).allowed,true);
});

test('event and policy guards still enforce attribution under a hostile caller search path', async t => {
  const db = await setup(t);
  await db.query('insert into public.nodes values ($1,$2),($3,$4),($5,$6)',[event,'event',policy,'policy',other,'actor']);
  await db.exec('create schema shadow; create table shadow.nodes(id uuid,type text); grant usage on schema shadow to authenticated; grant select on shadow.nodes to authenticated');
  await db.query('insert into shadow.nodes values ($1,$2),($3,$4)',[other,'event',policy,'actor']);
  await db.exec('set role authenticated; set search_path=shadow,public');
  await db.query('insert into public.graph_event_article_memberships values ($1)',[event]);
  await assert.rejects(db.query('insert into public.graph_event_article_memberships values ($1)',[other]),/must reference a node of type event/);
  await assert.rejects(db.query('insert into public.edges(source_id,target_id) values ($1,$2)',[policy,other]),/policy edge missing attribution/);
  const edge = 'insert into public.edges values ($1,$2,$3,$4,$5,$6,$7,$8)';
  await assert.rejects(db.query(edge,[policy,other,'MIP_inferred','recorded','source','reported',null,'[]']),/requires counterfactual_test/);
  await db.query(edge,[policy,other,'MIP_inferred','recorded','source','reported','test','["alternative"]']);
  await db.query('insert into public.edges(source_id,target_id) values ($1,$2)',[event,other]);
  assert.equal((await scalar(db,'select count(*)::int n from public.edges')).n,2);
});

test('existing auth trigger bootstraps only MIP profiles after public EXECUTE is revoked', async t => {
  const db = await setup(t);
  await db.exec('set role authenticated');
  await db.query('insert into auth.users values ($1,$2),($3,$4)',[user,'{"app":"mip"}',skipped,'{"app":"other"}']);
  assert.deepEqual((await db.query('select id from public.mip_profiles')).rows,[{id:user}]);
  // A pre-existing profile remains intact: ON CONFLICT is retained.
  await db.query('insert into public.mip_profiles values ($1)',[other]);
  await db.query('insert into auth.users values ($1,$2)',[other,'{"app":"mip"}']);
  assert.equal((await scalar(db,'select count(*)::int n from public.mip_profiles')).n,2);
  await assert.rejects(db.query('select public.handle_new_mip_user()'),/permission denied/);
});

test('direct arc assignment stages a candidate; only the matching approved receipt bypasses staging', async t => {
  const db = await setup(t);
  await db.exec('set role authenticated');
  await db.query('insert into public.articles(id) values ($1)',[article]);
  await db.query('update public.articles set arc_id=$1 where id=$2',[arc,article]);
  assert.deepEqual(await scalar(db,'select arc_id, arc_assignment_evidence from public.articles'),{arc_id:null,arc_assignment_evidence:{membership_gate:'staged_pending_score'}});
  const staged = await scalar(db,'select id,state,generation_method from public.arc_membership_candidates');
  assert.equal(staged.state,'pending'); assert.equal(staged.generation_method,'direct_attachment_intercept_v1');
  await db.query("select set_config('app.arc_membership_approval_candidate_id',$1,false)",[staged.id]);
  await db.query('update public.articles set arc_id=$1 where id=$2',[arc,article]);
  assert.equal((await scalar(db,'select arc_id from public.articles')).arc_id,null);
  await db.query("update public.arc_membership_candidates set state='approved' where id=$1",[staged.id]);
  await db.query('update public.articles set arc_id=$1 where id=$2',[newArc,article]);
  assert.equal((await scalar(db,'select arc_id from public.articles')).arc_id,null);
  await db.query('update public.articles set arc_id=$1 where id=$2',[arc,article]);
  assert.equal((await scalar(db,'select arc_id from public.articles')).arc_id,arc);
  assert.equal((await scalar(db,'select state from public.arc_membership_candidates where id=$1',[staged.id])).state,'approved');
});

test('article insert, update and delete invalidate affected approvals while preserving the explicit exemption', async t => {
  const db = await setup(t);
  await db.exec('set role authenticated');
  await db.query('insert into public.articles(id,arc_id) values ($1,$2)',[article,arc]);
  await db.query("insert into public.arc_membership_candidates(id,article_id,arc_id,state) values ($1,$2,$3,'approved'),($4,$5,$3,'approved')",[candidate,article,arc,secondCandidate,secondArticle]);
  await db.query("select set_config('app.arc_membership_approval_candidate_id',$1,false)",[candidate]);
  await db.query("update public.articles set arc_assignment_evidence='{}' where id=$1",[article]);
  assert.deepEqual((await db.query('select id,state,invalidated_at is not null stamped from public.arc_membership_candidates order by id')).rows,
    [{id:candidate,state:'approved',stamped:false},{id:secondCandidate,state:'invalidated',stamped:true}]);
  await db.exec("select set_config('app.arc_membership_approval_candidate_id','',false)");
  await db.query('insert into public.articles(id,arc_id) values ($1,$2)',[secondArticle,arc]);
  assert.equal((await scalar(db,'select state from public.arc_membership_candidates where id=$1',[candidate])).state,'invalidated');
  await db.query("update public.arc_membership_candidates set state='approved',invalidated_at=null where id=$1",[candidate]);
  await db.query('delete from public.articles where id=$1',[article]);
  assert.equal((await scalar(db,'select state from public.arc_membership_candidates where id=$1',[candidate])).state,'invalidated');
});
