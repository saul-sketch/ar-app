-- "Vino" y "compró" cuentan solo DESPUÉS del día del veredicto. El mismo día y antes van
-- aparte (el cliente ya estaba en el dealer; no lo trajo la aplicación). Históricas: nada.
-- Cruce: teléfono válido + (nombre compatible o mismo deal); si no, nombre y apellido exactos.
drop function if exists public.ar_oa_desenlaces(text, text);
create function public.ar_oa_desenlaces(p_codigo text default null, p_email text default null)
returns table(id uuid, vino_fecha date, vino_closer text, vino_resultado text, vendida boolean,
              vendida_fecha date, vendida_deal text, mismo_dia date, antes date, compro_antes boolean)
language sql stable security definer set search_path to 'public' as $$
  with yo as (
    select (public.ar_oa_quien(p_codigo) is not null
         or public.ar_oa_quien_crm(p_email, '') is not null) as manager
  ),
  apps as (
    select a.id, nullif(trim(a.deal_number), '') as deal,
           (a.created_at at time zone 'America/New_York')::date as creada,
           coalesce((a.veredicto_at at time zone 'America/New_York')::date,
                    (a.created_at at time zone 'America/New_York')::date) as vdia,
           right(regexp_replace(coalesce(a.cliente_telefono, ''), '\D', '', 'g'), 10) as tel,
           array_remove(regexp_split_to_array(regexp_replace(translate(lower(coalesce(a.cliente_nombre, '')),
             'áéíóúüñ', 'aeiouun'), '[^a-z]+', ' ', 'g'), ' '), '') as tok
      from public.ar_online_applications a, yo
     where a.borrada_at is null and coalesce(a.veredicto, '') <> 'historico'
       and (yo.manager
            or (coalesce(trim(p_email), '') <> ''
                and lower(trim(coalesce(a.vendedor_email, ''))) = lower(trim(p_email))))
  ),
  vis as (
    select d.date, v->>'closer' as closer, v->>'result' as res,
           (v->>'sale') = 'true' as vendio, nullif(v->>'deal_number', '') as deal,
           right(regexp_replace(coalesce(v->>'phone', ''), '\D', '', 'g'), 10) as tel,
           array_remove(regexp_split_to_array(regexp_replace(translate(lower(coalesce(v->>'name', '')),
             'áéíóúüñ', 'aeiouun'), '[^a-z]+', ' ', 'g'), ' '), '') as tok
      from public.ar_daily_reports d, jsonb_array_elements(coalesce(d.visits, '[]'::jsonb)) v
  ),
  m as (
    select a.id, a.vdia, v.date, v.closer, v.res, v.vendio, v.deal
      from apps a join vis v on v.date >= a.creada
     where (a.tel ~ '^[2-9][0-9]{9}$' and v.tel = a.tel
            and (cardinality(v.tok) = 0 or a.tok && v.tok or v.deal = a.deal))
        or (cardinality(a.tok) >= 2 and cardinality(v.tok) >= 2 and a.tok[1] = v.tok[1]
            and a.tok[cardinality(a.tok)] = any (v.tok[2:]))
  )
  select a.id,
         min(m.date) filter (where m.date > a.vdia),
         (array_agg(m.closer order by m.date) filter (where m.date > a.vdia))[1],
         (array_agg(m.res order by m.date desc) filter (where m.date > a.vdia))[1],
         coalesce(bool_or(m.vendio and m.date > a.vdia), false),
         min(m.date) filter (where m.vendio and m.date > a.vdia),
         (array_agg(m.deal order by m.date) filter (where m.vendio and m.date > a.vdia))[1],
         max(m.date) filter (where m.date = a.vdia),
         max(m.date) filter (where m.date < a.vdia),
         coalesce(bool_or(m.vendio and m.date <= a.vdia), false)
    from apps a left join m on m.id = a.id
   group by a.id
$$;
grant execute on function public.ar_oa_desenlaces(text, text) to anon, authenticated;
