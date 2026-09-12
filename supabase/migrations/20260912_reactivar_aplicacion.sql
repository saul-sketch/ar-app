-- Reactivar una aplicación: cambió algo (una modificación, subieron los ingresos, notas
-- nuevas) y vuelve a la fila de Finance como "sin revisar". La puede reactivar el
-- vendedor dueño o un manager. El veredicto anterior NO se pierde: queda en la
-- bitácora y en veredictos_previos, junto con qué cambió y por qué.
alter table public.ar_online_applications
  add column if not exists veredictos_previos jsonb not null default '[]'::jsonb,
  add column if not exists reactivada_at timestamptz,
  add column if not exists reactivada_por text,
  add column if not exists reactivaciones int not null default 0;

create or replace function public.ar_oa_reactivar(p_codigo text, p_email text, p_id uuid,
  p_motivo text, p_detalle text, p_pago_mensual numeric default null, p_down_hoy numeric default null,
  p_down_max numeric default null, p_notas text default null)
returns setof public.ar_online_applications
language plpgsql security definer set search_path to 'public' as $$
declare
  v_app public.ar_online_applications;
  v_quien text;
  v_det text := left(nullif(trim(coalesce(p_detalle, '')), ''), 500);
  v_cambios text[] := '{}';
  v_txt text;
  money_ text;
begin
  select * into v_app from public.ar_online_applications where id = p_id and borrada_at is null;
  if not found then return; end if;
  -- Quién: manager (código o CRM) o el vendedor dueño de la aplicación.
  v_quien := public.ar_oa_quien(p_codigo);
  if v_quien is null then v_quien := public.ar_oa_quien_crm(p_email, ''); end if;
  if v_quien is null then
    if coalesce(trim(p_email), '') <> '' and lower(trim(coalesce(v_app.vendedor_email, ''))) = lower(trim(p_email)) then
      v_quien := coalesce(nullif(trim(v_app.vendedor_nombre), ''), split_part(p_email, '@', 1));
    else return; end if;
  end if;
  if p_motivo not in ('modificacion', 'ingresos', 'notas', 'otro') or v_det is null then return; end if;
  if v_app.veredicto is null then return; end if;          -- ya está en la fila: nada que reactivar

  if p_pago_mensual is not null and p_pago_mensual is distinct from v_app.pago_mensual then
    v_cambios := v_cambios || ('pago mensual $' || coalesce(v_app.pago_mensual::bigint::text, '—') || ' → $' || p_pago_mensual::bigint); end if;
  if p_down_hoy is not null and p_down_hoy is distinct from v_app.down_hoy then
    v_cambios := v_cambios || ('down hoy $' || coalesce(v_app.down_hoy::bigint::text, '—') || ' → $' || p_down_hoy::bigint); end if;
  if p_down_max is not null and p_down_max is distinct from v_app.down_max then
    v_cambios := v_cambios || ('down máximo $' || coalesce(v_app.down_max::bigint::text, '—') || ' → $' || p_down_max::bigint); end if;
  if p_notas is not null and nullif(trim(p_notas), '') is distinct from nullif(trim(coalesce(v_app.notas, '')), '') then
    v_cambios := v_cambios || 'cambió las notas'::text; end if;

  v_txt := '🔄 La reactivó para revisión otra vez — '
        || case p_motivo when 'modificacion' then 'es una modificación' when 'ingresos' then 'cambiaron los ingresos'
                         when 'notas' then 'hay información nueva' else 'otro motivo' end
        || '. ' || v_det
        || case when cardinality(v_cambios) > 0 then ' · Cambios: ' || array_to_string(v_cambios, '; ') else '' end
        || ' · Antes estaba ' || upper(case v_app.veredicto when 'aprobado' then 'aprobada' when 'posible' then 'con posibilidad'
                                         when 'negado' then 'negada' else v_app.veredicto end)
        || coalesce(' (' || v_app.veredicto_por || ', ' || to_char(v_app.veredicto_at at time zone 'America/New_York', 'FMDD/FMMM') || ')', '');

  return query
  update public.ar_online_applications
     set veredictos_previos = veredictos_previos || jsonb_build_object('veredicto', veredicto, 'por', veredicto_por,
                                'at', veredicto_at, 'reactivada_por', v_quien, 'motivo', p_motivo, 'detalle', v_det, 'cuando', now()),
         veredicto = null, veredicto_por = null, veredicto_at = null, discord_aviso = null,
         perdida_at = null, perdida_motivo = null, perdida_por = null,
         pago_mensual = coalesce(p_pago_mensual, pago_mensual),
         down_hoy     = coalesce(p_down_hoy, down_hoy),
         down_max     = coalesce(p_down_max, down_max),
         notas        = coalesce(nullif(trim(p_notas), ''), notas),
         reactivada_at = now(), reactivada_por = v_quien, reactivaciones = reactivaciones + 1,
         recordatorio_at = null,
         bitacora = coalesce(bitacora, '[]'::jsonb) || jsonb_build_object(
           'id', gen_random_uuid(), 'quien', v_quien, 'tipo', 'reactivada', 'texto', v_txt,
           'cuando', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))
   where id = p_id
  returning *;
end $$;
grant execute on function public.ar_oa_reactivar(text, text, uuid, text, text, numeric, numeric, numeric, text) to anon, authenticated;
