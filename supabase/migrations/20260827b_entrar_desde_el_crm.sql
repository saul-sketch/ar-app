-- Entrar desde el CRM sin código: el link de menú de GHL manda el nombre y el correo
-- del usuario que ya inició sesión. Mismo patrón que el tablero de KPIs.
alter table public.ar_oa_usuarios add column if not exists email text;

-- Quién es, viniendo del CRM. Se reconoce por correo o por el nombre de pila, porque
-- GHL manda el nombre completo y no siempre coincide letra por letra.
create or replace function public.ar_oa_quien_crm(p_email text, p_nombre text)
returns text language sql security definer stable set search_path = public as $$
  select nombre from public.ar_oa_usuarios
   where activo and (
     (email is not null and lower(email) = lower(trim(p_email)))
     or lower(nombre) = lower(split_part(trim(p_nombre), ' ', 1))
     or lower(nombre) = lower(split_part(trim(p_email), '@', 1))
   )
   limit 1
$$;

-- Las MIAS: lo que sometio esa persona, nada mas. Sin codigo, porque el vendedor no
-- tiene uno — al CRM ya entro con su usuario. Trae la bitacora a proposito: el punto
-- es que vea la respuesta de Finance sin tener que preguntarle al manager.
create or replace function public.ar_oa_mias(p_email text)
returns setof public.ar_online_applications
language sql security definer stable set search_path = public as $$
  select * from public.ar_online_applications
   where coalesce(trim(p_email),'') <> ''
     and lower(trim(vendedor_email)) = lower(trim(p_email))
   order by created_at desc
$$;

revoke all on function public.ar_oa_quien_crm(text,text) from public;
revoke all on function public.ar_oa_mias(text) from public;
grant execute on function public.ar_oa_quien_crm(text,text) to anon;
grant execute on function public.ar_oa_mias(text) to anon;
notify pgrst, 'reload schema';
