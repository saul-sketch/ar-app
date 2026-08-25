-- Una puerta que responde claro: -1 = el código no sirve; 0 o más = cuántas hay.
-- Sin esto no se puede distinguir "código malo" de "todavía no hay ninguna",
-- y el panel le diría a la gente que su código está mal cuando no lo está.
create or replace function public.ar_oa_conteo(p_codigo text)
returns integer
language sql security definer stable set search_path = public as $$
  select case when upper(trim(p_codigo)) = 'FINANCE2026'
              then (select count(*)::int from public.ar_online_applications)
              else -1 end
$$;
revoke all on function public.ar_oa_conteo(text) from public;
grant execute on function public.ar_oa_conteo(text) to anon;
