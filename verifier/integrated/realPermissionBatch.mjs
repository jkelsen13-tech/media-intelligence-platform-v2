import {readFile} from 'node:fs/promises'
import {spawn} from 'node:child_process'
import {createHash,randomUUID} from 'node:crypto'
import {fixture,workerRole} from './fixture.mjs'
import {raw,quote as q,guard} from './transport.mjs'
const hash=x=>createHash('sha256').update(x).digest('hex')
const batch='cc-definition-batch-v1'
const error=code=>{throw Error(code)}
const check=(ok,code)=>{if(!ok)error(code)}
function pipe(command,args){
 return new Promise((resolve,reject)=>{
  const c=spawn(command,args,{stdio:['ignore','pipe','pipe']});let out=''
  c.stdout.on('data',b=>{out+=b;if(out.length>3000000){c.kill();reject(Error('pipe_limit'))}})
  c.stderr.resume()
  c.on('error',()=>reject(Error('subprocess_failed')))
  c.on('close',code=>{
   if(!code)return resolve(out)
   let safe='capture_or_boundary_failed'
   try{const e=JSON.parse(out).error;if(/^(material_title_mismatch|selection_boundary_mismatch|selection_boundary_order|selection_forbidden_or_unterminated|selection_discrepancy|unexpected_redirect|response_limit|retrieval_failed|rights_evidence_discrepancy|synthetic_extraction_failure|capture_failed)$/.test(e))safe=e}catch{}
   reject(Error(safe))
  })
 })
}
async function main(){
 guard()
 const activation=JSON.parse(await readFile(new URL('./realPermissionActivation.json',import.meta.url),'utf8'))
 const head=process.env.MIP_PERMISSION_HEAD||''
 if(!/^[0-9a-f]{40}$/.test(head)){console.log('MIP_PERMISSION_BATCH_NOT_ACTIVATED');return}
 const subject=(await pipe('git',['show','-s','--format=%s',head])).trim()
 if(activation.status!=='authorized_single_batch'||subject!==activation.commit_subject){console.log('MIP_PERMISSION_BATCH_NOT_ACTIVATED');return}
 check(process.env.GITHUB_RUN_ATTEMPT==='1'&&activation.attempt>=1&&activation.attempt<=3,'bounded_attempt_required')
 const cleanup=[];let f,captured,bytes,report={schema:'mip-real-permission-verification-v1',batch,head,activation_attempt:activation.attempt,positive:[],negative_tests:[],actual_publisher_revocations:0}
 try{
  // Parser regression uses synthetic HTML only. Capture process has no logging inheritance.
  report.parser=JSON.parse(await pipe('python3',['-I','-B','verifier/integrated/captureCcSection.py','--self-test']))
  const admissionBytes=await readFile(new URL('../real-permission-admission-2026-09-13.json',import.meta.url))
  const admission=JSON.parse(admissionBytes),admissionHash=hash(admissionBytes)
  check(admission.record_type==='actual_owner_instruction'&&admission.record_id==='cc-by-4-en-legalcode-text-only-admission-v1','admission_record_mismatch')
  check(admission.selection==='Section 1: Definitions, text only'&&admission.audience==='isolated_internal_review','admission_scope_mismatch')
  check(JSON.stringify(admission.operations)===JSON.stringify(['ingestion','retention','analysis','excerpt_display']),'admission_operations_mismatch')
  captured=JSON.parse(await pipe('python3',['-I','-B','verifier/integrated/captureCcSection.py']))
  check(!captured.error&&typeof captured.material_text==='string','capture_failed')
  bytes=Buffer.from(captured.material_text,'utf8')
  check(hash(bytes)===captured.selection.sha256&&bytes.length===captured.selection.bytes,'capture_hash_mismatch')
  if(activation.expected_material_sha256)check(hash(bytes)===activation.expected_material_sha256,'retry_material_discrepancy')
  report.capture={...captured.capture,selection:captured.selection,material_ref:admission.source_url+'#section-1-definitions',source_version:'4.0-English-Section-1'}
  report.rights=captured.rights
  report.admission={record_id:admission.record_id,record_sha256:admissionHash,source:admission.source,owner_designation:admission.owner_designation,signature:null,production_principal:null,effective_date:null}
  await raw('postgres',"alter system set log_min_error_statement='panic';alter system set log_min_messages='panic';alter system set log_statement='none';select pg_reload_conf();")
  await raw('postgres',"do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon;create role authenticated;create role service_role bypassrls;end if;end $$;")
  f=await fixture({after:fn=>cleanup.push(fn)})
  for(const name of ['007_survivor_release.sql','008_operation_evidence.sql','010_real_permission_reader.sql'])
   await f.admin(await readFile(new URL('../../supabase/qualification/mip-cutover-authority/'+name,import.meta.url),'utf8'))
  const revision=randomUUID(),metaHash=hash(JSON.stringify({capture:captured.capture,selection:captured.selection,rights:captured.rights}))
  await f.admin('insert into mip_identity.real_permission_captures values('+[batch,'runtime-a',report.capture.material_ref,report.capture.source_version,hash(bytes),bytes.length,admission.source_url,captured.selection.method,captured.capture.observed_at,metaHash,admissionHash].map(q).join(',')+');')
  for(const ev of captured.rights)
   await f.admin('insert into mip_identity.real_permission_documents values('+[batch,ev.kind,ev.url,ev.document_sha256,ev.clause_sha256,ev.observed_at,ev.effective_date_observed].map(q).join(',')+');')
  await f.admin('insert into mip_identity.real_admission_versions values('+[revision,batch,admission.record_id,admissionHash,admission.owner_designation].map(q).join(',')+",array['ingestion','retention','analysis','excerpt_display'],"+[admission.audience,admission.selection,false].map(q).join(',')+');insert into mip_identity.real_admission_heads values('+[batch,revision,true].map(q).join(',')+');insert into mip_identity.real_batch_states values('+q(batch)+",false,'bound');select comparison_qualification.bind_source_scope('runtime-a',"+q(batch)+');')
  const scope={source_project:batch,material_ref:report.capture.material_ref,material_version:hash(bytes),source_version:report.capture.source_version,domain:'rights',operation:'analysis',audience:admission.audience}
  const decision=async override=>JSON.parse(await raw(f.db,'set session authorization '+workerRole+';select mip_identity.check_admitted_material('+[f.session,'runtime-a',{...scope,...override}].map(q).join(',')+');'))
  const journal=f.journal(f.session)
  for(const operation of admission.operations){
   for(const domain of ['rights','privacy']){
    const d=await decision({operation,domain});check(d.allowed&&d.reason==='real_evidence_bound'&&d.synthetic===false,'positive_permission_failed')
   }
   if(operation==='ingestion')check((await journal.putOnce('admitted-section',{text:captured.material_text,hash:hash(bytes)})).committed,'ingestion_commit_failed')
   if(operation==='retention'){
    const retained=await journal.get('admitted-section');check(retained.text===captured.material_text&&retained.hash===hash(bytes),'retained_content_mismatch')
   }
   if(operation==='analysis'){
    const a=hash(JSON.stringify({bytes:bytes.length,tokens:captured.material_text.split(/\s+/u).length}))
    const b=hash(JSON.stringify({bytes:Buffer.byteLength((await journal.get('admitted-section')).text),tokens:(await journal.get('admitted-section')).text.split(/\s+/u).length}))
    check(a===b,'deterministic_analysis_failed');report.analysis_digest=a
   }
   if(operation==='excerpt_display'){
    const excerpt=captured.material_text.slice(0,96)
    let privateView='<span>'+excerpt.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')+'</span>'
    check(privateView.startsWith('<span>')&&privateView.endsWith('</span>'),'internal_render_failed')
    report.internal_display={passed:true,output_disclosed:false};privateView=null
   }
   report.positive.push({operation,audience:admission.audience,result:'allow',reason:'real_evidence_bound'})
  }
  for(const override of [{material_ref:'different-material'},{material_version:'0'.repeat(64)},{source_version:'different-version'},{operation:'full_content_display'},{operation:'redistribution'},{operation:'external_model_disclosure'},{audience:'public'},{audience:'external_model'},{domain:null}]){
   const d=await decision(override);check(!d.allowed,'negative_permission_failed')
   report.negative_tests.push({simulated:true,case:override,result:'deny',reason:d.reason})
  }
  for(const binding of ['missing','conflicting','unbound']){
   const result=await f.admin('begin;update mip_identity.real_batch_states set evidence_binding='+q(binding)+';select mip_identity.operation_check('+q(scope)+');rollback;')
   const d=JSON.parse(result);check(!d.allowed,'evidence_negative_failed')
   report.negative_tests.push({simulated:true,case:'evidence_'+binding,result:'deny',reason:d.reason})
  }
  const suspension=JSON.parse(await f.admin('begin;update mip_identity.real_admission_heads set active=false;select mip_identity.operation_check('+q(scope)+');rollback;'))
  check(!suspension.allowed&&suspension.reason==='internal_admission_inactive','suspension_negative_failed')
  // These attempts are transaction-local simulations and cannot create fresh owner approval.
  let denied=false
  try{await f.admin("begin;update mip_identity.real_admission_heads set active=false;update mip_identity.real_admission_heads set active=true;rollback;")}catch(e){denied=/^mip_.*revision/.test(e.message)}
  check(denied,'old_admission_reuse_allowed')
  const noPrivacy=JSON.parse(await f.admin('begin;delete from mip_identity.real_admission_heads;select mip_identity.operation_check('+q(scope)+');rollback;'))
  check(!noPrivacy.allowed,'rights_bypassed_internal_admission')
  report.negative_tests.push({simulated:true,case:'suspended_internal_admission',result:'deny',old_revision_reactivation:'denied',fresh_authorization_required:true,publisher_revocation:false,committed:false},{simulated:true,case:'rights_without_internal_privacy_admission',result:'deny',committed:false})
  check((await decision({})).allowed,'simulation_rollback_failed')
  let rejected=0
  for(const sql of ["select * from mip_identity.real_admission_versions","update mip_identity.real_admission_heads set active=true","insert into mip_identity.real_batch_states values('forged',false,'bound')"]){
   try{await raw(f.db,'set session authorization '+workerRole+';'+sql)}catch(e){if(/^mip_database_denied_42501/.test(e.message))rejected++}
  }
  check(rejected===3,'worker_self_attestation_possible')
  report.worker_writes_denied=3
  await f.admin('update mip_identity.real_batch_states set closed=true')
  check(!(await decision({})).allowed,'batch_close_failed')
  report.downstream={multi_outlet:'not_qualified_single_document',human_review:'unchanged',factual_publication:'not_qualified',public_release:'disabled',F2:'not_run',historical_articles:'not_authorized'}
  report.status='PERMISSION_COMPONENT_PASS'
 }catch(e){
  report.status='FAIL_CLOSED'
  // Never emit exception text, assertion diffs, SQL or child process output.
  report.error_code=/^[a-z][a-z_0-9]{1,180}$/.test(e.message)?e.message:'qualification_failed_sanitized'
  process.exitCode=1
 }finally{
  if(bytes)bytes.fill(0)
  captured=null
  let removed=true
  for(const fn of cleanup.reverse()){try{await fn()}catch{removed=false;process.exitCode=1}}
  if(f){try{removed=removed&&(await raw('postgres','select count(*) from pg_database where datname='+q(f.db)))==='0'}catch{removed=false;process.exitCode=1}}
  report.cleanup={disposable_database_absent:removed,material_files_written:false,public_content_artifacts_created:false,transient_process_memory:'released_on_process_exit',physical_secure_erasure_claimed:false}
  console.log('MIP_PERMISSION_EVIDENCE '+JSON.stringify(report))
 }
}
main().catch(()=>{console.log('MIP_PERMISSION_BATCH_FAIL_CLOSED');process.exitCode=1})
