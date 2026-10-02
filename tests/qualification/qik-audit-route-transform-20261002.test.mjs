import test from 'node:test';import assert from 'node:assert/strict';
const prefix='postgresql://mip_native_audit_v1.qikvmopbtijoebdqosyq:';const target='postgresql://mip_native_audit_v1:';
const host='@aws-0-us-west-1.pooler.supabase.com:5432/postgres?';const direct='@db.qikvmopbtijoebdqosyq.supabase.co:5432/postgres?';
const query='connect_timeout=5&sslrootcert=system&sslmode=verify-full';const ca='%2Fsynthetic%2Fca.pem';
const oldTransform=u=>u.replaceAll(prefix,target).replaceAll(host,direct).replaceAll('sslrootcert=system',`sslrootcert=${ca}`);
const bounded=u=>{assert.equal(u.split('@').length,2);assert.equal(u.split('?').length,2);assert.ok(u.startsWith(prefix));assert.ok(u.includes(host));const parameters=u.split('?')[1].split('&');assert.equal(parameters.length,3);assert.deepEqual([...parameters].sort(),['connect_timeout=5','sslmode=verify-full','sslrootcert=system'].sort());return target+u.split('@')[0].slice(prefix.length)+direct+parameters.map(p=>p==='sslrootcert=system'?`sslrootcert=${ca}`:p).join('&')};
for(const password of ['sentinel_sslrootcert=system_end',`sentinel_${prefix}_end`,'%73slrootcert%3Dsystem%2Fsentinel','dummy:colon/slash&equals=sentinel'])test(`bounded credential preservation ${password}`,()=>{const u=prefix+password+host+query;const n=bounded(u);assert.equal(n.split('@')[0].slice(target.length),password);assert.equal(n.split('?')[1],`connect_timeout=5&sslrootcert=${ca}&sslmode=verify-full`);if(password.includes('sslrootcert=system')||password.includes(prefix))assert.notEqual(oldTransform(u).split('@')[0].slice(target.length),password)});
test('reject extra/duplicate parameters and delimiters',()=>{for(const suffix of ['&sslrootcert=system','&x=y','?x=y','@x'])assert.throws(()=>bounded(prefix+'dummy'+host+query+suffix))});

// Opt-in self-contained disposable PostgreSQL17.6 qualification.
if(process.env.RUN_SYNTHETIC_PG_QUALIFICATION==='1'){
 const {runQikAuditRouteSyntheticQualification}=await import('../../verifier/runQikAuditRouteSyntheticQualification.mjs');
 await runQikAuditRouteSyntheticQualification({outputDir:process.env.SYNTHETIC_OUTPUT_DIR});
}
