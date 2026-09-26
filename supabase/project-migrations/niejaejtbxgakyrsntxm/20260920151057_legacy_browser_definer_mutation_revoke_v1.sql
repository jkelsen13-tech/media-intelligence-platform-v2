revoke execute on function public.publish_explanation(uuid,text)
  from public, anon, authenticated;

grant execute on function public.publish_explanation(uuid,text)
  to service_role;
