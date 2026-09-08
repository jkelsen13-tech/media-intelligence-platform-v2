import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
const folder=new URL('../supabase/migrations/',import.meta.url);
let sql;
const name=readdirSync(folder).find(x=>x.endsWith('_evaluated_record_claim_v1.sql'));
sql=readFileSync(name?new URL(name,folder):new URL('../supabase/proposals/evaluated_record_claim_v1.sql',import.meta.url),'utf8');
test('record claiming gates before queue mutation and closes supported legacy bypasses',()=>{
 assert.ok(sql.indexOf('qualified evaluation required')<sql.indexOf('for j in select'));
 assert.match(sql,/e\.implementation_sha256 is distinct from p_implementation_sha256/);
 assert.match(sql,/e\.record_kind is distinct from p_record_kind/);
 assert.match(sql,/worker_evaluation_revocations where evaluation_id=e.id/);
 assert.equal((sql.match(/v.record_kind=p_record_kind/g)||[]).length,2);
 assert.match(sql,/p_route='new_candidate_search' and p_producer='record_version'/);
 assert.match(sql,/producer-scoped candidate claim required/);
 assert.match(sql,/limit 100 for update skip locked/);
 assert.match(sql,/order by available_at,change_position limit 1 for update skip locked/);
 assert.match(sql,/attempt_count<5/);
 assert.match(sql,/interval '2 minutes'/);
});
test('qualification history is private, immutable and not seeded',()=>{
 assert.match(sql,/held_out_evaluation/);
 assert.match(sql,/reject_history_mutation/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/from public,anon,authenticated/);
 assert.doesNotMatch(sql,/insert into evidence_pipeline.worker_evaluations/);
 assert.doesNotMatch(sql,/cron.schedule|pg_net|http_post|security definer/i);
 assert.match(sql,/evaluation_id',e.id/);
});
