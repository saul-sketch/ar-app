-- Un código corto y legible en vez del uuid de 36 caracteres. Alfabeto sin
-- 0/O/1/I/L para que nadie se equivoque al dictarlo o copiarlo a mano.
alter table public.ar_online_applications add column if not exists codigo text;
create unique index if not exists ar_oa_codigo_unico on public.ar_online_applications (codigo);

-- El link corto entra por aquí. Igual que ar_oa_una: devuelve UNA, nunca la lista.
create or replace function public.ar_oa_por_codigo(p_codigo text)
returns setof public.ar_online_applications
language sql security definer stable set search_path = public as $$
  select * from public.ar_online_applications where upper(codigo) = upper(trim(p_codigo))
$$;
revoke all on function public.ar_oa_por_codigo(text) from public;
grant execute on function public.ar_oa_por_codigo(text) to anon;
notify pgrst, 'reload schema';
