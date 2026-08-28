-- Leer todo viniendo del CRM. A proposito NO da permiso de escribir: la identidad
-- del CRM viaja en la direccion y cualquiera podria poner ?name=Saul y aprobarse
-- sus propios deals. Para poner veredictos o notas sigue haciendo falta el codigo
-- personal, que no viaja en ninguna direccion.
create or replace function public.ar_oa_todas_crm(p_email text, p_nombre text)
returns setof public.ar_online_applications
language sql security definer stable set search_path = public as $$
  select * from public.ar_online_applications
   where public.ar_oa_quien_crm(p_email, p_nombre) is not null
   order by created_at desc
$$;
revoke all on function public.ar_oa_todas_crm(text,text) from public;
grant execute on function public.ar_oa_todas_crm(text,text) to anon;
notify pgrst, 'reload schema';
