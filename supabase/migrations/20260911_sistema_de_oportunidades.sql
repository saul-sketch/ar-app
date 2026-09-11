-- De bandeja de revisión a sistema de oportunidades.
--
-- Hasta hoy el app sabía quién aplicó y qué dijo Finance, y ahí se acababa. No
-- sabía si el cliente aprobado vino, ni si compró. Medido el 2026-09-11 cruzando
-- por teléfono contra el reporte diario de visitas:
--   aprobadas 22 → vinieron 11 → compraron 8
--   posibles  40 → vinieron 8  → compraron 2
-- Once aprobados y treinta y dos posibles nunca vinieron, y el app no los mostraba
-- en ningún lado. Esto cierra ese hueco.

-- 1) Seguimiento: el siguiente paso de cada oportunidad, y la pérdida con motivo.
alter table public.ar_online_applications
  add column if not exists proximo_contacto   date,
  add column if not exists proximo_tipo       text,        -- 'llamar' | 'visita'
  add column if not exists ultimo_contacto_at timestamptz,
  add column if not exists perdida_motivo     text,
  add column if not exists perdida_at         timestamptz,
  add column if not exists perdida_por        text;

-- 2) El desenlace, calculado, no tecleado: ¿vino? ¿compró?
--    Se cruza el teléfono (últimos 10 dígitos) contra las visitas del reporte
--    diario desde el día de la aplicación. Nadie tiene que acordarse de mover la
--    ficha: cuando el cliente aparece en el reporte, el app ya lo sabe.
--    Misma puerta que el resto: el manager ve todas, el vendedor las suyas.
create or replace function public.ar_oa_desenlaces(p_codigo text default null, p_email text default null)
returns table(id uuid, vino_fecha date, vino_closer text, vino_resultado text,
              vendida boolean, vendida_fecha date, vendida_deal text)
language sql security definer stable set search_path = public as $$
  with yo as (
    select (public.ar_oa_quien(p_codigo) is not null
         or public.ar_oa_quien_crm(p_email, '') is not null) as manager
  ),
  apps as (
    select a.id, (a.created_at at time zone 'America/New_York')::date as desde,
           right(regexp_replace(coalesce(a.cliente_telefono, ''), '\D', '', 'g'), 10) as tel
      from public.ar_online_applications a, yo
     where a.borrada_at is null
       and (yo.manager
            or (coalesce(trim(p_email), '') <> ''
                and lower(trim(coalesce(a.vendedor_email, ''))) = lower(trim(p_email))))
  ),
  vis as (
    select d.date, v->>'closer' as closer, v->>'result' as res,
           (v->>'sale') = 'true' as vendio, nullif(v->>'deal_number', '') as deal,
           right(regexp_replace(coalesce(v->>'phone', ''), '\D', '', 'g'), 10) as tel
      from public.ar_daily_reports d, jsonb_array_elements(coalesce(d.visits, '[]'::jsonb)) v
  )
  select a.id,
         min(v.date)                                               as vino_fecha,
         (array_agg(v.closer order by v.date))[1]                  as vino_closer,
         (array_agg(v.res order by v.date desc))[1]                as vino_resultado,
         coalesce(bool_or(v.vendio), false)                        as vendida,
         min(v.date) filter (where v.vendio)                       as vendida_fecha,
         (array_agg(v.deal order by v.date) filter (where v.vendio))[1] as vendida_deal
    from apps a
    left join vis v on v.tel = a.tel and length(a.tel) = 10 and v.date >= a.desde
   group by a.id
$$;

-- 3) Anotar el seguimiento. Lo puede hacer un manager o el vendedor dueño de la
--    aplicación: es el vendedor quien tiene que llamar al cliente aprobado, así
--    que es él quien anota qué pasó. Veredictos y notas de Finance siguen siendo
--    solo de managers — esto no toca eso.
create or replace function public.ar_oa_seguir(
  p_codigo text, p_email text, p_id uuid, p_accion text,
  p_fecha date default null, p_nota text default null
)
returns setof public.ar_online_applications
language plpgsql security definer volatile set search_path = public as $$
declare
  v_app  public.ar_online_applications;
  v_quien text;
  v_txt   text;
  v_hoy   date := (now() at time zone 'America/New_York')::date;
  v_nota  text := nullif(trim(coalesce(p_nota, '')), '');
begin
  select * into v_app from public.ar_online_applications where id = p_id and borrada_at is null;
  if not found then return; end if;

  v_quien := public.ar_oa_quien(p_codigo);
  if v_quien is null then v_quien := public.ar_oa_quien_crm(p_email, ''); end if;
  if v_quien is null then
    if coalesce(trim(p_email), '') <> ''
       and lower(trim(coalesce(v_app.vendedor_email, ''))) = lower(trim(p_email)) then
      v_quien := coalesce(nullif(trim(v_app.vendedor_nombre), ''), split_part(p_email, '@', 1));
    else
      return;
    end if;
  end if;

  if p_accion = 'llame' then
    v_txt := '📞 Llamé y no contestó' || coalesce(' · ' || v_nota, '');
    update public.ar_online_applications
       set ultimo_contacto_at = now(),
           proximo_contacto = coalesce(p_fecha, v_hoy + 1), proximo_tipo = 'llamar'
     where id = p_id;
  elsif p_accion = 'hable' then
    v_txt := '💬 Hablé con el cliente' || coalesce(' · ' || v_nota, '');
    update public.ar_online_applications
       set ultimo_contacto_at = now(),
           proximo_contacto = p_fecha, proximo_tipo = case when p_fecha is null then null else 'llamar' end
     where id = p_id;
  elsif p_accion = 'viene' then
    if p_fecha is null then return; end if;
    v_txt := '📅 Viene el ' || to_char(p_fecha, 'DD/MM') || coalesce(' · ' || v_nota, '');
    update public.ar_online_applications
       set ultimo_contacto_at = now(), proximo_contacto = p_fecha, proximo_tipo = 'visita'
     where id = p_id;
  elsif p_accion = 'perdida' then
    if v_nota is null then return; end if;               -- el motivo es obligatorio
    v_txt := '✕ Se perdió — ' || v_nota;
    update public.ar_online_applications
       set perdida_motivo = v_nota, perdida_at = now(), perdida_por = v_quien,
           proximo_contacto = null, proximo_tipo = null
     where id = p_id;
  elsif p_accion = 'reabrir' then
    v_txt := '↺ Reabierta';
    update public.ar_online_applications
       set perdida_motivo = null, perdida_at = null, perdida_por = null
     where id = p_id;
  else
    return;
  end if;

  return query
  update public.ar_online_applications
     set bitacora = coalesce(bitacora, '[]'::jsonb) || jsonb_build_object(
           'id', gen_random_uuid(), 'quien', v_quien, 'texto', v_txt, 'tipo', 'seguimiento',
           'cuando', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
   where id = p_id
  returning *;
end $$;

revoke all on function public.ar_oa_desenlaces(text, text) from public;
revoke all on function public.ar_oa_seguir(text, text, uuid, text, date, text) from public;
grant execute on function public.ar_oa_desenlaces(text, text) to anon;
grant execute on function public.ar_oa_seguir(text, text, uuid, text, date, text) to anon;

notify pgrst, 'reload schema';
