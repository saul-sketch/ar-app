-- Conteo diario de aplicaciones, para el reporte de KPIs de ventas. A proposito NO
-- devuelve ni un dato del cliente: solo dia, tienda y cuantas. Asi se puede leer desde
-- el otro tablero sin codigo y sin exponer nada.
-- El dia es el del ESTE (Orlando), que es como cuenta el reporte de ventas; created_at
-- esta en UTC y una aplicacion de las 9pm caeria en el dia siguiente si no se convierte.
create or replace function public.ar_oa_por_dia()
returns table(dia date, tienda text, n integer)
language sql security definer stable set search_path = public as $$
  select (created_at at time zone 'America/New_York')::date as dia,
         coalesce(location, 'sin tienda') as tienda,
         count(*)::int as n
    from public.ar_online_applications
   where borrada_at is null
   group by 1, 2
   order by 1 desc, 2
$$;
revoke all on function public.ar_oa_por_dia() from public;
grant execute on function public.ar_oa_por_dia() to anon;
notify pgrst, 'reload schema';
