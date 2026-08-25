-- Las aplicaciones que entraron antes del cambio no tienen código corto, así que su
-- link no abre. Se les pone uno. El default cubre cualquier fila futura que llegue
-- sin código (p.ej. desde una pantalla cacheada vieja), para que nunca quede sin link.
create or replace function public.ar_oa_codigo_nuevo() returns text
language sql volatile as $$
  select string_agg(substr('23456789ABCDEFGHJKMNPQRSTUVWXYZ',
                           1+floor(random()*31)::int, 1), '')
  from generate_series(1,6)
$$;
update public.ar_online_applications
   set codigo = public.ar_oa_codigo_nuevo()
 where codigo is null or trim(codigo) = '';
alter table public.ar_online_applications
  alter column codigo set default public.ar_oa_codigo_nuevo();
