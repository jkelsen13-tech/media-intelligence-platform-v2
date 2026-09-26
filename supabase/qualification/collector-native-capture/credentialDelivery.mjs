// Temporary helper only. Preserve server logging; refuse an unsafe configuration.
// Passwords are protocol parameters, never statement text. The nested ALTER is
// caught inside PL/pgSQL so its text cannot escape as an error context.
export async function assertCredentialLogging(admin) {
  const rows=(await admin.query("select name,setting from pg_settings where name=any($1::text[])",[[
    'log_statement','log_min_duration_statement','log_min_duration_sample',
    'log_transaction_sample_rate','log_parameter_max_length_on_error',
    'pgaudit.log','pgaudit.log_parameter','auto_explain.log_min_duration',
    'auto_explain.log_nested_statements','pg_stat_statements.track','statement_timeout',
  ]])).rows
  const settings=Object.fromEntries(rows.map(r=>[r.name,r.setting]))
  if(!['none','ddl','mod'].includes(settings.log_statement)
      || settings.log_min_duration_statement!=='-1'
      || settings.log_min_duration_sample!=='-1'
      || Number(settings.log_transaction_sample_rate)!==0
      || settings.log_parameter_max_length_on_error!=='0'
      || ![undefined,'none',''].includes(settings['pgaudit.log'])
      || ![undefined,'off'].includes(settings['pgaudit.log_parameter'])
      || (!([undefined,'-1'].includes(settings['auto_explain.log_min_duration']))
        && !(Number(settings.statement_timeout)>0 && Number(settings.statement_timeout)<=1000
          && Number(settings['auto_explain.log_min_duration'])>=5000))
      || settings['pg_stat_statements.track']==='all') throw Error('cnc_credential_logging_refused')
}
export async function installCredentialHelper(admin) {
  await assertCredentialLogging(admin)
  await admin.query(
    "create function pg_temp.cnc_set_password(p_role text,p_secret text) returns void language plpgsql security invoker set search_path='' as $body$ "
    +"begin "
    +"if p_role !~ '^cnc_[a-f0-9]{32}_(collector|native|cas)$' or p_secret !~ '^[A-Za-z0-9_-]{40,128}$' then raise exception 'cnc_credential_invalid';end if;"
    +"begin execute format('alter role %I password %L valid until %L',p_role,p_secret,clock_timestamp()+interval '30 minutes');"
    +"exception when query_canceled or assert_failure then raise exception 'cnc_password_assignment_failed' using errcode='P0001'; when others then raise exception 'cnc_password_assignment_failed' using errcode='P0001';end;"
    +"end $body$"
  )
  await admin.query('revoke all on function pg_temp.cnc_set_password(text,text) from public')
}
export async function assignCredential(admin,role,password) {
  await admin.query('select pg_temp.cnc_set_password($1,$2)',[role,password])
}
export async function removeCredentialHelper(admin) {
  await admin.query('drop function pg_temp.cnc_set_password(text,text)')
}
