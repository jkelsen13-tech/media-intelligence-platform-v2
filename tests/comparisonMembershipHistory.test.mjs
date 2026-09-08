import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const E = '00000000-0000-4000-8000-000000000001'
const F = '00000000-0000-4000-8000-000000000002'
const A = '00000000-0000-4000-8000-000000000011'
const B = '00000000-0000-4000-8000-000000000012'
const C = '00000000-0000-4000-8000-000000000013'
const migration = await readFile(new URL('../supabase/migrations/20260908104901_comparison_membership_history_guard.sql', import.meta.url), 'utf8')
async function fixture(t, legacy = false) {
  const db = await PGlite.create(); t.after(() => db.close())
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema mip_private;
    grant usage on schema public, mip_private to anon, authenticated, service_role;
    create table public.events(id uuid primary key, canonical_title text not null, comparison_validation_state text not null default 'pending_review');
    create table public.articles(id uuid primary key);
    create table public.event_articles(event_id uuid references public.events, article_id uuid references public.articles, membership_method text not null, primary key(event_id,article_id));
    alter table public.events enable row level security;
    alter table public.event_articles enable row level security;
    grant all on public.events, public.event_articles, public.articles to service_role;
    insert into public.events values ('${E}','Original event','approved'), ('${F}','Other event','approved');
    insert into public.articles values ('${A}'), ('${B}'), ('${C}');
    insert into public.event_articles values ('${E}','${A}','fixture');
  `)
  if (legacy) await db.exec(await readFile(new URL('../supabase/migrations/20260821_v2_source_comparison_membership_mutation_guard.sql', import.meta.url), 'utf8'))
  else await db.exec(migration)
  return db
}
const states = async db => (await db.query('select comparison_validation_state as state from public.events order by id')).rows.map(r => r.state)
const history = async db => (await db.query('select * from mip_private.comparison_membership_history order by id')).rows

test('same-event article replacement reproduces the legacy hole and retains prior approval under the survivor guard', async t => {
  const db = await fixture(t, true)
  await db.query('update public.event_articles set article_id=$1 where event_id=$2',[B,E])
  assert.equal((await states(db))[0], 'approved', 'legacy trigger fails to observe article replacement')
  await db.exec(migration)
  await db.exec('set role service_role')
  await db.query('update public.event_articles set article_id=$1 where event_id=$2',[C,E])
  assert.deepEqual(await states(db), ['pending_review','approved'])
  const [row] = await history(db)
  assert.equal(row.operation,'UPDATE'); assert.equal(row.event_id,E)
  assert.equal(row.prior_event.canonical_title,'Original event')
  assert.equal(row.prior_event.comparison_validation_state,'approved')
  assert.equal(row.membership_before.article_id,B); assert.equal(row.membership_after.article_id,C)
  await db.query("update public.events set canonical_title='Later title' where id=$1",[E])
  assert.deepEqual(await history(db),[row])
})

test('inserts, deletes and event moves invalidate only affected approvals, never approve quarantined records', async t => {
  const db = await fixture(t)
  await db.exec('set role service_role')
  await db.query('update public.event_articles set event_id=$1 where event_id=$2',[F,E])
  assert.deepEqual(await states(db), ['pending_review','pending_review'])
  assert.deepEqual((await history(db)).map(r=>r.event_id),[E,F])
  await db.query("update public.events set comparison_validation_state='approved' where id=$1",[F])
  await db.query('delete from public.event_articles where event_id=$1',[F])
  assert.equal((await history(db)).at(-1).operation,'DELETE')
  await db.query("update public.events set comparison_validation_state='approved' where id=$1",[E])
  await db.query("insert into public.event_articles values($1,$2,'new member')",[E,B])
  assert.equal((await history(db)).at(-1).operation,'INSERT')
  await db.query("update public.events set comparison_validation_state='quarantined' where id=$1",[E])
  const before = await history(db)
  await db.query('update public.event_articles set article_id=$1 where event_id=$2',[C,E])
  assert.equal((await states(db))[0],'quarantined')
  assert.deepEqual(await history(db),before)
})

test('no-op, duplicate and failed membership writes cannot spuriously invalidate or leave history', async t => {
  const db = await fixture(t)
  await db.exec('set role service_role')
  await db.query("insert into public.event_articles values($1,$2,'duplicate') on conflict do nothing",[E,A])
  await db.query('update public.event_articles set event_id=event_id, article_id=article_id')
  await db.query("update public.event_articles set membership_method='metadata only'")
  assert.deepEqual(await states(db), ['approved','approved']); assert.equal((await history(db)).length,0)
  await assert.rejects(db.query('update public.event_articles set article_id=$1',['00000000-0000-4000-8000-000000000099']), /foreign key/)
  assert.deepEqual(await states(db), ['approved','approved']); assert.equal((await history(db)).length,0)
  await db.exec('begin')
  await db.query("insert into public.event_articles values($1,$2,'rolled back')",[E,B])
  assert.equal((await history(db)).length,1)
  await db.exec('rollback')
  assert.deepEqual(await states(db), ['approved','approved']); assert.equal((await history(db)).length,0)
})

test('history cannot be rewritten or forged through worker/browser privileges; truncation fails closed', async t => {
  const db = await fixture(t)
  await db.query("insert into public.event_articles values($1,$2,'retained')",[E,B])
  const before = await history(db)
  for (const role of ['anon','authenticated','service_role']) {
    await db.exec('set role '+role)
    for (const sql of [
      "update mip_private.comparison_membership_history set operation='DELETE'",
      'delete from mip_private.comparison_membership_history',
      'truncate mip_private.comparison_membership_history',
      "insert into mip_private.comparison_membership_history(event_id,operation,prior_event) values ('"+E+"','INSERT','{}')",
    ]) await assert.rejects(db.exec(sql),/permission denied/)
    if(role!=='service_role') {
      await assert.rejects(history(db),/permission denied/)
      await assert.rejects(db.query("insert into public.event_articles values($1,$2,'denied')",[F,C]),/permission denied/)
    }
    await db.exec('reset role')
  }
  for(const sql of ['update mip_private.comparison_membership_history set event_id=event_id','delete from mip_private.comparison_membership_history','truncate mip_private.comparison_membership_history','truncate public.event_articles'])
    await assert.rejects(db.exec(sql), /append-only/)
  assert.deepEqual(await history(db),before)
  const functions=(await db.query("select prosecdef,proconfig,has_function_privilege('anon',oid,'EXECUTE') as anon,has_function_privilege('authenticated',oid,'EXECUTE') as authenticated,has_function_privilege('service_role',oid,'EXECUTE') as worker from pg_proc where pronamespace='mip_private'::regnamespace order by proname")).rows
  assert.equal(functions.length,2)
  assert.ok(functions.every(f=>!f.anon&&!f.authenticated&&!f.worker && f.proconfig.includes('search_path=\"\"')))
})
