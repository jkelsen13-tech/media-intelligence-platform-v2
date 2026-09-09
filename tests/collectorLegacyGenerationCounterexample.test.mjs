import test from 'node:test'
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {PGlite} from '@electric-sql/pglite'

// Actual recovered producer, narrowed isolated schema. This is a counterexample,
// not a production worker, publication model or repair deployment.
test('legacy transaction-time re-enqueue cannot identify the processed generation',async t=>{
  const db=await PGlite.create();t.after(()=>db.close())
  await db.exec(`
    create table public.events(id uuid primary key,comparison_validation_state text);
    create table public.source_comparison_enrichment_queue(
      event_id uuid primary key references public.events(id),state text,
      enqueued_at timestamptz,processed_at timestamptz,error_note text);
  `)
  await db.exec(await readFile(new URL('./fixtures/legacyComparisonProducer-2026-09-09.sql',import.meta.url),'utf8'))
  await db.exec(`
    create trigger changed after update on public.events for each row
      execute function public.mip_queue_source_comparison_enrichment();
    insert into public.events values('00000000-0000-4000-8000-000000000001','fixture-initial');
    begin;
    update public.events set comparison_validation_state='fixture-first';
  `)
  const before=(await db.query(`select event_id,state,enqueued_at::text,processed_at,error_note
    from public.source_comparison_enrichment_queue`)).rows[0]
  const consumed=(await db.query('select comparison_validation_state from public.events')).rows[0]
  await db.exec("update public.events set comparison_validation_state='fixture-newer'")
  const after=(await db.query(`select event_id,state,enqueued_at::text,processed_at,error_note
    from public.source_comparison_enrichment_queue`)).rows[0]
  assert.deepEqual(after,before,'even the full mutable queue row can repeat for a different input')
  assert.notEqual((await db.query('select comparison_validation_state from public.events')).rows[0].comparison_validation_state,
    consumed.comparison_validation_state)
  // A proposed event-ID + timestamp fence falsely acknowledges newer work.
  const acknowledged=await db.query(`update public.source_comparison_enrichment_queue
    set state='succeeded',processed_at=now()
    where event_id=$1 and state='pending' and enqueued_at=$2::timestamptz returning event_id`,
    [before.event_id,before.enqueued_at])
  assert.equal(acknowledged.rows.length,1,'demonstrated unsafe acknowledgement, not a success requirement for a future worker')
  await db.exec('rollback')
  assert.equal((await db.query('select * from public.source_comparison_enrichment_queue')).rows.length,0)
})
