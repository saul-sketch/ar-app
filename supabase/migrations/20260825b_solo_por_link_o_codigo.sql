-- El link público tiene que abrirse sin clave, pero eso NO debe significar que
-- cualquiera pueda descargarse la lista completa de clientes con sus teléfonos.
-- Se quita la lectura abierta y se deja solo dos puertas concretas:
--   ar_oa_una(id)      -> devuelve UNA aplicación, la del link. Nada más.
--   ar_oa_todas(codigo)-> devuelve todas, solo con el código del equipo.
drop policy if exists "oa read"   on public.ar_online_applications;
drop policy if exists "oa update" on public.ar_online_applications;

create or replace function public.ar_oa_una(p_id uuid)
returns setof public.ar_online_applications
language sql security definer stable set search_path = public as $$
  select * from public.ar_online_applications where id = p_id
$$;

create or replace function public.ar_oa_todas(p_codigo text)
returns setof public.ar_online_applications
language sql security definer stable set search_path = public as $$
  select * from public.ar_online_applications
  where upper(trim(p_codigo)) = 'FINANCE2026'
  order by created_at desc
$$;

create or replace function public.ar_oa_estado(p_codigo text, p_id uuid, p_estado text)
returns setof public.ar_online_applications
language sql security definer volatile set search_path = public as $$
  update public.ar_online_applications
     set estado = p_estado
   where id = p_id
     and upper(trim(p_codigo)) = 'FINANCE2026'
     and p_estado in ('nueva','trabajando','esperando','cerrada')
  returning *
$$;

revoke all on function public.ar_oa_una(uuid)               from public;
revoke all on function public.ar_oa_todas(text)             from public;
revoke all on function public.ar_oa_estado(text,uuid,text)  from public;
grant execute on function public.ar_oa_una(uuid)              to anon;
grant execute on function public.ar_oa_todas(text)            to anon;
grant execute on function public.ar_oa_estado(text,uuid,text) to anon;
