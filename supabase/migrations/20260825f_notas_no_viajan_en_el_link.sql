-- El link público NO puede llevar las notas internas. Aunque la pantalla no las
-- dibuje, los datos viajaban al navegador y cualquiera con el link podía verlos.
-- "Crédito 400, no hay nada" llegando al cliente seria un problema serio.
-- Las dos puertas del link devuelven la bitácora siempre vacía.
create or replace function public.ar_oa_por_codigo(p_codigo text)
returns setof public.ar_online_applications
language sql security definer stable set search_path = public as $$
  select jsonb_populate_record(null::public.ar_online_applications,
           to_jsonb(a) || jsonb_build_object('bitacora', '[]'::jsonb))
  from public.ar_online_applications a
  where upper(a.codigo) = upper(trim(p_codigo))
$$;

create or replace function public.ar_oa_una(p_id uuid)
returns setof public.ar_online_applications
language sql security definer stable set search_path = public as $$
  select jsonb_populate_record(null::public.ar_online_applications,
           to_jsonb(a) || jsonb_build_object('bitacora', '[]'::jsonb))
  from public.ar_online_applications a
  where a.id = p_id
$$;
notify pgrst, 'reload schema';
