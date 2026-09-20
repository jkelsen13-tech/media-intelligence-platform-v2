revoke execute on function public.publish_explanation(uuid,text)
  from public, anon, authenticated;
revoke execute on function public.mip_v2_gdelt_begin_stage(text,text,text,date,date)
  from public, anon, authenticated;

grant execute on function public.publish_explanation(uuid,text)
  to service_role;
grant execute on function public.mip_v2_gdelt_begin_stage(text,text,text,date,date)
  to service_role;
