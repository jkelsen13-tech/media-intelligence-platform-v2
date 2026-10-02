import test from 'node:test';import assert from 'node:assert/strict';
const prefix='postgresql://mip_native_audit_v1.qikvmopbtijoebdqosyq:';const target='postgresql://mip_native_audit_v1:';
const host='@aws-0-us-west-1.pooler.supabase.com:5432/postgres?';const direct='@db.qikvmopbtijoebdqosyq.supabase.co:5432/postgres?';
const query='connect_timeout=5&sslrootcert=system&sslmode=verify-full';const ca='%2Fsynthetic%2Fca.pem';
const oldTransform=u=>u.replaceAll(prefix,target).replaceAll(host,direct).replaceAll('sslrootcert=system',`sslrootcert=${ca}`);
const bounded=u=>{assert.equal(u.split('@').length,2);assert.equal(u.split('?').length,2);assert.ok(u.startsWith(prefix));assert.ok(u.includes(host));const parameters=u.split('?')[1].split('&');assert.equal(parameters.length,3);assert.deepEqual([...parameters].sort(),['connect_timeout=5','sslmode=verify-full','sslrootcert=system'].sort());return target+u.split('@')[0].slice(prefix.length)+direct+parameters.map(p=>p==='sslrootcert=system'?`sslrootcert=${ca}`:p).join('&')};
for(const password of ['sentinel_sslrootcert=system_end',`sentinel_${prefix}_end`,'%73slrootcert%3Dsystem%2Fsentinel','dummy:colon/slash&equals=sentinel'])test(`bounded credential preservation ${password}`,()=>{const u=prefix+password+host+query;const n=bounded(u);assert.equal(n.split('@')[0].slice(target.length),password);assert.equal(n.split('?')[1],`connect_timeout=5&sslrootcert=${ca}&sslmode=verify-full`);if(password.includes('sslrootcert=system')||password.includes(prefix))assert.notEqual(oldTransform(u).split('@')[0].slice(target.length),password)});
test('reject extra/duplicate parameters and delimiters',()=>{for(const suffix of ['&sslrootcert=system','&x=y','?x=y','@x'])assert.throws(()=>bounded(prefix+'dummy'+host+query+suffix))});

// Optional actual PG fixture qualification. Requires an explicitly provisioned
// disposable, network-disabled PostgreSQL17.6 container; never targets live DB.
if(process.env.RUN_SYNTHETIC_PG_QUALIFICATION==='1'){
const {readFileSync,writeFileSync}=await import('node:fs');const {spawnSync,spawn}=await import('node:child_process');
const container=process.env.SYNTHETIC_CONTAINER||'mip-oct02-synthetic-refusals';
const proposal=readFileSync(process.env.PROPOSAL_SQL||'/workspace/mip-oct02/evidence/qik-transform-proposal.sql','utf8');
const sql=x=>spawnSync('docker',['exec','-i',container,'psql','-U','postgres','-d','postgres','-X','-At'],{input:x,encoding:'utf8'});
const cases=[
 ['missing-update','', 'grant_missing',false],
 ['missing-operation',"DELETE FROM mip_comparison_install.receipts;",'state_refused'],
 ['wrong-operation',"UPDATE mip_comparison_install.receipts SET operation_id='wrong';",'state_refused'],
 ['duplicate-singleton',"INSERT INTO mip_native_activation.head VALUES(true,null);",'state_refused'],
 ['malformed-source',"UPDATE mip_factual.audit_connection SET connection_string='synthetic_invalid';",'source_refused'],
 ['duplicate-parameter',"UPDATE mip_factual.audit_connection SET connection_string=connection_string||'&sslmode=verify-full';",'source_refused'],
 ['already-applied',"UPDATE mip_factual.audit_connection SET connection_string='postgresql://mip_native_audit_v1:dummy@db.qikvmopbtijoebdqosyq.supabase.co:5432/postgres?sslrootcert=%2Fsynthetic%2Fca.pem&sslmode=verify-full&connect_timeout=5';",'already_applied'],
 ['bad-auditor',"SET LOCAL synthetic.probe_mode='badidentity';",'probe_refused'],
 ['bad-tls',"SET LOCAL synthetic.probe_mode='badtls';",'probe_refused'],
 ['rowcount-zero',"SET LOCAL synthetic.suppress_update='on';",'write_refused'],
];
const verify="SELECT 'RESTORED:'||((SELECT count(*)=1 FROM mip_factual.audit_connection WHERE id AND position('@aws-0-us-west-1.pooler.supabase.com' in connection_string)>0)::text)||':'||(NOT has_column_privilege('postgres','mip_factual.audit_connection','connection_string','UPDATE'))::text||':'||((SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid='mip_factual.audit_connection'::regclass)::text);";
const results=[];
for(const [name,mutation,reason,grant=true] of cases){const r=sql('BEGIN;'+(grant?'SET ROLE mip_cutover_schema_owner_v1;GRANT UPDATE(connection_string) ON mip_factual.audit_connection TO postgres;RESET ROLE;':'')+mutation+proposal+'ROLLBACK;'+verify);assert.match(r.stderr,new RegExp('qik_audit_route_'+reason));assert.match(r.stdout,/RESTORED:true:true:true/);results.push({name,expectedError:'qik_audit_route_'+reason,pass:true,rollbackRowAclForceRestored:true});}
const holder=spawn('docker',['exec','-i',container,'psql','-U','postgres','-d','postgres','-X','-At'],{stdio:['pipe','pipe','pipe']});let buf='';const acquired=new Promise((resolve,reject)=>{holder.stdout.on('data',b=>{buf+=b;if(buf.includes('LOCK_READY'))resolve()});holder.on('error',reject)});holder.stdin.end("BEGIN;SELECT pg_advisory_xact_lock(hashtextextended('qik-comparison-audit-v1',0));SELECT 'LOCK_READY';SELECT pg_sleep(3);ROLLBACK;");await acquired;const lock=sql('BEGIN;'+proposal+'ROLLBACK;'+verify);assert.match(lock.stderr,/qik_audit_route_inflight/);assert.match(lock.stdout,/RESTORED:true:true:true/);await new Promise(resolve=>holder.on('close',resolve));results.push({name:'independent-session-lock-contention',expectedError:'qik_audit_route_inflight',pass:true,rollbackRowAclForceRestored:true});
writeFileSync(process.env.RECEIPT_PATH||'/workspace/mip-oct02/evidence/synthetic-refusal-pg17.6-receipt.json',JSON.stringify({scope:'actual disposable PostgreSQL17.6 full proposed DO; synthetic CA path, identity/TLS dblink stub, no provider connection',cases:results,pass:results.length,fail:0},null,2)+'\n');console.log(`${results.length}/${results.length} actual PG refusal/lock cases PASS`);

}
