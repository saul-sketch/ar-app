-- Tarjetas del vendedor en Discord que ya no sirven: el cliente compró, la aplicación
-- se perdió, o el CRM la cerró. Se borran del canal para que solo quede lo que hay que
-- trabajar; el historial completo sigue en el panel.
create or replace function public.ar_oa_tarjetas_cerradas()
returns table(id uuid, msg text, vendedor_nombre text, location text, equipo text, motivo text)
language sql stable security definer set search_path to 'public' as $$
  select a.id, a.discord_msg_vend, a.vendedor_nombre, a.location,
         public.ar_oa_equipo_de(a.vendedor_nombre),
         case when d.vendida or d.compro_antes or a.crm_cierre_tipo = 'vendido' then 'compró'
              when a.perdida_at is not null then 'perdida'
              else 'cerrada en el CRM' end
    from public.ar_online_applications a
    left join public.ar_oa_desenlaces_todas() d on d.id = a.id
   where a.discord_msg_vend is not null
     and (coalesce(d.vendida, false) or coalesce(d.compro_antes, false)
          or a.crm_cierre_tipo is not null or a.perdida_at is not null or a.borrada_at is not null)
$$;
revoke all on function public.ar_oa_tarjetas_cerradas() from public, anon, authenticated;
grant execute on function public.ar_oa_tarjetas_cerradas() to service_role;
notify pgrst, 'reload schema';
