-- Vendedores que ya no están (lo dice Saúl, aunque el CRM todavía los tenga activos).
-- Sus clientes salen como "Sin nadie asignado" para que un manager los reparta.
create table if not exists public.ar_oa_vendedores_fuera (
  nombre text primary key, desde date not null default current_date, nota text);
alter table public.ar_oa_vendedores_fuera enable row level security;
insert into public.ar_oa_vendedores_fuera (nombre, nota) values
  ('enrique gonzalez', 'Saúl 11-sep: ya no está'), ('jose maldonado', 'Saúl 11-sep: ya no está')
on conflict do nothing;

drop function if exists public.ar_oa_pendientes_por_vender();
create function public.ar_oa_pendientes_por_vender()
returns table(id uuid, cliente_nombre text, veredicto text, veredicto_at timestamptz,
              vendedor_nombre text, location text, equipo text, vino date,
              activo boolean, crm_contact_id text, telefono text)
language sql stable security definer set search_path to 'public' as $$
  select a.id, a.cliente_nombre, a.veredicto, a.veredicto_at, a.vendedor_nombre, a.location,
         public.ar_oa_equipo_de(a.vendedor_nombre), coalesce(d.vino_fecha, d.mismo_dia, d.antes),
         public.ar_oa_equipo_de(a.vendedor_nombre) is not null
           and not exists (select 1 from public.ar_oa_vendedores_fuera f
                            where f.nombre = lower(trim(a.vendedor_nombre))),
         a.crm_contact_id,
         right(regexp_replace(coalesce(a.cliente_telefono, ''), '\D', '', 'g'), 10)
    from public.ar_online_applications a
    join public.ar_oa_desenlaces_todas() d on d.id = a.id
   -- Marcarla perdida en el panel NO la saca: solo el CRM (etapa de cierre) o una venta.
   where a.borrada_at is null
     and a.veredicto in ('aprobado', 'posible')
     and not d.vendida and not d.compro_antes
   order by a.vendedor_nombre, a.veredicto_at
$$;
revoke all on function public.ar_oa_pendientes_por_vender() from public, anon, authenticated;
grant execute on function public.ar_oa_pendientes_por_vender() to service_role;
